// WELLNESS_COACH_ACTIVITY_TARGET_CALCULATOR_V126M39
// Read-only calculator for Coach recommendations.
// Uses active calories only. Google Fit total calories, which include resting
// energy, are never used as an activity target baseline.

export type CoachActivityBaselineDay = {
  date: string;
  active_calories: number;
  steps: number;
  exercise_minutes: number;
  row_count: number;
};

export type CoachActivityTargetResult = {
  period_days: number;
  start_date: string;
  end_date: string;
  baseline: {
    active_calories_per_active_day: number;
    steps_per_recorded_day: number;
    exercise_minutes_per_active_day: number;
    active_calorie_days: number;
    step_days: number;
    exercise_days: number;
    observed_days: number;
    active_days: number;
  };
  recommendation: {
    active_calorie_target: number;
    step_target: number;
    exercise_minutes_target: number;
    ready_to_apply: boolean;
    confidence: "low" | "medium" | "high";
  };
  quality: {
    exact_active_calorie_rows: number;
    estimated_active_calorie_rows: number;
    manual_activity_rows: number;
    ignored_total_energy_rows: number;
    device_daily_rows_deduplicated: number;
    warnings: string[];
  };
  days: CoachActivityBaselineDay[];
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
  if (!row?.raw_payload) return {};
  if (typeof row.raw_payload === "object") return row.raw_payload;
  try {
    const parsed = JSON.parse(String(row.raw_payload));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function sourceKey(row: any) {
  const raw = rawPayload(row);
  return clean(
    row?.source || row?.provider || row?.input_source || raw?.provider || raw?.source,
  )
    .toLowerCase()
    .replace(/-/g, "_");
}

function dateKey(value: any) {
  const text = clean(value);
  if (!text) return "";
  const direct = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) {
    const candidate = `${direct[1]}-${direct[2]}-${direct[3]}`;
    const parsedCandidate = new Date(`${candidate}T12:00:00+07:00`);
    if (!Number.isNaN(parsedCandidate.getTime())) {
      const normalized = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(parsedCandidate);
      if (normalized === candidate) return candidate;
    }
    return "";
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function jakartaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(date: string, amount: number) {
  const parsed = new Date(`${date}T12:00:00+07:00`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function rowTimestamp(row: any) {
  const parsed = Date.parse(
    clean(row?.updated_at || row?.created_at || row?.started_at || row?.log_date),
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function activityDate(row: any) {
  return dateKey(row?.log_date || row?.started_at || row?.created_at);
}

function activeCalories(row: any) {
  const raw = rawPayload(row);
  const source = sourceKey(row);

  if (source === "google_fit") {
    const active = numberValue(
      raw?.google_fit_active_calories_exact ??
        raw?.google_fit_active_calories ??
        raw?.selected_active_calories ??
        raw?.sanitized_active_calories ??
        raw?.exact_snapshot?.active_calories,
    );
    const total = numberValue(
      raw?.google_fit_total_calories ??
        raw?.google_fit_calories_expended ??
        raw?.exact_snapshot?.total_calories ??
        row?.total_calories ??
        row?.calories,
    );
    return {
      value: active > 0 ? active : 0,
      kind: active > 0 ? ("exact" as const) : ("missing" as const),
      ignoredTotalEnergy: active <= 0 && total > 0,
    };
  }

  if (source === "health_connect") {
    const selected = numberValue(
      raw?.selected_active_calories ??
        raw?.sanitized_active_calories ??
        raw?.health_connect_active_calories,
    );
    if (selected > 0) {
      const estimated = clean(raw?.calories_source).includes("estimated");
      return {
        value: selected,
        kind: estimated ? ("estimated" as const) : ("exact" as const),
        ignoredTotalEnergy: false,
      };
    }

    const reported = numberValue(
      raw?.health_connect_calories_original ??
        raw?.health_connect_calories ??
        raw?.original_payload?.active_calories,
    );
    if (reported > 0 && raw?.health_connect_calories_rejected !== true) {
      return {
        value: reported,
        kind: raw?.health_connect_calories_used === false
          ? ("estimated" as const)
          : ("exact" as const),
        ignoredTotalEnergy: false,
      };
    }

    const stored = numberValue(row?.activity_calories ?? row?.calories);
    return {
      value: stored > 0 ? stored : 0,
      kind: stored > 0 ? ("estimated" as const) : ("missing" as const),
      ignoredTotalEnergy: false,
    };
  }

  const active = numberValue(
    row?.activity_calories ??
      row?.calories ??
      row?.calories_burned ??
      raw?.selected_active_calories ??
      raw?.active_calories ??
      raw?.calories,
  );
  return {
    value: Math.max(0, active),
    kind: active > 0 ? (source === "strava" ? ("exact" as const) : ("manual" as const)) : ("missing" as const),
    ignoredTotalEnergy: false,
  };
}

function steps(row: any) {
  const raw = rawPayload(row);
  return Math.max(
    0,
    numberValue(
      row?.steps ??
        row?.total_steps ??
        raw?.health_connect_steps ??
        raw?.google_fit_steps ??
        raw?.steps,
    ),
  );
}

function exerciseMinutes(row: any) {
  const raw = rawPayload(row);
  let minutes = numberValue(
    row?.duration_minutes ??
      row?.active_minutes ??
      row?.exercise_minutes ??
      raw?.health_connect_active_minutes ??
      raw?.active_minutes ??
      raw?.duration_minutes ??
      raw?.exercise_minutes,
  );

  if (minutes <= 0) {
    const start = Date.parse(clean(row?.started_at || row?.start_time));
    const end = Date.parse(clean(row?.ended_at || row?.end_time));
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      minutes = (end - start) / 60000;
    }
  }

  return Math.min(1440, Math.max(0, minutes));
}

function roundUp(value: number, increment: number) {
  if (!(value > 0) || !(increment > 0)) return 0;
  return Math.ceil(value / increment) * increment;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rounded(value: number, digits = 0) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function recommendedCalories(baseline: number, days: number) {
  if (days < 3 || baseline < 25) return 0;
  if (baseline > 1000) return roundUp(baseline, 25);
  const candidate = Math.max(baseline * 1.1, baseline + 25);
  return Math.min(roundUp(candidate, 25), roundUp(baseline + 100, 25));
}

function recommendedSteps(baseline: number, days: number) {
  if (days < 3 || baseline < 250) return 0;
  const candidate = Math.max(baseline * 1.1, baseline + 500);
  return Math.min(12000, roundUp(Math.min(candidate, baseline + 1500), 500));
}

function recommendedMinutes(baseline: number, days: number) {
  if (days < 3 || baseline < 3) return 0;
  const candidate = Math.max(baseline * 1.15, baseline + 5);
  return Math.min(60, roundUp(Math.min(candidate, baseline + 10), 5));
}

export function buildCoachActivityTargetRecommendation(
  rows: any[],
  options?: { periodDays?: number; endDate?: string },
): CoachActivityTargetResult {
  const periodDays = Math.min(30, Math.max(7, Math.floor(options?.periodDays || 14)));
  const endDate = dateKey(options?.endDate) || jakartaToday();
  const startDate = addDays(endDate, -(periodDays - 1));
  const inWindow = (rows || []).filter((row) => {
    const date = activityDate(row);
    return Boolean(date && date >= startDate && date <= endDate);
  });

  const deviceSnapshots = new Map<string, any>();
  const sessionRows: any[] = [];
  let deduplicated = 0;

  for (const row of inWindow) {
    const source = sourceKey(row);
    const raw = rawPayload(row);
    const date = activityDate(row);
    const syncMode = clean(raw?.sync_mode).toLowerCase();
    const isDailyDevice =
      (source === "google_fit" || source === "health_connect") &&
      (syncMode.includes("daily") || clean(row?.external_activity_id).includes("_daily_"));

    if (!isDailyDevice) {
      sessionRows.push(row);
      continue;
    }

    const key = `${date}|${source}`;
    const previous = deviceSnapshots.get(key);
    if (!previous || rowTimestamp(row) >= rowTimestamp(previous)) {
      if (previous) deduplicated += 1;
      deviceSnapshots.set(key, row);
    } else {
      deduplicated += 1;
    }
  }

  const dailyDeviceKeys = new Set(deviceSnapshots.keys());
  const selectedRows = [...deviceSnapshots.values(), ...sessionRows];
  const daily = new Map<string, CoachActivityBaselineDay>();
  let exactRows = 0;
  let estimatedRows = 0;
  let manualRows = 0;
  let ignoredTotalRows = 0;

  for (const row of selectedRows) {
    const date = activityDate(row);
    if (!date) continue;
    const current = daily.get(date) || {
      date,
      active_calories: 0,
      steps: 0,
      exercise_minutes: 0,
      row_count: 0,
    };
    const source = sourceKey(row);
    const raw = rawPayload(row);
    const syncMode = clean(raw?.sync_mode).toLowerCase();
    const isDailyDevice =
      (source === "google_fit" || source === "health_connect") &&
      (syncMode.includes("daily") || clean(row?.external_activity_id).includes("_daily_"));
    const coveredByDailyDevice =
      !isDailyDevice &&
      (source === "google_fit" || source === "health_connect") &&
      dailyDeviceKeys.has(`${date}|${source}`);
    const calories = coveredByDailyDevice
      ? { value: 0, kind: "missing" as const, ignoredTotalEnergy: false }
      : activeCalories(row);
    current.active_calories += calories.value;
    current.steps = Math.max(current.steps, coveredByDailyDevice ? 0 : steps(row));
    // Device exercise sessions may still provide duration when the daily row
    // already provides canonical calories and steps.
    current.exercise_minutes += exerciseMinutes(row);
    current.row_count += 1;
    daily.set(date, current);

    if (calories.kind === "exact") exactRows += 1;
    else if (calories.kind === "estimated") estimatedRows += 1;
    else if (calories.kind === "manual") manualRows += 1;
    if (calories.ignoredTotalEnergy) ignoredTotalRows += 1;
  }

  const days = [...daily.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      ...day,
      active_calories: rounded(day.active_calories, 1),
      steps: Math.round(day.steps),
      exercise_minutes: rounded(day.exercise_minutes, 1),
    }));

  const calorieDays = days.filter((day) => day.active_calories > 0);
  const stepDays = days.filter((day) => day.steps > 0);
  const minuteDays = days.filter((day) => day.exercise_minutes > 0);
  const activeDays = days.filter(
    (day) => day.active_calories > 0 || day.steps > 0 || day.exercise_minutes > 0,
  );

  const calorieBaseline = rounded(
    average(calorieDays.map((day) => day.active_calories)),
  );
  const stepBaseline = Math.round(average(stepDays.map((day) => day.steps)));
  const minuteBaseline = rounded(
    average(minuteDays.map((day) => day.exercise_minutes)),
  );

  const activeCalorieTarget = recommendedCalories(
    calorieBaseline,
    calorieDays.length,
  );
  const stepTarget = recommendedSteps(stepBaseline, stepDays.length);
  const exerciseMinutesTarget = recommendedMinutes(
    minuteBaseline,
    minuteDays.length,
  );

  const dataDays = Math.max(
    calorieDays.length,
    stepDays.length,
    minuteDays.length,
  );
  const confidence: "low" | "medium" | "high" =
    dataDays >= 10 ? "high" : dataDays >= 5 ? "medium" : "low";
  const warnings: string[] = [];

  if (ignoredTotalRows > 0) {
    warnings.push(
      `${ignoredTotalRows} row energi total Google Fit diabaikan karena mencakup energi istirahat.`,
    );
  }
  if (calorieDays.length < 3) {
    warnings.push("Data kalori aktif belum cukup untuk rekomendasi kalori workout.");
  }
  if (stepDays.length < 3) {
    warnings.push("Data langkah belum cukup untuk rekomendasi target langkah.");
  }
  if (minuteDays.length < 3) {
    warnings.push("Data durasi latihan belum cukup untuk rekomendasi menit latihan.");
  }
  if (calorieBaseline > 1000) {
    warnings.push(
      "Baseline kalori aktif sangat tinggi. Coach perlu meninjau sumber device sebelum menerapkan target.",
    );
  }

  return {
    period_days: periodDays,
    start_date: startDate,
    end_date: endDate,
    baseline: {
      active_calories_per_active_day: calorieBaseline,
      steps_per_recorded_day: stepBaseline,
      exercise_minutes_per_active_day: minuteBaseline,
      active_calorie_days: calorieDays.length,
      step_days: stepDays.length,
      exercise_days: minuteDays.length,
      observed_days: days.length,
      active_days: activeDays.length,
    },
    recommendation: {
      active_calorie_target: activeCalorieTarget,
      step_target: stepTarget,
      exercise_minutes_target: exerciseMinutesTarget,
      ready_to_apply:
        activeCalorieTarget > 0 || stepTarget > 0 || exerciseMinutesTarget > 0,
      confidence,
    },
    quality: {
      exact_active_calorie_rows: exactRows,
      estimated_active_calorie_rows: estimatedRows,
      manual_activity_rows: manualRows,
      ignored_total_energy_rows: ignoredTotalRows,
      device_daily_rows_deduplicated: deduplicated,
      warnings,
    },
    days,
  };
}
