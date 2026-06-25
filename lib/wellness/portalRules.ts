// WELLNESS_PORTAL_USER_STRAVA_V347
// Isolated wellness portal rules. No MCU Corporate, CAPASKA, or Vaccination imports.

export type WellnessRiskLevel = "Rendah" | "Sedang" | "Tinggi";

export type WellnessPortalAccount = {
  id: string;
  name: string;
  employeeId: string;
  emailOrPhone: string;
  company: string;
  department: string;
  role: "peserta" | "ketua_kelompok" | "tim_medis" | "perusahaan";
  groupName: string;
  heightCm?: number;
  baselineWeightKg?: number;
  baselineWaistCm?: number;
  baselineSbp?: number;
  baselineDbp?: number;
  baselineHba1c?: number;
  baselineGlucose?: number;
  createdAt: string;
  stravaConnected?: boolean;
  stravaConnectedAt?: string;
};

export type WellnessMonitoringLog = {
  id: string;
  accountId: string;
  date: string;
  weightKg?: number;
  waistCm?: number;
  sbp?: number;
  dbp?: number;
  glucose?: number;
  hba1c?: number;
  activityMinutes?: number;
  steps?: number;
  mealNote?: string;
  symptoms?: string;
  medicationNote?: string;
  bpPhotoUrl?: string;
  labFileUrl?: string;
  source?: "manual" | "strava";
  createdAt: string;
};

export type WellnessRiskSummary = {
  level: WellnessRiskLevel;
  group: string;
  followUp: boolean;
  reasons: string[];
  compliance: "Lengkap" | "Kurang" | "Belum Ada";
};

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function calculateBmi(weightKg?: number, heightCm?: number): number | undefined {
  const weight = toNumber(weightKg);
  const height = toNumber(heightCm);
  if (!weight || !height || height <= 0) return undefined;
  const meter = height / 100;
  return Math.round((weight / (meter * meter)) * 10) / 10;
}

export function classifyWellnessPortalRisk(account: WellnessPortalAccount, latest?: Partial<WellnessMonitoringLog>): WellnessRiskSummary {
  const hba1c = toNumber(latest?.hba1c) ?? toNumber(account.baselineHba1c);
  const glucose = toNumber(latest?.glucose) ?? toNumber(account.baselineGlucose);
  const sbp = toNumber(latest?.sbp) ?? toNumber(account.baselineSbp);
  const dbp = toNumber(latest?.dbp) ?? toNumber(account.baselineDbp);
  const weight = toNumber(latest?.weightKg) ?? toNumber(account.baselineWeightKg);
  const bmi = calculateBmi(weight, account.heightCm);

  const reasons: string[] = [];
  const glucoseRisk = (hba1c !== undefined && hba1c > 6.4) || (glucose !== undefined && glucose >= 126);
  const obesityRisk = bmi !== undefined && bmi > 30;
  const hypertensionRisk = (sbp !== undefined && sbp > 150) || (dbp !== undefined && dbp > 100);

  if (glucoseRisk) reasons.push("Glucose/HbA1c risk");
  if (obesityRisk) reasons.push("Obesity/BMI risk");
  if (hypertensionRisk) reasons.push("Hypertension risk");

  let group = "Kelompok Monitoring Ringan";
  if (glucoseRisk && obesityRisk && hypertensionRisk) group = "Kelompok 1 - Triple Risk";
  else if (glucoseRisk && obesityRisk) group = "Kelompok 2 - Glucose + Obesity";
  else if (obesityRisk && hypertensionRisk) group = "Kelompok 3 - Obesity + Hypertension";
  else if (glucoseRisk) group = "Kelompok 4 - Glucose Dominant";
  else if (hypertensionRisk) group = "Kelompok 5 - Hypertension Dominant";

  const riskCount = [glucoseRisk, obesityRisk, hypertensionRisk].filter(Boolean).length;
  const level: WellnessRiskLevel = riskCount >= 2 ? "Tinggi" : riskCount === 1 ? "Sedang" : "Rendah";
  const followUp = riskCount >= 2 || hypertensionRisk || glucoseRisk;

  const hasMonitoring = Boolean(latest && Object.keys(latest).some((key) => !["id", "accountId", "date", "createdAt", "source"].includes(key)));
  const compliance = hasMonitoring ? "Lengkap" : "Belum Ada";

  return {
    level,
    group,
    followUp,
    reasons: reasons.length ? reasons : ["Belum ada red flag wellness dari data yang tersedia"],
    compliance,
  };
}
