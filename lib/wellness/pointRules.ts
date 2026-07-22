// WELLNESS_POINT_RULES_V87
// Single source of truth for Wellness participant point values.

export const WELLNESS_POINT_RULES = {
  nutrition_input: 5,
  nutrition_daily_bonus: 10,
  healthtalk_offline_with_evidence: 20,
  healthtalk_online_or_without_evidence: 10,
  workout_target_reached: 10,
  workout_below_target: 5,
} as const;

export function cleanPointValue(value: any) {
  return String(value ?? "").trim();
}

export function pointNumber(value: any) {
  const text = cleanPointValue(value);
  if (!text) return 0;

  const normalized = /^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text)
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function nutritionInputPoints() {
  return WELLNESS_POINT_RULES.nutrition_input;
}

export function nutritionDailyBonusPoints(params: {
  totalCalories: number;
  calorieLimit: number;
  hasNutritionInput: boolean;
}) {
  if (!params.hasNutritionInput || !(params.calorieLimit > 0)) return 0;
  return params.totalCalories <= params.calorieLimit
    ? WELLNESS_POINT_RULES.nutrition_daily_bonus
    : 0;
}

export function workoutDailyPoints(params: {
  calories: number;
  calorieTarget: number;
  hasActivity: boolean;
}) {
  if (!params.hasActivity) return 0;
  if (params.calorieTarget > 0 && params.calories >= params.calorieTarget) {
    return WELLNESS_POINT_RULES.workout_target_reached;
  }
  return WELLNESS_POINT_RULES.workout_below_target;
}

export function hasHealthtalkEvidence(row: any) {
  const raw = row?.raw_payload || {};
  return Boolean(
    cleanPointValue(
      row?.evidence_url ||
        row?.evidence_preview_url ||
        row?.google_drive_url ||
        row?.google_drive_preview_url ||
        raw?.["Bukti Healthtalk"] ||
        raw?.["Preview Bukti Healthtalk"] ||
        raw?.evidence_url ||
        raw?.evidence_preview_url,
    ),
  );
}

export function healthtalkPointType(row: any) {
  const raw = row?.raw_payload || {};
  return cleanPointValue(
    row?.healthtalk_type ||
      row?.attendance_type ||
      row?.participation_type ||
      row?.type ||
      raw?.["Jenis Healthtalk"] ||
      raw?.healthtalk_type,
  ).toLowerCase();
}

export function healthtalkPoints(params: {
  healthtalkType: any;
  hasEvidence: boolean;
}) {
  const type = cleanPointValue(params.healthtalkType).toLowerCase();
  const offline = /offline|luring|onsite|tatap\s*muka/.test(type);

  if (offline && params.hasEvidence) {
    return WELLNESS_POINT_RULES.healthtalk_offline_with_evidence;
  }

  // Final rule: online OR any submission without evidence receives +10.
  return WELLNESS_POINT_RULES.healthtalk_online_or_without_evidence;
}

export function healthtalkPointsFromRow(row: any) {
  return healthtalkPoints({
    healthtalkType: healthtalkPointType(row),
    hasEvidence: hasHealthtalkEvidence(row),
  });
}

export function participantNutritionCalorieLimit(participant: any) {
  return pointNumber(
    participant?.daily_calorie_limit ||
      participant?.nutrition_max_calories ||
      participant?.daily_calorie_target ||
      participant?.target_calories ||
      participant?.calorie_limit,
  );
}

export function participantWorkoutCalorieTarget(participant: any) {
  return pointNumber(
    participant?.workout_calorie_target ||
      participant?.workout_min_calories ||
      participant?.active_calorie_target ||
      participant?.daily_activity_calorie_target,
  );
}
