// WELLNESS_COMPANY_ISOLATION_V126C_FINAL
// WELLNESS_CANONICAL_NUTRITION_HISTORY_V105
// WELLNESS_NUTRITION_GOOGLE_SHEET_ONLY_V126M3A
// One read path for Participant, Coach, Company, and Admin.
// Source aktif nutrisi: Google Sheet CSV saja.
// wellness_food_logs tidak lagi dibaca sebagai sumber history nutrisi.
// No database schema, migration, Google Apps Script, or point-rule changes.

export type CanonicalNutritionSourceSummary = {
  supabase_rows: number;
  google_sheet_ok: boolean;
  google_sheet_message: string;
  google_sheet_rows: number;
  unmatched_google_sheet_rows: number;
};

export type CanonicalNutritionParticipantHistory = {
  participant_id: number;
  logs: any[];
  sources: CanonicalNutritionSourceSummary;
};

export type CanonicalNutritionBulkHistory = {
  byParticipantId: Map<number, CanonicalNutritionParticipantHistory>;
  sources: CanonicalNutritionSourceSummary;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const raw = clean(value);
  if (!raw || raw === "-") return 0;

  const text = raw.replace(/[^0-9,.-]/g, "");
  let normalized = text;

  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text)) {
    normalized = text.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text)) {
    normalized = text.replace(/,/g, "");
  } else if (text.includes(",") && !text.includes(".")) {
    normalized = text.replace(",", ".");
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return "";
}

function firstPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const number = parseNumber(value);
    if (number > 0) return number;
  }
  return 0;
}

function parseRaw(value: any) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value !== "string") return {};

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function canonicalNutritionNormalizeText(value: unknown) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalNutritionDate(value: unknown) {
  return clean(value).slice(0, 10);
}

export function canonicalNutritionCalories(row: any) {
  return firstPositiveNumber(
    row?.calories,
    row?.total_calories,
    row?.total_calorie,
    row?.total_kcal,
    row?.estimated_calories,
    row?.raw_payload?.["Kalori Makanan"],
    row?.raw_payload?.calories,
    row?.raw_payload?.total_calories,
  );
}

export function canonicalNutritionMealSlot(row: any, index = 0) {
  const meal = canonicalNutritionNormalizeText(
    row?.meal_time || row?.meal_type || row?.meal_period || row?.waktu_makan,
  );
  return meal || `log:${clean(row?.id || row?.created_at || index)}`;
}

export function canonicalNutritionJakartaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((item) => item.type === "year")?.value || "";
  const month = parts.find((item) => item.type === "month")?.value || "";
  const day = parts.find((item) => item.type === "day")?.value || "";

  return year && month && day
    ? `${year}-${month}-${day}`
    : new Date().toISOString().slice(0, 10);
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (character === "," && !quoted) {
      row.push(current);
      current = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(current);
      if (row.some((cell) => clean(cell))) rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += character;
  }

  row.push(current);
  if (row.some((cell) => clean(cell))) rows.push(row);
  if (rows.length === 0) return [] as Array<Record<string, string>>;

  const headers = rows[0].map((header) => clean(header));
  return rows.slice(1).map((cells, index) => {
    const item: Record<string, string> = {
      __row_index: String(index + 2),
    };

    headers.forEach((header, headerIndex) => {
      item[header || `column_${headerIndex}`] = clean(cells[headerIndex]);
    });

    return item;
  });
}

function findColumn(row: Record<string, string>, keywords: string[]) {
  for (const [key, value] of Object.entries(row || {})) {
    const normalizedKey = canonicalNutritionNormalizeText(key);
    if (
      keywords.some((keyword) =>
        normalizedKey.includes(canonicalNutritionNormalizeText(keyword)),
      )
    ) {
      return value;
    }
  }
  return "";
}

function normalizeSheetDate(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";

  const iso = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];

  const numericDate = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (numericDate) {
    const first = Number(numericDate[1]);
    const second = Number(numericDate[2]);
    const year = numericDate[3];
    const month = first > 12 ? second : second > 12 ? first : second;
    const day = first > 12 ? first : second > 12 ? second : first;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(parsed);
    const year = parts.find((item) => item.type === "year")?.value || "";
    const month = parts.find((item) => item.type === "month")?.value || "";
    const day = parts.find((item) => item.type === "day")?.value || "";
    if (year && month && day) return `${year}-${month}-${day}`;
  }

  return raw.slice(0, 10);
}

function normalizeGoogleDriveImageUrl(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";

  const file = raw.match(/\/file\/d\/([^/]+)/i);
  if (file?.[1]) {
    return `https://drive.google.com/thumbnail?id=${file[1]}&sz=w600`;
  }

  const id = raw.match(/[?&]id=([^&]+)/i) || raw.match(/thumbnail\?id=([^&]+)/i);
  if (id?.[1]) {
    return `https://drive.google.com/thumbnail?id=${id[1]}&sz=w600`;
  }

  return raw;
}

function splitFoodText(value: string) {
  return clean(value)
    .replace(/\s+-\s*\d+(?:\.\d+)?\s*(?:porsi|portion)?/gi, "")
    .split(/,|;|\bdan\b|\+/i)
    .map((item) => clean(item))
    .filter(Boolean);
}

function buildFoodIndex(rows: any[]) {
  const result: Array<{
    name: string;
    normalized: string;
    calories: number;
  }> = [];

  for (const row of rows || []) {
    const calories = firstPositiveNumber(row?.calories, row?.calorie, row?.kcal);
    const aliases = Array.isArray(row?.aliases)
      ? row.aliases
      : clean(row?.aliases)
          .split(",")
          .map((item) => clean(item))
          .filter(Boolean);

    for (const name of [row?.food_name, row?.name, ...aliases]) {
      const normalized = canonicalNutritionNormalizeText(name);
      if (!normalized) continue;
      result.push({ name: clean(name), normalized, calories });
    }
  }

  return result;
}

function matchFoodCalories(foodText: string, foodIndex: ReturnType<typeof buildFoodIndex>) {
  const matched: any[] = [];
  const unmatched: string[] = [];
  const tokens = splitFoodText(foodText);
  let totalCalories = 0;

  for (const token of tokens) {
    const normalized = canonicalNutritionNormalizeText(token);
    if (!normalized) continue;

    const match =
      foodIndex.find((item) => item.normalized === normalized) ||
      foodIndex.find((item) => normalized.includes(item.normalized)) ||
      foodIndex.find((item) => item.normalized.includes(normalized));

    if (!match) {
      unmatched.push(token);
      continue;
    }

    totalCalories += match.calories;
    matched.push({
      input: token,
      matched_name: match.name,
      calories: match.calories,
    });
  }

  return {
    itemCount: Math.max(tokens.length, 1),
    totalCalories,
    matched,
    unmatched,
  };
}

function normalizeSupabaseFood(row: any) {
  const raw = parseRaw(row?.raw_payload);
  const original = raw?.original_payload || raw?.original || {};
  const detectedFoods = Array.isArray(row?.detected_foods)
    ? row.detected_foods.join(", ")
    : firstText(row?.detected_foods, raw?.detected_foods, original?.detected_foods);
  const foodName = firstText(
    row?.food_name,
    row?.meal_text,
    detectedFoods,
    raw?.food_name,
    raw?.foodName,
    raw?.meal_text,
    raw?.makanan,
    original?.food_name,
    original?.foodName,
    original?.meal_text,
    original?.makanan,
    "Food log",
  );
  const calories = firstPositiveNumber(
    row?.calories,
    row?.total_calories,
    row?.total_calorie,
    row?.total_kcal,
    row?.estimated_calories,
    raw?.calories,
    raw?.total_calories,
    raw?.total_calorie,
    raw?.total_kcal,
    raw?.estimated_calories,
    raw?.matched_calories,
    original?.calories,
    original?.total_calories,
    original?.total_kcal,
  );

  return {
    id: `supabase-${row?.id}`,
    original_id: row?.id,
    google_sheet_row_number: Number(
      row?.google_sheet_row_number ||
        raw?.google_sheet_row_number ||
        raw?._rowNumber ||
        0,
    ),
    participant_id: Number(row?.participant_id || 0),
    participant_code: clean(row?.participant_code || raw?.participant_code),
    log_date: firstText(
      row?.log_date,
      raw?.log_date,
      original?.log_date,
      row?.created_at,
    ).slice(0, 10),
    meal_time: firstText(
      row?.meal_time,
      row?.meal_type,
      raw?.meal_time,
      raw?.meal_type,
      "-",
    ),
    meal_type: firstText(
      row?.meal_type,
      row?.meal_time,
      raw?.meal_type,
      raw?.meal_time,
      "-",
    ),
    food_name: foodName,
    meal_text: foodName,
    detected_foods: detectedFoods,
    portion: firstText(row?.portion, raw?.portion, original?.portion, "-"),
    calories,
    total_calories: calories,
    item_count: Math.max(splitFoodText(foodName).length, 1),
    photo_url: normalizeGoogleDriveImageUrl(
      firstText(
        row?.photo_url,
        row?.google_drive_preview_url,
        row?.google_drive_url,
        row?.evidence_url,
        raw?.photo_url,
        raw?.photoUrl,
        raw?.evidence_url,
        raw?.image_url,
        original?.photo_url,
        original?.photoUrl,
      ),
    ),
    notes: firstText(row?.notes, raw?.notes, original?.notes),
    source: "supabase",
    source_detail: clean(row?.source) || "wellness_food_logs",
    created_at: row?.created_at,
    updated_at: row?.updated_at,
    raw_payload: row?.raw_payload,
  };
}

function rowLooksLikeNutrition(row: Record<string, string>) {
  const logType = canonicalNutritionNormalizeText(
    findColumn(row, ["log type", "jenis log"]),
  );

  if (logType && !/nutrition|nutrisi|food|meal/.test(logType)) return false;

  return Boolean(
    findColumn(row, ["waktu makan", "meal time", "meal type"]) ||
      findColumn(row, ["add options", "nama makanan", "makanan", "food"]),
  );
}

function normalizeSheetFood(
  row: Record<string, string>,
  participant: any,
  foodIndex: ReturnType<typeof buildFoodIndex>,
) {
  const participantId = Number(participant?.id || 0);
  // WELLNESS_CANONICAL_NUTRITION_LOG_DATE_V126M119_46A
  // Log Date is the operational achievement date; Submission Date is audit time only.
  const explicitLogDate = findColumn(row, [
    "log date",
    "log_date",
    "tanggal log",
    "tanggal aktivitas",
  ]);
  const submissionDate = findColumn(row, [
    "submission date",
    "timestamp",
    "tanggal",
    "waktu submit",
  ]);
  const mealTime = findColumn(row, [
    "waktu makan",
    "meal time",
    "meal_type",
    "meal type",
  ]);
  const mealText = findColumn(row, [
    "add options",
    "nama makanan",
    "makanan",
    "meal text",
    "food",
  ]);
  const directCalories = firstPositiveNumber(
    findColumn(row, [
      "kalori makanan",
      "total calories",
      "total calorie",
      "total kalori",
      "calories",
      "kkal",
    ]),
  );
  const matched = matchFoodCalories(mealText, foodIndex);
  const calories = directCalories > 0 ? directCalories : matched.totalCalories;
  const uploadPhoto = findColumn(row, [
    "upload foto makanan",
    "foto makanan",
    "photo",
    "image",
  ]);
  const previewPhoto = findColumn(row, ["preview foto makanan", "preview"]);

  return {
    id: `sheet-${participantId}-${row.__row_index}`,
    original_id: row.__row_index,
    google_sheet_row_number: Number(row.__row_index || 0),
    participant_id: participantId,
    participant_code: clean(participant?.code),
    log_date: normalizeSheetDate(explicitLogDate || submissionDate),
    meal_time: mealTime || "-",
    meal_type: mealTime || "-",
    food_name: mealText || "Food log",
    meal_text: mealText || "Food log",
    detected_foods: matched.matched
      .map((item) => item.matched_name)
      .join(", "),
    portion: "-",
    calories,
    total_calories: calories,
    item_count: matched.itemCount,
    photo_url: normalizeGoogleDriveImageUrl(previewPhoto || uploadPhoto),
    notes: findColumn(row, ["catatan nutrisi", "notes", "catatan"]),
    source: "google_sheet",
    source_detail: "Form Responses CSV",
    created_at: submissionDate,
    updated_at: submissionDate,
    matched_foods: matched.matched,
    unmatched_foods: matched.unmatched,
    raw_payload: row,
  };
}

function participantId(row: any) {
  return Number(row?.id || row?.participant_id || 0);
}

function participantName(row: any) {
  return firstText(row?.name, row?.employee_name, row?.full_name, row?.nama);
}

function participantCode(row: any) {
  return firstText(
    row?.code,
    row?.employee_code,
    row?.kode_karyawan,
    row?.no_karyawan,
    row?.nik,
  );
}

function participantCompanyIdV126C(
  row: any,
) {
  return parseNumber(
    row?.wellness_company_id ||
      row?.company_id ||
      0,
  );
}

function scopedCompanyCodeKeyV126C(
  companyId: number,
  code: string,
) {
  const normalizedCode =
    canonicalNutritionNormalizeText(
      code,
    );

  if (
    !(companyId > 0) ||
    !normalizedCode
  ) {
    return "";
  }

  return `${companyId}|${normalizedCode}`;
}

function buildParticipantIndexes(
  participants: any[],
) {
  const byId = new Map<
    number,
    any
  >();

  const byCompanyCodeV126C =
    new Map<string, any>();

  for (
    const participant
    of participants || []
  ) {
    const id =
      participantId(participant);

    const code =
      participantCode(participant);

    const companyId =
      participantCompanyIdV126C(
        participant,
      );

    if (id > 0) {
      byId.set(
        id,
        participant,
      );
    }

    const scopedKey =
      scopedCompanyCodeKeyV126C(
        companyId,
        code,
      );

    if (scopedKey) {
      byCompanyCodeV126C.set(
        scopedKey,
        participant,
      );
    }
  }

  return {
    byId,
    byCompanyCodeV126C,
  };
}

function matchSheetParticipant(
  row: Record<string, string>,
  _participants: any[],
  indexes:
    ReturnType<
      typeof buildParticipantIndexes
    >,
) {
  /*
   * Identitas Google Sheet:
   *
   * 1. Participant ID; atau
   * 2. Company ID + Kode Karyawan.
   *
   * Nama perusahaan, nama peserta,
   * atau kode global tidak boleh
   * digunakan sebagai fallback.
   */
  const explicitId = parseNumber(
    findColumn(
      row,
      [
        "participant id",
        "participant_id",
      ],
    ),
  );

  if (explicitId > 0) {
    return (
      indexes.byId.get(
        explicitId,
      ) || null
    );
  }

  const explicitCompanyId =
    parseNumber(
      findColumn(
        row,
        [
          "company id",
          "company_id",
          "wellness company id",
          "wellness_company_id",
        ],
      ),
    );

  const explicitCode =
    findColumn(
      row,
      [
        "kode karyawan",
        "employee code",
        "participant code",
        "kode peserta",
        "kode",
      ],
    );

  const scopedKey =
    scopedCompanyCodeKeyV126C(
      explicitCompanyId,
      explicitCode,
    );

  if (scopedKey) {
    return (
      indexes
        .byCompanyCodeV126C
        .get(scopedKey) ||
      null
    );
  }

  return null;
}

function logScore(row: any) {
  return (
    (row?.source === "google_sheet" ? 10 : 0) +
    (clean(row?.photo_url) ? 2 : 0) +
    (canonicalNutritionCalories(row) > 0 ? 1 : 0)
  );
}

function sortNewest(left: any, right: any) {
  const rightDate = firstText(
    right?.created_at,
    right?.updated_at,
    right?.log_date,
  );
  const leftDate = firstText(left?.created_at, left?.updated_at, left?.log_date);
  return rightDate.localeCompare(leftDate);
}

export function dedupeCanonicalNutritionLogs(rows: any[]) {
  const preferred = [...(rows || [])].sort((left, right) => logScore(right) - logScore(left));
  const seen = new Set<string>();
  const result: any[] = [];

  for (const row of preferred) {
    const sheetRowNumber = Number(row?.google_sheet_row_number || 0);
    const key = sheetRowNumber > 0
      ? [Number(row?.participant_id || 0), "sheet-row", sheetRowNumber].join("|")
      : [
          Number(row?.participant_id || 0),
          canonicalNutritionDate(row?.log_date || row?.created_at),
          canonicalNutritionNormalizeText(row?.meal_time || row?.meal_type),
          canonicalNutritionNormalizeText(row?.food_name || row?.meal_text),
        ].join("|");

    if (!clean(row?.log_date) || !clean(row?.food_name || row?.meal_text)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }

  return result.sort(sortNewest);
}

async function fetchSheetRows() {
  const url =
    process.env.GOOGLE_SHEET_NUTRITION_CSV_URL ||
    process.env.NEXT_PUBLIC_GOOGLE_SHEET_NUTRITION_CSV_URL ||
    "";

  if (!url) {
    return {
      ok: false,
      message: "GOOGLE_SHEET_NUTRITION_CSV_URL belum diset.",
      rows: [] as Array<Record<string, string>>,
    };
  }

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return {
        ok: false,
        message: `Gagal fetch Google Sheet CSV: ${response.status}`,
        rows: [] as Array<Record<string, string>>,
      };
    }

    const rows = parseCsv(await response.text());
    return {
      ok: true,
      message: `Google Sheet CSV loaded. Rows: ${rows.length}.`,
      rows,
    };
  } catch (error: any) {
    return {
      ok: false,
      message: error?.message || "Gagal memuat Google Sheet CSV.",
      rows: [] as Array<Record<string, string>>,
    };
  }
}


async function loadDbRows(
  _supabase: any,
  _participantIds: number[],
) {
  /*
   * WELLNESS_NUTRITION_GOOGLE_SHEET_ONLY_V126M3A
   *
   * Sengaja mengembalikan array kosong agar
   * wellness_food_logs tidak ikut masuk ke
   * canonical nutrition history.
   */
  return [];
}

async function loadFoodMaster(supabase: any) {
  const result = await supabase
    .from("wellness_food_calories")
    .select("*")
    .limit(5000);
  return result?.error ? [] : result?.data || [];
}

export async function loadCanonicalNutritionHistories(params: {
  supabase: any;
  participants: any[];
  dbRows?: any[];
  foodMasterRows?: any[];
}): Promise<CanonicalNutritionBulkHistory> {
  const participants = (params.participants || []).filter(
    (item) => participantId(item) > 0,
  );
  const participantIds = participants.map(participantId);
  const [dbRows, foodMasterRows, sheet] = await Promise.all([
    loadDbRows(
      params.supabase,
      participantIds,
    ),
    params.foodMasterRows
      ? Promise.resolve(params.foodMasterRows)
      : loadFoodMaster(params.supabase),
    fetchSheetRows(),
  ]);

  const indexes = buildParticipantIndexes(participants);
  const foodIndex = buildFoodIndex(foodMasterRows || []);
  const staged = new Map<number, any[]>();
  const dbCount = new Map<number, number>();
  const sheetCount = new Map<number, number>();

  for (const participant of participants) {
    staged.set(participantId(participant), []);
    dbCount.set(participantId(participant), 0);
    sheetCount.set(participantId(participant), 0);
  }

  for (const row of dbRows || []) {
    const id = Number(row?.participant_id || 0);
    if (!staged.has(id)) continue;
    staged.get(id)!.push(normalizeSupabaseFood(row));
    dbCount.set(id, (dbCount.get(id) || 0) + 1);
  }

  let unmatchedSheetRows = 0;
  for (const row of sheet.rows || []) {
    if (!rowLooksLikeNutrition(row)) continue;
    const participant = matchSheetParticipant(row, participants, indexes);
    if (!participant) {
      unmatchedSheetRows += 1;
      continue;
    }

    const id = participantId(participant);
    const normalized = normalizeSheetFood(row, participant, foodIndex);
    if (!normalized.log_date || !clean(normalized.food_name)) continue;
    staged.get(id)!.push(normalized);
    sheetCount.set(id, (sheetCount.get(id) || 0) + 1);
  }

  const byParticipantId = new Map<number, CanonicalNutritionParticipantHistory>();
  for (const participant of participants) {
    const id = participantId(participant);
    byParticipantId.set(id, {
      participant_id: id,
      logs: dedupeCanonicalNutritionLogs(staged.get(id) || []),
      sources: {
        supabase_rows: dbCount.get(id) || 0,
        google_sheet_ok: sheet.ok,
        google_sheet_message: sheet.message,
        google_sheet_rows: sheetCount.get(id) || 0,
        unmatched_google_sheet_rows: unmatchedSheetRows,
      },
    });
  }

  return {
    byParticipantId,
    sources: {
      supabase_rows: [...dbCount.values()].reduce((sum, value) => sum + value, 0),
      google_sheet_ok: sheet.ok,
      google_sheet_message: sheet.message,
      google_sheet_rows: [...sheetCount.values()].reduce((sum, value) => sum + value, 0),
      unmatched_google_sheet_rows: unmatchedSheetRows,
    },
  };
}

export async function loadCanonicalNutritionHistory(params: {
  supabase: any;
  participant: any;
  dbRows?: any[];
  foodMasterRows?: any[];
}): Promise<CanonicalNutritionParticipantHistory> {
  const id = participantId(params.participant);
  const bulk = await loadCanonicalNutritionHistories({
    supabase: params.supabase,
    participants: [params.participant],
    dbRows: params.dbRows,
    foodMasterRows: params.foodMasterRows,
  });

  return (
    bulk.byParticipantId.get(id) || {
      participant_id: id,
      logs: [],
      sources: bulk.sources,
    }
  );
}
