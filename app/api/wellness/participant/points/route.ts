// WELLNESS_PARTICIPANT_POINT_SUMMARY_V87
// Source-derived point summary for the participant portal.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import {
  filterClinicalRowsForProgram,
  filterOperationalRowsForProgram,
  isOperationalRowInProgramWindow,
  programWindowDayCount,
} from "@/lib/wellness/programWindow";
import {
  fetchWellnessGoogleSheetRows,
  googleSheetRowsToFoodLogs,
  googleSheetRowsToHealthtalkLogs,
} from "@/lib/wellness/googleSheetResponses";
import {
  filterActivityRowsByFitnessSource,
  loadParticipantControlMap,
} from "@/lib/wellness/participantControls";
import {
  resolveWellnessPointBreakdown,
  wellnessPointCategory,
} from "@/lib/wellness/pointLedger";
import {
  healthtalkPointsFromRow,
  nutritionDailyBonusPoints,
  workoutDailyPoints,
} from "@/lib/wellness/pointRules";
import {
  pointActivityCalories,
  pointActivityHasValue,
} from "@/lib/wellness/pointWriter";
import {
  effectiveTargetsForDate,
  loadEffectiveTargetTimeline,
  targetTimelineSummary,
} from "@/lib/wellness/effectiveDatedTargets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const valueNumber = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function dateOnly(value: any) {
  return clean(value).slice(0, 10);
}

function activityDate(row: any) {
  return dateOnly(
    row?.log_date ||
      row?.date ||
      row?.started_at ||
      row?.raw_payload?.start_date_local ||
      row?.raw_payload?.last_sync_at ||
      row?.updated_at ||
      row?.created_at,
  );
}

function activityUpdatedAt(row: any) {
  const value =
    row?.raw_payload?.last_sync_at ||
    row?.raw_payload?.health_connect_last_sync_at ||
    row?.updated_at ||
    row?.started_at ||
    row?.created_at;
  const parsed = new Date(value || "").getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function isDeviceDailyRow(row: any) {
  const raw = row?.raw_payload || {};
  const source = clean(
    row?.source || row?.input_source || row?.provider || raw?.provider,
  )
    .toLowerCase()
    .replace(/-/g, "_");
  const externalId = clean(
    row?.external_activity_id || row?.provider_activity_id || row?.id,
  ).toLowerCase();
  const syncMode = clean(raw?.sync_mode).toLowerCase();
  const name = clean(
    row?.activity_name || row?.activity_type || row?.nama_activities,
  ).toLowerCase();

  if (source === "google_fit") {
    return (
      externalId.includes("google_fit_daily_") ||
      name.includes("google fit daily") ||
      syncMode === "aggregate_daily"
    );
  }

  if (source === "health_connect") {
    return (
      externalId.includes("health_connect_daily_") ||
      name.includes("health connect daily") ||
      syncMode === "daily_aggregate"
    );
  }

  return false;
}

function normalizeActivities(rows: any[] = []) {
  const result = new Map<string, any>();

  for (const row of rows) {
    const date = activityDate(row);
    const key = isDeviceDailyRow(row)
      ? `device_daily:${date}`
      : `activity:${clean(row?.id || row?.external_activity_id || `${date}:${result.size}`)}`;
    const previous = result.get(key);

    if (!previous) {
      result.set(key, row);
      continue;
    }

    const currentQuality = pointActivityCalories(row) * 1000 + numberValue(row?.steps);
    const previousQuality =
      pointActivityCalories(previous) * 1000 + numberValue(previous?.steps);

    if (
      currentQuality > previousQuality ||
      (currentQuality === previousQuality &&
        activityUpdatedAt(row) >= activityUpdatedAt(previous))
    ) {
      result.set(key, row);
    }
  }

  return [...result.values()];
}

function foodCalories(row: any) {
  return numberValue(
    row?.calories ??
      row?.total_calories ??
      row?.estimated_calories ??
      row?.raw_payload?.["Kalori Makanan"],
  );
}

function uniqueRows(rows: any[] = []) {
  const result = new Map<string, any>();

  for (const row of rows) {
    const key = clean(row?.id) ||
      JSON.stringify([
        row?.participant_id,
        row?.participant_code,
        row?.log_date,
        row?.created_at,
        row?.food_name,
        row?.healthtalk_title,
      ]);
    result.set(key, row);
  }

  return [...result.values()];
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const participant = await getParticipantFromPortalSession(supabase, req);

    if (!participant?.id) {
      return NextResponse.json(
        { ok: false, message: "OTP/session peserta belum aktif." },
        { status: 401 },
      );
    }

    const participantId = Number(participant.id);
    const participantCode = clean(
      participant.code || participant.employee_code || participant.no_karyawan,
    );

    const [sheetResult, activityResult, ledgerResult, controlMap, targets] =
      await Promise.all([
        fetchWellnessGoogleSheetRows({
          participantId,
          code: participantCode,
          limit: 10000,
        }).catch(() => ({ ok: false, rows: [] as any[] })),
        supabase
          .from("wellness_activity_logs")
          .select("*")
          .eq("participant_id", participantId)
          .order("log_date", { ascending: true })
          .limit(10000),
        supabase
          .from("wellness_point_logs")
          .select("*")
          .eq("participant_id", participantId)
          .order("log_date", { ascending: true })
          .limit(10000),
        loadParticipantControlMap(supabase, [participantId]),
        loadEffectiveTargetTimeline({ supabase, participant }),
      ]);

    // V126D: identitas Sheet wajib participant_id.
    const matchesParticipant =
      (row: any) =>
        Number(
          row?.participant_id,
        ) === participantId;

    const foodRows =
      filterOperationalRowsForProgram(
        participant,
        uniqueRows(
          googleSheetRowsToFoodLogs(
            sheetResult.rows || [],
          ).filter(
            matchesParticipant,
          ),
        ),
        "",
        "",
        ["log_date", "created_at"],
      );

    const healthtalkRows =
      filterOperationalRowsForProgram(
        participant,
        uniqueRows(
          googleSheetRowsToHealthtalkLogs(
            sheetResult.rows || [],
          ).filter(
            matchesParticipant,
          ),
        ),
        "",
        "",
        [
          "event_date",
          "log_date",
          "created_at",
        ],
      );

    const nutritionByDate = new Map<string, { count: number; calories: number }>();
    for (const row of foodRows) {
      const date = dateOnly(row?.log_date || row?.created_at);
      if (!date) continue;
      const bucket = nutritionByDate.get(date) || { count: 0, calories: 0 };
      bucket.count += 1;
      bucket.calories += foodCalories(row);
      nutritionByDate.set(date, bucket);
    }

    let nutritionPoints = 0;
    for (const [date, bucket] of nutritionByDate.entries()) {
      const datedTargets = effectiveTargetsForDate(targets, date);
      nutritionPoints += bucket.count * 5;
      nutritionPoints += nutritionDailyBonusPoints({
        totalCalories: bucket.calories,
        calorieLimit: datedTargets.nutrition,
        hasNutritionInput: bucket.count > 0,
      });
    }

    const selectedActivities =
      filterOperationalRowsForProgram(
        participant,
        normalizeActivities(
          filterActivityRowsByFitnessSource(
            activityResult.data || [],
            controlMap,
          ),
        ),
        "",
        "",
        [
          "log_date",
          "started_at",
          "created_at",
        ],
      );
    const workoutByDate = new Map<
      string,
      { calories: number; hasActivity: boolean }
    >();

    for (const row of selectedActivities) {
      const date = activityDate(row);
      if (!date) continue;
      const bucket = workoutByDate.get(date) || {
        calories: 0,
        hasActivity: false,
      };
      bucket.calories += pointActivityCalories(row);
      bucket.hasActivity = bucket.hasActivity || pointActivityHasValue(row);
      workoutByDate.set(date, bucket);
    }

    let workoutPoints = 0;
    for (const [date, bucket] of workoutByDate.entries()) {
      const datedTargets = effectiveTargetsForDate(targets, date);
      workoutPoints += workoutDailyPoints({
        calories: bucket.calories,
        calorieTarget: datedTargets.workout,
        hasActivity: bucket.hasActivity,
      });
    }

    const healthtalkPoints = healthtalkRows.reduce(
      (sum: number, row: any) => sum + healthtalkPointsFromRow(row),
      0,
    );
    const ledgerRows =
      filterOperationalRowsForProgram(
        participant,
        ledgerResult.error
          ? []
          : ledgerResult.data || [],
        "",
        "",
        ["log_date", "created_at"],
      );
    const otherPoints = ledgerRows
      .filter((row: any) => wellnessPointCategory(row) === "other")
      .reduce((sum: number, row: any) => sum + numberValue(row?.points), 0);

    const breakdown = resolveWellnessPointBreakdown({
      ledgerRows,
      calculated: {
        nutrition: nutritionPoints,
        workout: workoutPoints,
        healthtalk: healthtalkPoints,
        other: otherPoints,
      },
      preferCalculated: {
        // WELLNESS_PARTICIPANT_POINT_INITIAL_LOAD_CANONICAL_WORKOUT_V126M95_1
        // Confirmed source rule:
        // Nutrition = awarded ledger (Google Sheet input/bonus writes are durable).
        // Workout   = canonical recalculation from selected activity + effective target.
        // HealthTalk= canonical recalculation from merged Health Talk source.
        //
        // A partially populated Workout ledger must not suppress valid activity days.
        nutrition: false,
        workout: true,
        healthtalk: true,
      },
    });

    return NextResponse.json({
      ok: true,
      participant_id: participantId,
      total_points: breakdown.total,
      point_breakdown: breakdown,
      healthtalk_count: healthtalkRows.length,
      nutrition_input_count: foodRows.length,
      nutrition_days: nutritionByDate.size,
      workout_days: workoutByDate.size,
      targets: {
        nutrition_max_calories: targets.current.nutrition,
        workout_min_calories: targets.current.workout,
        target_history: targetTimelineSummary(targets),
      },
      source_status: {
        google_sheet: sheetResult.ok !== false,
        activity: !activityResult.error,
        ledger: !ledgerResult.error,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || "Gagal menghitung point peserta.",
      },
      { status: 500 },
    );
  }
}
