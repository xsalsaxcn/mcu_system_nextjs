// WELLNESS_COMPANY_ISOLATION_V126C_FINAL
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchWellnessGoogleSheetRows,
  googleSheetRowsToHealthtalkLogs,
} from "@/lib/wellness/googleSheetResponses";
import { loadCanonicalNutritionHistory } from "@/lib/wellness/nutritionHistory";
import {
  buildCoachGroupUnitMap,
  canCoachAccessParticipant,
  canonicalParticipantGroupName,
  canonicalParticipantGroupUnit,
  canonicalParticipantKelompokUnit,
} from "@/lib/wellness/coachGroupAccess";
import { filterActivityRowsByFitnessSource, loadParticipantControlMap } from "@/lib/wellness/participantControls";
import { resolveWellnessPointBreakdown } from "@/lib/wellness/pointLedger";
import {
  filterClinicalRowsForProgram,
  filterOperationalRowsForProgram,
  isOperationalRowInProgramWindow,
  programWindowDayCount,
} from "@/lib/wellness/programWindow";
import {
  healthtalkPointsFromRow,
  nutritionDailyBonusPoints,
  participantNutritionCalorieLimit,
  participantWorkoutCalorieTarget,
  workoutDailyPoints,
} from "@/lib/wellness/pointRules";
import {
  buildWellnessStreakSummary,
  wellnessStreakWorkoutCalories,
} from "@/lib/wellness/streak";

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

// WELLNESS_COACH_GRAPH_NAKES_SHEET_RECONCILIATION_V126M42_5
function sheetField(row: any, ...keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && clean(value) !== "") {
      return value;
    }
  }
  return null;
}

function normalizedClinicalDateKey(value: any) {
  const text = clean(value);
  if (!text) return "";

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  }

  const local = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (local) {
    return `${local[3]}-${String(local[2]).padStart(2, "0")}-${String(local[1]).padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function sortableClinicalNumber(value: any) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return String(Math.max(0, Math.trunc(parsed))).padStart(20, "0");
  }
  return clean(value);
}

function sheetClinicalTimestampKey(row: any) {
  const value = sheetField(row, "Submission Date", "Updated At", "Created At");
  const parsed = value ? new Date(String(value)) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? String(parsed.getTime()).padStart(16, "0")
    : clean(value);
}

function isNakesSheetRow(row: any) {
  const logType = clean(sheetField(row, "Log Type", "log_type")).toLowerCase();
  const marker = clean(sheetField(row, "NAKES Sync Marker", "Marker")).toLowerCase();
  return (
    logType === "nakes_checkup" ||
    marker.includes("nakes") ||
    Boolean(
      sheetField(
        row,
        "Tinggi Badan NAKES (cm)",
        "Berat Badan NAKES (kg)",
        "Usia NAKES (tahun)",
        "NAKES History ID",
      ),
    )
  );
}

function googleSheetRowsToNakesClinicalRows(
  rows: any[],
  participantId: number,
  participantCode: string,
) {
  const normalizedCode = clean(participantCode).toLowerCase();

  return (rows || [])
    .filter((row: any) => {
      if (!isNakesSheetRow(row)) return false;
      const rowParticipantId = asNumber(
        sheetField(row, "Participant ID", "participant_id"),
      );
      const rowCode = clean(
        sheetField(row, "KODE", "Kode", "participant_code"),
      ).toLowerCase();
      return (
        rowParticipantId === participantId ||
        Boolean(normalizedCode && rowCode === normalizedCode)
      );
    })
    .map((row: any) => {
      const checkupDate = normalizedClinicalDateKey(
        sheetField(
          row,
          "Log Date",
          "Tanggal Pemeriksaan NAKES",
          "Submission Date",
        ),
      );
      const updatedAt = clean(
        sheetField(row, "Submission Date", "Updated At", "Created At"),
      );
      const revision = asNumber(
        sheetField(row, "NAKES Revision", "Revision"),
      );
      const rowNumber = asNumber(row?._rowNumber);
      const historyId = clean(
        sheetField(row, "NAKES History ID", "History ID"),
      );
      const weight = nullableNumber(
        sheetField(
          row,
          "Berat Badan NAKES (kg)",
          "BB Monitoring terbaru",
          "BB anda per hari ini (diisi sekali saja perminggu)",
        ),
      );
      const height = nullableNumber(
        sheetField(row, "Tinggi Badan NAKES (cm)"),
      );
      const suppliedBmi = nullableNumber(sheetField(row, "BMI"));
      const calculatedBmi =
        weight !== null && height !== null && height > 0
          ? Math.round((weight / Math.pow(height / 100, 2)) * 10) / 10
          : null;
      const recencyKey = [
        checkupDate,
        sheetClinicalTimestampKey(row),
        sortableClinicalNumber(revision),
        sortableClinicalNumber(rowNumber),
      ].join("|");

      return {
        id: `sheet-nakes:${historyId || rowNumber || recencyKey}`,
        participant_id: participantId,
        participant_code: participantCode,
        checkup_date: checkupDate,
        created_at: updatedAt || checkupDate,
        updated_at: updatedAt || checkupDate,
        height_cm: height,
        weight_kg: weight,
        bmi: suppliedBmi ?? calculatedBmi,
        waist_cm: nullableNumber(
          sheetField(row, "Lingkar Perut NAKES (cm)", "Lingkar Perut (cm)"),
        ),
        systolic: nullableNumber(sheetField(row, "Sistolik NAKES")),
        diastolic: nullableNumber(sheetField(row, "Diastolik NAKES")),
        pulse: nullableNumber(sheetField(row, "Nadi NAKES")),
        hba1c_percent: nullableNumber(sheetField(row, "HbA1c NAKES (%)")),
        glucose_value: nullableNumber(sheetField(row, "Gula Darah NAKES")),
        raw_payload: {
          source: "google_sheet_nakes",
          age_years: nullableNumber(
            sheetField(row, "Usia NAKES (tahun)", "Usia"),
          ),
          nakes_revision: revision,
          sheet_row_number: rowNumber,
          sheet_recency_key: recencyKey,
        },
        _wellness_sheet_recency_key: recencyKey,
      };
    })
    .filter((row: any) =>
      Boolean(
        row.checkup_date &&
          (row.weight_kg !== null ||
            row.height_cm !== null ||
            row.bmi !== null ||
            row.waist_cm !== null ||
            row.systolic !== null ||
            row.diastolic !== null ||
            row.hba1c_percent !== null ||
            row.glucose_value !== null),
      ),
    )
    .sort((a: any, b: any) =>
      clean(a?._wellness_sheet_recency_key).localeCompare(
        clean(b?._wellness_sheet_recency_key),
      ),
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


// WELLNESS_CANONICAL_STREAK_PARITY_V126M23_1
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

function activitySourceKeyV126M31(row: any) {
  const raw =
    row?.raw_payload && typeof row.raw_payload === "object"
      ? row.raw_payload
      : {};

  return clean(
    row?.source || row?.provider || row?.input_source || raw?.provider,
  )
    .toLowerCase()
    .replace(/-/g, "_");
}

function workoutSourceBreakdownV126M31(rows: any[], targetDate: string) {
  const result = {
    date: targetDate,
    total: 0,
    google_fit: 0,
    health_connect: 0,
    strava: 0,
    manual: 0,
    other: 0,
  };

  for (const row of rows || []) {
    const rowDate = dateKey(
      row?.log_date || row?.started_at || row?.created_at,
    );
    if (!targetDate || rowDate !== targetDate) continue;

    const calories = wellnessStreakWorkoutCalories(row);
    const source = activitySourceKeyV126M31(row);
    result.total += calories;

    if (source === "google_fit") result.google_fit += calories;
    else if (source === "health_connect") result.health_connect += calories;
    else if (source === "strava") result.strava += calories;
    else if (!source || source === "manual" || source === "google_sheet") {
      result.manual += calories;
    } else {
      result.other += calories;
    }
  }

  for (const key of [
    "total",
    "google_fit",
    "health_connect",
    "strava",
    "manual",
    "other",
  ] as const) {
    result[key] = Math.round(result[key]);
  }

  return result;
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
  return healthtalkPointsFromRow(row);
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
    nutrition_max_calories: find(/Target\s+Nutrisi\s*:\s*([0-9.,]+)/i),
    workout_min_calories: find(/Target\s+(?:Kalori\s+)?Workout\s*:\s*([0-9.,]+)/i),
  };
}

function nutritionTargetForParticipant(participant: any, notes: any[]) {
  const direct = participantNutritionCalorieLimit(participant);
  if (direct > 0) return direct;

  for (const note of notes || []) {
    const parsed = parseTargetsFromNote(note);
    if (parsed.nutrition_max_calories > 0) {
      return parsed.nutrition_max_calories;
    }
  }

  return 0;
}

function workoutTargetForParticipant(participant: any, notes: any[]) {
  const direct = participantWorkoutCalorieTarget(participant);
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

    const { data: groupUnits, error: groupUnitError } = await supabase
      .from("wellness_group_units")
      .select("*")
      .limit(5000);

    if (groupUnitError) throw groupUnitError;
    const groupUnitMap = buildCoachGroupUnitMap(groupUnits || []);

    const { data: participant, error: participantError } = await supabase
      .from("wellness_participants")
      .select("*")
      .eq("id", participantId)
      .maybeSingle();

    if (participantError || !participant) {
      return NextResponse.json({ ok: false, message: "Peserta tidak ditemukan." }, { status: 404 });
    }

    if (
      !canCoachAccessParticipant(
        participant,
        assignments || [],
        groupUnitMap,
      )
    ) {
      return NextResponse.json({ ok: false, message: "Peserta tidak termasuk assigned group coach." }, { status: 403 });
    }

    const canonicalGroup = canonicalParticipantGroupUnit(
      participant,
      groupUnitMap,
    );
    const canonicalKelompok = canonicalParticipantKelompokUnit(
      participant,
      groupUnitMap,
    );
    const code = clean(participant.code || participant.employee_code || participant.no_karyawan);

    const [activityRowsRaw, foodRows, weightRows, clinicalRows, historyById, historyByCode, miniMcuRows, pointRows, healthtalkRows, targetNotes] = await Promise.all([
      safeSelect(supabase, "wellness_activity_logs", (q) => q.eq("participant_id", participantId).order("log_date", { ascending: true }).limit(2000)),
      safeSelect(supabase, "wellness_food_logs", (q) => q.eq("participant_id", participantId).order("log_date", { ascending: true }).limit(2000)),
      safeSelect(supabase, "wellness_weight_logs", (q) => q.eq("participant_id", participantId).order("log_date", { ascending: true }).limit(1000)),
      safeSelect(supabase, "wellness_clinical_history", (q) => q.eq("participant_id", participantId).limit(1000)),
      safeSelect(supabase, "wellness_checkup_history", (q) => q.eq("participant_id", participantId).order("checkup_date", { ascending: true }).limit(1000)),
      [],
      safeSelect(supabase, "wellness_mini_mcu_logs", (q) => q.eq("participant_id", participantId).order("exam_date", { ascending: true }).limit(1000)),
      safeSelect(supabase, "wellness_point_logs", (q) => q.eq("participant_id", participantId).order("log_date", { ascending: true }).limit(3000)),
      safeSelect(supabase, "wellness_healthtalk_logs", (q) => q.eq("participant_id", participantId).order("event_date", { ascending: true }).limit(1000)),
      safeSelect(supabase, "wellness_coach_notes", (q) => q.eq("participant_id", participantId).order("created_at", { ascending: false }).limit(100)),
    ]);

    const participantControlMap = await loadParticipantControlMap(
      supabase,
      [participantId],
    );
    const activityRows =
      filterOperationalRowsForProgram(
        participant,
        filterActivityRowsByFitnessSource(
          activityRowsRaw,
          participantControlMap,
        ),
        "",
        "",
        [
          "log_date",
          "started_at",
          "created_at",
        ],
      );

    const scopedFoodRows =
      filterOperationalRowsForProgram(
        participant,
        foodRows,
        "",
        "",
        ["log_date", "created_at"],
      );

    const scopedWeightRows =
      filterOperationalRowsForProgram(
        participant,
        weightRows,
        "",
        "",
        ["log_date", "created_at"],
      );

    const scopedMiniMcuRows =
      filterOperationalRowsForProgram(
        participant,
        miniMcuRows,
        "",
        "",
        ["exam_date", "created_at"],
      );

    const scopedPointRows =
      filterOperationalRowsForProgram(
        participant,
        pointRows,
        "",
        "",
        ["log_date", "created_at"],
      );

    const [nutritionHistory, sheetResult] = await Promise.all([
      loadCanonicalNutritionHistory({
        supabase,
        participant,
        dbRows: scopedFoodRows,
      }),
      fetchWellnessGoogleSheetRows({
        participantId,
        code,
        limit: 2000,
      }).catch(() => ({ ok: false, rows: [] as any[] })),
    ]);

    const sheetHealthtalkRows = googleSheetRowsToHealthtalkLogs(sheetResult.rows || []).filter((row: any) => {
      return asNumber(row.participant_id) === participantId;
    });
    const sheetNakesClinicalRows = filterClinicalRowsForProgram(
      participant,
      googleSheetRowsToNakesClinicalRows(
        sheetResult.rows || [],
        participantId,
        code,
      ),
      "",
      "",
    );

    const mergedFoodRows =
      filterOperationalRowsForProgram(
        participant,
        nutritionHistory.logs || [],
        "",
        "",
        ["log_date", "created_at"],
      );

    const mergedHealthtalkRows =
      filterOperationalRowsForProgram(
        participant,
        mergeRows(
          healthtalkRows,
          sheetHealthtalkRows,
        ),
        "",
        "",
        [
          "event_date",
          "log_date",
          "created_at",
        ],
      );

    const clinicalAll = mergeRows(
      filterClinicalRowsForProgram(
        participant,
        mergeRows(
          clinicalRows,
          historyById,
          historyByCode,
          scopedMiniMcuRows,
        ),
        "",
        "",
      ),
      // Sheet NAKES berada paling akhir agar revisi sinkron terbaru
      // menggantikan nilai Supabase lama pada tanggal pemeriksaan yang sama.
      sheetNakesClinicalRows,
    );

    const nutritionTargetCalories = nutritionTargetForParticipant(participant, targetNotes);
    const workoutTargetCalories = workoutTargetForParticipant(participant, targetNotes) || 300;
    const dailyPoints = new Map<string, number>();

    const nutritionRowsByDate = rowsByDate(
      mergedFoodRows,
      (row) => row?.log_date || row?.created_at
    );
    let nutritionPoints = 0;
    for (const [date, rows] of nutritionRowsByDate.entries()) {
      const inputPoints = rows.length * 5;
      const totalCalories = rows.reduce(
        (sum, row) => sum + foodCalories(row),
        0,
      );
      const bonusPoints = nutritionDailyBonusPoints({
        totalCalories,
        calorieLimit: nutritionTargetCalories,
        hasNutritionInput: rows.length > 0,
      });
      const points = inputPoints + bonusPoints;
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
      const points = workoutDailyPoints({
        calories,
        calorieTarget: workoutTargetCalories,
        hasActivity: rows.some(
          (row) =>
            activityCalories(row) > 0 ||
            activitySteps(row) > 0 ||
            asNumber(row?.duration_minutes) > 0,
        ),
      });
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
    for (const row of scopedPointRows) {
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
      ledgerRows: scopedPointRows,
      calculated: {
        nutrition: nutritionPoints,
        workout: activityPoints,
        healthtalk: healthtalkPoints,
        other: otherPoints,
      },
      preferCalculated: {
        nutrition: true,
        workout: true,
        healthtalk: true,
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
    const workoutChart = aggregateByDate(activityRows, wellnessStreakWorkoutCalories, (row) => row?.log_date || row?.started_at || row?.created_at);
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
        mergeRows(scopedWeightRows, clinicalAll),
        (row) => nullableNumber(row?.weight_kg, row?.weight, row?.body_weight)
      ),
      bmi: compactClinicalPoints(
        mergeRows(scopedWeightRows, clinicalAll),
        (row) => nullableNumber(row?.bmi)
      ),
      waist_cm: compactClinicalPoints(
        mergeRows(scopedWeightRows, clinicalAll),
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
    const streak = buildWellnessStreakSummary({
      nutritionRows: mergedFoodRows,
      activityRows,
      workoutTargetCalories,
    });
    const latestWorkoutDateV126M31 = clean(streak.days.at(-1)?.date);
    const workoutSourceBreakdown = workoutSourceBreakdownV126M31(
      activityRows,
      latestWorkoutDateV126M31,
    );

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
        group_name: canonicalParticipantGroupName(participant, groupUnitMap),
        group_unit_id: clean(canonicalGroup?.id) || null,
        kelompok_name: clean(canonicalKelompok?.name) || "-",
        kelompok_id: clean(canonicalKelompok?.id) || null,
      },
      summary: {
        total_points: Math.round(totalPoints),
        healthtalk_count: healthtalks.length,
        nutrition_log_count: mergedFoodRows.length,
        workout_log_count: activityRows.length,
        total_steps: activityRows.reduce((sum, row) => sum + activitySteps(row), 0),
        total_workout_calories: Math.round(activityRows.reduce((sum, row) => sum + wellnessStreakWorkoutCalories(row), 0)),
        latest_weight_kg: latestWeight,
        latest_bmi: latestBmi,
        latest_systolic: latestBp?.value ?? null,
        latest_diastolic: latestBp?.secondary ?? null,
      },
      point_breakdown: pointBreakdown,
        point_source: resolvedPointLedger.source,
        point_ledger_rows: resolvedPointLedger.ledger_row_count,
      point_rules: {
        nutrition_input_points: 5,
        nutrition_daily_bonus_points: 10,
        nutrition_target_calories: nutritionTargetCalories,
        workout_target_calories: workoutTargetCalories,
        workout_target_points: 10,
        workout_partial_points: 5,
        healthtalk_offline_with_evidence_points: 20,
        healthtalk_online_or_without_evidence_points: 10,
      },
      charts,
      streak,
      workout_source_breakdown: workoutSourceBreakdown,
      nutrition_logs: mergedFoodRows,
      nutrition_sources: nutritionHistory.sources,
      healthtalks,
      google_sheet: {
        ok: Boolean(nutritionHistory.sources.google_sheet_ok),
        nutrition_count: nutritionHistory.sources.google_sheet_rows,
        healthtalk_count: sheetHealthtalkRows.length,
        nakes_clinical_count: sheetNakesClinicalRows.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal memuat detail peserta." },
      { status: 500 }
    );
  }
}
