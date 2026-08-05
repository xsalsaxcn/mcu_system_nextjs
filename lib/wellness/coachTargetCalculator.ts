// WELLNESS_COACH_ACTIVITY_TARGET_CALCULATOR_V126M39
// WELLNESS_COACH_GOAL_WEIGHT_NUTRITION_V126M40_3
// WELLNESS_COACH_FLEXIBLE_GOAL_WEIGHT_V126M40_4
// WELLNESS_COACH_GOAL_WEIGHT_SAFETY_FALLBACK_V126M40_5
// WELLNESS_COACH_INVALID_GOAL_SAFE_CLAMP_V126M40_6
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

export type CoachNutritionClinicalSummary = {
  source: string;
  measured_at: string;
  weight_kg: number;
  height_cm: number;
  bmi: number;
  bmi_category: string;
  age_years: number;
  gender: "male" | "female" | "unknown";
  healthy_weight_min_kg: number;
  healthy_weight_max_kg: number;
};

export type CoachNutritionTargetSummary = {
  formula: "Mifflin-St Jeor";
  goal: "maintain" | "reduce" | "gain" | "medical_review";
  bmr_calories: number;
  activity_factor: number;
  maintenance_calories: number;
  nutrition_target_calories: number;
  target_weight_kg: number;
  phase_target_weight_kg: number;
  requested_target_weight_kg: number;
  goal_source: "coach" | "bmi" | "bmi_safety_fallback";
  target_bmi: number;
  calorie_adjustment_percent: number;
  ready_to_apply: boolean;
  confidence: "low" | "medium" | "high";
  warnings: string[];
};

export type CoachNutritionProfileInput = {
  gender?: unknown;
  birth_date?: unknown;
  age_years?: unknown;
  height_cm?: unknown;
  weight_kg?: unknown;
  goal_weight_kg?: unknown;
  goal_weight_mode?: unknown;
  bmi?: unknown;
  measurement_source?: unknown;
  measurement_date?: unknown;
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
    nutrition_calorie_target?: number;
    target_weight_kg?: number;
    phase_target_weight_kg?: number;
    ready_to_apply: boolean;
    confidence: "low" | "medium" | "high";
  };
  clinical?: CoachNutritionClinicalSummary;
  nutrition?: CoachNutritionTargetSummary;
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

function normalizeGender(value: unknown): "male" | "female" | "unknown" {
  const text = clean(value).toLowerCase();
  if (["male", "m", "l", "laki-laki", "laki laki", "pria"].includes(text)) {
    return "male";
  }
  if (["female", "f", "p", "perempuan", "wanita"].includes(text)) {
    return "female";
  }
  return "unknown";
}

function ageOnDate(value: unknown, referenceDate: string) {
  const birthText = clean(value);
  const birth = new Date(birthText);
  const reference = new Date(`${referenceDate}T12:00:00+07:00`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(reference.getTime())) return 0;
  let age = reference.getFullYear() - birth.getFullYear();
  const monthDelta = reference.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && reference.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age > 0 && age < 120 ? age : 0;
}

function bmiCategory(value: number) {
  if (!(value > 0)) return "Belum tersedia";
  if (value < 18.5) return "Berat Badan Kurang";
  if (value < 25) return "Normal";
  if (value < 30) return "Berat Badan Berlebih";
  return "Obesitas";
}

function nearest(value: number, increment: number) {
  if (!(value > 0) || !(increment > 0)) return 0;
  return Math.round(value / increment) * increment;
}

function activityFactorForNutrition(activity: CoachActivityTargetResult) {
  const steps = activity.baseline.steps_per_recorded_day || 0;
  const minutes = activity.baseline.exercise_minutes_per_active_day || 0;
  if (steps >= 10000 || minutes >= 45) return 1.55;
  if (steps >= 7500 || minutes >= 30) return 1.45;
  if (steps >= 5000 || minutes >= 15) return 1.35;
  return 1.2;
}

/**
 * Builds an editable Coach recommendation. BMI determines the operational goal,
 * while Mifflin-St Jeor uses weight, height, age, and sex for energy estimation.
 * The result never writes data automatically.
 */
export function buildCoachNutritionTargetRecommendation(
  profile: CoachNutritionProfileInput,
  activity: CoachActivityTargetResult,
): {
  clinical: CoachNutritionClinicalSummary;
  nutrition: CoachNutritionTargetSummary;
} {
  const height = numberValue(profile.height_cm);
  const weight = numberValue(profile.weight_kg);
  const suppliedBmi = numberValue(profile.bmi);
  const goalWeightMode =
    clean(profile.goal_weight_mode).toLowerCase() === "coach" ? "coach" : "bmi";
  const requestedTargetWeight =
    goalWeightMode === "coach" ? numberValue(profile.goal_weight_kg) : 0;
  const hasCoachGoalWeight = goalWeightMode === "coach" && requestedTargetWeight > 0;
  const calculatedBmi =
    weight > 0 && height > 0 ? weight / ((height / 100) ** 2) : 0;
  const bmi = rounded(suppliedBmi > 0 ? suppliedBmi : calculatedBmi, 1);
  const gender = normalizeGender(profile.gender);
  const suppliedAge = Math.round(numberValue(profile.age_years));
  const age =
    suppliedAge > 0 && suppliedAge < 120
      ? suppliedAge
      : ageOnDate(profile.birth_date, activity.end_date);
  const healthyMin = height > 0 ? rounded(18.5 * ((height / 100) ** 2), 1) : 0;
  const healthyMax = height > 0 ? rounded(24.9 * ((height / 100) ** 2), 1) : 0;
  const requestedTargetBmi =
    height > 0 && requestedTargetWeight > 0
      ? rounded(requestedTargetWeight / ((height / 100) ** 2), 1)
      : 0;
  const activityFactor = activityFactorForNutrition(activity);
  const warnings: string[] = [];

  let confidence: "low" | "medium" | "high" = "high";
  if (!(height > 0) || !(weight > 0) || !(bmi > 0)) {
    warnings.push("Tinggi, berat badan, atau BMI terbaru belum lengkap.");
    confidence = "low";
  }
  if (!age) {
    warnings.push("Tanggal lahir belum tersedia; kebutuhan kalori belum dapat dihitung otomatis.");
    confidence = "low";
  } else if (age < 18) {
    warnings.push("Peserta di bawah 18 tahun memerlukan perhitungan klinis khusus.");
    confidence = "low";
  }
  if (gender === "unknown") {
    warnings.push("Jenis kelamin belum tersedia; rumus Mifflin-St Jeor belum dapat diterapkan.");
    confidence = "low";
  }
  if (clean(profile.measurement_source).toLowerCase().includes("baseline")) {
    warnings.push("Pengukuran NAKES terbaru belum tersedia; sistem memakai baseline peserta.");
    if (confidence === "high") confidence = "medium";
  }

  let goal: CoachNutritionTargetSummary["goal"] = "medical_review";
  let goalSource: CoachNutritionTargetSummary["goal_source"] = hasCoachGoalWeight
    ? "coach"
    : "bmi";
  let bmr = 0;
  let maintenance = 0;
  let nutritionTarget = 0;
  let targetWeight = 0;
  let phaseTargetWeight = 0;
  let calorieAdjustmentPercent = 0;

  // A Coach-entered goal weight takes priority over BMI-only maintenance logic.
  // BMI remains a safety boundary. Large changes are split into a first 5% phase.
  if (height > 0 && weight > 0 && bmi > 0 && hasCoachGoalWeight) {
    targetWeight = rounded(requestedTargetWeight, 1);
    if (requestedTargetBmi < 18.5 || requestedTargetBmi > 35) {
      goalSource = "bmi_safety_fallback";
      const safeBoundaryWeight =
        requestedTargetBmi < 18.5
          ? healthyMin
          : rounded(35 * ((height / 100) ** 2), 1);
      targetWeight = safeBoundaryWeight;
      warnings.push(
        `Goal BB Coach ${rounded(requestedTargetWeight, 1)} kg menghasilkan BMI ${requestedTargetBmi} dan memerlukan review klinis.`,
      );
      warnings.push(
        `Untuk kalkulasi nutrisi, sistem memakai batas aman ${safeBoundaryWeight} kg. Nilai Target BB Coach pada form tetap dipertahankan untuk review.`,
      );
      confidence = "medium";

      if (bmi < 18.5) {
        goal = "medical_review";
        phaseTargetWeight = healthyMin;
        warnings.push(
          "BMI saat ini di bawah 18,5. Target nutrisi tetap memerlukan review NAKES/dokter.",
        );
        confidence = "low";
      } else if (targetWeight < weight - 0.5) {
        goal = "reduce";
        phaseTargetWeight = rounded(Math.max(targetWeight, weight * 0.95), 1);
        const safeLossPercent = ((weight - targetWeight) / weight) * 100;
        calorieAdjustmentPercent = safeLossPercent > 5 ? -15 : -10;
        warnings.push(
          `Arah program tetap penurunan BB. Fase awal sistem: ${phaseTargetWeight} kg sebelum menuju batas aman ${targetWeight} kg.`,
        );
      } else if (targetWeight > weight + 0.5) {
        goal = "gain";
        phaseTargetWeight = rounded(Math.min(targetWeight, weight * 1.05), 1);
        calorieAdjustmentPercent = 10;
      } else {
        goal = "maintain";
        phaseTargetWeight = rounded(weight, 1);
        calorieAdjustmentPercent = 0;
      }
    } else if (requestedTargetWeight < weight - 0.5) {
      goal = "reduce";
      phaseTargetWeight = rounded(Math.max(requestedTargetWeight, weight * 0.95), 1);
      const lossPercent = ((weight - requestedTargetWeight) / weight) * 100;
      calorieAdjustmentPercent = lossPercent > 5 ? -15 : -10;
      if (lossPercent > 10) {
        warnings.push(
          `Goal BB ${targetWeight} kg adalah target jangka panjang (${rounded(lossPercent, 1)}% dari BB saat ini). Fase awal sistem: ${phaseTargetWeight} kg.`,
        );
        if (confidence === "high") confidence = "medium";
      }
      if (requestedTargetBmi < 20) {
        warnings.push(
          `BMI pada goal BB sekitar ${requestedTargetBmi}; Coach/NAKES perlu memantau progres dan kondisi klinis.`,
        );
        if (confidence === "high") confidence = "medium";
      }
    } else if (requestedTargetWeight > weight + 0.5) {
      goal = "gain";
      phaseTargetWeight = rounded(Math.min(requestedTargetWeight, weight * 1.05), 1);
      calorieAdjustmentPercent = 10;
    } else {
      goal = "maintain";
      phaseTargetWeight = rounded(weight, 1);
    }
  } else if (height > 0 && weight > 0 && bmi > 0) {
    // Fallback when Coach has not entered a goal weight.
    if (bmi < 18.5) {
      goal = "medical_review";
      targetWeight = healthyMin;
      phaseTargetWeight = healthyMin;
      warnings.push(
        "BMI di bawah 18,5. Target berat badan perlu dikonfirmasi NAKES/dokter sebelum diterapkan.",
      );
    } else if (bmi < 25) {
      goal = "maintain";
      targetWeight = rounded(weight, 1);
      phaseTargetWeight = rounded(weight, 1);
    } else {
      goal = "reduce";
      targetWeight = rounded(Math.max(healthyMax, weight * 0.95), 1);
      phaseTargetWeight = targetWeight;
      calorieAdjustmentPercent = bmi >= 30 ? -15 : -10;
    }
  }

  const completeAdultProfile =
    height > 0 && weight > 0 && bmi > 0 && age >= 18 && gender !== "unknown";

  if (completeAdultProfile) {
    bmr = 10 * weight + 6.25 * height - 5 * age + (gender === "male" ? 5 : -161);
    bmr = nearest(bmr, 10);
    maintenance = nearest(bmr * activityFactor, 50);

    if (goal === "maintain") {
      nutritionTarget = maintenance;
    } else if (goal === "reduce") {
      const factor = calorieAdjustmentPercent <= -15 ? 0.85 : 0.9;
      nutritionTarget = nearest(maintenance * factor, 50);
    } else if (goal === "gain") {
      nutritionTarget = nearest(maintenance * 1.1, 50);
    }

    if (nutritionTarget > 0 && nutritionTarget < 1200) {
      warnings.push(
        "Hasil di bawah 1.200 kkal/hari tidak diterapkan otomatis dan perlu review klinis.",
      );
      nutritionTarget = 0;
      goal = "medical_review";
      confidence = "low";
    }
  }

  return {
    clinical: {
      source: clean(profile.measurement_source) || "Data peserta",
      measured_at: dateKey(profile.measurement_date) || "",
      weight_kg: rounded(weight, 1),
      height_cm: rounded(height, 1),
      bmi,
      bmi_category: bmiCategory(bmi),
      age_years: age,
      gender,
      healthy_weight_min_kg: healthyMin,
      healthy_weight_max_kg: healthyMax,
    },
    nutrition: {
      formula: "Mifflin-St Jeor",
      goal,
      bmr_calories: bmr,
      activity_factor: activityFactor,
      maintenance_calories: maintenance,
      nutrition_target_calories: nutritionTarget,
      target_weight_kg: targetWeight,
      phase_target_weight_kg: phaseTargetWeight,
      requested_target_weight_kg: rounded(requestedTargetWeight, 1),
      goal_source: goalSource,
      target_bmi: requestedTargetBmi,
      calorie_adjustment_percent: calorieAdjustmentPercent,
      ready_to_apply: nutritionTarget > 0 && targetWeight > 0 && goal !== "medical_review",
      confidence,
      warnings,
    },
  };
}

