// WELLNESS_PARTICIPANT_NUTRITION_GOOGLE_SHEET_ONLY_V402_MULTI_FOOD
// Nutrition submission is stored ONLY in existing Google Sheet + Google Drive.
// V402:
// - support comma-separated foods
// - each food item is matched to wellness_food_calories
// - total calories = sum of all matched items
// - Detected Foods contains item-by-item breakdown
// - Supabase is used only for participant session and master calorie lookup.
// - No insert into wellness_food_logs.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

// PORTION_SCOPE_FALLBACK_V24
// Fallback untuk helper function lama yang berada di luar scope POST.
// Nilai porsi sebenarnya tetap dikirim dari body POST dan/atau raw_payload.
const portionGroup = "";
const portionFraction = "";
const portionMultiplier = 0;


export const runtime = "nodejs";

function clean(value: any) {
  return String(value ?? "").trim();
}

function toNumberOrNull(value: any) {
  const text = clean(value);
  if (!text) return null;

  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function safeIsoDate(value: any) {
  const text = clean(value);
  if (!text) return todayDate();

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text.slice(0, 10) || todayDate();
  }

  return date.toISOString().slice(0, 10);
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

function splitFoodItems(value: any) {
  return clean(value)
    .split(/[,;\n]+/g)
    .map((item) => clean(item))
    .filter(Boolean);
}

function mealLabel(value: any) {
  const text = clean(value).toLowerCase();

  const map: Record<string, string> = {
    breakfast: "Breakfast / Sarapan",
    sarapan: "Breakfast / Sarapan",
    lunch: "Lunch / Makan Siang",
    makan_siang: "Lunch / Makan Siang",
    dinner: "Dinner / Makan Malam",
    makan_malam: "Dinner / Makan Malam",
    snack: "Snack / Camilan",
    camilan: "Snack / Camilan",
    meal: "Meal",
  };

  return map[text] || clean(value) || "Meal";
}

function getWebhookUrl() {
  return clean(process.env.WELLNESS_GOOGLE_SHEET_WEBHOOK_URL);
}

function getWebhookSecret() {
  return clean(
    process.env.WELLNESS_GOOGLE_SHEET_WEBHOOK_SECRET ||
      process.env.WELLNESS_WEBHOOK_SECRET ||
      ""
  );
}

function getSheetName() {
  return clean(process.env.WELLNESS_GOOGLE_SHEET_TAB_NAME) || "Form Responses";
}

function assertWebhookConfigured() {
  const url = getWebhookUrl();

  if (!url) {
    throw new Error(
      "WELLNESS_GOOGLE_SHEET_WEBHOOK_URL belum diisi di Vercel Production. Data tidak disimpan agar tidak masuk ke Supabase."
    );
  }

  return url;
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

async function fileToBase64(fileLike: any) {
  if (!fileLike || typeof fileLike !== "object") return null;
  if (typeof fileLike.arrayBuffer !== "function") return null;

  const arrayBuffer = await fileLike.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (!buffer.length) return null;

  const maxBytes = 4 * 1024 * 1024;
  if (buffer.length > maxBytes) {
    throw new Error("Ukuran foto maksimal 4 MB. Silakan upload foto yang lebih kecil.");
  }

  return {
    dataBase64: buffer.toString("base64"),
    filename: clean(fileLike.name) || `nutrition-${Date.now()}.jpg`,
    contentType: clean(fileLike.type) || "application/octet-stream",
    size: buffer.length,
  };
}

async function postToWebhook(payload: any) {
  const url = assertWebhookConfigured();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      secret: getWebhookSecret(),
      ...payload,
    }),
  });

  const text = await response.text();

  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {
      ok: false,
      message: text || "Invalid webhook response",
    };
  }

  if (!response.ok || json?.ok === false) {
    throw new Error(json?.message || `Webhook gagal: HTTP ${response.status}`);
  }

  return json;
}

async function uploadNutritionPhoto(params: {
  photo: any;
  participant: any;
  companyName: string;
  logDate: string;
}) {
  const converted = await fileToBase64(params.photo);
  if (!converted) return null;

  return await postToWebhook({
    action: "uploadEvidence",
    filename: converted.filename,
    originalFilename: converted.filename,
    contentType: converted.contentType,
    dataBase64: converted.dataBase64,

    folderName: "wellness program",
    companyName: params.companyName || "Tanpa Perusahaan",

    participantId: params.participant?.id,
    participant_id: params.participant?.id,
    participantCode: params.participant?.code,
    participant_code: params.participant?.code,
    participantName: params.participant?.name,
    participant_name: params.participant?.name,

    evidenceCategory: "Nutrisi",
    activeTab: "nutrition",
    fieldKey: "food_photo",
    logDate: params.logDate,

    marker: "WELLNESS_PARTICIPANT_NUTRITION_GOOGLE_SHEET_ONLY_V402_MULTI_FOOD",
  });
}

async function loadFoodMaster(supabase: any) {
  const { data, error } = await supabase
    .from("wellness_food_calories")
    .select("id,food_name,calories,category,aliases")
    .eq("is_active", 1)
    .limit(2000);

  if (error) throw error;

  return Array.isArray(data) ? data : [];
}

function matchOneFoodFromMaster(foods: any[], foodName: string) {
  const keyword = normalizeText(foodName);
  if (!keyword) return null;

  let best: any = null;
  let bestScore = 0;

  for (const food of foods) {
    const name = normalizeText(food.food_name);
    const aliases = splitAliases(food.aliases);
    const candidates = [name, ...aliases].filter(Boolean);

    for (const candidate of candidates) {
      let score = 0;

      if (keyword === candidate) {
        score = 1000 + candidate.length;
      } else if (keyword.includes(candidate) && candidate.length >= 3) {
        score = 500 + candidate.length;
      } else if (candidate.includes(keyword) && keyword.length >= 3) {
        score = 300 + keyword.length;
      }

      if (score > bestScore) {
        bestScore = score;
        best = food;
      }
    }
  }

  if (!best) return null;

  return {
    input_name: foodName,
    id: best.id,
    food_name: best.food_name,
    calories: toNumberOrNull(best.calories),
    category: best.category || null,
    aliases: best.aliases || null,
    match_score: bestScore,
  };
}

async function calculateMultiFoodCalories(supabase: any, foodName: string) {
  const foodItems = splitFoodItems(foodName);
  const items = foodItems.length ? foodItems : [clean(foodName)];

  const foods = await loadFoodMaster(supabase);

  const breakdown = items.map((item) => {
    const matched = matchOneFoodFromMaster(foods, item);

    if (!matched) {
      return {
        input_name: item,
        matched: false,
        matched_name: null,
        calories: null,
        reference_id: null,
        category: null,
        status: "not_found_master",
      };
    }

    return {
      input_name: item,
      matched: true,
      matched_name: matched.food_name,
      calories: matched.calories,
      reference_id: matched.id,
      category: matched.category,
      status: "matched_master",
    };
  });

  let totalCalories = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;

  for (const item of breakdown) {
    if (item.matched && Number.isFinite(Number(item.calories))) {
      totalCalories += Number(item.calories);
      matchedCount += 1;
    } else {
      unmatchedCount += 1;
    }
  }

  const allMatched = breakdown.length > 0 && unmatchedCount === 0;
  const partiallyMatched = matchedCount > 0 && unmatchedCount > 0;
  const noneMatched = matchedCount === 0;

  const detectedFoodsText = breakdown
    .map((item) => {
      if (item.matched) {
        return `${item.input_name}: ${item.calories ?? 0} kkal (${item.matched_name})`;
      }

      return `${item.input_name}: belum match`;
    })
    .join(" | ");

  return {
    original_food_name: clean(foodName),
portion_group: portionGroup || null,
portion_fraction: portionFraction || null,
portion_multiplier: portionMultiplier || null,
plate_group: portionGroup || null,
plate_fraction: portionFraction || null,
isi_piringku_group: portionGroup || null,
isi_piringku_fraction: portionFraction || null,
    items,
    breakdown,
    total_calories: matchedCount > 0 ? totalCalories : null,
    matched_count: matchedCount,
    unmatched_count: unmatchedCount,
    calorie_match_status: allMatched
      ? "matched_master"
      : partiallyMatched
        ? "partial_match_master"
        : noneMatched
          ? "not_found_master"
          : "not_found_master",
    detected_foods_text: detectedFoodsText,
  };
}

function buildSheetRow(params: {
  participant: any;
  body: any;
  logDate: string;
  mealType: string;
  foodName: string;
  portion: string | null;
  notes: string | null;
  calorieResult: any;
  photoResult: any;
}) {
  const participant = params.participant || {};
  const photo = params.photoResult || {};

  const previewUrl =
    photo.previewUrl ||
    photo.thumbnailUrl ||
    photo.publicUrl ||
    photo.driveUrl ||
    "";

  const driveUrl = photo.driveUrl || photo.publicUrl || "";

  const company =
    clean(
      participant.company ||
        participant.company_name ||
        params.body.company ||
        params.body.company_name
    ) || "";

  const calories = params.calorieResult?.total_calories ?? "";
  const detectedFoods =
    params.calorieResult?.detected_foods_text ||
    params.calorieResult?.original_food_name ||
    params.foodName;

  return {
    "Submission Date": new Date().toISOString(),
    "Pilih Nama Anda": participant.name || "",
    "Nama Peserta": participant.name || "",

    "Waktu Makan": mealLabel(params.mealType),
    "Add Options": [params.foodName, params.portion].filter(Boolean).join(" - "),
    "Upload Foto Makanan": driveUrl,
    "Preview Foto Makanan": previewUrl,

    "Melakukan Workout/Aktifitas Ringan?": "",
    "Jenis Workout/Aktifitas": "",
    "Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)": "",
    "Submission IP": "Harmony Health App",
    "Berapa Menit anda melakukan nya ?": "",

    "Berat badan Awal": participant.baseline_weight_kg || participant.weight_kg || "",
    "BB anda per hari ini (diisi sekali saja perminggu)": "",
    "Helper column BB jangan diubah": "",
    "BB Monitoring terbaru": "",

    "Lingkar Perut (cm)": participant.waist_cm || "",
    "BMI": participant.bmi || "",

    "Catatan Nutrisi": params.notes || "",
    "Kalori Makanan": calories,
    "Detected Foods": detectedFoods,

    "Kalori Aktivitas": "",
    "Bukti Aktivitas": "",
    "Preview Bukti Aktivitas": "",

    "Healthtalk/Seminar": "",
    "Jenis Healthtalk": "",
    "Tanggal Healthtalk": "",
    "Bukti Healthtalk": "",
    "Preview Bukti Healthtalk": "",

    "Total Point": 5,

    "Company": company,
    "Kelompok": participant.group_name || participant.kelompok || "",
    "Group Upload": "Portal Peserta",
    "Risk Cluster": participant.risk_cluster || "",
    "KODE": participant.code || "",
    "Participant ID": participant.id || "",
    "Log Date": params.logDate,
    "Log Type": "nutrition",
    "Evidence Count": driveUrl ? 1 : 0,
    "Created By": "participant_portal",
    "Marker": "WELLNESS_PARTICIPANT_NUTRITION_GOOGLE_SHEET_ONLY_V402_MULTI_FOOD",
  };
}

export async function GET(req: NextRequest) {
  const { participant } = await getParticipant(req);

  if (!participant?.id) {
    return NextResponse.json(
      {
        ok: false,
        message: "OTP/session peserta belum aktif.",
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    mode: "google_sheet_only",
    participant_id: participant.id,
    logs: [],
    message:
      "Nutrisi disimpan di Google Sheet. Route ini tidak membaca Supabase agar database tidak penuh.",
  });
}

export async function POST(req: NextRequest) {
  const { supabase, participant } = await getParticipant(req);

  if (!participant?.id) {
    return NextResponse.json(
      {
        ok: false,
        message: "OTP/session peserta belum aktif.",
      },
      { status: 401 }
    );
  }

  try {
    assertWebhookConfigured();

    const { body, photo } = await parseRequestBody(req);

    const foodName = clean(body?.food_name || body?.foodName || body?.makanan);

    if (!foodName) {
      return NextResponse.json(
        {
          ok: false,
          message: "Nama makanan wajib diisi.",
        },
        { status: 400 }
      );
    }

    const logDate = safeIsoDate(body?.log_date || body?.logDate);
    const mealType = clean(body?.meal_type || body?.mealType) || "meal";

// PORTION_PAYLOAD_V21
const portionGroup = clean(
  body?.portion_group ||
    body?.portionGroup ||
    body?.plate_group ||
    body?.plateGroup ||
    body?.isi_piringku_group
);

const portionFraction = clean(
  body?.portion_fraction ||
    body?.portionFraction ||
    body?.plate_fraction ||
    body?.plateFraction ||
    body?.isi_piringku_fraction
);

const portionMultiplierRaw = Number(
  body?.portion_multiplier ||
    body?.portionMultiplier ||
    body?.plate_multiplier ||
    body?.plateMultiplier ||
    0
);

const portionMultiplier = Number.isFinite(portionMultiplierRaw)
  ? portionMultiplierRaw
  : 0;
    const portion = clean(body?.portion || body?.porsi) || null;
    const notes = clean(body?.notes || body?.catatan) || null;

    const companyName =
      clean(
        participant?.company ||
          participant?.company_name ||
          body?.company ||
          body?.company_name
      ) || "Tanpa Perusahaan";

    const calorieResult = await calculateMultiFoodCalories(supabase, foodName);

    const photoResult = await uploadNutritionPhoto({
      photo,
      participant,
      companyName,
      logDate,
    });

    const sheetRow = buildSheetRow({
      participant,
      body,
      logDate,
      mealType,
      foodName,
      portion,
      notes,
      calorieResult,
      photoResult,
    });

    const sheetResult = await postToWebhook({
      sheet: getSheetName(),
      row: sheetRow,
      marker: "WELLNESS_PARTICIPANT_NUTRITION_GOOGLE_SHEET_ONLY_V402_MULTI_FOOD",
    });

    const returnedLog = {
      id: `sheet_${sheetResult?.rowNumber || Date.now()}`,
      participant_id: participant.id,
      log_date: logDate,
      meal_type: mealType,
      food_name: foodName,
      portion,
      calories: calorieResult.total_calories,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      notes,
      source: "google_sheet",
      photo_url:
        photoResult?.previewUrl ||
        photoResult?.thumbnailUrl ||
        photoResult?.publicUrl ||
        photoResult?.driveUrl ||
        null,
      calorie_source: "wellness_food_calories",
      calorie_match_status: calorieResult.calorie_match_status,
      detected_foods_text: calorieResult.detected_foods_text,
      food_breakdown: calorieResult.breakdown,
      google_sheet_row_number: sheetResult?.rowNumber || null,
      google_drive: photoResult || null,
      google_sheet: sheetResult || null,
    };

    const total = calorieResult.total_calories;
    const breakdownText = calorieResult.detected_foods_text;

    return NextResponse.json({
      ok: true,
      mode: "google_sheet_only",
      message:
        total !== null
          ? `Berhasil masuk Google Sheet · Total ${total} kalori · Breakdown: ${breakdownText} · Point +5`
          : `Berhasil masuk Google Sheet · Kalori belum ditemukan di Master KaloriData · Breakdown: ${breakdownText} · Point +5`,
      log: returnedLog,
      calories: total,
      point: 5,
      calorie_match_status: calorieResult.calorie_match_status,
      detected_foods_text: calorieResult.detected_foods_text,
      food_breakdown: calorieResult.breakdown,
      google_drive: photoResult,
      google_sheet: sheetResult,
    });
  } catch (error: any) {
    console.error(
      "WELLNESS_PARTICIPANT_NUTRITION_GOOGLE_SHEET_ONLY_V402_MULTI_FOOD_ERROR",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        mode: "google_sheet_only",
        message: "Gagal menyimpan nutrisi ke Google Sheet.",
        detail: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
