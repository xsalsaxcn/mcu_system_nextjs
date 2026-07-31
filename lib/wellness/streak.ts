// WELLNESS_CANONICAL_STREAK_V126M23_1
// Shared read-only streak calculation for Coach and Participant.
// Google Fit total energy (including basal calories) is display-only.

export type WellnessStreakDay = {
  date: string;
  label: string;
  nutrition_count: number;
  nutrition_calories: number;
  workout_calories: number;
  steps: number;
  success: boolean;
};

export type WellnessStreakSummary = {
  current_streak: number;
  longest_streak: number;
  success_dates: string[];
  days: WellnessStreakDay[];
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = clean(value);
  if (!text) return 0;
  const normalized = /^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text)
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rawPayload(row: any) {
  const raw = row?.raw_payload;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? raw : {};
}

export function wellnessJakartaDate(value: any) {
  const text = clean(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(text) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) {
    return text.slice(0, 10);
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text.slice(0, 10);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function jakartaDay(offsetDays = 0) {
  const shifted = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

function dayLabel(date: string) {
  if (!date) return "-";
  return new Date(`${date}T12:00:00+07:00`)
    .toLocaleDateString("id-ID", {
      weekday: "short",
      timeZone: "Asia/Jakarta",
    })
    .replace(/\./g, "")
    .slice(0, 3);
}

function activityDate(row: any) {
  const raw = rawPayload(row);
  return wellnessJakartaDate(
    row?.log_date ||
      row?.date ||
      row?.tanggal ||
      raw?.log_date ||
      row?.started_at ||
      row?.start_date_local ||
      raw?.start_date_local ||
      raw?.last_sync_at ||
      raw?.health_connect_last_sync_at ||
      row?.updated_at ||
      row?.created_at,
  );
}

function activitySource(row: any) {
  const raw = rawPayload(row);
  return clean(
    row?.source || row?.input_source || row?.provider || raw?.provider,
  )
    .toLowerCase()
    .replace(/-/g, "_");
}

function isGoogleFitDaily(row: any) {
  const raw = rawPayload(row);
  const source = activitySource(row);
  const externalId = clean(
    row?.external_activity_id || row?.provider_activity_id || row?.id,
  ).toLowerCase();
  const syncMode = clean(raw?.sync_mode).toLowerCase();
  const name = clean(
    row?.activity_name || row?.activity_type || row?.nama_activities,
  ).toLowerCase();

  return source === "google_fit" && (
    externalId.includes("google_fit_daily_") ||
    name.includes("google fit daily") ||
    syncMode === "aggregate_daily"
  );
}

function isHealthConnectDaily(row: any) {
  const raw = rawPayload(row);
  const source = activitySource(row);
  const externalId = clean(
    row?.external_activity_id || row?.provider_activity_id || row?.id,
  ).toLowerCase();
  const syncMode = clean(raw?.sync_mode).toLowerCase();
  const name = clean(
    row?.activity_name || row?.activity_type || row?.nama_activities,
  ).toLowerCase();

  return source === "health_connect" && (
    externalId.includes("health_connect_daily_") ||
    name.includes("health connect daily") ||
    syncMode === "daily_aggregate"
  );
}

export function wellnessStreakSteps(row: any) {
  const raw = rawPayload(row);
  return numberValue(
    row?.steps ??
      row?.total_steps ??
      raw?.health_connect_steps ??
      raw?.google_fit_steps ??
      raw?.steps ??
      raw?.total_steps,
  );
}

function activityMinutes(row: any) {
  const raw = rawPayload(row);
  return numberValue(
    row?.duration_minutes ??
      row?.total_duration_minutes ??
      raw?.google_fit_active_minutes ??
      raw?.health_connect_active_minutes ??
      raw?.active_minutes ??
      raw?.duration_minutes,
  );
}

function activityDistance(row: any) {
  const raw = rawPayload(row);
  return numberValue(
    row?.distance_km ??
      row?.total_distance_km ??
      raw?.health_connect_distance_km ??
      raw?.google_fit_distance_km ??
      raw?.distance_km,
  );
}

function estimatedHealthConnectCalories(row: any) {
  const steps = wellnessStreakSteps(row);
  const minutes = activityMinutes(row);
  const rawDistance = activityDistance(row);
  const estimatedDistance = steps > 0 ? steps * 0.0007 : rawDistance;
  const minDistance = Math.max(0.05, steps * 0.00025);
  const maxDistance = Math.max(0.3, steps * 0.0015);
  const distance =
    steps > 0 && rawDistance >= minDistance && rawDistance <= maxDistance
      ? rawDistance
      : estimatedDistance;

  if (steps > 0) {
    const distanceEstimate = distance * 70 * 0.53;
    return Math.max(1, Math.round(Math.min(distanceEstimate, steps * 0.1)));
  }

  if (minutes > 0) {
    return Math.min(1200, Math.max(1, Math.round(minutes * 4.2)));
  }

  return 0;
}

export function wellnessStreakWorkoutCalories(row: any) {
  const raw = rawPayload(row);

  if (isGoogleFitDaily(row)) {
    // Exact active calories only. Google Fit total energy includes basal energy
    // and must never create workout target success.
    return numberValue(
      raw?.google_fit_active_calories_exact ??
        raw?.google_fit_active_calories ??
        raw?.selected_active_calories ??
        raw?.sanitized_active_calories,
    );
  }

  if (isHealthConnectDaily(row)) {
    const selected = numberValue(
      raw?.selected_active_calories ??
        raw?.sanitized_active_calories ??
        raw?.health_connect_active_calories,
    );
    if (selected > 0) return selected;

    const reported = numberValue(
      raw?.health_connect_calories_original ??
        raw?.health_connect_calories ??
        raw?.original_payload?.calories ??
        raw?.original_payload?.active_calories,
    );
    if (raw?.health_connect_calories_used === true && reported > 0) {
      return reported;
    }

    const stored = numberValue(
      row?.activity_calories ?? row?.calories ?? row?.calories_burned,
    );
    if (stored > 0 && stored <= 2500) return stored;

    return estimatedHealthConnectCalories(row);
  }

  return numberValue(
    row?.calories ??
      row?.total_calories ??
      row?.activity_calories ??
      row?.calories_burned ??
      raw?.selected_active_calories ??
      raw?.sanitized_active_calories ??
      raw?.active_calories ??
      raw?.calories,
  );
}

function nutritionCalories(row: any) {
  const raw = rawPayload(row);
  return numberValue(
    row?.total_calories ??
      row?.calories ??
      row?.estimated_calories ??
      row?.calorie_total ??
      raw?.["Kalori Makanan"],
  );
}

export function buildWellnessStreakSummary(params: {
  nutritionRows: any[];
  activityRows: any[];
  workoutTargetCalories: number;
  historyDays?: number;
}): WellnessStreakSummary {
  const map = new Map<
    string,
    {
      mealKeys: Set<string>;
      nutritionCalories: number;
      workoutCalories: number;
      steps: number;
    }
  >();

  const ensure = (date: string) => {
    if (!map.has(date)) {
      map.set(date, {
        mealKeys: new Set<string>(),
        nutritionCalories: 0,
        workoutCalories: 0,
        steps: 0,
      });
    }
    return map.get(date)!;
  };

  for (const row of params.nutritionRows || []) {
    const date = wellnessJakartaDate(
      row?.log_date || row?.date || row?.created_at || row?.updated_at,
    );
    if (!date) continue;
    const bucket = ensure(date);
    const meal = clean(
      row?.meal_time || row?.meal_type || row?.meal_period || row?.waktu_makan,
    ).toLowerCase();
    bucket.mealKeys.add(meal || `row-${bucket.mealKeys.size + 1}`);
    bucket.nutritionCalories += nutritionCalories(row);
  }

  for (const row of params.activityRows || []) {
    const date = activityDate(row);
    if (!date) continue;
    const bucket = ensure(date);
    bucket.workoutCalories += wellnessStreakWorkoutCalories(row);
    bucket.steps += wellnessStreakSteps(row);
  }

  const historyDays = Math.max(7, Math.round(params.historyDays || 42));
  const allDays: WellnessStreakDay[] = [];

  for (let offset = -(historyDays - 1); offset <= 0; offset += 1) {
    const date = jakartaDay(offset);
    const bucket = map.get(date);
    const nutritionCount = bucket?.mealKeys.size || 0;
    const workoutCalories = Math.round(bucket?.workoutCalories || 0);
    const success =
      nutritionCount >= 3 &&
      (params.workoutTargetCalories > 0
        ? workoutCalories >= params.workoutTargetCalories
        : workoutCalories > 0);

    allDays.push({
      date,
      label: dayLabel(date),
      nutrition_count: nutritionCount,
      nutrition_calories: Math.round(bucket?.nutritionCalories || 0),
      workout_calories: workoutCalories,
      steps: Math.round(bucket?.steps || 0),
      success,
    });
  }

  let cursor = allDays.length - 1;
  // Today is allowed to remain pending without deleting the completed streak
  // that ended yesterday.
  if (!allDays[cursor]?.success) cursor -= 1;

  let currentStreak = 0;
  while (cursor >= 0 && allDays[cursor]?.success) {
    currentStreak += 1;
    cursor -= 1;
  }

  let longestStreak = 0;
  let running = 0;
  for (const day of allDays) {
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
    success_dates: allDays.filter((day) => day.success).map((day) => day.date),
    days: allDays.slice(-7),
  };
}
