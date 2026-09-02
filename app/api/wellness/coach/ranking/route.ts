// WELLNESS_STREAK_PROOF_POINT_PARITY_V126M119_7
// WELLNESS_COMPANY_ISOLATION_V126C_FINAL
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchWellnessGoogleSheetRows,
  googleSheetRowsToHealthtalkLogs,
} from "@/lib/wellness/googleSheetResponses";
import { loadCanonicalNutritionHistories } from "@/lib/wellness/nutritionHistory";
import {
  buildCoachGroupUnitMap,
  canCoachAccessParticipant,
  canonicalParticipantGroupName,
  dedupeCoachParticipants,
  matchingCoachAssignment,
} from "@/lib/wellness/coachGroupAccess";
import {
  filterClinicalRowsForProgram,
  filterOperationalRowsForProgram,
  isOperationalRowInProgramWindow,
  programWindowDayCount,
} from "@/lib/wellness/programWindow";
import { postSupportWebhook } from "@/lib/wellness/supportServer";
import { filterActivityRowsByFitnessSource, loadParticipantControlMap } from "@/lib/wellness/participantControls";
import { resolveWellnessPointBreakdown } from "@/lib/wellness/pointLedger";
import {
  healthtalkPointsFromRow,
  nutritionDailyBonusPoints,
  participantNutritionCalorieLimit,
  participantWorkoutCalorieTarget,
  pointNumber,
  workoutDailyPoints,
} from "@/lib/wellness/pointRules";
import {
  buildEffectiveTargetTimeline,
  effectiveTargetsForDate,
  targetTimelineSummary,
} from "@/lib/wellness/effectiveDatedTargets";

// WELLNESS_COACH_GROUP_RANKING_API_V76
// WELLNESS_COACH_RANKING_SINGLE_FITNESS_SOURCE_V79F
// WELLNESS_COACH_RANKING_ADMIN_PARITY_V112

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Metric = "overall" | "compliance" | "workout" | "nutrition" | "healthtalk";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Supabase admin env is missing.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function clean(value: any) {
  return String(value ?? "").trim();
}

function asNumber(value: any) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = clean(value);
  if (!text) return 0;
  const normalized = /^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text)
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(",", ".").replace(/[^\d.-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function jakartaDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateKey(value: any) {
  return clean(value).slice(0, 10);
}

function participantId(row: any) {
  return asNumber(
    row?.id || row?.participant_id || row?.wellness_participant_id,
  );
}

function participantName(row: any) {
  return clean(
    row?.name || row?.employee_name || row?.nama || row?.full_name || "-",
  );
}

function participantCode(row: any) {
  return clean(
    row?.code || row?.employee_code || row?.kode_karyawan || row?.nik || "-",
  );
}

async function getCoach(request: NextRequest, supabase: any) {
  const token = request.cookies.get("wellness_coach_session")?.value || "";
  if (!token) return null;
  const { data, error } = await supabase
    .from("wellness_coach_auth_sessions")
    .select("*, coach:wellness_coach_users(*)")
    .eq("session_token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data?.coach || data.coach.is_active === false) return null;
  return data.coach;
}

async function safeSelect(
  supabase: any,
  table: string,
  builder: (query: any) => any,
) {
  try {
    const result = await builder(supabase.from(table).select("*"));
    return result?.error ? [] : result?.data || [];
  } catch {
    return [];
  }
}

function isDeviceDaily(row: any) {
  const source = clean(
    row?.source || row?.provider || row?.raw_payload?.provider,
  ).toLowerCase();
  const name = clean(row?.activity_name || row?.activity_type).toLowerCase();
  const mode = clean(row?.raw_payload?.sync_mode).toLowerCase();
  return (
    mode === "daily_aggregate" ||
    name.includes("google fit daily") ||
    name.includes("health connect daily") ||
    source === "google_fit" ||
    source === "health_connect"
  );
}

function providerPriority(row: any) {
  const source = clean(
    row?.source || row?.provider || row?.raw_payload?.provider,
  ).toLowerCase();
  const name = clean(row?.activity_name || row?.activity_type).toLowerCase();
  if (source.includes("health_connect") || name.includes("health connect"))
    return 3;
  if (source.includes("google_fit") || name.includes("google fit")) return 2;
  return 1;
}

function selectedActivityRows(rows: any[]) {
  const normal: any[] = [];
  const daily = new Map<string, any>();
  for (const row of rows || []) {
    if (!isDeviceDaily(row)) {
      normal.push(row);
      continue;
    }
    const key = `${asNumber(row?.participant_id)}:${dateKey(
      row?.log_date || row?.started_at || row?.created_at,
    )}`;
    const current = daily.get(key);
    if (!current || providerPriority(row) > providerPriority(current))
      daily.set(key, row);
  }
  return [...normal, ...daily.values()];
}

function activityCalories(row: any) {
  return asNumber(
    row?.calories ??
      row?.total_calories ??
      row?.calories_burned ??
      row?.activity_calories ??
      row?.raw_payload?.selected_active_calories ??
      row?.raw_payload?.health_connect_calories ??
      row?.raw_payload?.calories,
  );
}

function foodCalories(row: any) {
  return pointNumber(
    row?.calories ??
      row?.total_calories ??
      row?.estimated_calories ??
      row?.raw_payload?.["Kalori Makanan"],
  );
}

function mealSlot(row: any) {
  const text = clean(
    row?.meal_time ||
      row?.meal_type ||
      row?.meal_period ||
      row?.waktu_makan ||
      row?.raw_payload?.["Waktu Makan"],
  ).toLowerCase();

  if (/sarapan|breakfast|pagi/.test(text)) return "breakfast";
  if (/siang|lunch/.test(text)) return "lunch";
  if (/malam|dinner/.test(text)) return "dinner";
  if (/snack|camilan/.test(text)) {
    return `snack:${clean(row?.id || row?.created_at || row?.food_name)}`;
  }
  return `meal:${clean(row?.id || row?.created_at || row?.food_name)}`;
}

function pointLogDate(row: any) {
  return dateKey(row?.log_date || row?.created_at);
}

function isNutritionInputPoint(row: any) {
  const sourceType = clean(row?.source_type).toLowerCase();
  const pointKey = clean(row?.point_key).toLowerCase();
  const description = clean(row?.description).toLowerCase();

  return (
    sourceType === "nutrition_google_sheet" ||
    pointKey.startsWith("nutrition_input_") ||
    description.startsWith("input nutrisi:")
  );
}

function nutritionPointIdentity(row: any) {
  return clean(row?.source_id) || clean(row?.point_key) || clean(row?.id);
}

function activitySteps(row: any) {
  return asNumber(
    row?.steps ||
      row?.total_steps ||
      row?.raw_payload?.health_connect_steps ||
      row?.raw_payload?.google_fit_steps,
  );
}

function healthtalkPoint(row: any) {
  return healthtalkPointsFromRow(row);
}

function parseNutritionTarget(participant: any, notes: any[]) {
  const direct = participantNutritionCalorieLimit(participant);
  if (direct > 0) return direct;
  const note = (notes || []).find((item) =>
    clean(item?.topic).toLowerCase().includes("target wellness"),
  );
  const text = [note?.action_plan, note?.coach_note].map(clean).join("\n");
  const match = text.match(/Target\s+Nutrisi\s*:\s*([0-9.,]+)/i);
  return match ? asNumber(match[1]) : 0;
}

function parseWorkoutTarget(participant: any, notes: any[]) {
  const direct = participantWorkoutCalorieTarget(participant);
  if (direct > 0) return direct;
  const note = (notes || []).find((item) =>
    clean(item?.topic).toLowerCase().includes("target wellness"),
  );
  const text = [note?.action_plan, note?.coach_note].map(clean).join("\n");
  const match = text.match(/Target\s+(?:Kalori\s+)?Workout\s*:\s*([0-9.,]+)/i);
  return match ? asNumber(match[1]) : 300;
}

// WELLNESS_RANKING_UI_POINT_FLOW_V111
// Metric tabs display actual point values. Achieved-day fields remain available
// for progress/streak but are not used as the ranking point value.
function metricValue(row: any, metric: Metric) {
  if (metric === "compliance") return row.compliance_percent;
  if (metric === "workout") return row.workout_points;
  if (metric === "nutrition") return row.nutrition_points;
  if (metric === "healthtalk") return row.healthtalk_points;
  return row.total_points;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = adminClient();
    const coach = await getCoach(request, supabase);
    if (!coach) {
      return NextResponse.json(
        { ok: false, message: "Session coach belum aktif." },
        { status: 401 },
      );
    }

    const metricRaw = clean(
      request.nextUrl.searchParams.get("metric"),
    ) as Metric;
    const metric: Metric = [
      "overall",
      "compliance",
      "workout",
      "nutrition",
      "healthtalk",
    ].includes(metricRaw)
      ? metricRaw
      : "overall";
    const groupFilter =
      clean(request.nextUrl.searchParams.get("group")) || "all";
    const days = Math.min(
      90,
      Math.max(7, asNumber(request.nextUrl.searchParams.get("days")) || 30),
    );
    const fromDate = jakartaDate(-(days - 1));
    const toDate = jakartaDate();

    const { data: assignments, error: assignmentError } = await supabase
      .from("wellness_coach_group_assignments")
      .select("*")
      .eq("coach_user_id", coach.id)
      .eq("is_active", true);
    if (assignmentError) throw assignmentError;

    const { data: groupUnits, error: groupUnitError } = await supabase
      .from("wellness_group_units")
      .select("*")
      .limit(5000);
    if (groupUnitError) throw groupUnitError;
    const groupUnitMap = buildCoachGroupUnitMap(groupUnits || []);

    const { data: allParticipants, error: participantError } = await supabase
      .from("wellness_participants")
      .select("*")
      .limit(2000);
    if (participantError) throw participantError;

    let participants = dedupeCoachParticipants(allParticipants || []).filter(
      (row: any) =>
        canCoachAccessParticipant(row, assignments || [], groupUnitMap),
    );
    if (groupFilter !== "all") {
      participants = participants.filter((row: any) => {
        const assignment = matchingCoachAssignment(
          row,
          assignments || [],
          groupUnitMap,
        );
        return (
          clean(assignment?.wellness_group_unit_id) === groupFilter ||
          clean(assignment?.group_name).toLowerCase() ===
            groupFilter.toLowerCase()
        );
      });
    }

    const ids = participants.map(participantId).filter(Boolean);
    const participantControlMap = await loadParticipantControlMap(supabase, ids);
    if (!ids.length) {
      return NextResponse.json({
        ok: true,
        rows: [],
        metric,
        period: { from: fromDate, to: toDate, days },
      });
    }

    const [activityRowsRaw, foodRows, healthtalkRows, pointRows, targetNotes] =
      await Promise.all([
        safeSelect(supabase, "wellness_activity_logs", (query) =>
          query
            .in("participant_id", ids)
            .gte("log_date", fromDate)
            .limit(20000),
        ),
        safeSelect(supabase, "wellness_food_logs", (query) =>
          query
            .in("participant_id", ids)
            .order("log_date", { ascending: false })
            .limit(30000),
        ),
        safeSelect(supabase, "wellness_healthtalk_logs", (query) =>
          query
            .in("participant_id", ids)
            .gte("event_date", fromDate)
            .limit(10000),
        ),
        safeSelect(supabase, "wellness_point_logs", (query) =>
          query
            .in("participant_id", ids)
            .order("log_date", { ascending: false })
            .limit(20000),
        ),
        safeSelect(supabase, "wellness_coach_notes", (query) =>
          query
            .in("participant_id", ids)
            .order("created_at", { ascending: false })
            .limit(5000),
        ),
      ]);

    const activityRows = selectedActivityRows(
      filterActivityRowsByFitnessSource(
        activityRowsRaw,
        participantControlMap,
      ),
    );
    const nutritionHistory = await loadCanonicalNutritionHistories({
      supabase,
      participants,
      dbRows: foodRows,
    });
    const pointRowsInPeriod = pointRows.filter((row: any) => {
      const date = pointLogDate(row);
      return !date || (date >= fromDate && date <= toDate);
    });
    const sheet = await fetchWellnessGoogleSheetRows({ limit: 10000 }).catch(
      () => ({ ok: false, rows: [] as any[] }),
    );
    const sheetHealthtalk = googleSheetRowsToHealthtalkLogs(
      sheet.rows || [],
    ).filter(
      (row: any) =>
        ids.includes(asNumber(row.participant_id)),
    );

    const profilesResult = await postSupportWebhook("wellnessProfileList", {
      actorType: "participant",
      actorIds: ids.map(String),
    }).catch(() => ({ profiles: [] }));
    const profileMap = new Map<string, any>(
      (profilesResult?.profiles || []).map((profile: any) => [
        clean(profile.actor_id),
        profile,
      ]),
    );

    const rows = participants.map((participant: any) => {
      const id = participantId(participant);
      const code = participantCode(participant);
      const assignment = matchingCoachAssignment(
        participant,
        assignments || [],
        groupUnitMap,
      );
      const canonicalHistory = nutritionHistory.byParticipantId.get(id);
      const participantFood =
        filterOperationalRowsForProgram(
          participant,
          canonicalHistory?.logs || [],
          fromDate,
          toDate,
          ["log_date", "created_at"],
        );
      const participantActivities =
        filterOperationalRowsForProgram(
          participant,
          activityRows.filter(
            (row: any) =>
              asNumber(
                row.participant_id,
              ) === id,
          ),
          fromDate,
          toDate,
          [
            "log_date",
            "started_at",
            "created_at",
          ],
        );
      const dbHealthtalk = healthtalkRows.filter(
        (row: any) => asNumber(row.participant_id) === id,
      );
      const participantSheetHealthtalk = sheetHealthtalk.filter(
        (row: any) =>
          asNumber(row.participant_id) === id,
      );
      const participantHealthtalk = (
        participantSheetHealthtalk.length
          ? participantSheetHealthtalk
          : dbHealthtalk
      ).filter((row: any) => {
        const date = dateKey(row?.event_date || row?.log_date || row?.created_at);
        return !date || (date >= fromDate && date <= toDate);
      });
      const participantPointHistory =
        filterOperationalRowsForProgram(
          participant,
          pointRows.filter(
            (row: any) =>
              asNumber(
                row.participant_id,
              ) === id,
          ),
          fromDate,
          toDate,
          ["log_date", "created_at"],
        );
      const nutritionPointInputs = [
        ...new Map(
          participantPointHistory
            .filter(isNutritionInputPoint)
            .map((row: any) => [nutritionPointIdentity(row), row]),
        ).values(),
      ];
      const participantNotes = targetNotes.filter(
        (row: any) => asNumber(row.participant_id) === id,
      );
      const targetTimeline = buildEffectiveTargetTimeline({
        participant,
        notes: participantNotes,
      });
      const nutritionTarget = targetTimeline.current.nutrition;
      const workoutTarget = targetTimeline.current.workout || 300;

      const foodByDate = new Map<string, Set<string>>();
      const foodCaloriesByDate = new Map<string, number>();
      participantFood.forEach((row: any) => {
        const date = dateKey(row?.log_date || row?.created_at);
        if (!date || date < fromDate || date > toDate) return;
        if (!foodByDate.has(date)) foodByDate.set(date, new Set());
        foodByDate.get(date)!.add(mealSlot(row));
        foodCaloriesByDate.set(
          date,
          (foodCaloriesByDate.get(date) || 0) + foodCalories(row),
        );
      });

      const nutritionPointInputsByDate = new Map<string, Set<string>>();
      for (const row of nutritionPointInputs) {
        const date = pointLogDate(row);
        if (!date || date < fromDate || date > toDate) continue;
        if (!nutritionPointInputsByDate.has(date)) {
          nutritionPointInputsByDate.set(date, new Set());
        }
        nutritionPointInputsByDate
          .get(date)!
          .add(nutritionPointIdentity(row));
      }

      for (const [date, inputKeys] of nutritionPointInputsByDate.entries()) {
        const slots = foodByDate.get(date) || new Set<string>();
        const targetSize = Math.max(slots.size, inputKeys.size);
        while (slots.size < targetSize) {
          slots.add(`point-input:${date}:${slots.size + 1}`);
        }
        foodByDate.set(date, slots);
      }

      const nutritionInputCount = [...foodByDate.values()].reduce(
        (sum, slots) => sum + slots.size,
        0,
      );

      const workoutByDate = new Map<string, { calories: number; steps: number }>();
      participantActivities.forEach((row: any) => {
        const date = dateKey(
          row?.log_date || row?.started_at || row?.created_at,
        );
        if (!date || date < fromDate || date > toDate) return;
        const current = workoutByDate.get(date) || { calories: 0, steps: 0 };
        current.calories += activityCalories(row);
        current.steps = Math.max(current.steps, activitySteps(row));
        workoutByDate.set(date, current);
      });

      let nutritionPoints = nutritionInputCount * 5;
      let nutritionAchievedDays = 0;
      for (const [date, meals] of foodByDate.entries()) {
        const count = meals.size;
        const datedTargets = effectiveTargetsForDate(targetTimeline, date);
        nutritionPoints += nutritionDailyBonusPoints({
          totalCalories: foodCaloriesByDate.get(date) || 0,
          calorieLimit: datedTargets.nutrition,
          hasNutritionInput: count > 0,
        });
        if (count >= 3) nutritionAchievedDays += 1;
      }

      let workoutPoints = 0;
      let workoutAchievedDays = 0;
      for (const [date, value] of workoutByDate.entries()) {
        const datedTargets = effectiveTargetsForDate(targetTimeline, date);
        const achieved = value.calories >= datedTargets.workout;
        workoutPoints += workoutDailyPoints({
          calories: value.calories,
          calorieTarget: datedTargets.workout,
          hasActivity: value.calories > 0 || value.steps > 0,
        });
        if (achieved) workoutAchievedDays += 1;
      }

      let healthtalkPoints = participantHealthtalk.reduce(
        (sum: number, row: any) => sum + healthtalkPoint(row),
        0,
      );
      const participantPointRows =
        filterOperationalRowsForProgram(
          participant,
          pointRowsInPeriod.filter(
            (row: any) =>
              asNumber(
                row.participant_id,
              ) === id,
          ),
          fromDate,
          toDate,
          ["log_date", "created_at"],
        );
      const pointLedger = resolveWellnessPointBreakdown({
        ledgerRows: participantPointRows,
        calculated: {
          nutrition: nutritionPoints,
          workout: workoutPoints,
          healthtalk: healthtalkPoints,
          other: 0,
        },
        preferCalculated: {
          nutrition: false,
          workout: true,
          healthtalk: true,
        },
      });
      nutritionPoints = pointLedger.nutrition;
      workoutPoints = pointLedger.workout;
      healthtalkPoints = pointLedger.healthtalk;
      const otherPoints = pointLedger.other;
      const activeDates = new Set([
        ...foodByDate.keys(),
        ...workoutByDate.keys(),
      ]);
      const effectiveDays =
        programWindowDayCount(
          participant,
          fromDate,
          toDate,
          days,
        );

      const compliancePercent =
        Math.round(
          (
            activeDates.size /
            effectiveDays
          ) * 100,
        );
      const successDates = new Set<string>();
      for (const date of new Set([
        ...foodByDate.keys(),
        ...workoutByDate.keys(),
      ])) {
        const nutritionOk = (foodByDate.get(date)?.size || 0) >= 3;
        const workoutCalories = workoutByDate.get(date)?.calories || 0;
        const datedTargets = effectiveTargetsForDate(targetTimeline, date);
        const workoutOk = workoutCalories >= datedTargets.workout;
        if (nutritionOk && workoutOk) successDates.add(date);
      }
      let currentStreak = 0;
      for (let offset = 0; offset > -effectiveDays; offset -= 1) {
        const date = jakartaDate(offset);
        if (!successDates.has(date)) {
          if (offset === 0) continue;
          break;
        }
        currentStreak += 1;
      }

      const totalPoints = pointLedger.total;
      const profile = profileMap.get(String(id)) || {};
      return {
        participant_id: id,
        name: participantName(participant),
        code,
        // WELLNESS_COACH_CANONICAL_GROUP_ACCESS_V126M20_3
        group_name: canonicalParticipantGroupName(participant, groupUnitMap),
        assigned_group_name: clean(assignment?.group_name) || "",
        assigned_group_unit_id:
          clean(assignment?.wellness_group_unit_id) || null,
        photo_url: profile.photo_url || "",
        photo_preview_url: profile.photo_preview_url || "",
        total_points: Math.round(totalPoints),
        compliance_percent: compliancePercent,
        nutrition_target_calories: nutritionTarget,
        workout_target_calories: workoutTarget,
        target_history: targetTimelineSummary(targetTimeline),
        workout_points: workoutPoints,
        workout_achieved_days: workoutAchievedDays,
        nutrition_points: nutritionPoints,
        nutrition_achieved_days: nutritionAchievedDays,
        healthtalk_points: healthtalkPoints,
        healthtalk_count: participantHealthtalk.length,
        other_points: otherPoints,
        point_source: pointLedger.source,
        point_ledger_rows: pointLedger.ledger_row_count,
        nutrition_history_sources: canonicalHistory?.sources || null,
        current_streak: currentStreak,
      };
    });

    rows.sort((left: any, right: any) => {
      const primary = metricValue(right, metric) - metricValue(left, metric);
      if (primary !== 0) return primary;
      return (
        right.total_points - left.total_points ||
        right.compliance_percent - left.compliance_percent
      );
    });
    const maxValue = Math.max(
      1,
      ...rows.map((row: any) => metricValue(row, metric)),
    );
    const ranked = rows.slice(0, 10).map((row: any, index: number) => ({
      ...row,
      rank: index + 1,
      metric_value: metricValue(row, metric),
      progress_percent: Math.round((metricValue(row, metric) / maxValue) * 100),
    }));

    return NextResponse.json({
      ok: true,
      metric,
      rows: ranked,
      period: { from: fromDate, to: toDate, days },
      summary: { participant_count: rows.length },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || "Ranking kelompok gagal dimuat.",
      },
      { status: 500 },
    );
  }
}
