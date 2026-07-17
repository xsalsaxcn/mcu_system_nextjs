import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  fetchWellnessGoogleSheetRows,
  googleSheetRowsToFoodLogs,
  googleSheetRowsToHealthtalkLogs,
} from "@/lib/wellness/googleSheetResponses";
import { postSupportWebhook } from "@/lib/wellness/supportServer";
import { resolveCompanyPortalContext } from "@/lib/wellness/companyAuth";
import { filterActivityRowsByFitnessSource, loadParticipantControlMap } from "@/lib/wellness/participantControls";
import { resolveWellnessPointBreakdown } from "@/lib/wellness/pointLedger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// WELLNESS_COMPANY_DASHBOARD_RANKING_V78
// WELLNESS_COMPANY_SINGLE_FITNESS_SOURCE_V79F
// WELLNESS_COMPANY_POINT_LEDGER_TRUTH_V79G
// Company-scoped executive dashboard, per-kelompok rankings, cross-group
// rankings, flags, and aggregated before-after progress. No schema migration.

function clean(value: any) {
  return String(value ?? "").trim();
}

function number(value: any) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function jakartaDate(offsetDays = 0) {
  const value = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((item) => item.type === "year")?.value || "";
  const month = parts.find((item) => item.type === "month")?.value || "";
  const day = parts.find((item) => item.type === "day")?.value || "";
  return year && month && day
    ? `${year}-${month}-${day}`
    : value.toISOString().slice(0, 10);
}

function dateOnly(value: any) {
  return clean(value).slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const first = new Date(`${from}T00:00:00Z`).getTime();
  const last = new Date(`${to}T00:00:00Z`).getTime();
  if (!Number.isFinite(first) || !Number.isFinite(last)) return 0;
  return Math.max(0, Math.floor((last - first) / 86_400_000));
}

async function safeRows(query: any) {
  try {
    const result = await query;
    if (result?.error) return [];
    return result?.data || [];
  } catch {
    return [];
  }
}

function groupRows(rows: any[], field = "participant_id") {
  const map = new Map<number, any[]>();
  for (const row of rows || []) {
    const id = number(row?.[field]);
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(row);
  }
  return map;
}

function rowsByParticipantOrCode(rows: any[]) {
  const byId = new Map<number, any[]>();
  const byCode = new Map<string, any[]>();

  for (const row of rows || []) {
    const id = number(row.participant_id);
    const code = clean(
      row.participant_code || row.employee_code || row.code,
    );
    if (id) {
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id)!.push(row);
    }
    if (code) {
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code)!.push(row);
    }
  }

  return { byId, byCode };
}

function dedupeRows(rows: any[]) {
  const map = new Map<string, any>();
  for (const row of rows || []) {
    const key = clean(row.id)
      ? `id:${row.id}`
      : JSON.stringify([
          row.participant_id,
          row.participant_code,
          row.log_date,
          row.event_date,
          row.meal_time,
          row.activity_type,
          row.title,
        ]);
    map.set(key, row);
  }
  return [...map.values()];
}

function mealSlot(row: any) {
  const text = clean(
    row.meal_time ||
      row.meal_type ||
      row.raw_payload?.["Waktu Makan"] ||
      row.raw_payload?.meal_time,
  ).toLowerCase();

  if (/sarapan|breakfast|pagi/.test(text)) return "breakfast";
  if (/siang|lunch/.test(text)) return "lunch";
  if (/malam|dinner/.test(text)) return "dinner";
  if (/snack|camilan/.test(text)) return `snack:${clean(row.id || row.created_at)}`;
  return `meal:${clean(row.id || row.created_at || row.food_name)}`;
}

function activityCalories(row: any) {
  return number(
    row.calories ||
      row.total_calories ||
      row.calories_burned ||
      row.raw_payload?.selected_active_calories ||
      row.raw_payload?.health_connect_calories ||
      row.raw_payload?.google_fit_active_calories,
  );
}

function activitySteps(row: any) {
  return number(
    row.steps ||
      row.total_steps ||
      row.raw_payload?.health_connect_steps ||
      row.raw_payload?.google_fit_steps,
  );
}

function healthtalkType(row: any) {
  return clean(
    row.healthtalk_type ||
      row.attendance_type ||
      row.type ||
      row.raw_payload?.["Jenis Healthtalk"],
  ).toLowerCase();
}

function healthtalkPoint(row: any) {
  const explicit = number(
    row.points || row.point || row.total_points || row.raw_payload?.["Total Point"],
  );
  if (explicit > 0) return explicit;
  const type = healthtalkType(row);
  if (/offline|luring|onsite|tatap/.test(type)) return 10;
  if (/online|daring|zoom|webinar/.test(type)) return 5;
  return 5;
}

function parseTargets(note: any) {
  const text = [note?.action_plan, note?.coach_note, note?.main_issue]
    .map(clean)
    .join("\n");
  const workout = text.match(/Target\s+(?:Kalori\s+)?Workout\s*:\s*([0-9.,]+)/i);
  const nutrition = text.match(/Target\s+Nutrisi\s*:\s*([0-9.,]+)/i);
  return {
    workout: workout ? number(workout[1]) : 0,
    nutrition: nutrition ? number(nutrition[1]) : 0,
  };
}

function latestTarget(notes: any[]) {
  return (
    [...(notes || [])]
      .sort((left, right) =>
        clean(right.created_at).localeCompare(clean(left.created_at)),
      )
      .find((item) => clean(item.topic).toLowerCase().includes("target wellness")) ||
    null
  );
}

function latestRow(rows: any[], fields: string[]) {
  return [...(rows || [])].sort((left, right) => {
    const leftDate = fields.map((field) => clean(left?.[field])).find(Boolean) || "";
    const rightDate = fields.map((field) => clean(right?.[field])).find(Boolean) || "";
    return rightDate.localeCompare(leftDate);
  })[0];
}

function baselineValue(participant: any, historyRows: any[], key: string) {
  const firstHistory = [...(historyRows || [])].sort((left, right) =>
    clean(left.checkup_date).localeCompare(clean(right.checkup_date)),
  )[0];

  const candidates: Record<string, any[]> = {
    weight: [participant.initial_weight_kg, participant.baseline_weight_kg, firstHistory?.weight_kg],
    bmi: [participant.baseline_bmi, firstHistory?.bmi],
    waist: [participant.baseline_waist_cm, participant.initial_waist_cm, firstHistory?.waist_cm],
    hba1c: [participant.baseline_hba1c, participant.initial_hba1c, participant.hba1c_initial, firstHistory?.hba1c_percent],
    sbp: [participant.baseline_sbp, participant.initial_sbp, firstHistory?.systolic],
  };

  return (candidates[key] || []).map(number).find((value) => value > 0) || 0;
}

function currentValues(
  participant: any,
  weightRows: any[],
  miniRows: any[],
  historyRows: any[],
) {
  const weight = latestRow(weightRows, ["log_date", "created_at"]);
  const mini = latestRow(miniRows, ["exam_date", "created_at"]);
  const history = latestRow(historyRows, ["checkup_date", "created_at"]);

  return {
    weight:
      number(history?.weight_kg) ||
      number(mini?.weight_kg) ||
      number(weight?.weight_kg) ||
      baselineValue(participant, historyRows, "weight"),
    bmi:
      number(history?.bmi) ||
      number(mini?.bmi) ||
      number(weight?.bmi) ||
      baselineValue(participant, historyRows, "bmi"),
    waist:
      number(history?.waist_cm) ||
      number(mini?.waist_cm) ||
      number(weight?.waist_cm) ||
      baselineValue(participant, historyRows, "waist"),
    hba1c:
      number(history?.hba1c_percent) ||
      number(mini?.hba1c) ||
      number(participant.hba1c) ||
      baselineValue(participant, historyRows, "hba1c"),
    sbp:
      number(history?.systolic) ||
      number(mini?.sbp) ||
      number(participant.sbp) ||
      baselineValue(participant, historyRows, "sbp"),
  };
}

function improvementScore(baseline: any, current: any, targetWeight: number) {
  const keys = ["weight", "bmi", "waist", "hba1c", "sbp"];
  let available = 0;
  let improved = 0;

  for (const key of keys) {
    const first = number(baseline[key]);
    const last = number(current[key]);
    if (!(first > 0 && last > 0)) continue;
    available += 1;

    if (key === "weight" && targetWeight > 0) {
      if (Math.abs(last - targetWeight) < Math.abs(first - targetWeight)) improved += 1;
    } else if (last < first) {
      improved += 1;
    }
  }

  return available ? Math.round((improved / available) * 100) : 0;
}

function currentStreak(
  today: string,
  nutritionTargetDates: Set<string>,
  workoutTargetDates: Set<string>,
) {
  let streak = 0;
  for (let offset = 0; offset < 120; offset += 1) {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    if (!nutritionTargetDates.has(key) || !workoutTargetDates.has(key)) break;
    streak += 1;
  }
  return streak;
}

function metricValue(item: any, metric: string) {
  if (metric === "diligence") return number(item.diligence_percent);
  if (metric === "workout") return number(item.workout_achievement_percent);
  if (metric === "nutrition") return number(item.nutrition_achievement_percent);
  if (metric === "healthtalk") return number(item.healthtalk_points);
  if (metric === "streak") return number(item.current_streak);
  return number(item.overall_score);
}

function rankParticipants(items: any[], metric: string, limit = 10) {
  return [...items]
    .sort((left, right) => {
      const difference = metricValue(right, metric) - metricValue(left, metric);
      if (difference !== 0) return difference;
      return clean(left.name).localeCompare(clean(right.name), "id");
    })
    .slice(0, limit)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
      ranking_metric: metric,
      ranking_value: metricValue(item, metric),
    }));
}

export async function GET(request: NextRequest) {
  try {
    const context = await resolveCompanyPortalContext(request);
    if (!context.user) return fail(context.message || "Unauthorized", 401);

    if (!context.company) {
      return ok({
        requires_company_selection: context.requiresSelection,
        message: context.message,
        companies: context.companies,
      });
    }

    const supabase = getSupabaseAdmin();
    const companyId = number(context.company.id);
    const days = clamp(number(request.nextUrl.searchParams.get("days")) || 30, 7, 90);
    const today = jakartaDate();
    const fromDate = jakartaDate(-(days - 1));

    const [participants, groupUnits, assignments, coachUsers] = await Promise.all([
      safeRows(
        supabase
          .from("wellness_participants")
          .select("*")
          .eq("wellness_company_id", companyId)
          .limit(5000),
      ),
      safeRows(
        supabase
          .from("wellness_group_units")
          .select("*")
          .eq("company_id", companyId)
          .order("unit_type", { ascending: true })
          .order("name", { ascending: true }),
      ),
      safeRows(
        supabase
          .from("wellness_coach_group_assignments")
          .select("*")
          .eq("is_active", true)
          .limit(5000),
      ),
      safeRows(
        supabase
          .from("wellness_coach_users")
          .select("*")
          .limit(1000),
      ),
    ]);

    const participantIds = participants.map((item: any) => number(item.id)).filter(Boolean);
    const participantCodes = participants.map((item: any) => clean(item.code)).filter(Boolean);
    const participantControlMap = await loadParticipantControlMap(
      supabase,
      participantIds,
    );

    let activityRows: any[] = [];
    let foodRows: any[] = [];
    let healthtalkRows: any[] = [];
    let pointRows: any[] = [];
    let weightRows: any[] = [];
    let miniRows: any[] = [];
    let historyRows: any[] = [];
    let coachNotes: any[] = [];

    if (participantIds.length > 0) {
      [
        activityRows,
        foodRows,
        healthtalkRows,
        pointRows,
        weightRows,
        miniRows,
        historyRows,
        coachNotes,
      ] = await Promise.all([
        safeRows(
          supabase
            .from("wellness_activity_logs")
            .select("*")
            .in("participant_id", participantIds)
            .gte("log_date", fromDate)
            .limit(20000),
        ),
        safeRows(
          supabase
            .from("wellness_food_logs")
            .select("*")
            .in("participant_id", participantIds)
            .gte("log_date", fromDate)
            .limit(20000),
        ),
        safeRows(
          supabase
            .from("wellness_healthtalk_logs")
            .select("*")
            .in("participant_id", participantIds)
            .limit(10000),
        ),
        safeRows(
          supabase
            .from("wellness_point_logs")
            .select("*")
            .in("participant_id", participantIds)
            .gte("log_date", fromDate)
            .limit(20000),
        ),
        safeRows(
          supabase
            .from("wellness_weight_logs")
            .select("*")
            .in("participant_id", participantIds)
            .limit(10000),
        ),
        safeRows(
          supabase
            .from("wellness_mini_mcu_logs")
            .select("*")
            .in("participant_id", participantIds)
            .limit(10000),
        ),
        safeRows(
          supabase
            .from("wellness_checkup_history")
            .select("*")
            .in("participant_id", participantIds)
            .limit(10000),
        ),
        safeRows(
          supabase
            .from("wellness_coach_notes")
            .select("*")
            .in("participant_id", participantIds)
            .order("created_at", { ascending: false })
            .limit(10000),
        ),
      ]);
    }

    const sheetResult = await fetchWellnessGoogleSheetRows({ limit: 5000 }).catch(
      () => ({ rows: [] }),
    );

    const sheetFoodRows = googleSheetRowsToFoodLogs(sheetResult.rows || []).filter(
      (row: any) =>
        participantIds.includes(number(row.participant_id)) ||
        participantCodes.includes(clean(row.participant_code)),
    );
    const sheetHealthtalkRows = googleSheetRowsToHealthtalkLogs(
      sheetResult.rows || [],
    ).filter(
      (row: any) =>
        participantIds.includes(number(row.participant_id)) ||
        participantCodes.includes(clean(row.participant_code)),
    );

    const dbFood = groupRows(foodRows);
    const sheetFood = rowsByParticipantOrCode(sheetFoodRows);
    const selectedActivityRows = filterActivityRowsByFitnessSource(
      activityRows,
      participantControlMap,
    );
    const dbActivity = groupRows(selectedActivityRows);
    const dbHealthtalk = groupRows(healthtalkRows);
    const sheetHealthtalk = rowsByParticipantOrCode(sheetHealthtalkRows);
    const points = groupRows(pointRows);
    const weights = groupRows(weightRows);
    const mini = groupRows(miniRows);
    const history = groupRows(historyRows);
    const notes = groupRows(coachNotes);

    const unitById = new Map<number, any>(
      groupUnits.map((item: any) => [number(item.id), item]),
    );
    const coachById = new Map<number, any>(
      coachUsers.map((item: any) => [number(item.id), item]),
    );

    const companyGroupIds = new Set(groupUnits.map((item: any) => clean(item.id)));
    const companyAssignments = assignments.filter((item: any) =>
      companyGroupIds.has(clean(item.wellness_group_unit_id)),
    );

    const coachProfilesResult = await postSupportWebhook("wellnessProfileList", {
      actorType: "coach",
      actorIds: [...new Set(companyAssignments.map((item: any) => clean(item.coach_user_id)))],
    }).catch(() => ({ profiles: [] }));
    const coachProfileMap = new Map<string, any>(
      (coachProfilesResult.profiles || []).map((item: any) => [clean(item.actor_id), item]),
    );

    const participantProfilesResult = await postSupportWebhook(
      "wellnessProfileList",
      {
        actorType: "participant",
        actorIds: participantIds.map(String),
      },
    ).catch(() => ({ profiles: [] }));
    const participantProfileMap = new Map<string, any>(
      (participantProfilesResult.profiles || []).map((item: any) => [
        clean(item.actor_id),
        item,
      ]),
    );

    const participantCards = participants.map((participant: any) => {
      const id = number(participant.id);
      const code = clean(participant.code || participant.employee_code);
      const sheetFoods = dedupeRows([
        ...(sheetFood.byId.get(id) || []),
        ...(sheetFood.byCode.get(code) || []),
      ]).filter((item: any) => dateOnly(item.log_date || item.created_at) >= fromDate);
      const foods = sheetFoods.length
        ? sheetFoods
        : (dbFood.get(id) || []).filter(
            (item: any) => dateOnly(item.log_date || item.created_at) >= fromDate,
          );
      const activities = dbActivity.get(id) || [];
      const sheetTalks = dedupeRows([
        ...(sheetHealthtalk.byId.get(id) || []),
        ...(sheetHealthtalk.byCode.get(code) || []),
      ]);
      const talks = (sheetTalks.length ? sheetTalks : dbHealthtalk.get(id) || []).filter(
        (item: any) => {
          const date = dateOnly(item.event_date || item.log_date || item.created_at);
          return !date || (date >= fromDate && date <= today);
        },
      );
      const participantNotes = notes.get(id) || [];
      const targetNote = latestTarget(participantNotes);
      const parsedTargets = parseTargets(targetNote);
      const workoutTarget =
        number(
          participant.workout_calorie_target ||
            participant.active_calorie_target ||
            participant.daily_activity_calorie_target,
        ) ||
        parsedTargets.workout ||
        300;

      const effectiveDays = clamp(
        participant.program_start_date
          ? daysBetween(
              dateOnly(participant.program_start_date),
              today,
            ) + 1
          : days,
        1,
        days,
      );

      const nutritionByDate = new Map<string, Set<string>>();
      for (const row of foods) {
        const date = dateOnly(row.log_date || row.created_at);
        if (!date || date < fromDate || date > today) continue;
        if (!nutritionByDate.has(date)) nutritionByDate.set(date, new Set());
        nutritionByDate.get(date)!.add(mealSlot(row));
      }

      const workoutByDate = new Map<string, { calories: number; steps: number }>();
      for (const row of activities) {
        const date = dateOnly(row.log_date || row.started_at || row.created_at);
        if (!date || date < fromDate || date > today) continue;
        const current = workoutByDate.get(date) || { calories: 0, steps: 0 };
        current.calories += activityCalories(row);
        current.steps = Math.max(current.steps, activitySteps(row));
        workoutByDate.set(date, current);
      }

      const nutritionTargetDates = new Set<string>();
      let nutritionPoints = 0;
      for (const [date, slots] of nutritionByDate.entries()) {
        if (slots.size >= 3) {
          nutritionPoints += 10;
          nutritionTargetDates.add(date);
        } else if (slots.size > 0) {
          nutritionPoints += 5;
        }
      }

      const workoutTargetDates = new Set<string>();
      let workoutPoints = 0;
      for (const [date, value] of workoutByDate.entries()) {
        if (value.calories >= workoutTarget || value.steps >= 8000) {
          workoutPoints += 10;
          workoutTargetDates.add(date);
        } else if (value.calories > 0 || value.steps > 0) {
          workoutPoints += 5;
        }
      }

      let healthtalkPoints = talks.reduce(
        (sum: number, item: any) => sum + healthtalkPoint(item),
        0,
      );
      const healthtalkCount = talks.length;
      const activeDates = new Set([
        ...nutritionByDate.keys(),
        ...workoutByDate.keys(),
      ]);
      const diligencePercent = Math.round(
        (activeDates.size / effectiveDays) * 100,
      );
      const nutritionAchievementPercent = Math.round(
        (nutritionTargetDates.size / effectiveDays) * 100,
      );
      const workoutAchievementPercent = Math.round(
        (workoutTargetDates.size / effectiveDays) * 100,
      );
      const streak = currentStreak(
        today,
        nutritionTargetDates,
        workoutTargetDates,
      );

      const historyParticipant = history.get(id) || [];
      const baseline = {
        weight: baselineValue(participant, historyParticipant, "weight"),
        bmi: baselineValue(participant, historyParticipant, "bmi"),
        waist: baselineValue(participant, historyParticipant, "waist"),
        hba1c: baselineValue(participant, historyParticipant, "hba1c"),
        sbp: baselineValue(participant, historyParticipant, "sbp"),
      };
      const current = currentValues(
        participant,
        weights.get(id) || [],
        mini.get(id) || [],
        historyParticipant,
      );
      const healthImprovementPercent = improvementScore(
        baseline,
        current,
        number(participant.target_weight_kg),
      );

      const pointLedger = resolveWellnessPointBreakdown({
        ledgerRows: points.get(id) || [],
        calculated: {
          nutrition: nutritionPoints,
          workout: workoutPoints,
          healthtalk: healthtalkPoints,
          other: 0,
        },
      });

      // Canonical rule: do not add calculated event points on top of
      // wellness_point_logs. Use the ledger per category, with calculation only
      // for legacy/imported categories that have no ledger row.
      nutritionPoints = pointLedger.nutrition;
      workoutPoints = pointLedger.workout;
      healthtalkPoints = pointLedger.healthtalk;
      const otherPoints = pointLedger.other;
      const totalPoints = pointLedger.total;
      const healthtalkPercent = clamp(healthtalkCount * 25, 0, 100);
      const streakPercent = clamp((streak / 7) * 100, 0, 100);
      const overallScore = Math.round(
        diligencePercent * 0.3 +
          workoutAchievementPercent * 0.25 +
          nutritionAchievementPercent * 0.2 +
          healthtalkPercent * 0.1 +
          streakPercent * 0.1 +
          healthImprovementPercent * 0.05,
      );

      const flag =
        diligencePercent >= 70
          ? "green"
          : diligencePercent >= 35
            ? "yellow"
            : "red";

      const childUnit = unitById.get(number(participant.wellness_group_unit_id));
      const explicitKelompok = unitById.get(number(participant.wellness_kelompok_id));
      const kelompok =
        explicitKelompok ||
        (childUnit?.parent_id ? unitById.get(number(childUnit.parent_id)) : null) ||
        (childUnit?.unit_type === "kelompok" ? childUnit : null);
      const group = childUnit?.unit_type === "group" ? childUnit : null;
      const profile = participantProfileMap.get(String(id)) || {};

      return {
        id,
        name: clean(participant.name || participant.full_name) || `Peserta ${id}`,
        code,
        profile_photo_url: clean(profile.photo_url),
        profile_photo_preview_url: clean(profile.photo_preview_url),
        kelompok_id: number(kelompok?.id) || 0,
        kelompok_name: clean(kelompok?.name) || clean(participant.group_name) || "Tanpa Kelompok",
        group_id: number(group?.id) || 0,
        group_name: clean(group?.name) || clean(participant.group_name) || "-",
        total_points: totalPoints,
        nutrition_points: nutritionPoints,
        workout_points: workoutPoints,
        healthtalk_points: healthtalkPoints,
        other_points: otherPoints,
        point_source: pointLedger.source,
        point_ledger_rows: pointLedger.ledger_row_count,
        diligence_percent: clamp(diligencePercent, 0, 100),
        nutrition_achievement_percent: clamp(nutritionAchievementPercent, 0, 100),
        workout_achievement_percent: clamp(workoutAchievementPercent, 0, 100),
        health_improvement_percent: healthImprovementPercent,
        current_streak: streak,
        healthtalk_count: healthtalkCount,
        active_days: activeDates.size,
        nutrition_target_days: nutritionTargetDates.size,
        workout_target_days: workoutTargetDates.size,
        workout_target_calories: workoutTarget,
        overall_score: clamp(overallScore, 0, 100),
        flag,
        flag_label:
          flag === "green"
            ? "Patuh"
            : flag === "yellow"
              ? "Perlu dipantau"
              : "Perlu follow up",
        wellness_control: participantControlMap.get(id) || null,
        baseline,
        current,
      };
    });

    const kelompokUnits = groupUnits.filter(
      (item: any) => clean(item.unit_type).toLowerCase() === "kelompok",
    );

    const kelompokCards = kelompokUnits.map((unit: any) => {
      const members = participantCards.filter(
        (item: any) => number(item.kelompok_id) === number(unit.id),
      );
      const childGroups = groupUnits.filter(
        (item: any) => number(item.parent_id) === number(unit.id),
      );
      const relatedGroupIds = new Set([
        clean(unit.id),
        ...childGroups.map((item: any) => clean(item.id)),
      ]);
      const relatedAssignments = companyAssignments.filter((item: any) =>
        relatedGroupIds.has(clean(item.wellness_group_unit_id)),
      );
      const coaches = [...new Set<number>(relatedAssignments.map((item: any) => number(item.coach_user_id)))]
        .map((coachId: number) => {
          const coach = coachById.get(coachId) || {};
          const profile = coachProfileMap.get(String(coachId)) || {};
          return {
            id: coachId,
            name: clean(coach.name || coach.full_name || coach.email) || clean(unit.coach_name) || "Coach Wellness",
            email: clean(coach.email),
            profile_photo_url: clean(profile.photo_url),
            profile_photo_preview_url: clean(profile.photo_preview_url),
          };
        });

      if (!coaches.length && clean(unit.coach_name)) {
        coaches.push({
          id: 0,
          name: clean(unit.coach_name),
          email: "",
          profile_photo_url: "",
          profile_photo_preview_url: "",
        });
      }

      const average = (field: string) =>
        members.length
          ? Math.round(
              members.reduce((sum: number, item: any) => sum + number(item[field]), 0) /
                members.length,
            )
          : 0;

      const overallScore = average("overall_score");
      return {
        id: number(unit.id),
        name: clean(unit.name) || `Kelompok ${unit.id}`,
        coaches,
        child_groups: childGroups.map((item: any) => ({
          id: number(item.id),
          name: clean(item.name),
        })),
        member_count: members.length,
        overall_score: overallScore,
        diligence_percent: average("diligence_percent"),
        workout_achievement_percent: average("workout_achievement_percent"),
        nutrition_achievement_percent: average("nutrition_achievement_percent"),
        health_improvement_percent: average("health_improvement_percent"),
        healthtalk_points: members.reduce(
          (sum: number, item: any) => sum + number(item.healthtalk_points),
          0,
        ),
        total_points: members.reduce(
          (sum: number, item: any) => sum + number(item.total_points),
          0,
        ),
        flags: {
          green: members.filter((item: any) => item.flag === "green").length,
          yellow: members.filter((item: any) => item.flag === "yellow").length,
          red: members.filter((item: any) => item.flag === "red").length,
        },
        rankings: {
          overall: rankParticipants(members, "overall"),
          diligence: rankParticipants(members, "diligence"),
          workout: rankParticipants(members, "workout"),
          nutrition: rankParticipants(members, "nutrition"),
          healthtalk: rankParticipants(members, "healthtalk"),
          streak: rankParticipants(members, "streak"),
        },
      };
    });

    // Include orphaned participants so no one disappears from company reporting.
    const orphanMembers = participantCards.filter((item: any) => !item.kelompok_id);
    if (orphanMembers.length > 0) {
      kelompokCards.push({
        id: 0,
        name: "Belum Terpetakan",
        coaches: [],
        child_groups: [],
        member_count: orphanMembers.length,
        overall_score: Math.round(
          orphanMembers.reduce((sum: number, item: any) => sum + item.overall_score, 0) /
            orphanMembers.length,
        ),
        diligence_percent: Math.round(
          orphanMembers.reduce((sum: number, item: any) => sum + item.diligence_percent, 0) /
            orphanMembers.length,
        ),
        workout_achievement_percent: Math.round(
          orphanMembers.reduce((sum: number, item: any) => sum + item.workout_achievement_percent, 0) /
            orphanMembers.length,
        ),
        nutrition_achievement_percent: Math.round(
          orphanMembers.reduce((sum: number, item: any) => sum + item.nutrition_achievement_percent, 0) /
            orphanMembers.length,
        ),
        health_improvement_percent: 0,
        healthtalk_points: orphanMembers.reduce(
          (sum: number, item: any) => sum + item.healthtalk_points,
          0,
        ),
        total_points: orphanMembers.reduce(
          (sum: number, item: any) => sum + item.total_points,
          0,
        ),
        flags: {
          green: orphanMembers.filter((item: any) => item.flag === "green").length,
          yellow: orphanMembers.filter((item: any) => item.flag === "yellow").length,
          red: orphanMembers.filter((item: any) => item.flag === "red").length,
        },
        rankings: {
          overall: rankParticipants(orphanMembers, "overall"),
          diligence: rankParticipants(orphanMembers, "diligence"),
          workout: rankParticipants(orphanMembers, "workout"),
          nutrition: rankParticipants(orphanMembers, "nutrition"),
          healthtalk: rankParticipants(orphanMembers, "healthtalk"),
          streak: rankParticipants(orphanMembers, "streak"),
        },
      });
    }

    const groupRanking = [...kelompokCards]
      .sort((left: any, right: any) => {
        const scoreDifference = right.overall_score - left.overall_score;
        if (scoreDifference !== 0) return scoreDifference;
        return left.name.localeCompare(right.name, "id");
      })
      .map((item: any, index: number) => ({ ...item, rank: index + 1 }));

    const beforeAfter = [
      { key: "weight", label: "Berat Badan", unit: "kg" },
      { key: "bmi", label: "BMI", unit: "" },
      { key: "waist", label: "Lingkar Pinggang", unit: "cm" },
      { key: "hba1c", label: "HbA1c", unit: "%" },
      { key: "sbp", label: "Tekanan Darah Sistolik", unit: "mmHg" },
    ].map((parameter) => {
      const available = participantCards.filter(
        (item: any) =>
          number(item.baseline?.[parameter.key]) > 0 &&
          number(item.current?.[parameter.key]) > 0,
      );
      const baselineAverage = available.length
        ? available.reduce(
            (sum: number, item: any) => sum + number(item.baseline[parameter.key]),
            0,
          ) / available.length
        : 0;
      const currentAverage = available.length
        ? available.reduce(
            (sum: number, item: any) => sum + number(item.current[parameter.key]),
            0,
          ) / available.length
        : 0;
      return {
        ...parameter,
        baseline: Math.round(baselineAverage * 10) / 10,
        current: Math.round(currentAverage * 10) / 10,
        delta: Math.round((currentAverage - baselineAverage) * 10) / 10,
        participant_count: available.length,
        improved_count: available.filter(
          (item: any) =>
            number(item.current[parameter.key]) <
            number(item.baseline[parameter.key]),
        ).length,
      };
    });

    const coaches = [...new Set<number>(companyAssignments.map((item: any) => number(item.coach_user_id)))]
      .filter(Boolean)
      .map((coachId: number) => {
        const coach = coachById.get(coachId) || {};
        const profile = coachProfileMap.get(String(coachId)) || {};
        const assignedUnits = companyAssignments
          .filter((item: any) => number(item.coach_user_id) === coachId)
          .map((item: any) => unitById.get(number(item.wellness_group_unit_id)))
          .filter(Boolean);
        const kelompokNames = [...new Set(assignedUnits.map((unit: any) => {
          const parent = unit?.parent_id ? unitById.get(number(unit.parent_id)) : unit;
          return clean(parent?.name || unit?.name);
        }).filter(Boolean))];
        return {
          id: coachId,
          name: clean(coach.name || coach.full_name || coach.email) || `Coach ${coachId}`,
          email: clean(coach.email),
          kelompok_names: kelompokNames,
          profile_photo_url: clean(profile.photo_url),
          profile_photo_preview_url: clean(profile.photo_preview_url),
        };
      });

    return ok({
      company: {
        id: companyId,
        name: clean(context.company.name),
        code: clean(context.company.code || context.company.slug),
      },
      companies: context.companies,
      can_select_company: context.isManager,
      period: { from: fromDate, to: today, days },
      summary: {
        total_participants: participantCards.length,
        active_participants: participantCards.filter((item: any) => item.active_days > 0).length,
        compliance_rate: participantCards.length
          ? Math.round(
              participantCards.reduce(
                (sum: number, item: any) => sum + item.diligence_percent,
                0,
              ) / participantCards.length,
            )
          : 0,
        flags: {
          green: participantCards.filter((item: any) => item.flag === "green").length,
          yellow: participantCards.filter((item: any) => item.flag === "yellow").length,
          red: participantCards.filter((item: any) => item.flag === "red").length,
        },
        group_count: kelompokCards.length,
        coach_count: coaches.length,
        total_points: participantCards.reduce(
          (sum: number, item: any) => sum + item.total_points,
          0,
        ),
        average_group_score: kelompokCards.length
          ? Math.round(
              kelompokCards.reduce(
                (sum: number, item: any) => sum + item.overall_score,
                0,
              ) / kelompokCards.length,
            )
          : 0,
      },
      group_ranking: groupRanking,
      top_participants: rankParticipants(participantCards, "overall", 10),
      rankings: {
        overall: rankParticipants(participantCards, "overall", 10),
        diligence: rankParticipants(participantCards, "diligence", 10),
        workout: rankParticipants(participantCards, "workout", 10),
        nutrition: rankParticipants(participantCards, "nutrition", 10),
        healthtalk: rankParticipants(participantCards, "healthtalk", 10),
        streak: rankParticipants(participantCards, "streak", 10),
      },
      participants: participantCards,
      coaches,
      before_after: beforeAfter,
    });
  } catch (error: any) {
    return fail(error?.message || "Portal Perusahaan gagal dimuat.", 500);
  }
}
