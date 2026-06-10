export type FoodReference = {
  id?: number;
  food_name?: string;
  foodName?: string;
  name?: string;
  calories?: number | string | null;
  category?: string | null;
  aliases?: string | null;
  is_active?: number | boolean | string | null;
};

export type CalorieMatchResult = {
  totalCalories: number;
  detectedFoods: string[];
  normalizedText: string;
};

const IGNORE_WORDS = [
  "menu", "sehat", "sarapan", "makan", "rebusan", "cemilan",
  "minum", "ngirit", "berkuah", "hidangan", "umum", "masakan"
];

const TYPO_MAP: Record<string, string> = {
  "gado2": "gado gado",
  "gado-gado": "gado gado",
  "gado": "gado gado",
  "baso": "bakso",
  "baxo": "bakso",
  "bako": "bakso",
  "nasgor": "nasi goreng",
  "nasi goreng": "nasi goreng",
  "pecel lele": "lele",
  "lele goreng": "lele",
  "ayam pillet": "ayam filet",
  "ayam fillet": "ayam filet",
  "mie": "mi",
  "telor": "telur",
  "telo": "ubi",
  "tempeh": "tempe",
  "sayurr": "sayur",
  "habatusauda": "habbatussauda",
  "habbatus sauda": "habbatussauda",
  "pokcoy": "pokcay",
  "pakcoy": "pokcay",
  "pokchoy": "pokcay",
  "pakchoy": "pokcay",
  "tumispokcay": "tumis pokcay",
  "somay": "siomay",
  "somai": "siomay",
  "siomai": "siomay",
  "batagoor": "batagor",
  "bakwan sayur": "bakwan",
  "risol": "risoles"
};

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeFoodText(value: unknown) {
  let text = String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s,\/+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [wrong, correct] of Object.entries(TYPO_MAP)) {
    const re = new RegExp(`\\b${escapeRegExp(wrong)}\\b`, "gi");
    text = text.replace(re, correct);
  }

  return text.replace(/\s+/g, " ").trim();
}

function isActive(value: unknown) {
  return value === undefined || value === null || value === true || value === 1 || value === "1";
}

function referenceName(item: FoodReference) {
  return String(item.food_name || item.foodName || item.name || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aliasNames(item: FoodReference) {
  const aliases = String(item.aliases || "")
    .split(/[,;|]/)
    .map((part) => part.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return [referenceName(item), ...aliases].filter(Boolean);
}

export function matchCalories(input: unknown, references: FoodReference[]): CalorieMatchResult {
  let text = normalizeFoodText(input);
  const items = (references || [])
    .filter((item) => isActive(item.is_active))
    .map((item) => ({
      item,
      names: aliasNames(item).filter((name) => name.length >= 3 && !IGNORE_WORDS.some((word) => name.includes(word))),
      calories: Number(item.calories || 0) || 0,
    }))
    .filter((entry) => entry.names.length && entry.calories > 0)
    .sort((a, b) => Math.max(...b.names.map((n) => n.length)) - Math.max(...a.names.map((n) => n.length)));

  let total = 0;
  const detected: string[] = [];
  const matched = new Set<string>();

  for (const entry of items) {
    for (const name of entry.names) {
      if (matched.has(name)) continue;
      const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, "i");
      if (!pattern.test(text)) continue;

      total += entry.calories;
      detected.push(referenceName(entry.item));
      matched.add(name);
      text = text.replace(pattern, " ").replace(/\s+/g, " ");
      break;
    }
  }

  return {
    totalCalories: total > 0 ? Math.round(total * 10) / 10 : 0,
    detectedFoods: Array.from(new Set(detected)).filter(Boolean),
    normalizedText: normalizeFoodText(input),
  };
}
