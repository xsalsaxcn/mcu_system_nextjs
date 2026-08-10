// WELLNESS_ADMIN_STREAK_DIAGNOSTIC_V126M53_1
// Read-only Admin diagnostic for the canonical Wellness streak engine.
// No writes, no schema changes, no Google Fit/Health Connect sync changes.

import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import {
  activityFitnessProvider,
  filterActivityRowsByFitnessSource,
  loadParticipantControlMap,
} from "@/lib/wellness/participantControls";
import { loadCanonicalNutritionHistories } from "@/lib/wellness/nutritionHistory";
import {
  buildEffectiveTargetTimeline,
  effectiveTargetsForDate,
  targetTimelineSummary,
} from "@/lib/wellness/effectiveDatedTargets";
import {
  buildWellnessStreakSummary,
  wellnessJakartaDate,
  wellnessStreakSteps,
  wellnessStreakWorkoutCalories,
} from "@/lib/wellness/streak";
import { filterOperationalRowsForProgram } from "@/lib/wellness/programWindow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "supervisor",
  "doctor",
  "wellness_admin",
]);

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function active(value: any) {
  return ![false, 0, "0", "false", "inactive", "nonaktif"].includes(
    typeof value === "string" ? value.toLowerCase() : value,
  );
}

function jakartaDate(offsetDays = 0) {
  const shifted = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

function parseRaw(value: any) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function activityDiagnosticDate(row: any) {
  const raw = parseRaw(row?.raw_payload);
  return wellnessJakartaDate(
    row?.log_date ||
      row?.date ||
      row?.tanggal ||
      raw?.log_date ||
      row?.started_at ||
      row?.start_date_local ||
      raw?.start_date_local ||
      raw?.last_sync_at ||
      raw?.health_connect_last_sync_at ||
      row?.updated_at ||
      row?.created_at,
  );
}

function providerWarnings(rows: any[]) {
  const warnings = new Set<string>();

  for (const row of rows || []) {
    const provider = activityFitnessProvider(row);
    const raw = parseRaw(row?.raw_payload);

    if (provider === "google_fit") {
      const activeCalories = numberValue(
        raw?.google_fit_active_calories_exact ??
          raw?.google_fit_active_calories ??
          raw?.selected_active_calories ??
          raw?.sanitized_active_calories,
      );
      const totalCalories = numberValue(
        raw?.google_fit_total_calories ??
          raw?.google_fit_calories_expended ??
          raw?.exact_snapshot?.total_calories ??
          row?.total_calories ??
          row?.calories ??
          row?.calories_burned,
      );
      if (activeCalories <= 0 && totalCalories > 0) {
        warnings.add("GOOGLE_FIT_TOTAL_CALORIES_FALLBACK");
      }
    }

    if (provider === "health_connect") {
      const selected = numberValue(
        raw?.selected_active_calories ??
          raw?.sanitized_active_calories ??
          raw?.health_connect_active_calories,
      );
      const stored = numberValue(
        row?.activity_calories ?? row?.calories ?? row?.calories_burned,
      );
      const resolved = wellnessStreakWorkoutCalories(row);
      if (selected <= 0 && stored <= 0 && resolved > 0) {
        warnings.add("HEALTH_CONNECT_CALORIES_ESTIMATED_OR_FALLBACK");
      }
    }
  }

  return [...warnings];
}

function diagnosisLabel(params: {
  nutritionOk: boolean;
  workoutOk: boolean;
  stepsOk: boolean;
  activityZero: boolean;
}) {
  if (params.nutritionOk && params.workoutOk) {
    return { code: "PASS", label: "Target streak tercapai" };
  }
  if (!params.nutritionOk && !params.workoutOk) {
    return {
      code: "NUTRISI_DAN_WORKOUT_KURANG",
      label: "Nutrisi dan workout belum memenuhi target",
    };
  }
  if (!params.nutritionOk) {
    return {
      code: "NUTRISI_KURANG",
      label: "Input nutrisi kurang dari 3 kali",
    };
  }
  if (params.activityZero) {
    return {
      code: "DATA_ACTIVITY_NOL",
      label: "Workout/aktivitas terbaca 0 pada tanggal ini",
    };
  }
  if (params.stepsOk) {
    return {
      code: "WORKOUT_KURANG_STEPS_TERCAPAI",
      label: "Langkah tercapai, tetapi kalori workout belum mencapai target",
    };
  }
  return {
    code: "WORKOUT_KURANG",
    label: "Kalori workout belum mencapai target",
  };
}

async function selectParticipantRows(params: {
  supabase: any;
  table: string;
  participantIds: number[];
  select?: string;
  limitPerChunk?: number;
}) {
  const rows: any[] = [];
  const chunkSize = 100;
  const select = params.select || "*";
  const limitPerChunk = Math.max(1000, params.limitPerChunk || 50000);

  for (let index = 0; index < params.participantIds.length; index += chunkSize) {
    const chunk = params.participantIds.slice(index, index + chunkSize);
    const result = await params.supabase
      .from(params.table)
      .select(select)
      .in("participant_id", chunk)
      .limit(limitPerChunk);

    if (result?.error) throw result.error;
    rows.push(...(result?.data || []));
  }

  return rows;
}

export async function GET(request: NextRequest) {
  try {
    const user: any = getSessionUser(request);
    if (!user) return fail("Session Admin belum aktif.", 401);

    const role = clean(user.role).toLowerCase();
    if (!ADMIN_ROLES.has(role)) {
      return fail("Akun ini tidak memiliki akses Diagnostik Streak.", 403);
    }

    const supabase = getSupabaseAdmin();
    const url = new URL(request.url);
    const requestedParticipantId = numberValue(
      url.searchParams.get("participant_id"),
    );
    const requestedCompanyId = numberValue(url.searchParams.get("company_id"));
    const query = clean(url.searchParams.get("q")).toLowerCase();

    const [participantResult, companyResult, groupResult] = await Promise.all([
      supabase.from("wellness_participants").select("*").limit(10000),
      supabase.from("wellness_companies").select("id,name,code,is_active").limit(5000),
      supabase
        .from("wellness_group_units")
        .select("id,name,parent_id,company_id,unit_type")
        .limit(10000),
    ]);

    if (participantResult?.error) throw participantResult.error;

    const companyRows = companyResult?.error ? [] : companyResult?.data || [];
    const groupRows = groupResult?.error ? [] : groupResult?.data || [];
    const companyById = new Map<number, any>(
      companyRows.map((item: any) => [numberValue(item.id), item]),
    );
    const groupById = new Map<number, any>(
      groupRows.map((item: any) => [numberValue(item.id), item]),
    );

    let participants = (participantResult?.data || []).filter((item: any) =>
      active(item?.is_active),
    );

    if (requestedParticipantId > 0) {
      participants = participants.filter(
        (item: any) => numberValue(item.id) === requestedParticipantId,
      );
    }
    if (requestedCompanyId > 0) {
      participants = participants.filter(
        (item: any) =>
          numberValue(item.wellness_company_id || item.company_id) ===
          requestedCompanyId,
      );
    }
    if (query) {
      participants = participants.filter((item: any) =>
        [
          item?.name,
          item?.full_name,
          item?.employee_name,
          item?.code,
          item?.employee_code,
          item?.no_karyawan,
        ]
          .map(clean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      );
    }

    const participantIds = participants
      .map((item: any) => numberValue(item.id))
      .filter(Boolean);

    if (!participantIds.length) {
      return ok({
        generated_at: new Date().toISOString(),
        timezone: "Asia/Jakarta",
        rule: {
          nutrition_min_submissions: 3,
          workout: "workout calories >= effective Coach target",
          steps: "informational_only",
        },
        summary: {
          participants: 0,
          participant_days: 0,
          pass_days: 0,
          issue_days: 0,
          steps_reached_but_streak_failed: 0,
        },
        participants: [],
        rows: [],
      });
    }

    const [activityRowsAll, noteRows, controlMap, nutritionBulk] =
      await Promise.all([
        selectParticipantRows({
          supabase,
          table: "wellness_activity_logs",
          participantIds,
          select: "*",
          limitPerChunk: 50000,
        }),
        selectParticipantRows({
          supabase,
          table: "wellness_coach_notes",
          participantIds,
          select: "*",
          limitPerChunk: 20000,
        }),
        loadParticipantControlMap(supabase, participantIds),
        loadCanonicalNutritionHistories({ supabase, participants }),
      ]);

    const activityByParticipant = new Map<number, any[]>();
    for (const row of activityRowsAll) {
      const participantId = numberValue(row?.participant_id);
      if (!activityByParticipant.has(participantId)) {
        activityByParticipant.set(participantId, []);
      }
      activityByParticipant.get(participantId)!.push(row);
    }

    const notesByParticipant = new Map<number, any[]>();
    for (const row of noteRows) {
      const participantId = numberValue(row?.participant_id);
      if (!notesByParticipant.has(participantId)) {
        notesByParticipant.set(participantId, []);
      }
      notesByParticipant.get(participantId)!.push(row);
    }

    const participantSummaries: any[] = [];
    const diagnosticRows: any[] = [];

    for (const participant of participants) {
      const participantId = numberValue(participant.id);
      const control = controlMap.get(participantId) || null;
      const selectedActivityRows = filterOperationalRowsForProgram(
        participant,
        filterActivityRowsByFitnessSource(
          activityByParticipant.get(participantId) || [],
          controlMap,
        ),
        "",
        "",
        ["log_date", "started_at", "created_at"],
      );
      const nutritionHistory = nutritionBulk.byParticipantId.get(participantId);
      const nutritionRows = filterOperationalRowsForProgram(
        participant,
        nutritionHistory?.logs || [],
        "",
        "",
        ["log_date", "created_at"],
      );
      const targetTimeline = buildEffectiveTargetTimeline({
        participant,
        notes: notesByParticipant.get(participantId) || [],
      });
      const streak = buildWellnessStreakSummary({
        nutritionRows,
        activityRows: selectedActivityRows,
        workoutTargetCalories: numberValue(targetTimeline.current?.workout) || 300,
        targetTimeline,
        historyDays: 42,
      });

      const companyId = numberValue(
        participant.wellness_company_id || participant.company_id,
      );
      const groupUnit =
        groupById.get(numberValue(participant.wellness_group_unit_id)) || {};
      const kelompok =
        groupById.get(numberValue(participant.wellness_kelompok_id)) ||
        (groupUnit?.parent_id
          ? groupById.get(numberValue(groupUnit.parent_id))
          : null) ||
        {};
      const participantName =
        clean(participant.name || participant.full_name || participant.employee_name) ||
        `Peserta ${participantId}`;
      const participantCode = clean(
        participant.code || participant.employee_code || participant.no_karyawan,
      );
      const companyName =
        clean(companyById.get(companyId)?.name) ||
        clean(participant.company_name) ||
        `Perusahaan ${companyId || "-"}`;
      const groupName =
        clean(groupUnit?.name || kelompok?.name || participant.group_name) || "-";

      const activityByDate = new Map<string, any[]>();
      for (const activity of selectedActivityRows) {
        const date = activityDiagnosticDate(activity);
        if (!date) continue;
        if (!activityByDate.has(date)) activityByDate.set(date, []);
        activityByDate.get(date)!.push(activity);
      }

      let recentPass = 0;
      let recentIssue = 0;
      let recentStepsOnly = 0;

      for (const day of streak.days || []) {
        const targets = effectiveTargetsForDate(targetTimeline, day.date);
        const workoutTarget = Math.round(
          numberValue(day.workout_target_calories || targets.workout || 0),
        );
        const stepTarget = Math.round(numberValue(targets.steps) || 8000);
        const nutritionOk = numberValue(day.nutrition_count) >= 3;
        const workoutOk =
          workoutTarget > 0
            ? numberValue(day.workout_calories) >= workoutTarget
            : numberValue(day.workout_calories) > 0;
        const stepsOk =
          stepTarget > 0 && numberValue(day.steps) >= stepTarget;
        const dayActivities = activityByDate.get(day.date) || [];
        const diagnosis = diagnosisLabel({
          nutritionOk,
          workoutOk,
          stepsOk,
          activityZero:
            numberValue(day.workout_calories) <= 0 &&
            numberValue(day.steps) <= 0,
        });
        const targetChangedToday = targetTimeline.revisions.some(
          (item) => item.effective_from === day.date,
        );
        const warnings = providerWarnings(dayActivities);

        if (day.success) recentPass += 1;
        else recentIssue += 1;
        if (!day.success && stepsOk) recentStepsOnly += 1;

        diagnosticRows.push({
          participant_id: participantId,
          participant_code: participantCode,
          participant_name: participantName,
          company_id: companyId,
          company_name: companyName,
          group_name: groupName,
          date: day.date,
          day_label: day.label,
          nutrition_count: numberValue(day.nutrition_count),
          nutrition_min: 3,
          nutrition_ok: nutritionOk,
          nutrition_calories: numberValue(day.nutrition_calories),
          workout_calories: numberValue(day.workout_calories),
          workout_target: workoutTarget,
          workout_ok: workoutOk,
          steps: numberValue(day.steps),
          step_target: stepTarget,
          steps_ok: stepsOk,
          steps_are_streak_rule: false,
          success: Boolean(day.success),
          diagnosis_code: diagnosis.code,
          diagnosis_label: diagnosis.label,
          target_effective_from: day.target_effective_from || null,
          target_changed_today: targetChangedToday,
          fitness_source: clean(control?.fitness_source || "none"),
          source_connected: Boolean(control?.source_connected),
          activity_provider_rows: dayActivities.length,
          activity_providers: [
            ...new Set(dayActivities.map((item) => activityFitnessProvider(item))),
          ].filter((item) => item !== "none"),
          provider_warnings: warnings,
        });
      }

      participantSummaries.push({
        participant_id: participantId,
        participant_code: participantCode,
        participant_name: participantName,
        company_id: companyId,
        company_name: companyName,
        group_name: groupName,
        current_streak: numberValue(streak.current_streak),
        longest_streak: numberValue(streak.longest_streak),
        success_dates: streak.success_dates || [],
        fitness_source: clean(control?.fitness_source || "none"),
        source_connected: Boolean(control?.source_connected),
        target_history: targetTimelineSummary(targetTimeline),
        nutrition_source: nutritionHistory?.sources || null,
        recent_7d_pass: recentPass,
        recent_7d_issue: recentIssue,
        recent_7d_steps_reached_but_streak_failed: recentStepsOnly,
      });
    }

    diagnosticRows.sort((left, right) => {
      const name = clean(left.participant_name).localeCompare(
        clean(right.participant_name),
        "id",
      );
      if (name !== 0) return name;
      return clean(left.date).localeCompare(clean(right.date));
    });

    const passDays = diagnosticRows.filter((row) => row.success).length;
    const stepsOnly = diagnosticRows.filter(
      (row) => !row.success && row.steps_ok,
    ).length;

    return ok({
      generated_at: new Date().toISOString(),
      timezone: "Asia/Jakarta",
      today: jakartaDate(0),
      rule: {
        nutrition_min_submissions: 3,
        workout: "workout calories >= effective Coach target",
        steps: "informational_only",
        note: "Langkah dapat tercapai tanpa menghasilkan streak bila target kalori workout belum tercapai.",
      },
      filters: {
        participant_id: requestedParticipantId || null,
        company_id: requestedCompanyId || null,
        q: query,
      },
      summary: {
        participants: participantSummaries.length,
        participant_days: diagnosticRows.length,
        pass_days: passDays,
        issue_days: diagnosticRows.length - passDays,
        steps_reached_but_streak_failed: stepsOnly,
        target_change_days: diagnosticRows.filter(
          (row) => row.target_changed_today,
        ).length,
        provider_warning_days: diagnosticRows.filter(
          (row) => (row.provider_warnings || []).length > 0,
        ).length,
      },
      nutrition_source: nutritionBulk.sources,
      participants: participantSummaries,
      rows: diagnosticRows,
    });
  } catch (error: any) {
    return fail(
      clean(error?.message || "Diagnostik Streak Admin gagal dijalankan."),
      500,
    );
  }
}
