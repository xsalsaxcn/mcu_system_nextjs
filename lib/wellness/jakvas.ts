// WELLNESS_JAKVAS_REPORT_V1
// Pure Jakarta Cardiovascular Score (JAKVAS) calculator.
// IMPORTANT: This module is isolated from Wellness streak, point, target,
// Google Fit, Health Connect, and participant-control rules.

export type JakvasSmokingStatus = "never" | "former" | "current";
export type JakvasActivityCategory = "heavy" | "moderate" | "light" | "none";
export type JakvasRiskCategory = "low" | "moderate" | "high";

export type JakvasInput = {
  gender?: any;
  age_years?: any;
  systolic?: any;
  diastolic?: any;
  bmi?: any;
  smoking_status?: JakvasSmokingStatus | null;
  diabetes_status?: boolean | null;
  prior_cvd?: boolean | null;
  physical_activity_category?: JakvasActivityCategory | null;
};

export type JakvasComponent = {
  key: string;
  label: string;
  value: string;
  points: number | null;
  available: boolean;
  note?: string;
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberOrNull(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeJakvasGender(value: any): "male" | "female" | null {
  const text = clean(value).toLowerCase();
  if (!text) return null;
  if (["m", "male", "l", "laki", "laki-laki", "pria"].includes(text)) return "male";
  if (["f", "female", "p", "perempuan", "wanita"].includes(text)) return "female";
  if (/^laki/.test(text) || /^pria/.test(text)) return "male";
  if (/^perempuan/.test(text) || /^wanita/.test(text)) return "female";
  return null;
}

export function jakvasGenderPoints(value: any): number | null {
  const gender = normalizeJakvasGender(value);
  if (gender === "female") return 0;
  if (gender === "male") return 1;
  return null;
}

export function jakvasAgePoints(value: any): number | null {
  const age = numberOrNull(value);
  if (age === null || age < 25 || age > 64) return null;
  if (age <= 34) return -4;
  if (age <= 39) return -3;
  if (age <= 44) return -2;
  if (age <= 49) return 0;
  if (age <= 54) return 1;
  if (age <= 59) return 2;
  return 3;
}

function systolicBand(value: number) {
  if (value < 130) return 0;
  if (value < 140) return 1;
  if (value < 160) return 2;
  if (value < 180) return 3;
  return 4;
}

function diastolicBand(value: number) {
  if (value < 85) return 0;
  if (value < 90) return 1;
  if (value < 100) return 2;
  if (value < 110) return 3;
  return 4;
}

export function jakvasBloodPressurePoints(systolicValue: any, diastolicValue: any): number | null {
  const systolic = numberOrNull(systolicValue);
  const diastolic = numberOrNull(diastolicValue);
  if (systolic === null || diastolic === null) return null;
  // For discordant SBP/DBP, use the higher JAKVAS pressure band.
  return Math.max(systolicBand(systolic), diastolicBand(diastolic));
}

export function jakvasBmiPoints(value: any): { points: number | null; warning?: string } {
  const bmi = numberOrNull(value);
  if (bmi === null || bmi <= 0) return { points: null };
  if (bmi < 13.79) {
    return {
      points: 0,
      warning: "BMI di bawah rentang referensi tabel (13,79); dipetakan ke kategori poin terendah.",
    };
  }
  if (bmi <= 25.99) return { points: 0 };
  if (bmi <= 29.99) return { points: 1 };
  if (bmi <= 35.58) return { points: 2 };
  return {
    points: 2,
    warning: "BMI di atas rentang referensi tabel (35,58); dipetakan ke kategori poin tertinggi.",
  };
}

export function jakvasSmokingPoints(value: JakvasSmokingStatus | null | undefined): number | null {
  if (value === "never") return 0;
  if (value === "former") return 3;
  if (value === "current") return 4;
  return null;
}

export function jakvasDiabetesPoints(value: boolean | null | undefined): number | null {
  if (value === true) return 2;
  if (value === false) return 0;
  return null;
}

export function jakvasActivityPoints(value: JakvasActivityCategory | null | undefined): number | null {
  if (value === "heavy") return -3;
  if (value === "moderate") return 0;
  if (value === "light") return 1;
  if (value === "none") return 2;
  return null;
}

function component(key: string, label: string, value: string, points: number | null, note?: string): JakvasComponent {
  return {
    key,
    label,
    value: value || "Belum tersedia",
    points,
    available: points !== null,
    ...(note ? { note } : {}),
  };
}

function smokingLabel(value: JakvasSmokingStatus | null | undefined) {
  if (value === "never") return "Tidak merokok";
  if (value === "former") return "Bekas perokok";
  if (value === "current") return "Perokok aktif";
  return "Belum tersedia";
}

function activityLabel(value: JakvasActivityCategory | null | undefined) {
  if (value === "heavy") return "Berat (>3x/minggu, ≥30 menit/hari)";
  if (value === "moderate") return "Sedang (2–3x/minggu, ≥30 menit/hari)";
  if (value === "light") return "Ringan (1x/minggu, ≥30 menit/hari)";
  if (value === "none") return "Tidak ada";
  return "Belum tersedia";
}

export function calculateJakvas(input: JakvasInput) {
  const gender = normalizeJakvasGender(input.gender);
  const age = numberOrNull(input.age_years);
  const systolic = numberOrNull(input.systolic);
  const diastolic = numberOrNull(input.diastolic);
  const bmi = numberOrNull(input.bmi);
  const bmiResult = jakvasBmiPoints(bmi);

  const components: JakvasComponent[] = [
    component(
      "gender",
      "Jenis Kelamin",
      gender === "male" ? "Laki-laki" : gender === "female" ? "Perempuan" : "Belum tersedia",
      jakvasGenderPoints(gender),
    ),
    component(
      "age",
      "Umur",
      age !== null ? `${Math.floor(age)} tahun` : "Belum tersedia",
      jakvasAgePoints(age),
      age !== null && (age < 25 || age > 64) ? "JAKVAS ditujukan untuk usia 25–64 tahun." : undefined,
    ),
    component(
      "blood_pressure",
      "Tekanan Darah",
      systolic !== null && diastolic !== null ? `${Math.round(systolic)}/${Math.round(diastolic)} mmHg` : "Belum tersedia",
      jakvasBloodPressurePoints(systolic, diastolic),
      "Jika kategori sistolik dan diastolik berbeda, digunakan kategori poin yang lebih tinggi.",
    ),
    component(
      "bmi",
      "BMI / IMT",
      bmi !== null ? bmi.toFixed(1).replace(".", ",") : "Belum tersedia",
      bmiResult.points,
      bmiResult.warning,
    ),
    component(
      "smoking",
      "Kebiasaan Merokok",
      smokingLabel(input.smoking_status),
      jakvasSmokingPoints(input.smoking_status),
    ),
    component(
      "diabetes",
      "Diabetes Melitus",
      input.diabetes_status === true ? "Ya" : input.diabetes_status === false ? "Tidak" : "Belum tersedia",
      jakvasDiabetesPoints(input.diabetes_status),
    ),
    component(
      "physical_activity",
      "Aktivitas Fisik Mingguan",
      activityLabel(input.physical_activity_category),
      jakvasActivityPoints(input.physical_activity_category),
    ),
  ];

  const missingFields = components
    .filter((item) => item.points === null)
    .map((item) => item.key);

  if (input.prior_cvd === null || input.prior_cvd === undefined) {
    missingFields.push("prior_cvd");
  }

  const ageEligible = age !== null && age >= 25 && age <= 64;
  const priorCvdKnown = input.prior_cvd === true || input.prior_cvd === false;
  const eligible = ageEligible && priorCvdKnown && input.prior_cvd === false;
  const complete = eligible && missingFields.length === 0;

  const totalScore = complete
    ? components.reduce((sum, item) => sum + Number(item.points || 0), 0)
    : null;

  let riskCategory: JakvasRiskCategory | null = null;
  let riskLabel = "Belum dapat dihitung";
  let risk10y = "-";
  let recommendation = "Lengkapi data JAKVAS terlebih dahulu.";

  if (totalScore !== null) {
    if (totalScore <= 1) {
      riskCategory = "low";
      riskLabel = "Risiko Rendah";
      risk10y = "< 10%";
      recommendation = "Pertahankan pola hidup sehat dan faktor risiko yang sudah terkontrol.";
    } else if (totalScore <= 4) {
      riskCategory = "moderate";
      riskLabel = "Risiko Sedang";
      risk10y = "10–20%";
      recommendation = "Perbaiki gaya hidup dan lakukan pemantauan faktor risiko secara berkala.";
    } else {
      riskCategory = "high";
      riskLabel = "Risiko Tinggi";
      risk10y = "> 20%";
      recommendation = "Konsultasi dengan dokter untuk evaluasi faktor risiko kardiovaskular.";
    }
  } else if (input.prior_cvd === true) {
    riskLabel = "Tidak memenuhi kriteria JAKVAS";
    recommendation = "JAKVAS ini ditujukan untuk individu yang belum pernah menderita penyakit kardiovaskular.";
  } else if (age !== null && !ageEligible) {
    riskLabel = "Di luar rentang usia JAKVAS";
    recommendation = "JAKVAS ini ditujukan untuk usia 25–64 tahun.";
  }

  return {
    engine_key: "jakvas:user-rule-v1",
    eligible,
    complete,
    total_score: totalScore,
    risk_category: riskCategory,
    risk_label: riskLabel,
    risk_10y_label: risk10y,
    recommendation,
    missing_fields: [...new Set(missingFields)],
    prior_cvd: input.prior_cvd ?? null,
    components,
    reference_notes: components.map((item) => item.note).filter(Boolean),
  };
}
