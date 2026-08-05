// WELLNESS_PARTICIPANT_STREAK_SERVER_V126M26_1
// Shared server loader for the participant initial payload and streak refresh API.
// Read-only: no database writes, schema changes, or Google Fit sync changes.

import {
  filterActivityRowsByFitnessSource,
  loadParticipantControlMap,
} from "@/lib/wellness/participantControls";
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

  const activityPromise = params.supabase
    .from("wellness_activity_logs")
    .select("*")
    .eq("participant_id", participantId)
    .order("log_date", { ascending: true })
    .limit(2000)
    .then((result: any) => result)
    .catch((error: any) => ({ data: [], error }));

  const controlPromise = loadParticipantControlMap(
    params.supabase,
    [participantId],
  ).catch((error: any) => {
    warnings.push(`fitness-control:${clean(error?.message || "unavailable")}`);
    return fallbackControlMap(params.participant);
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

  const [activityResult, controlMap, nutritionHistory, targets] =
    await Promise.all([
      activityPromise,
      controlPromise,
      nutritionPromise,
      targetPromise,
    ]);

  if (activityResult?.error) {
    warnings.push(
      `activity:${clean(activityResult.error?.message || "unavailable")}`,
    );
  }

  const activityRows = filterOperationalRowsForProgram(
    params.participant,
    filterActivityRowsByFitnessSource(
      activityResult?.error ? [] : activityResult?.data || [],
      controlMap,
    ),
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
    controlMap.get(participantId) ||
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
      activity_ok: !activityResult?.error,
      activity_rows: activityRows.length,
      fitness_source: clean(control?.fitness_source || "none"),
    },
    status: warnings.length > 0 ? "partial" : "ok",
    warnings,
  };
}
