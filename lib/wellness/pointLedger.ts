// WELLNESS_POINT_LEDGER_SOURCE_OF_TRUTH_V79G
// wellness_point_logs is the canonical ledger when a category has ledger rows.
// Calculated values are used only as a fallback for older/direct-import data
// that has no point ledger rows for that category.

export type WellnessPointBreakdown = {
  nutrition: number;
  workout: number;
  healthtalk: number;
  other: number;
  total: number;
  source: "wellness_point_logs" | "ledger_with_fallback" | "calculated_fallback";
  ledger_row_count: number;
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function wellnessPointCategory(row: any) {
  const text = [row?.source_type, row?.point_key, row?.description]
    .map(clean)
    .join(" ")
    .toLowerCase();

  if (/health.?talk|seminar/.test(text)) return "healthtalk" as const;
  if (/activity|workout|exercise|step/.test(text)) return "workout" as const;
  if (/food|nutrition|nutrisi|meal/.test(text)) return "nutrition" as const;
  return "other" as const;
}

export function resolveWellnessPointBreakdown(params: {
  ledgerRows?: any[];
  calculated?: Partial<Record<"nutrition" | "workout" | "healthtalk" | "other", number>>;
}): WellnessPointBreakdown {
  const rows = (params.ledgerRows || []).filter(
    (row: any) => numberValue(row?.points) !== 0,
  );
  const calculated = params.calculated || {};
  const sums = { nutrition: 0, workout: 0, healthtalk: 0, other: 0 };
  const counts = { nutrition: 0, workout: 0, healthtalk: 0, other: 0 };

  for (const row of rows) {
    const category = wellnessPointCategory(row);
    sums[category] += numberValue(row.points);
    counts[category] += 1;
  }

  const categories = ["nutrition", "workout", "healthtalk", "other"] as const;
  const resolved = { nutrition: 0, workout: 0, healthtalk: 0, other: 0 };
  let fallbackCount = 0;

  for (const category of categories) {
    if (counts[category] > 0) {
      resolved[category] = sums[category];
    } else {
      resolved[category] = numberValue(calculated[category]);
      if (resolved[category] !== 0) fallbackCount += 1;
    }
  }

  const total =
    resolved.nutrition +
    resolved.workout +
    resolved.healthtalk +
    resolved.other;

  return {
    ...resolved,
    total,
    source:
      rows.length === 0
        ? "calculated_fallback"
        : fallbackCount > 0
          ? "ledger_with_fallback"
          : "wellness_point_logs",
    ledger_row_count: rows.length,
  };
}
