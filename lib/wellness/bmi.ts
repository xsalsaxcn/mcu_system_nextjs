export function toNumber(value: unknown): number | null {
  const text = String(value ?? "").replace(",", ".");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateBmi(weightKg: unknown, heightCm: unknown): number | null {
  const weight = toNumber(weightKg);
  const height = toNumber(heightCm);
  if (!weight || !height || height <= 0) return null;
  const heightM = height / 100;
  return Math.round((weight / (heightM * heightM)) * 10) / 10;
}

export function interpretBmi(bmi: unknown) {
  const value = toNumber(bmi);
  if (value === null) return "";
  if (value < 18.5) return "Berat Badan Kurang";
  if (value < 25) return "Normal";
  if (value < 30) return "Berat Badan Berlebih";
  return "Obesitas";
}

export function weightDelta(currentWeight: unknown, initialWeight: unknown): number | null {
  const current = toNumber(currentWeight);
  const initial = toNumber(initialWeight);
  if (current === null || initial === null) return null;
  return Math.round((current - initial) * 10) / 10;
}
