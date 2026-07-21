$ErrorActionPreference = "Stop"

$project = "C:\Users\Lenovo\Documents\mcu_system_nextjs"
$apiDir = Join-Path $project "app\api\wellness\portal\nutrition-direct"
$apiPath = Join-Path $apiDir "route.ts"

Write-Host "PATCH NUTRITION DIRECT ACCURACY V30B"
Write-Host "Patch ini hanya memperbaiki pembacaan Google Sheet, total kalori, jumlah item, dan URL foto."
Write-Host "Tidak mengubah input, Google Sheet, database table, Google Fit, atau Health Connect."

New-Item -ItemType Directory -Force -Path $apiDir | Out-Null

$api = @'
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) {
    throw new Error("Supabase admin env is missing.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function asNumber(value: unknown) {
  const n = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(value: unknown) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRaw(value: any) {
  if (!value) return {};

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  if (typeof value === "object") return value;

  return {};
}

function firstText(...values: any[]) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }

  return "";
}

function firstNumber(...values: any[]) {
  for (const value of values) {
    const n = asNumber(value);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return 0;
}

function jakartaDate() {
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
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(current);

      if (row.some((cell) => clean(cell))) rows.push(row);

      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((cell) => clean(cell))) rows.push(row);

  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => clean(header));

  return rows.slice(1).map((cells, index) => {
    const item: Record<string, string> = { __row_index: String(index + 2) };

    headers.forEach((header, headerIndex) => {
      item[header || `column_${headerIndex}`] = clean(cells[headerIndex]);
    });

    return item;
  });
}

function findColumn(row: Record<string, string>, keywords: string[]) {
  const keys = Object.keys(row);

  for (const key of keys) {
    const normalizedKey = normalizeText(key);

    if (keywords.some((keyword) => normalizedKey.includes(normalizeText(keyword)))) {
      return row[key];
    }
  }

  return "";
}

function normalizeSheetDate(value: unknown) {
  const raw = clean(value);

  if (!raw) return "";

  const isoMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[0];

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

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

  const fileMatch = raw.match(/\/file\/d\/([^/]+)/i);
  if (fileMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w600`;
  }

  const idMatch =
    raw.match(/[?&]id=([^&]+)/i) ||
    raw.match(/thumbnail\?id=([^&]+)/i);

  if (idMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w600`;
  }

  return raw;
}

function extractExplicitCaloriesFromSheetRow(row: Record<string, string>) {
  const combined = Object.values(row || {}).join(" ");

  const totalMatch =
    combined.match(/total\s+([0-9.,]+)\s*(?:kalori|kkal|calories|calorie)/i) ||
    combined.match(/([0-9.,]+)\s*(?:kalori|kkal)\s*[\-–—•]*\s*breakdown/i);

  if (!totalMatch) return 0;

  return asNumber(totalMatch[1]);
}

function splitFoodText(value: string) {
  return clean(value)
    .replace(/\s+-\s*\d+(\.\d+)?\s*(porsi|portion)?/gi, "")
    .split(/,|;|\bdan\b|\+/i)
    .map((item) => clean(item))
    .filter(Boolean);
}

function buildFoodIndex(masterFoods: any[]) {
  const items: Array<{
    name: string;
    normalized: string;
    calories: number;
    raw: any;
  }> = [];

  for (const food of masterFoods || []) {
    const calories = asNumber(food.calories || food.calorie || food.kcal);
    const names = [
      food.food_name,
      food.name,
      ...(Array.isArray(food.aliases)
        ? food.aliases
        : clean(food.aliases)
            .split(",")
            .map((item) => clean(item))),
    ].filter(Boolean);

    for (const name of names) {
      const normalized = normalizeText(name);

      if (normalized) {
        items.push({
          name: clean(name),
          normalized,
          calories,
          raw: food,
        });
      }
    }
  }

  return items;
}

function matchFoodCalories(foodText: string, foodIndex: ReturnType<typeof buildFoodIndex>) {
  const tokens = splitFoodText(foodText);
  const matched: any[] = [];
  const unmatched: string[] = [];
  let totalCalories = 0;

  for (const token of tokens) {
    const normalizedToken = normalizeText(token);

    if (!normalizedToken) continue;

    const match =
      foodIndex.find((food) => food.normalized === normalizedToken) ||
      foodIndex.find((food) => normalizedToken.includes(food.normalized)) ||
      foodIndex.find((food) => food.normalized.includes(normalizedToken));

    if (match) {
      totalCalories += asNumber(match.calories);
      matched.push({
        input: token,
        matched_name: match.name,
        calories: asNumber(match.calories),
      });
    } else {
      unmatched.push(token);
    }
  }

  return {
    itemCount: tokens.length,
    totalCalories,
    matched,
    unmatched,
  };
}

function normalizeSupabaseFood(row: any) {
  const raw = parseRaw(row.raw_payload);
  const original = raw.original_payload || raw.original || {};

  const detectedFoods = Array.isArray(row.detected_foods)
    ? row.detected_foods.join(", ")
    : firstText(row.detected_foods, raw.detected_foods, original.detected_foods);

  const foodName = firstText(
    row.food_name,
    row.meal_text,
    detectedFoods,
    raw.food_name,
    raw.foodName,
    raw.meal_text,
    raw.makanan,
    original.food_name,
    original.foodName,
    original.meal_text,
    original.makanan,
    "Food log"
  );

  const calories = firstNumber(
    row.calories,
    row.total_calories,
    row.total_calorie,
    row.total_kcal,
    row.estimated_calories,
    raw.calories,
    raw.total_calories,
    raw.total_calorie,
    raw.total_kcal,
    raw.estimated_calories,
    raw.matched_calories,
    original.calories,
    original.total_calories,
    original.total_kcal
  );

  const tokens = splitFoodText(foodName);

  return {
    id: `supabase-${row.id}`,
    original_id: row.id,
    participant_id: row.participant_id,
    log_date: firstText(row.log_date, raw.log_date, original.log_date, row.created_at).slice(0, 10),
    meal_time: firstText(row.meal_time, row.meal_type, raw.meal_time, raw.meal_type, "-"),
    meal_type: firstText(row.meal_type, row.meal_time, raw.meal_type, raw.meal_time, "-"),
    food_name: foodName,
    meal_text: foodName,
    detected_foods: detectedFoods,
    portion: firstText(row.portion, raw.portion, original.portion, "-"),
    calories,
    total_calories: calories,
    item_count: Math.max(tokens.length, 1),
    photo_url: normalizeGoogleDriveImageUrl(
      firstText(
        row.photo_url,
        row.evidence_url,
        raw.photo_url,
        raw.photoUrl,
        raw.evidence_url,
        raw.image_url,
        original.photo_url,
        original.photoUrl
      )
    ),
    source: "supabase",
    created_at: row.created_at,
    updated_at: row.updated_at,
    raw_payload: row.raw_payload,
  };
}

function normalizeSheetFood(
  row: Record<string, string>,
  participantId: number,
  foodIndex: ReturnType<typeof buildFoodIndex>
) {
  const submissionDate = findColumn(row, [
    "submission date",
    "timestamp",
    "tanggal",
    "waktu submit",
  ]);

  const selectedName = findColumn(row, [
    "pilih nama anda",
    "pilih nama",
    "nama anda",
  ]);

  const participantName = findColumn(row, [
    "nama peserta",
    "participant",
    "peserta",
  ]);

  const mealTime = findColumn(row, [
    "waktu makan",
    "meal time",
    "meal_type",
    "meal type",
  ]);

  const mealText = findColumn(row, [
    "add options",
    "makanan",
    "meal text",
    "food",
    "nama makanan",
  ]);

  const uploadPhoto = findColumn(row, [
    "upload foto makanan",
    "foto makanan",
    "photo",
    "image",
  ]);

  const previewPhoto = findColumn(row, [
    "preview foto makanan",
    "preview",
  ]);

  const explicitCalories = extractExplicitCaloriesFromSheetRow(row);
  const matchedResult = matchFoodCalories(mealText, foodIndex);
  const finalCalories =
    explicitCalories > 0 ? explicitCalories : matchedResult.totalCalories;

  const logDate = normalizeSheetDate(submissionDate);

  return {
    id: `sheet-${participantId}-${row.__row_index}`,
    original_id: row.__row_index,
    participant_id: participantId,
    log_date: logDate,
    meal_time: mealTime || "-",
    meal_type: mealTime || "-",
    food_name: mealText || "Food log",
    meal_text: mealText || "Food log",
    detected_foods: matchedResult.matched.map((item) => item.matched_name).join(", "),
    portion: "-",
    calories: finalCalories,
    total_calories: finalCalories,
    item_count: Math.max(matchedResult.itemCount, 1),
    photo_url: normalizeGoogleDriveImageUrl(previewPhoto || uploadPhoto || ""),
    source: "google_sheet",
    selected_name: selectedName,
    participant_name: participantName,
    created_at: submissionDate,
    updated_at: submissionDate,
    matched_foods: matchedResult.matched,
    unmatched_foods: matchedResult.unmatched,
    raw_payload: row,
  };
}

function rowBelongsToParticipant(row: Record<string, string>, participant: any) {
  const name = normalizeText(participant?.name);
  const code = normalizeText(participant?.code);

  const rowName = normalizeText(
    [
      findColumn(row, ["nama peserta", "participant", "peserta"]),
      findColumn(row, ["pilih nama anda", "pilih nama", "nama anda"]),
    ].join(" ")
  );

  if (name && rowName.includes(name)) return true;
  if (code && rowName.includes(code)) return true;

  return false;
}

function sortNewest(a: any, b: any) {
  const bDate = clean(b.created_at || b.updated_at || b.log_date);
  const aDate = clean(a.created_at || a.updated_at || a.log_date);

  return bDate.localeCompare(aDate);
}

function dedupeLogs(logs: any[]) {
  const sorted = [...logs].sort((a, b) => {
    const scoreA =
      (a.source === "google_sheet" ? 10 : 0) +
      (a.photo_url ? 2 : 0) +
      (asNumber(a.calories) > 0 ? 1 : 0);

    const scoreB =
      (b.source === "google_sheet" ? 10 : 0) +
      (b.photo_url ? 2 : 0) +
      (asNumber(b.calories) > 0 ? 1 : 0);

    return scoreB - scoreA;
  });

  const seen = new Set<string>();
  const result: any[] = [];

  for (const log of sorted) {
    const key = [
      log.log_date,
      normalizeText(log.meal_time),
      normalizeText(log.food_name),
    ].join("|");

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(log);
  }

  return result.sort(sortNewest);
}

async function loadSheetLogs(
  participantId: number,
  participant: any,
  foodIndex: ReturnType<typeof buildFoodIndex>
) {
  const csvUrl =
    process.env.GOOGLE_SHEET_NUTRITION_CSV_URL ||
    process.env.NEXT_PUBLIC_GOOGLE_SHEET_NUTRITION_CSV_URL ||
    "";

  if (!csvUrl) {
    return {
      ok: false,
      message: "GOOGLE_SHEET_NUTRITION_CSV_URL belum diset.",
      logs: [],
    };
  }

  const response = await fetch(csvUrl, {
    cache: "no-store",
  });

  if (!response.ok) {
    return {
      ok: false,
      message: `Gagal fetch Google Sheet CSV: ${response.status}`,
      logs: [],
    };
  }

  const csvText = await response.text();
  const rows = parseCsv(csvText);

  const logs = rows
    .filter((row) => rowBelongsToParticipant(row, participant))
    .map((row) => normalizeSheetFood(row, participantId, foodIndex))
    .filter((row) => clean(row.food_name) && clean(row.log_date));

  return {
    ok: true,
    message: `Google Sheet loaded. Rows matched: ${logs.length}.`,
    logs,
  };
}

export async function GET(request: NextRequest) {
  try {
    const participantId = asNumber(request.nextUrl.searchParams.get("participant_id"));

    if (!participantId) {
      return NextResponse.json(
        { ok: false, message: "participant_id wajib diisi." },
        { status: 400 }
      );
    }

    const today = jakartaDate();
    const supabase = adminClient();

    const { data: participant } = await supabase
      .from("wellness_participants")
      .select("*")
      .eq("id", participantId)
      .maybeSingle();

    const { data: foodMaster } = await supabase
      .from("wellness_food_calories")
      .select("*")
      .limit(2000);

    const foodIndex = buildFoodIndex(foodMaster || []);

    const { data: foodRows, error: foodError } = await supabase
      .from("wellness_food_logs")
      .select("*")
      .eq("participant_id", participantId)
      .limit(200);

    if (foodError) {
      return NextResponse.json(
        { ok: false, message: foodError.message },
        { status: 500 }
      );
    }

    const supabaseLogs = (foodRows || []).map(normalizeSupabaseFood);

    const sheetResult = await loadSheetLogs(
      participantId,
      participant || {},
      foodIndex
    ).catch((error) => ({
      ok: false,
      message: error?.message || "Gagal memuat Google Sheet.",
      logs: [],
    }));

    const logs = dedupeLogs([
      ...supabaseLogs,
      ...(sheetResult.logs || []),
    ]);

    const todayLogs = logs.filter(
      (item: any) => clean(item.log_date).slice(0, 10) === today
    );

    const todayCalories = todayLogs.reduce((sum: number, item: any) => {
      return sum + asNumber(item.calories || item.total_calories);
    }, 0);

    const todayItemCount = todayLogs.reduce((sum: number, item: any) => {
      return sum + Math.max(asNumber(item.item_count), 1);
    }, 0);

    return NextResponse.json({
      ok: true,
      participant_id: participantId,
      participant: participant || null,
      today,
      logs,
      today_logs: todayLogs,
      latest_logs: logs.slice(0, 8),
      today_count: todayItemCount,
      today_row_count: todayLogs.length,
      today_calories: todayCalories,
      has_today_data: todayLogs.length > 0,
      sources: {
        supabase_rows: supabaseLogs.length,
        google_sheet_ok: sheetResult.ok,
        google_sheet_message: sheetResult.message,
        google_sheet_rows: sheetResult.logs?.length || 0,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal memuat nutrisi." },
      { status: 500 }
    );
  }
}
'@

Set-Content -Path $apiPath -Value $api -Encoding UTF8

Write-Host "OK - app\api\wellness\portal\nutrition-direct\route.ts overwritten safely"
Write-Host "DONE - PATCH NUTRITION DIRECT ACCURACY V30B"