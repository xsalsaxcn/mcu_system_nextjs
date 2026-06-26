export type WellnessRiskInput = {
  hba1c?: number | null;
  glucose?: number | null;
  bmi?: number | null;
  sbp?: number | null;
  dbp?: number | null;
};

export type WellnessRiskResult = {
  level: "low" | "medium" | "high";
  label: string;
  group: string;
  flags: string[];
  needFollowup: boolean;
};

export const WELLNESS_FOCUS_ITEMS = [
  { title: "Baseline MCU", description: "Data MCU awal menjadi alasan peserta masuk program: HbA1c/gula darah, BMI/BB, lingkar perut, dan tekanan darah." },
  { title: "Monitoring Harian", description: "Nutrisi dan workout diisi harian oleh peserta untuk melihat kepatuhan dan perubahan perilaku." },
  { title: "Monitoring Berkala", description: "BB, BMI, lingkar perut, dan tekanan darah dipantau berkala sebagai indikator progress." },
  { title: "Mini MCU Nakes", description: "Nakes perusahaan mengisi follow-up klinis untuk membandingkan before-after program." },
] as const;

export const WELLNESS_GROUPS = [
  { name: "Grup A - Triple Risk", criteria: "Glucose + Obesity + Hypertension", focus: "Prioritas dokter okupasi, BP control, edukasi diabetes-range, weight loss intensif, recheck klinis berkala.", priority: "high" },
  { name: "Grup B - Glucose + Obesity", criteria: "HbA1c/gula tinggi + obesitas", focus: "Nutrition coaching intensif, defisit kalori aman, workout bertahap, recheck HbA1c/gula darah.", priority: "high" },
  { name: "Grup C - Glucose + Hypertension", criteria: "HbA1c/gula tinggi + tekanan darah tinggi", focus: "Kontrol tekanan darah, edukasi garam/gula sederhana, aktivitas fisik aman, follow-up nakes.", priority: "high" },
  { name: "Grup D - Obesity + Hypertension", criteria: "Obesitas + tekanan darah tinggi", focus: "Weight management, edukasi garam, monitoring BP, lingkar perut, dan aktivitas bertahap.", priority: "medium" },
  { name: "Grup E - PreHT/HT + Glucose Dominant", criteria: "Glucose risk dominan dengan tekanan darah mulai meningkat", focus: "Edukasi diabetes-range, pola makan, aktivitas fisik, BP log, dan validasi klinis bila menetap.", priority: "medium" },
  { name: "Grup F - Hypertension Dominant", criteria: "Tekanan darah dominan", focus: "Repeat BP, home/onsite BP log, edukasi garam/kafein/rokok, dan reminder pengukuran.", priority: "medium" },
  { name: "Grup G - Pre DM + Obesity Dominant", criteria: "Pre-DM + obesitas", focus: "Pencegahan progresi diabetes dengan weight loss, nutrisi, aktivitas, dan recheck metabolik.", priority: "medium" },
] as const;

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function classifyWellnessRisk(input: WellnessRiskInput): WellnessRiskResult {
  // WELLNESS_SETTINGS_PARAMETER_V350_RISK_RULES
  const hba1c = toNumber(input.hba1c);
  const glucose = toNumber(input.glucose);
  const bmi = toNumber(input.bmi);
  const sbp = toNumber(input.sbp);
  const dbp = toNumber(input.dbp);

  const flags: string[] = [];
  const hasDiabetesRange = (hba1c !== null && hba1c > 6.4) || (glucose !== null && glucose >= 126);
  const hasPreGlucose = !hasDiabetesRange && ((hba1c !== null && hba1c >= 5.7) || (glucose !== null && glucose >= 100));
  const hasObesity = bmi !== null && bmi >= 30;
  const hasHypertension = (sbp !== null && sbp > 150) || (dbp !== null && dbp > 100);
  const hasBpElevation = !hasHypertension && ((sbp !== null && sbp >= 130) || (dbp !== null && dbp >= 80));

  if (hasDiabetesRange) flags.push("glucose");
  if (hasPreGlucose) flags.push("pre_glucose");
  if (hasObesity) flags.push("obesity");
  if (hasHypertension) flags.push("hypertension");
  if (hasBpElevation) flags.push("bp_elevation");

  if (hasDiabetesRange && hasObesity && hasHypertension) {
    return { level: "high", label: "Triple Risk", group: "Grup A - Triple Risk", flags, needFollowup: true };
  }
  if (hasDiabetesRange && hasObesity) {
    return { level: "high", label: "Glucose + Obesity", group: "Grup B - Glucose + Obesity", flags, needFollowup: true };
  }
  if (hasDiabetesRange && hasHypertension) {
    return { level: "high", label: "Glucose + Hypertension", group: "Grup C - Glucose + Hypertension", flags, needFollowup: true };
  }
  if (hasObesity && hasHypertension) {
    return { level: "medium", label: "Obesity + Hypertension", group: "Grup D - Obesity + Hypertension", flags, needFollowup: true };
  }
  if ((hasDiabetesRange || hasPreGlucose) && hasBpElevation) {
    return { level: "medium", label: "Glucose Dominant", group: "Grup E - PreHT/HT + Glucose Dominant", flags, needFollowup: true };
  }
  if (hasHypertension || hasBpElevation) {
    return { level: "medium", label: "Hypertension Dominant", group: "Grup F - Hypertension Dominant", flags, needFollowup: true };
  }
  if (hasPreGlucose && hasObesity) {
    return { level: "medium", label: "Pre-DM + Obesity", group: "Grup G - Pre DM + Obesity Dominant", flags, needFollowup: true };
  }
  if (hasDiabetesRange || hasPreGlucose || hasObesity) {
    return { level: "medium", label: "Metabolic Monitoring", group: "Wellness Monitoring", flags, needFollowup: true };
  }
  return { level: "low", label: "Monitoring", group: "Wellness Monitoring", flags, needFollowup: false };
}

export function complianceStatus(latestDate?: string | null): "Baik" | "Kurang" | "Tidak aktif" | "Drop risk" {
  if (!latestDate) return "Tidak aktif";
  const then = new Date(latestDate).getTime();
  const now = Date.now();
  if (!Number.isFinite(then)) return "Tidak aktif";
  const diffDays = Math.floor((now - then) / 86400000);
  if (diffDays <= 2) return "Baik";
  if (diffDays <= 6) return "Kurang";
  if (diffDays <= 14) return "Tidak aktif";
  return "Drop risk";
}
