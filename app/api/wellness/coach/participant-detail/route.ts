import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchWellnessGoogleSheetRows,
  googleSheetRowsToFoodLogs,
  googleSheetRowsToHealthtalkLogs,
} from "@/lib/wellness/googleSheetResponses";
import { filterActivityRowsByFitnessSource, loadParticipantControlMap } from "@/lib/wellness/participantControls";
import { resolveWellnessPointBreakdown } from "@/lib/wellness/pointLedger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// WELLNESS_COACH_PARTICIPANT_DETAIL_V55
// Read-only detail endpoint for assigned coach participants.
// No schema migration and no access outside coach assignments.
// WELLNESS_COACH_POINT_RULES_V59
// WELLNESS_COACH_DETAIL_SINGLE_FITNESS_SOURCE_V79F

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

function parseNumber(value: any): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = clean(value);
  if (!text || text === "-") return null;

  const normalized = /^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text)
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function asNumber(value: any): number {
  return parseNumber(value) ?? 0;
}

function nullableNumber(...values: any[]): number | null {
  for (const value of values) {
    const n = parseNumber(value);
    if (n !== null) return n;
  }
  return null;
}

function dateKey(value: any) {
  return clean(value).slice(0, 10);
}

function dateLabel(value: any) {
  const text = dateKey(value);
  const parts = text.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : text || "-";
}

function participantIds(row: any) {
  return [
    row?.wellness_group_unit_id,
    row?.group_unit_id,
    row?.group_id,
    row?.wellness_group_id,
  ]
    .map(clean)
    .filter(Boolean);
}

function participantNames(row: any) {
  return [
    row?.group_name,
    row?.group_unit_name,
    row?.risk_group,
    row?.risk_category,
    row?.category,
    row?.group,
  ]
    .map((value) => clean(value).toLowerCase())
    .filter(Boolean);
}

function canAccessParticipant(row: any, assignments: any[]) {
  const allowedIds = new Set(
    (assignments || []).map((item) => clean(item.wellness_group_unit_id)).filter(Boolean)
  );
  const allowedNames = new Set(
    (assignments || []).map((item) => clean(item.group_name).toLowerCase()).filter(Boolean)
  );

  return (
    participantIds(row).some((id) => allowedIds.has(id)) ||
    participantNames(row).some((name) => allowedNames.has(name))
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
  builder: (query: any) => any
): Promise<any[]> {
  try {
    const result = await builder(supabase.from(table).select("*"));
    return result?.error ? [] : result?.data || [];
  } catch {
    return [];
  }
}

function mergeRows(...lists: any[][]) {
  const map = new Map<string, any>();

  for (const list of lists) {
    for (const row of list || []) {
      const key = row?.id
        ? `id:${row.id}`
        : JSON.stringify([
            row?.participant_id,
            row?.participant_code,
            row?.log_date,
            row?.event_date,
            row?.title,
            row?.healthtalk_title,
            row?.food_name,
          ]);
      map.set(key, row);
    }
  }

  return [...map.values()];
}

function aggregateByDate(rows: any[], valueGetter: (row: any) => number, dateGetter: (row: any) => string) {
  const map = new Map<string, number>();

  for (const row of rows || []) {
    const date = dateKey(dateGetter(row));
    if (!date) continue;
    const value = valueGetter(row);
    if (!Number.isFinite(value)) continue;
    map.set(date, (map.get(date) || 0) + value);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([date, value]) => ({
      date,
      label: dateLabel(date),
      value: Math.round(value * 10) / 10,
    }));
}


// WELLNESS_COACH_STREAK_COMPUTED_V66
function jakartaDateKey(offsetDays = 0) {
  const shifted = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

function shortDayLabel(date: string) {
  if (!date) return "-";
  return new Date(`${date}T12:00:00+07:00`).toLocaleDateString("id-ID", {
    weekday: "short",
    timeZone: "Asia/Jakarta",
  }).slice(0, 3);
}

function buildStreakSummary(
  foodRows: any[],
  activityRows: any[],
  workoutTargetCalories: number
) {
  const map = new Map<string, {
    mealKeys: Set<string>;
    nutritionCalories: number;
    workoutCalories: number;
    steps: number;
  }>();

  const ensure = (date: string) => {
    if (!map.has(date)) {
      map.set(date, { mealKeys: new Set<string>(), nutritionCalories: 0, workoutCalories: 0, steps: 0 });
    }
    return map.get(date)!;
  };

  for (const row of foodRows || []) {
    const date = dateKey(row?.log_date || row?.created_at || row?.updated_at);
    if (!date) continue;
    const bucket = ensure(date);
    const meal = clean(row?.meal_time || row?.meal_type || row?.meal_period || row?.waktu_makan).toLowerCase();
    bucket.mealKeys.add(meal || `row-${bucket.mealKeys.size + 1}`);
    bucket.nutritionCalories += foodCalories(row);
  }

  for (const row of activityRows || []) {
    const date = dateKey(row?.log_date || row?.started_at || row?.created_at || row?.updated_at);
    if (!date) continue;
    const bucket = ensure(date);
    bucket.workoutCalories += activityCalories(row);
    bucket.steps += activitySteps(row);
  }

  const days = [] as any[];
  for (let offset = -41; offset <= 0; offset += 1) {
    const date = jakartaDateKey(offset);
    const bucket = map.get(date);
    const nutritionCount = bucket?.mealKeys.size || 0;
    const workoutCalories = Math.round(bucket?.workoutCalories || 0);
    const success = nutritionCount >= 3 && (
      workoutTargetCalories > 0
        ? workoutCalories >= workoutTargetCalories
        : workoutCalories > 0
    );
    days.push({
      date,
      label: shortDayLabel(date),
      nutrition_count: nutritionCount,
      nutrition_calories: Math.round(bucket?.nutritionCalories || 0),
      workout_calories: workoutCalories,
      steps: Math.round(bucket?.steps || 0),
      success,
    });
  }

  let cursor = days.length - 1;
  if (!days[cursor]?.success) cursor -= 1;
  let currentStreak = 0;
  while (cursor >= 0 && days[cursor]?.success) {
    currentStreak += 1;
    cursor -= 1;
  }

  let longestStreak = 0;
  let running = 0;
  for (const day of days) {
    if (day.success) {
      running += 1;
      longestStreak = Math.max(longestStreak, running);
    } else {
      running = 0;
    }
  }

  return {
    current_streak: currentStreak,
    longest_streak: longestStreak,
    success_dates: days.filter((item) => item.success).map((item) => item.date),
    days: days.slice(-7),
  };
}

function compactClinicalPoints(rows: any[], getter: (row: any) => number | null) {
  const map = new Map<string, any>();

  for (const row of rows || []) {
    const date = dateKey(row?.checkup_date || row?.exam_date || row?.log_date || row?.created_at);
    if (!date) continue;
    const value = getter(row);
    if (value === null || !Number.isFinite(value)) continue;
    map.set(date, { date, label: dateLabel(date), value: Math.round(value * 10) / 10 });
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-20);
}

function compactBloodPressure(rows: any[]) {
  const map = new Map<string, any>();

  for (const row of rows || []) {
    const date = dateKey(row?.checkup_date || row?.exam_date || row?.created_at);
    if (!date) continue;
    const systolic = nullableNumber(row?.systolic, row?.sbp, row?.systolic_bp);
    const diastolic = nullableNumber(row?.diastolic, row?.dbp, row?.diastolic_bp);
    if (systolic === null && diastolic === null) continue;
    map.set(date, {
      date,
      label: dateLabel(date),
      value: systolic,
      secondary: diastolic,
    });
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-20);
}

function activityCalories(row: any) {
  return asNumber(
    row?.calories ??
      row?.total_calories ??
      row?.calories_burned ??
      row?.activity_calories ??
      row?.raw_payload?.health_connect_calories ??
      row?.raw_payload?.google_fit_calories_expended ??
      row?.raw_payload?.calories
  );
}

function activitySteps(row: any) {
  return asNumber(
    row?.steps ?? row?.total_steps ?? row?.raw_payload?.health_connect_steps ?? row?.raw_payload?.google_fit_steps
  );
}

function foodCalories(row: any) {
  return asNumber(
    row?.total_calories ??
      row?.calories ??
      row?.estimated_calories ??
      row?.raw_payload?.["Kalori Makanan"]
  );
}

function healthtalkPoint(row: any) {
  const type = clean(
    row?.healthtalk_type ||
      row?.attendance_type ||
      row?.participation_type ||
      row?.type
  ).toLowerCase();

  if (/offline|luring|onsite|tatap muka/.test(type)) return 10;
  if (/online|daring|webinar|zoom/.test(type)) return 5;
  return 0;
}

function parseTargetsFromNote(note: any) {
  const text = [note?.action_plan, note?.coach_note, note?.main_issue]
    .map(clean)
    .filter(Boolean)
    .join("\n");
  const find = (pattern: RegExp) => {
    const match = text.match(pattern);
    return match ? asNumber(String(match[1]).replace(",", ".")) : 0;
  };
  return {
    workout_min_calories: find(/Target\s+(?:Kalori\s+)?Workout\s*:\s*([0-9.,]+)/i),
  };
}

function workoutTargetForParticipant(participant: any, notes: any[]) {
  const direct = asNumber(
    participant?.workout_calorie_target ||
      participant?.active_calorie_target ||
      participant?.daily_activity_calorie_target
  );
  if (direct > 0) return direct;

  for (const note of notes || []) {
    const parsed = parseTargetsFromNote(note);
    if (parsed.workout_min_calories > 0) return parsed.workout_min_calories;
  }
  return 0;
}

function rowsByDate(rows: any[], dateGetter: (row: any) => string) {
  const map = new Map<string, any[]>();
  for (const row of rows || []) {
    const date = dateKey(dateGetter(row));
    if (!date) continue;
    const current = map.get(date) || [];
    current.push(row);
    map.set(date, current);
  }
  return map;
}

function addDailyPoint(map: Map<string, number>, date: string, points: number) {
  if (!date || !Number.isFinite(points)) return;
  map.set(date, (map.get(date) || 0) + points);
}

function nutritionMealCount(rows: any[]) {
  const slots = new Set<string>();
  (rows || []).forEach((row, index) => {
    const mealType = clean(row?.meal_type || row?.meal_time).toLowerCase();
    const fallback = clean(row?.id || row?.created_at || `row-${index}`);
    slots.add(mealType || `log:${fallback}:${index}`);
  });
  return slots.size;
}

function pointCategory(row: any) {
  const text = [row?.source_type, row?.point_key, row?.description]
    .map(clean)
    .join(" ")
    .toLowerCase();

  if (/health.?talk|seminar/.test(text)) return "healthtalk";
  if (/activity|workout|step/.test(text)) return "activity";
  if (/food|nutrition|nutrisi/.test(text)) return "nutrition";
  return "other";
}

export async function GET(request: NextRequest) {
  try {
    const participantId = asNumber(request.nextUrl.searchParams.get("participant_id"));
    if (!participantId) {
      return NextResponse.json({ ok: false, message: "participant_id wajib diisi." }, { status: 400 });
    }

    const supabase = adminClient();
    const coach = await getCoach(request, supabase);
    if (!coach) {
      return NextResponse.json({ ok: false, message: "Session coach belum aktif." }, { status: 401 });
    }

    const { data: assignments, error: assignmentError } = await supabase
      .from("wellness_coach_group_assignments")
      .select("*")
      .eq("coach_user_id", coach.id)
      .eq("is_active", true);

    if (assignmentError) throw assignmentError;

    const { data: participant, error: participantError } = await supabase
      .from("wellness_participants")
      .select("*")
      .eq("id", participantId)
      .maybeSingle();

    if (participantError || !participant) {
      return NextResponse.json({ ok: false, message: "Peserta tidak ditemukan." }, { status: 404 });
    }

    if (!canAccessParticipant(participant, assignments || [])) {
      return NextResponse.json({ ok: false, message: "Peserta tidak termasuk assigned group coach." }, { status: 403 });
    }

    const code = clean(participant.code || participant.employee_code || participant.no_karyawan);

    const [activityRowsRaw, foodRows, weightRows, clinicalRows, historyById, historyByCode, miniMcuRows, pointRows, healthtalkRows, targetNotes] = await Promise.all([
      safeSelect(supabase, "wellness_activity_logs", (q) => q.eq("participant_id", participantId).order("log_date", { ascending: true }).limit(2000)),
      safeSelect(supabase, "wellness_food_logs", (q) => q.eq("participant_id", participantId).order("log_date", { ascending: true }).limit(2000)),
      safeSelect(supabase, "wellness_weight_logs", (q) => q.eq("participant_id", participantId).order("log_date", { ascending: true }).limit(1000)),
      safeSelect(supabase, "wellness_clinical_history", (q) => q.eq("participant_id", participantId).limit(1000)),
      safeSelect(supabase, "wellness_checkup_history", (q) => q.eq("participant_id", participantId).order("checkup_date", { ascending: true }).limit(1000)),
      code
        ? safeSelect(supabase, "wellness_checkup_history", (q) => q.eq("employee_code", code).order("checkup_date", { ascending: true }).limit(1000))
        : Promise.resolve([]),
      safeSelect(supabase, "wellness_mini_mcu_logs", (q) => q.eq("participant_id", participantId).order("exam_date", { ascending: true }).limit(1000)),
      safeSelect(supabase, "wellness_point_logs", (q) => q.eq("participant_id", participantId).order("log_date", { ascending: true }).limit(3000)),
      safeSelect(supabase, "wellness_healthtalk_logs", (q) => q.eq("participant_id", participantId).order("event_date", { ascending: true }).limit(1000)),
      safeSelect(supabase, "wellness_coach_notes", (q) => q.eq("participant_id", participantId).order("created_at", { ascending: false }).limit(100)),
    ]);

    const participantControlMap = await loadParticipantControlMap(
      supabase,
      [participantId],
    );
    const activityRows = filterActivityRowsByFitnessSource(
      activityRowsRaw,
      participantControlMap,
    );

    const sheetResult = await fetchWellnessGoogleSheetRows({
      participantId,
      code,
      limit: 2000,
    }).catch(() => ({ ok: false, rows: [] as any[] }));

    const sheetFoodRows = googleSheetRowsToFoodLogs(sheetResult.rows || []).filter((row: any) => {
      return asNumber(row.participant_id) === participantId || (code && clean(row.participant_code) === code);
    });
    const sheetHealthtalkRows = googleSheetRowsToHealthtalkLogs(sheetResult.rows || []).filter((row: any) => {
      return asNumber(row.participant_id) === participantId || (code && clean(row.participant_code) === code);
    });

    const mergedFoodRows = mergeRows(foodRows, sheetFoodRows);
    const mergedHealthtalkRows = mergeRows(healthtalkRows, sheetHealthtalkRows);
    const clinicalAll = mergeRows(clinicalRows, historyById, historyByCode, miniMcuRows);

    const workoutTargetCalories = workoutTargetForParticipant(participant, targetNotes);
    const dailyPoints = new Map<string, number>();

    const nutritionRowsByDate = rowsByDate(
      mergedFoodRows,
      (row) => row?.log_date || row?.created_at
    );
    let nutritionPoints = 0;
    for (const [date, rows] of nutritionRowsByDate.entries()) {
      const mealCount = nutritionMealCount(rows);
      const points = mealCount >= 3 ? 10 : mealCount > 0 ? 5 : 0;
      nutritionPoints += points;
      addDailyPoint(dailyPoints, date, points);
    }

    const workoutRowsByDate = rowsByDate(
      activityRows,
      (row) => row?.log_date || row?.started_at || row?.created_at
    );
    let activityPoints = 0;
    for (const [date, rows] of workoutRowsByDate.entries()) {
      const calories = rows.reduce((sum, row) => sum + activityCalories(row), 0);
      const points =
        calories <= 0
          ? 0
          : workoutTargetCalories > 0 && calories >= workoutTargetCalories
            ? 10
            : 5;
      activityPoints += points;
      addDailyPoint(dailyPoints, date, points);
    }

    let healthtalkPoints = 0;
    for (const row of mergedHealthtalkRows) {
      const date = dateKey(row?.event_date || row?.log_date || row?.created_at);
      const points = healthtalkPoint(row);
      healthtalkPoints += points;
      addDailyPoint(dailyPoints, date, points);
    }

    let otherPoints = 0;
    for (const row of pointRows) {
      if (pointCategory(row) !== "other") continue;
      const points = asNumber(row?.points);
      otherPoints += points;
      addDailyPoint(
        dailyPoints,
        dateKey(row?.log_date || row?.event_date || row?.created_at),
        points
      );
    }

    const resolvedPointLedger = resolveWellnessPointBreakdown({
      ledgerRows: pointRows,
      calculated: {
        nutrition: nutritionPoints,
        workout: activityPoints,
        healthtalk: healthtalkPoints,
        other: otherPoints,
      },
    });
    const pointBreakdown = {
      nutrition: resolvedPointLedger.nutrition,
      activity: resolvedPointLedger.workout,
      healthtalk: resolvedPointLedger.healthtalk,
      other: resolvedPointLedger.other,
    };
    const totalPoints = resolvedPointLedger.total;

    const nutritionChart = aggregateByDate(mergedFoodRows, foodCalories, (row) => row?.log_date || row?.created_at);
    const workoutChart = aggregateByDate(activityRows, activityCalories, (row) => row?.log_date || row?.started_at || row?.created_at);
    const stepChart = aggregateByDate(activityRows, activitySteps, (row) => row?.log_date || row?.started_at || row?.created_at);
    const pointChart = [...dailyPoints.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, value]) => ({
        date,
        label: dateLabel(date),
        value: Math.round(value * 10) / 10,
      }));

    const charts = {
      nutrition_calories: nutritionChart,
      workout_calories: workoutChart,
      steps: stepChart,
      weight_kg: compactClinicalPoints(
        mergeRows(weightRows, clinicalAll),
        (row) => nullableNumber(row?.weight_kg, row?.weight, row?.body_weight)
      ),
      bmi: compactClinicalPoints(
        mergeRows(weightRows, clinicalAll),
        (row) => nullableNumber(row?.bmi)
      ),
      waist_cm: compactClinicalPoints(
        mergeRows(weightRows, clinicalAll),
        (row) => nullableNumber(row?.waist_cm, row?.waist_circumference)
      ),
      hba1c: compactClinicalPoints(
        clinicalAll,
        (row) => nullableNumber(row?.hba1c_percent, row?.hba1c, row?.hba1c_value)
      ),
      glucose: compactClinicalPoints(
        clinicalAll,
        (row) => nullableNumber(row?.glucose_value, row?.blood_glucose, row?.fasting_glucose)
      ),
      blood_pressure: compactBloodPressure(clinicalAll),
      points: pointChart,
    };

    const latestWeight = charts.weight_kg.at(-1)?.value ?? null;
    const latestBmi = charts.bmi.at(-1)?.value ?? null;
    const latestBp = charts.blood_pressure.at(-1) || null;
    const streak = buildStreakSummary(mergedFoodRows, activityRows, workoutTargetCalories);

    const healthtalks = mergedHealthtalkRows
      .map((row: any) => ({
        id: row.id,
        date: dateKey(row?.event_date || row?.log_date || row?.created_at),
        title: clean(row?.title || row?.healthtalk_title || "Health Talk"),
        type: clean(row?.healthtalk_type || row?.attendance_type || "-"),
        points: healthtalkPoint(row),
        evidence_url: clean(row?.evidence_url || row?.evidence_preview_url),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      ok: true,
      participant: {
        id: participant.id,
        name: clean(participant.name || participant.employee_name || participant.full_name || "-"),
        code: clean(participant.code || participant.employee_code || participant.no_karyawan || "-"),
      },
      summary: {
        total_points: Math.round(totalPoints),
        healthtalk_count: healthtalks.length,
        nutrition_log_count: mergedFoodRows.length,
        workout_log_count: activityRows.length,
        total_steps: activityRows.reduce((sum, row) => sum + activitySteps(row), 0),
        total_workout_calories: Math.round(activityRows.reduce((sum, row) => sum + activityCalories(row), 0)),
        latest_weight_kg: latestWeight,
        latest_bmi: latestBmi,
        latest_systolic: latestBp?.value ?? null,
        latest_diastolic: latestBp?.secondary ?? null,
      },
      point_breakdown: pointBreakdown,
        point_source: resolvedPointLedger.source,
        point_ledger_rows: resolvedPointLedger.ledger_row_count,
      point_rules: {
        nutrition_full_meals: 3,
        nutrition_full_points: 10,
        nutrition_partial_points: 5,
        workout_target_calories: workoutTargetCalories,
        workout_target_points: 10,
        workout_partial_points: 5,
        healthtalk_offline_points: 10,
        healthtalk_online_points: 5,
      },
      charts,
      streak,
      healthtalks,
      google_sheet: {
        ok: Boolean(sheetResult.ok),
        nutrition_count: sheetFoodRows.length,
        healthtalk_count: sheetHealthtalkRows.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal memuat detail peserta." },
      { status: 500 }
    );
  }
}
