// WELLNESS_PARTICIPANT_STREAK_SERVER_V126M26_1
// Shared server loader for the participant initial payload and streak refresh API.
// Read-only: no database writes, schema changes, or Google Fit sync changes.

import {
  loadCanonicalWorkoutHistory,
} from "@/lib/wellness/canonicalWorkoutHistory";
import { loadCanonicalNutritionHistory } from "@/lib/wellness/nutritionHistory";
import {
  loadEffectiveTargetTimeline,
  targetTimelineSummary,
} from "@/lib/wellness/effectiveDatedTargets";
import { filterOperationalRowsForProgram } from "@/lib/wellness/programWindow";
import { buildWellnessStreakSummary } from "@/lib/wellness/streak";

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function fallbackControlMap(participant: any) {
  const participantId = numberValue(participant?.id);
  const map = new Map<number, any>();
  if (participantId > 0 && participant?.wellness_control) {
    map.set(participantId, participant.wellness_control);
  }
  return map;
}

export async function loadParticipantCanonicalStreak(params: {
  supabase: any;
  participant: any;
}) {
  const participantId = numberValue(params.participant?.id);
  const warnings: string[] = [];

  // WELLNESS_CANONICAL_WORKOUT_READ_PATH_V126M71
  // Manual workout dihitung hanya dari Google Sheet. Supabase manual tetap
  // internal mirror dan tidak masuk canonical streak. Device tetap memakai
  // selected Google Fit / Health Connect source.
  const workoutPromise = loadCanonicalWorkoutHistory({
    supabase: params.supabase,
    participant: params.participant,
  }).catch((error: any) => {
    warnings.push(`workout:${clean(error?.message || "unavailable")}`);
    return {
      participant_id: participantId,
      logs: [],
      control: fallbackControlMap(params.participant).get(participantId) || {},
      sources: {
        database_ok: false,
        database_message: clean(error?.message || "Workout source unavailable."),
        supabase_rows: 0,
        supabase_manual_hidden: 0,
        device_rows_visible: 0,
        google_sheet_ok: false,
        google_sheet_message: clean(error?.message || "Workout source unavailable."),
        google_sheet_rows: 0,
        unmatched_google_sheet_rows: 0,
        canonical_rows: 0,
        fitness_source: "none",
      },
    };
  });

  const nutritionPromise = loadCanonicalNutritionHistory({
    supabase: params.supabase,
    participant: params.participant,
  }).catch((error: any) => {
    warnings.push(`nutrition:${clean(error?.message || "unavailable")}`);
    return {
      participant_id: participantId,
      logs: [],
      sources: {
        supabase_rows: 0,
        google_sheet_ok: false,
        google_sheet_message: clean(error?.message || "Nutrition source unavailable."),
        google_sheet_rows: 0,
        unmatched_google_sheet_rows: 0,
      },
    };
  });

  const targetPromise = loadEffectiveTargetTimeline({
    supabase: params.supabase,
    participant: params.participant,
  }).catch((error: any) => {
    warnings.push(`targets:${clean(error?.message || "unavailable")}`);
    return loadEffectiveTargetTimeline({
      supabase: params.supabase,
      participant: params.participant,
      notes: [],
    });
  });

  const [workoutHistory, nutritionHistory, targets] =
    await Promise.all([
      workoutPromise,
      nutritionPromise,
      targetPromise,
    ]);

  if (workoutHistory?.sources?.database_ok === false) {
    warnings.push(
      `activity:${clean(workoutHistory?.sources?.database_message || "unavailable")}`,
    );
  }
  if (workoutHistory?.sources?.google_sheet_ok === false) {
    warnings.push(
      `workout-sheet:${clean(workoutHistory?.sources?.google_sheet_message || "unavailable")}`,
    );
  }

  const activityRows = filterOperationalRowsForProgram(
    params.participant,
    workoutHistory?.logs || [],
    "",
    "",
    ["log_date", "started_at", "created_at"],
  );

  const nutritionRows = filterOperationalRowsForProgram(
    params.participant,
    nutritionHistory?.logs || [],
    "",
    "",
    ["log_date", "created_at"],
  );

  const nutritionTarget = numberValue(targets?.current?.nutrition);
  const workoutTarget = numberValue(targets?.current?.workout) || 300;
  const streak = buildWellnessStreakSummary({
    nutritionRows,
    activityRows,
    workoutTargetCalories: workoutTarget,
    targetTimeline: targets,
  });

  const control =
    workoutHistory?.control ||
    params.participant?.wellness_control ||
    {};

  return {
    participant_id: participantId,
    streak,
    targets: {
      nutrition_max_calories: nutritionTarget,
      workout_min_calories: workoutTarget,
      target_history: targetTimelineSummary(targets),
    },
    sources: {
      nutrition: nutritionHistory?.sources || null,
      nutrition_rows: nutritionRows.length,
      activity_ok:
        workoutHistory?.sources?.database_ok !== false &&
        workoutHistory?.sources?.google_sheet_ok !== false,
      activity_rows: activityRows.length,
      activity: workoutHistory?.sources || null,
      fitness_source: clean(control?.fitness_source || "none"),
    },
    status: warnings.length > 0 ? "partial" : "ok",
    warnings,
  };
}
