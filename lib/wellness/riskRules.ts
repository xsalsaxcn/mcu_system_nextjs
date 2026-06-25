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
  { title: "HbA1c / Gula Darah", description: "Pantau risiko pre-diabetes, diabetes-range, dan kebutuhan recheck HbA1c 3 bulan." },
  { title: "BMI / Obesitas", description: "Pantau berat badan, BMI, lingkar perut, dan target penurunan berat badan." },
  { title: "Tekanan Darah", description: "Catat tekanan darah sistolik/diastolik dan alert bila tetap tinggi." },
  { title: "Aktivitas dan Kepatuhan", description: "Pantau upload rutin, aktivitas fisik, edukasi, challenge, dan follow-up." },
] as const;

export const WELLNESS_GROUPS = [
  { name: "Kelompok 1", criteria: "Triple Risk / Glucose + Hypertension", focus: "Dokter okupasi, edukasi diabetes-range, BP control, weight loss intensif, recheck HbA1c 3 bulan.", priority: "high" },
  { name: "Kelompok 2", criteria: "Glucose + Obesity / Pre-DM + Obesity", focus: "Nutrition coaching, activity plan, monitoring berat badan dan lingkar perut, recheck HbA1c.", priority: "high" },
  { name: "Kelompok 3", criteria: "Obesity + Hypertension", focus: "BP control, weight management, edukasi garam, aktivitas fisik bertahap.", priority: "medium" },
  { name: "Kelompok 4", criteria: "Glucose Dominant", focus: "Edukasi diabetes-range, pola makan, aktivitas fisik, recheck HbA1c, validasi dokter bila tetap tinggi.", priority: "medium" },
  { name: "Kelompok 5", criteria: "Hypertension Dominant", focus: "Repeat BP, home/onsite BP log, edukasi garam/kafein/rokok, reminder pengukuran.", priority: "medium" },
] as const;

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function classifyWellnessRisk(input: WellnessRiskInput): WellnessRiskResult {
  const hba1c = toNumber(input.hba1c);
  const glucose = toNumber(input.glucose);
  const bmi = toNumber(input.bmi);
  const sbp = toNumber(input.sbp);
  const dbp = toNumber(input.dbp);

  const flags: string[] = [];
  if ((hba1c !== null && hba1c > 6.4) || (glucose !== null && glucose >= 126)) flags.push("glucose");
  if (bmi !== null && bmi > 30) flags.push("obesity");
  if ((sbp !== null && sbp > 150) || (dbp !== null && dbp > 100)) flags.push("hypertension");

  const hasGlucose = flags.includes("glucose");
  const hasObesity = flags.includes("obesity");
  const hasHypertension = flags.includes("hypertension");

  if (flags.length >= 3 || (hasGlucose && hasHypertension)) {
    return { level: "high", label: "High Risk", group: "Kelompok 1", flags, needFollowup: true };
  }
  if (hasGlucose && hasObesity) {
    return { level: "high", label: "Metabolic Risk", group: "Kelompok 2", flags, needFollowup: true };
  }
  if (hasObesity && hasHypertension) {
    return { level: "medium", label: "Obesity + Hypertension", group: "Kelompok 3", flags, needFollowup: true };
  }
  if (hasGlucose) {
    return { level: "medium", label: "Glucose Dominant", group: "Kelompok 4", flags, needFollowup: true };
  }
  if (hasHypertension) {
    return { level: "medium", label: "Hypertension Dominant", group: "Kelompok 5", flags, needFollowup: true };
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
