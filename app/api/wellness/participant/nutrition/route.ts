// WELLNESS_PARTICIPANT_ALL_FORMS_EXISTING_GS_V398_NUTRITION
// Participant nutrition route using the existing Apps Script v370:
// - food photo -> Google Drive by action=uploadEvidence
// - submission row -> Google Sheet Form Responses
// - mirror -> wellness_food_logs so the participant dashboard still works

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import {
  buildBaseFormRow,
  getCompanyName,
  getDriveUrl,
  getPreviewUrl,
  getWellnessSheetName,
  postToWellnessWebhook,
  safeLogDate,
  uploadEvidenceToDrive,
} from "@/lib/wellness/googleSheetWebhook";

export const runtime = "nodejs";

const MARKER = "WELLNESS_PARTICIPANT_ALL_FORMS_EXISTING_GS_V398_NUTRITION";

function clean(value: any) {
  return String(value ?? "").trim();
}

function toNumberOrNull(value: any) {
  const text = clean(value);
  if (!text) return null;
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function normalizeText(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "")
    .replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitAliases(value: any) {
  return clean(value)
    .split(/[;,|]/g)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function mealLabel(value: any) {
  const text = clean(value).toLowerCase();
  const map: Record<string, string> = {
    breakfast: "Breakfast / Sarapan",
    sarapan: "Breakfast / Sarapan",
    lunch: "Lunch / Makan Siang",
    dinner: "Dinner / Makan Malam",
    snack: "Snack / Camilan",
    meal: "Meal",
  };
  return map[text] || clean(value) || "Meal";
}

async function getParticipant(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const participant = await getParticipantFromPortalSession(supabase, req);
  return { supabase, participant };
}

async function parseRequestBody(req: NextRequest) {
  const contentType = clean(req.headers.get("content-type")).toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const body: Record<string, any> = {};

    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") body[key] = value;
    }

    const photo =
      formData.get("food_photo") ||
      formData.get("photo") ||
      formData.get("file") ||
      formData.get("evidence") ||
      null;

    return { body, photo };
  }

  const body = await req.json().catch(() => ({}));
  return { body: body || {}, photo: null };
}

async function findFoodCalories(supabase: any, foodName: string) {
  const keyword = normalizeText(foodName);
  if (!keyword) return null;

  const { data, error } = await supabase
    .from("wellness_food_calories")
    .select("id,food_name,calories,category,aliases")
    .eq("is_active", 1)
    .limit(2000);

  if (error) throw error;

  const foods = Array.isArray(data) ? data : [];
  let best: any = null;
  let bestScore = 0;

  for (const food of foods) {
    const name = normalizeText(food.food_name);
    const aliases = splitAliases(food.aliases);
    const candidates = [name, ...aliases].filter(Boolean);

    for (const candidate of candidates) {
      let score = 0;
      if (keyword === candidate) score = 1000 + candidate.length;
      else if (keyword.includes(candidate) && candidate.length >= 3) score = 500 + candidate.length;
      else if (candidate.includes(keyword) && keyword.length >= 3) score = 300 + keyword.length;

      if (score > bestScore) {
        bestScore = score;
        best = food;
      }
    }
  }

  if (!best) return null;

  return {
    id: best.id,
    food_name: best.food_name,
    calories: toNumberOrNull(best.calories),
    category: best.category || null,
    aliases: best.aliases || null,
    match_score: bestScore,
  };
}

function buildNutritionRow(params: {
  participant: any;
  body: any;
  logDate: string;
  mealType: string;
  foodName: string;
  portion: string | null;
  notes: string | null;
  calories: number | null;
  matchedFood: any;
  photoResult: any;
}) {
  const row: any = buildBaseFormRow({
    participant: params.participant,
    body: params.body,
    logDate: params.logDate,
    logType: "nutrition",
    marker: MARKER,
  });

  const driveUrl = getDriveUrl(params.photoResult);
  const previewUrl = getPreviewUrl(params.photoResult);

  row["Waktu Makan"] = mealLabel(params.mealType);
  row["Add Options"] = [params.foodName, params.portion].filter(Boolean).join(" - ");
  row["Upload Foto Makanan"] = driveUrl;
  row["Preview Foto Makanan"] = previewUrl;
  row["Catatan Nutrisi"] = params.notes || "";
  row["Kalori Makanan"] = params.calories ?? "";
  row["Detected Foods"] = params.matchedFood?.food_name || params.foodName;
  row["Evidence Count"] = driveUrl ? 1 : 0;

  return row;
}

export async function GET(req: NextRequest) {
  const { supabase, participant } = await getParticipant(req);

  if (!participant?.id) {
    return NextResponse.json(
      { ok: false, message: "OTP/session peserta belum aktif." },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("wellness_food_logs")
    .select("*")
    .eq("participant_id", participant.id)
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { ok: false, message: "Gagal membaca nutrisi peserta.", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    participant_id: participant.id,
    logs: data || [],
  });
}

export async function POST(req: NextRequest) {
  const { supabase, participant } = await getParticipant(req);

  if (!participant?.id) {
    return NextResponse.json(
      { ok: false, message: "OTP/session peserta belum aktif." },
      { status: 401 }
    );
  }

  try {
    const { body, photo } = await parseRequestBody(req);
    const foodName = clean(body?.food_name || body?.foodName || body?.makanan);

    if (!foodName) {
      return NextResponse.json(
        { ok: false, message: "Nama makanan wajib diisi." },
        { status: 400 }
      );
    }

    const logDate = safeLogDate(body?.log_date || body?.logDate);
    const mealType = clean(body?.meal_type || body?.mealType) || "meal";
    const portion = clean(body?.portion || body?.porsi) || null;
    const notes = clean(body?.notes || body?.catatan) || null;
    const companyName = getCompanyName(participant, body);

    const matchedFood = await findFoodCalories(supabase, foodName);
    const calories = matchedFood?.calories ?? null;
    const calorieMatchStatus = matchedFood ? "matched_master" : "not_found_master";

    const photoResult = await uploadEvidenceToDrive({
      file: photo,
      participant,
      companyName,
      category: "Nutrisi",
      activeTab: "nutrition",
      fieldKey: "food_photo",
      logDate,
      marker: MARKER,
    });

    const sheetRow = buildNutritionRow({
      participant,
      body,
      logDate,
      mealType,
      foodName,
      portion,
      notes,
      calories,
      matchedFood,
      photoResult,
    });

    const sheetResult = await postToWellnessWebhook({
      sheet: getWellnessSheetName(),
      row: sheetRow,
      marker: MARKER,
    });

    const payload: any = {
      participant_id: Number(participant.id),
      log_date: logDate,
      meal_type: mealType,
      food_name: foodName,
      portion,
      calories,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      notes,
      source: "participant_portal",
      raw_payload: {
        ...body,
        master_food: matchedFood,
        google_drive: photoResult || null,
        google_sheet: sheetResult || null,
        saved_at: new Date().toISOString(),
        marker: MARKER,
      },
      photo_url: getPreviewUrl(photoResult) || null,
      photo_path: photoResult?.folderPath || null,
      google_drive_file_id: photoResult?.fileId || null,
      google_drive_url: getDriveUrl(photoResult) || null,
      google_drive_preview_url: getPreviewUrl(photoResult) || null,
      calorie_source: matchedFood ? "wellness_food_calories" : "not_found",
      calorie_reference_id: matchedFood?.id || null,
      calorie_match_status: calorieMatchStatus,
      google_sheet_synced_at: new Date().toISOString(),
      google_sheet_row_number: sheetResult?.rowNumber || null,
      sync_status: "synced",
      sync_error: null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("wellness_food_logs")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      message: matchedFood
        ? `Nutrisi berhasil disimpan ke Google Sheet. Kalori otomatis: ${calories} kkal.`
        : "Nutrisi berhasil disimpan ke Google Sheet. Kalori belum ditemukan di Master KaloriData.",
      log: data,
      calories,
      calorie_match_status: calorieMatchStatus,
      matched_food: matchedFood,
      google_drive: photoResult,
      google_sheet: sheetResult,
    });
  } catch (error: any) {
    console.error("WELLNESS_PARTICIPANT_ALL_FORMS_EXISTING_GS_V398_NUTRITION_ERROR", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Gagal menyimpan nutrisi.",
        detail: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
