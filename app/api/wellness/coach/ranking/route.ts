import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchWellnessGoogleSheetRows,
  googleSheetRowsToFoodLogs,
  googleSheetRowsToHealthtalkLogs,
} from "@/lib/wellness/googleSheetResponses";
import { postSupportWebhook } from "@/lib/wellness/supportServer";
import { filterActivityRowsByFitnessSource, loadParticipantControlMap } from "@/lib/wellness/participantControls";
import { resolveWellnessPointBreakdown } from "@/lib/wellness/pointLedger";
import {
  healthtalkPointsFromRow,
  nutritionDailyBonusPoints,
  participantNutritionCalorieLimit,
  pointNumber,
  workoutDailyPoints,
} from "@/lib/wellness/pointRules";

// WELLNESS_COACH_GROUP_RANKING_API_V76
// WELLNESS_COACH_RANKING_SINGLE_FITNESS_SOURCE_V79F

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

function participantGroupIds(row: any) {
  return [
    row?.wellness_group_unit_id,
    row?.group_unit_id,
    row?.group_id,
    row?.wellness_group_id,
  ]
    .map(clean)
    .filter(Boolean);
}

function participantGroupNames(row: any) {
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
    (assignments || [])
      .map((item) => clean(item.wellness_group_unit_id))
      .filter(Boolean),
  );
  const allowedNames = new Set(
    (assignments || [])
      .map((item) => clean(item.group_name).toLowerCase())
      .filter(Boolean),
  );
  return (
    participantGroupIds(row).some((id) => allowedIds.has(id)) ||
    participantGroupNames(row).some((name) => allowedNames.has(name))
  );
}

function assignedGroup(row: any, assignments: any[]) {
  const ids = participantGroupIds(row);
  const names = participantGroupNames(row);
  return (
    (assignments || []).find((item) => {
      const id = clean(item.wellness_group_unit_id);
      const name = clean(item.group_name).toLowerCase();
      return (id && ids.includes(id)) || (name && names.includes(name));
    }) || null
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

function mealKey(row: any, index: number) {
  return clean(
    row?.meal_time ||
      row?.meal_type ||
      row?.meal_period ||
      row?.waktu_makan ||
      row?.id ||
      index,
  ).toLowerCase();
}

function healthtalkPoint(row: any) {
  return healthtalkPointsFromRow(row);
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
            row?.meal_type,
            row?.food_name,
            row?.healthtalk_title,
          ]);
      map.set(key, row);
    }
  }
  return [...map.values()];
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
  const direct = asNumber(
    participant?.workout_calorie_target ||
      participant?.active_calorie_target ||
      participant?.daily_activity_calorie_target,
  );
  if (direct > 0) return direct;
  const note = (notes || []).find((item) =>
    clean(item?.topic).toLowerCase().includes("target wellness"),
  );
  const text = [note?.action_plan, note?.coach_note].map(clean).join("\n");
  const match = text.match(/Target\s+(?:Kalori\s+)?Workout\s*:\s*([0-9.,]+)/i);
  return match ? asNumber(match[1]) : 0;
}

function metricValue(row: any, metric: Metric) {
  if (metric === "compliance") return row.compliance_percent;
  if (metric === "workout") return row.workout_achieved_days;
  if (metric === "nutrition") return row.nutrition_achieved_days;
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

    const { data: allParticipants, error: participantError } = await supabase
      .from("wellness_participants")
      .select("*")
      .limit(2000);
    if (participantError) throw participantError;

    let participants = (allParticipants || []).filter((row: any) =>
      canAccessParticipant(row, assignments || []),
    );
    if (groupFilter !== "all") {
      participants = participants.filter((row: any) => {
        const assignment = assignedGroup(row, assignments || []);
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
            .gte("log_date", fromDate)
            .limit(20000),
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
            .gte("log_date", fromDate)
            .limit(10000),
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
    const sheet = await fetchWellnessGoogleSheetRows({ limit: 10000 }).catch(
      () => ({ ok: false, rows: [] as any[] }),
    );
    const sheetFood = googleSheetRowsToFoodLogs(sheet.rows || []).filter(
      (row: any) =>
        ids.includes(asNumber(row.participant_id)) &&
        dateKey(row.log_date) >= fromDate,
    );
    const sheetHealthtalk = googleSheetRowsToHealthtalkLogs(
      sheet.rows || [],
    ).filter(
      (row: any) =>
        ids.includes(asNumber(row.participant_id)) &&
        dateKey(row.event_date || row.log_date) >= fromDate,
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
      const assignment = assignedGroup(participant, assignments || []);
      const participantFood = mergeRows(
        foodRows.filter((row: any) => asNumber(row.participant_id) === id),
        sheetFood.filter(
          (row: any) =>
            asNumber(row.participant_id) === id ||
            (code && clean(row.participant_code) === code),
        ),
      );
      const participantActivities = activityRows.filter(
        (row: any) => asNumber(row.participant_id) === id,
      );
      const participantHealthtalk = mergeRows(
        healthtalkRows.filter(
          (row: any) => asNumber(row.participant_id) === id,
        ),
        sheetHealthtalk.filter(
          (row: any) =>
            asNumber(row.participant_id) === id ||
            (code && clean(row.participant_code) === code),
        ),
      );
      const participantNotes = targetNotes.filter(
        (row: any) => asNumber(row.participant_id) === id,
      );
      const nutritionTarget = parseNutritionTarget(participant, participantNotes);
      const workoutTarget = parseWorkoutTarget(participant, participantNotes);

      const foodByDate = new Map<string, Set<string>>();
      const foodCaloriesByDate = new Map<string, number>();
      let nutritionInputCount = 0;
      participantFood.forEach((row: any, index: number) => {
        const date = dateKey(row?.log_date || row?.created_at);
        if (!date || date < fromDate || date > toDate) return;
        if (!foodByDate.has(date)) foodByDate.set(date, new Set());
        foodByDate.get(date)!.add(mealKey(row, index));
        foodCaloriesByDate.set(
          date,
          (foodCaloriesByDate.get(date) || 0) + foodCalories(row),
        );
        nutritionInputCount += 1;
      });

      const workoutByDate = new Map<string, number>();
      participantActivities.forEach((row: any) => {
        const date = dateKey(
          row?.log_date || row?.started_at || row?.created_at,
        );
        if (!date || date < fromDate || date > toDate) return;
        workoutByDate.set(
          date,
          (workoutByDate.get(date) || 0) + activityCalories(row),
        );
      });

      let nutritionPoints = nutritionInputCount * 5;
      let nutritionAchievedDays = 0;
      for (const [date, meals] of foodByDate.entries()) {
        const count = meals.size;
        nutritionPoints += nutritionDailyBonusPoints({
          totalCalories: foodCaloriesByDate.get(date) || 0,
          calorieLimit: nutritionTarget,
          hasNutritionInput: count > 0,
        });
        if (count >= 3) nutritionAchievedDays += 1;
      }

      let workoutPoints = 0;
      let workoutAchievedDays = 0;
      for (const calories of workoutByDate.values()) {
        const achieved =
          workoutTarget > 0 ? calories >= workoutTarget : calories > 0;
        workoutPoints += workoutDailyPoints({
          calories,
          calorieTarget: workoutTarget,
          hasActivity: calories > 0,
        });
        if (achieved) workoutAchievedDays += 1;
      }

      let healthtalkPoints = participantHealthtalk.reduce(
        (sum: number, row: any) => sum + healthtalkPoint(row),
        0,
      );
      const participantPointRows = pointRows.filter(
        (row: any) => asNumber(row.participant_id) === id,
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
          nutrition: true,
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
      const compliancePercent = Math.round((activeDates.size / days) * 100);
      const successDates = new Set<string>();
      for (const date of new Set([
        ...foodByDate.keys(),
        ...workoutByDate.keys(),
      ])) {
        const nutritionOk = (foodByDate.get(date)?.size || 0) >= 3;
        const workoutCalories = workoutByDate.get(date) || 0;
        const workoutOk =
          workoutTarget > 0
            ? workoutCalories >= workoutTarget
            : workoutCalories > 0;
        if (nutritionOk && workoutOk) successDates.add(date);
      }
      let currentStreak = 0;
      for (let offset = 0; offset > -days; offset -= 1) {
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
        group_name:
          clean(assignment?.group_name) ||
          participantGroupNames(participant)[0] ||
          "-",
        photo_url: profile.photo_url || "",
        photo_preview_url: profile.photo_preview_url || "",
        total_points: Math.round(totalPoints),
        compliance_percent: compliancePercent,
        nutrition_target_calories: nutritionTarget,
        workout_points: workoutPoints,
        workout_achieved_days: workoutAchievedDays,
        nutrition_points: nutritionPoints,
        nutrition_achieved_days: nutritionAchievedDays,
        healthtalk_points: healthtalkPoints,
        healthtalk_count: participantHealthtalk.length,
        other_points: otherPoints,
        point_source: pointLedger.source,
        point_ledger_rows: pointLedger.ledger_row_count,
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
