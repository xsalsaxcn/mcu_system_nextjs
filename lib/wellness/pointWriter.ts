// WELLNESS_POINT_WRITER_V87
// Idempotent writes and daily reconciliation for wellness_point_logs.

import {
  participantNutritionCalorieLimit,
  participantWorkoutCalorieTarget,
  pointNumber,
  workoutDailyPoints,
} from "@/lib/wellness/pointRules";
import {
  filterActivityRowsByFitnessSource,
  loadParticipantControlMap,
} from "@/lib/wellness/participantControls";
import { wellnessStreakWorkoutCalories } from "@/lib/wellness/streak";
import {
  effectiveTargetsForDate,
  loadEffectiveTargetTimeline,
  targetTimelineSummary,
} from "@/lib/wellness/effectiveDatedTargets";

export type WellnessPointWriteResult = {
  ok: boolean;
  points: number;
  warning: string;
  row?: any;
  inserted?: boolean;
  previousPoints?: number;
  delta?: number;
  removed?: boolean;
  calories?: number;
  target?: number;
  hasActivity?: boolean;
};

function clean(value: any) {
  return String(value ?? "").trim();
}

export function participantCompanyId(participant: any) {
  return (
    pointNumber(
      participant?.wellness_company_id ||
        participant?.company_id ||
        participant?.wellnessCompanyId,
    ) || null
  );
}

export async function resolveParticipantPointTargets(
  supabase: any,
  participant: any,
  logDate = "",
) {
  const timeline = await loadEffectiveTargetTimeline({ supabase, participant });
  const values = logDate
    ? effectiveTargetsForDate(timeline, logDate)
    : timeline.current;

  return {
    nutrition: pointNumber(values.nutrition),
    workout: pointNumber(values.workout) || 300,
    steps: pointNumber(values.steps) || 8000,
    duration_minutes: pointNumber(values.duration_minutes),
    weight_kg: pointNumber(values.weight_kg),
    effective_date: logDate || timeline.current_revision?.effective_from || "",
    timeline: targetTimelineSummary(timeline),
  };
}

export async function insertPointOnce(params: {
  supabase: any;
  participant: any;
  logDate: string;
  pointKey: string;
  sourceType: string;
  sourceId?: number | null;
  points: number;
  description: string;
}): Promise<WellnessPointWriteResult> {
  const participantId = pointNumber(params.participant?.id);
  const sourceId = pointNumber(params.sourceId) || null;

  if (!participantId || !(params.points > 0)) {
    return { ok: false, inserted: false, points: 0, warning: "Point tidak valid." };
  }

  try {
    let query = params.supabase
      .from("wellness_point_logs")
      .select("*")
      .eq("participant_id", participantId)
      .eq("point_key", params.pointKey)
      .eq("source_type", params.sourceType)
      .limit(1);

    if (sourceId) query = query.eq("source_id", sourceId);

    const existingResult = await query;
    if (existingResult?.error) throw existingResult.error;
    const existing = existingResult?.data?.[0] || null;

    if (existing) {
      return {
        ok: true,
        inserted: false,
        row: existing,
        points: pointNumber(existing.points),
        warning: "",
      };
    }

    const { data, error } = await params.supabase
      .from("wellness_point_logs")
      .insert({
        participant_id: participantId,
        company_id: participantCompanyId(params.participant),
        log_date: params.logDate,
        point_key: params.pointKey,
        source_type: params.sourceType,
        source_id: sourceId,
        points: params.points,
        description: params.description,
        status: "approved",
      })
      .select("*")
      .single();

    if (error) throw error;

    return {
      ok: true,
      inserted: true,
      row: data,
      points: params.points,
      warning: "",
    };
  } catch (error: any) {
    return {
      ok: false,
      inserted: false,
      points: 0,
      warning: error?.message || "Point belum tersimpan ke ledger.",
    };
  }
}

export async function setDailyPoint(params: {
  supabase: any;
  participant: any;
  logDate: string;
  pointKey: string;
  sourceType: string;
  sourceId?: number | null;
  points: number;
  description: string;
}): Promise<WellnessPointWriteResult> {
  const participantId = pointNumber(params.participant?.id);
  const desiredPoints = Math.max(0, pointNumber(params.points));

  if (!participantId) {
    return { ok: false, points: 0, previousPoints: 0, delta: 0, warning: "Participant tidak valid." };
  }

  try {
    const existingResult = await params.supabase
      .from("wellness_point_logs")
      .select("*")
      .eq("participant_id", participantId)
      .eq("log_date", params.logDate)
      .eq("point_key", params.pointKey)
      .order("id", { ascending: true });

    if (existingResult?.error) throw existingResult.error;

    const rows = existingResult?.data || [];
    const previousPoints = rows.reduce(
      (sum: number, row: any) => sum + pointNumber(row?.points),
      0,
    );

    if (desiredPoints <= 0) {
      if (rows.length > 0) {
        const { error } = await params.supabase
          .from("wellness_point_logs")
          .delete()
          .eq("participant_id", participantId)
          .eq("log_date", params.logDate)
          .eq("point_key", params.pointKey);
        if (error) throw error;
      }

      return {
        ok: true,
        points: 0,
        previousPoints,
        delta: -previousPoints,
        removed: rows.length > 0,
        warning: "",
      };
    }

    const payload = {
      company_id: participantCompanyId(params.participant),
      source_type: params.sourceType,
      source_id: pointNumber(params.sourceId) || null,
      points: desiredPoints,
      description: params.description,
      status: "approved",
      updated_at: new Date().toISOString(),
    };

    let row: any = null;

    if (rows.length > 0) {
      const primary = rows[0];
      const { data, error } = await params.supabase
        .from("wellness_point_logs")
        .update(payload)
        .eq("id", primary.id)
        .select("*")
        .single();
      if (error) throw error;
      row = data;

      if (rows.length > 1) {
        const duplicateIds = rows.slice(1).map((item: any) => item.id).filter(Boolean);
        if (duplicateIds.length > 0) {
          await params.supabase
            .from("wellness_point_logs")
            .delete()
            .in("id", duplicateIds);
        }
      }
    } else {
      const { data, error } = await params.supabase
        .from("wellness_point_logs")
        .insert({
          participant_id: participantId,
          log_date: params.logDate,
          point_key: params.pointKey,
          ...payload,
        })
        .select("*")
        .single();
      if (error) throw error;
      row = data;
    }

    return {
      ok: true,
      row,
      points: desiredPoints,
      previousPoints,
      delta: desiredPoints - previousPoints,
      warning: "",
    };
  } catch (error: any) {
    return {
      ok: false,
      points: 0,
      previousPoints: 0,
      delta: 0,
      warning: error?.message || "Point harian belum tersimpan ke ledger.",
    };
  }
}

// WELLNESS_COACH_TARGET_STREAK_PARITY_V126M109_1_POINT_ACTIVE_ONLY
// Workout points use the same canonical ACTIVE-workout calorie resolver as
// participant streak and Coach progress. Point rule values are unchanged.
export function pointActivityCalories(row: any) {
  return wellnessStreakWorkoutCalories(row);
}

export function pointActivityHasValue(row: any) {
  const raw = row?.raw_payload || {};
  return Boolean(
    pointActivityCalories(row) > 0 ||
      pointNumber(row?.steps ?? row?.total_steps ?? raw?.steps ?? raw?.total_steps) > 0 ||
      pointNumber(row?.duration_minutes ?? raw?.duration_minutes ?? raw?.active_minutes) > 0,
  );
}

export async function reconcileWorkoutDailyPoint(params: {
  supabase: any;
  participant: any;
  logDate: string;
  sourceId?: number | null;
}): Promise<WellnessPointWriteResult> {
  const participantId = pointNumber(params.participant?.id);
  const { data, error } = await params.supabase
    .from("wellness_activity_logs")
    .select("*")
    .eq("participant_id", participantId)
    .eq("log_date", params.logDate)
    .limit(1000);

  if (error) {
    return {
      ok: false,
      points: 0,
      calories: 0,
      target: 0,
      warning: error.message,
    };
  }

  const controlMap = await loadParticipantControlMap(params.supabase, [participantId]);
  const selectedRows = filterActivityRowsByFitnessSource(data || [], controlMap);
  const calories = selectedRows.reduce(
    (sum: number, row: any) => sum + pointActivityCalories(row),
    0,
  );
  const hasActivity = selectedRows.some(pointActivityHasValue);
  const targets = await resolveParticipantPointTargets(
    params.supabase,
    params.participant,
    params.logDate,
  );
  const points = workoutDailyPoints({
    calories,
    calorieTarget: targets.workout,
    hasActivity,
  });

  const result = await setDailyPoint({
    supabase: params.supabase,
    participant: params.participant,
    logDate: params.logDate,
    pointKey: "workout_daily",
    sourceType: "workout_daily",
    sourceId: params.sourceId,
    points,
    description:
      points >= 10
        ? `Target workout harian tercapai (${Math.round(calories)}/${Math.round(targets.workout)} kkal)`
        : `Workout tercatat, target harian belum tercapai (${Math.round(calories)}/${Math.round(targets.workout)} kkal)`,
  });

  return {
    ...result,
    calories,
    target: targets.workout,
    hasActivity,
  };
}
