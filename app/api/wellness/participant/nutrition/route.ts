// WELLNESS_PARTICIPANT_NUTRITION_GOOGLE_SHEET_ONLY_V402_MULTI_FOOD
// WELLNESS_NUTRITION_IDEMPOTENCY_V126L
// WELLNESS_NUTRITION_DELETE_V126M
// WELLNESS_NUTRITION_CANONICAL_DEDUPE_SAFE_DELETE_V126M1
// WELLNESS_MOBILE_UPLOAD_LOCAL_DATE_SAFE_DELETE_GOOGLE_FIT_V126M2
// WELLNESS_NUTRITION_GOOGLE_SHEET_ONLY_V126M3A
// WELLNESS_NUTRITION_STATUS_MIRROR_V98
// WELLNESS_LOCAL_DATE_JAKARTA_V126M13_2
// Google Sheet + Google Drive remain the primary submission store.
// A compact mirror is also saved to the existing wellness_food_logs table
// so Coach/Admin can read daily nutrition status. No schema or point-rule change.
// V402:
// - support comma-separated foods
// - each food item is matched to wellness_food_calories
// - total calories = sum of all matched items
// - Detected Foods contains item-by-item breakdown
// - Supabase is used for participant session, calorie master, and point ledger.
// - Existing wellness_food_logs receives a compact status mirror after Sheet append.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import {
  fetchWellnessGoogleSheetRows,
  googleSheetRowsToFoodLogs,
} from "@/lib/wellness/googleSheetResponses";
import {
  nutritionDailyBonusPoints,
  nutritionInputPoints,
  pointNumber,
} from "@/lib/wellness/pointRules";
import {
  insertPointOnce,
  resolveParticipantPointTargets,
  setDailyPoint,
} from "@/lib/wellness/pointWriter";

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


// NUTRITION_API_BODY_PORTION_ESTIMATE_V45
function numberFromPostedNutritionV45(value: any) {
  const raw = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function parseSubmittedBreakdownV45(value: any) {
  const text = clean(value);

  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readSubmittedNutritionEstimateV45(body: any) {
  const directCalories =
    numberFromPostedNutritionV45(body?.estimated_calories) ||
    numberFromPostedNutritionV45(body?.estimatedCalories) ||
    numberFromPostedNutritionV45(body?.calories) ||
    numberFromPostedNutritionV45(body?.total_calories) ||
    0;

  const breakdown =
    parseSubmittedBreakdownV45(body?.food_breakdown) ||
    parseSubmittedBreakdownV45(body?.portion_breakdown) ||
    [];

  const activeBreakdown = Array.isArray(breakdown) ? breakdown : [];

  const breakdownCalories = activeBreakdown.reduce((sum: number, item: any) => {
    const subtotal =
      numberFromPostedNutritionV45(item?.subtotal_calories) ||
      numberFromPostedNutritionV45(item?.total_calories) ||
      numberFromPostedNutritionV45(item?.calories) ||
      0;

    return sum + subtotal;
  }, 0);

  return {
    submitted_calories: directCalories > 0 ? directCalories : breakdownCalories,
    submitted_breakdown: activeBreakdown,
  };
}

function normalizeSubmittedBreakdownV45(items: any[]) {
  return (items || [])
    .map((item: any) => {
      const inputName = clean(
        item?.input_name ||
          item?.food_name ||
          item?.name ||
          item?.matched_name ||
          "Makanan"
      );

      const matchedName = clean(item?.matched_name || item?.food_name || "");
      const portionFraction = clean(item?.portion_fraction || item?.portion || "");
      const portionMultiplier = numberFromPostedNutritionV45(item?.portion_multiplier) || null;
      const baseCalories = numberFromPostedNutritionV45(item?.base_calories);
      const subtotalCalories =
        numberFromPostedNutritionV45(item?.subtotal_calories) ||
        numberFromPostedNutritionV45(item?.total_calories) ||
        numberFromPostedNutritionV45(item?.calories) ||
        0;

      return {
        input_name: inputName,
        matched: clean(item?.match_status || item?.status).toLowerCase() !== "unmatched",
        matched_name: matchedName || null,
        calories: subtotalCalories,
        base_calories: baseCalories || null,
        portion_fraction: portionFraction || null,
        portion_multiplier: portionMultiplier,
        reference_id: item?.reference_id || item?.id || null,
        category: clean(item?.category) || null,
        status: "matched_master_portion_ui",
      };
    })
    .filter((item: any) => clean(item.input_name));
}

function submittedBreakdownTextV45(items: any[]) {
  return (items || [])
    .map((item: any) => {
      const portion = clean(item.portion_fraction);
      const matched = clean(item.matched_name);
      const calories = numberFromPostedNutritionV45(item.calories);

      if (portion && matched) {
        return `${item.input_name}: ${calories} kkal (${portion} porsi, ${matched})`;
      }

      if (portion) {
        return `${item.input_name}: ${calories} kkal (${portion} porsi)`;
      }

      if (matched) {
        return `${item.input_name}: ${calories} kkal (${matched})`;
      }

      return `${item.input_name}: ${calories} kkal`;
    })
    .join(" | ");
}

function applySubmittedEstimateToCalorieResultV45(calorieResult: any, body: any) {
  const submitted = readSubmittedNutritionEstimateV45(body);
  const submittedCalories = numberFromPostedNutritionV45(submitted.submitted_calories);
  const submittedBreakdown = normalizeSubmittedBreakdownV45(submitted.submitted_breakdown);

  if (submittedCalories <= 0 && submittedBreakdown.length === 0) {
    return calorieResult;
  }

  const breakdownCalories = submittedBreakdown.reduce((sum: number, item: any) => {
    return sum + numberFromPostedNutritionV45(item.calories);
  }, 0);

  const finalCalories =
    submittedCalories > 0
      ? submittedCalories
      : breakdownCalories > 0
        ? breakdownCalories
        : calorieResult?.total_calories;

  const finalBreakdown =
    submittedBreakdown.length > 0 ? submittedBreakdown : calorieResult?.breakdown || [];

  const detectedText =
    submittedBreakdown.length > 0
      ? submittedBreakdownTextV45(finalBreakdown)
      : calorieResult?.detected_foods_text;

  return {
    ...calorieResult,
    total_calories: finalCalories,
    breakdown: finalBreakdown,
    detected_foods_text: detectedText,
    calorie_match_status: "matched_master_portion_ui",
    portion_estimate_source: "client_portion_breakdown_v45",
    submitted_calories_v45: submittedCalories,
  };
}

function toNumberOrNull(value: any) {
  const text = clean(value);
  if (!text) return null;

  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function jakartaDateKeyV126M2(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const year = parts.find((item) => item.type === "year")?.value || "";
  const month = parts.find((item) => item.type === "month")?.value || "";
  const day = parts.find((item) => item.type === "day")?.value || "";

  if (!year || !month || !day) {
    return value.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

function todayDate() {
  return jakartaDateKeyV126M2(new Date());
}

function jakartaSubmissionTimestampV126M13(value = new Date()) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    value = new Date();
  }

  const shifted = new Date(value.getTime() + 7 * 60 * 60 * 1000);
  return shifted.toISOString().replace(/Z$/, "+07:00");
}

// WELLNESS_NUTRITION_BACKDATE_SHEET_DATE_V126M15_1
// Keep the real WIB submission time, but use the operational date selected
// by the participant. This makes Google Sheet backdated entries consistently
// show the selected date in both Submission Date and Log Date.
function jakartaSubmissionTimestampForLogDateV126M15(
  logDate: any,
  value = new Date(),
) {
  const dateKey = safeIsoDate(logDate);
  const currentJakartaTimestamp = jakartaSubmissionTimestampV126M13(value);
  return `${dateKey}${currentJakartaTimestamp.slice(10)}`;
}

function safeIsoDate(value: any) {
  const text = clean(value);
  if (!text) return todayDate();

  const exactDate = text.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (exactDate?.[1]) return exactDate[1];

  const localDate = text.match(/^(\d{4}-\d{2}-\d{2})\s+/);
  if (localDate?.[1]) return localDate[1];

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    const embeddedDate = text.match(/(\d{4}-\d{2}-\d{2})/);
    return embeddedDate?.[1] || todayDate();
  }

  return jakartaDateKeyV126M2(date);
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

  const maxBytes = 1_600_000;
  if (buffer.length > maxBytes) {
    throw new Error(
      "Ukuran foto masih terlalu besar setelah kompresi. Gunakan screenshot atau foto dengan resolusi lebih kecil.",
    );
  }

  return {
    dataBase64: buffer.toString("base64"),
    filename: clean(fileLike.name) || `nutrition-${Date.now()}.jpg`,
    contentType: clean(fileLike.type) || "application/octet-stream",
    size: buffer.length,
  };
}

type WellnessWebhookOptionsV126M17 = {
  attempts?: number;
  timeoutMs?: number;
  requestId?: string;
  label?: string;
};

function wellnessSleepV126M17(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wellnessWebhookRetryableV126M17(error: any) {
  const message = clean(error?.message || error || "").toLowerCase();
  const status = Number(error?.status || 0);

  return (
    error?.name === "AbortError" ||
    [408, 425, 429, 500, 502, 503, 504].includes(status) ||
    /wellness_retryable_busy|sedang menerima banyak input|sedang sibuk|timeout|timed out|fetch failed|network|socket|econnreset/i.test(
      message,
    )
  );
}

// WELLNESS_STABLE_DELIVERY_V126M17
// Main Sheet writes are retried with the same request/submission ID. If the
// first execution completed but its response was lost, Apps Script deduplicates
// the retry instead of appending a second row.
async function postToWebhook(
  payload: any,
  options: WellnessWebhookOptionsV126M17 = {},
) {
  const url = assertWebhookConfigured();
  const attempts = Math.max(1, Number(options.attempts || 1));
  const timeoutMs = Math.max(5000, Number(options.timeoutMs || 20000));
  const requestId = clean(
    options.requestId ||
      payload?.requestId ||
      payload?.request_id ||
      payload?.submissionId ||
      payload?.submission_id ||
      `wellness-${Date.now()}`,
  );
  let lastError: any = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          secret: getWebhookSecret(),
          requestId,
          request_id: requestId,
          ...payload,
        }),
        signal: controller.signal,
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
        const webhookError: any = new Error(
          json?.message || `Webhook gagal: HTTP ${response.status}`,
        );
        webhookError.status = response.status;
        webhookError.webhook = json;
        throw webhookError;
      }

      return json;
    } catch (error: any) {
      lastError = error;
      const retryable = wellnessWebhookRetryableV126M17(error);

      if (!retryable || attempt >= attempts) {
        throw error;
      }

      await wellnessSleepV126M17(
        700 * attempt + Math.floor(Math.random() * 401),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error("Webhook gagal tanpa respons.");
}

function publicNutritionErrorV126M2(error: any) {
  const raw = clean(error?.message || error || "");
  const compact = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/request entity too large|payload too large|body exceeded/i.test(compact)) {
    return "Ukuran foto terlalu besar. Gunakan screenshot atau foto dengan resolusi lebih kecil.";
  }

  if (/unauthorized webhook secret/i.test(compact)) {
    return "Webhook Google Sheet menolak akses. Periksa deployment dan secret Apps Script.";
  }

  if (/timeout|timed out|fetch failed|network/i.test(compact)) {
    return "Koneksi ke Google Sheet atau Google Drive terputus. Silakan coba kembali.";
  }

  return compact.slice(0, 500) ||
    "Gagal menyimpan nutrisi ke Google Sheet.";
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

// WELLNESS_NUTRITION_FULL_MASTER_PAGINATION_V126K
async function loadFoodMaster(
  supabase: any,
) {
  const pageSize = 1000;
  const rows: any[] = [];

  for (
    let from = 0;
    ;
    from += pageSize
  ) {
    const to =
      from + pageSize - 1;

    const {
      data,
      error,
    } = await supabase
      .from(
        "wellness_food_calories",
      )
      .select(
        "id,food_name,calories,category,aliases",
      )
      .eq("is_active", 1)
      .order(
        "id",
        {
          ascending: true,
        },
      )
      .range(
        from,
        to,
      );

    if (error) {
      throw error;
    }

    const batch =
      Array.isArray(data)
        ? data
        : [];

    rows.push(...batch);

    if (
      batch.length < pageSize
    ) {
      break;
    }
  }

  return rows;
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
    "Submission ID": clean(
      params.body?.submission_id ||
        params.body?.submissionId,
    ),
    "Submission Date": jakartaSubmissionTimestampForLogDateV126M15(params.logDate),
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


async function saveNutritionStatusMirrorV98(
  _params: any,
) {
  /*
   * WELLNESS_NUTRITION_GOOGLE_SHEET_ONLY_V126M3A
   *
   * Nutrisi hanya disimpan ke Google Sheet.
   * Supabase tetap dipakai untuk:
   * - participant session
   * - Master Kalori
   * - point ledger
   * - target nutrisi
   *
   * Tidak ada row baru yang dibuat ke
   * wellness_food_logs.
   */
  return {
    ok: true,
    inserted: false,
    disabled: true,
    warning: "",
    message:
      "Mirror Supabase dinonaktifkan. Google Sheet adalah penyimpanan nutrisi.",
  };
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

    const foodName = clean(
      body?.food_name ||
        body?.foodName ||
        body?.makanan,
    );

    const submissionId = clean(
      body?.submission_id ||
        body?.submissionId ||
        req.headers.get("x-submission-id"),
    );

    if (!submissionId) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Submission ID nutrisi tidak tersedia. Silakan refresh aplikasi.",
        },
        { status: 400 },
      );
    }

    body.submission_id = submissionId;

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

    let calorieResult = await calculateMultiFoodCalories(supabase, foodName);

// PORTION_ESTIMATE_APPLIED_V45
// Route ini membaca request lewat parseRequestBody(req), jadi estimasi porsi diambil dari body.
calorieResult = applySubmittedEstimateToCalorieResultV45(calorieResult, body);

    let photoResult: any = null;
    let photoWarning = "";

    if (photo) {
      try {
        photoResult = await uploadNutritionPhoto({
          photo,
          participant,
          companyName,
          logDate,
        });
      } catch (photoError: any) {
        // WELLNESS_STABLE_DELIVERY_V126M17
        // A Drive/photo failure must not block the nutrition row.
        photoWarning =
          publicNutritionErrorV126M2(photoError) ||
          "Foto belum berhasil diunggah, tetapi data nutrisi tetap diproses.";
      }
    }

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

    const sheetResult = await postToWebhook(
      {
        sheet: getSheetName(),
        row: sheetRow,
        submissionId,
        submission_id: submissionId,
        marker:
          "WELLNESS_PARTICIPANT_NUTRITION_GOOGLE_SHEET_ONLY_V402_MULTI_FOOD",
      },
      {
        attempts: 4,
        timeoutMs: 20000,
        requestId: submissionId,
        label: "nutrition_append",
      },
    );

    const returnedLog = {
      id: `sheet_${sheetResult?.rowNumber || Date.now()}`,
      submission_id: submissionId,
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
      portion_estimate_source: (calorieResult as any).portion_estimate_source || null,
      submitted_calories_v45: (calorieResult as any).submitted_calories_v45 || null,
      google_sheet_row_number: sheetResult?.rowNumber || null,
      google_drive: photoResult || null,
      google_sheet: sheetResult || null,
      photo_warning: photoWarning || null,
    };

    const statusMirrorResult = await saveNutritionStatusMirrorV98({
      supabase,
      participant,
      logDate,
      mealType,
      foodName,
      portion,
      notes,
      body,
      calorieResult,
      photoResult,
      sheetResult,
    });

    const inputPointValue = nutritionInputPoints();
    const sheetRowNumber = pointNumber(
      sheetResult?.rowNumber || sheetResult?.row_number || sheetResult?._rowNumber,
    );
    const inputPointResult = await insertPointOnce({
      supabase,
      participant,
      logDate,
      pointKey: `nutrition_input_${submissionId}`,
      sourceType: "nutrition_google_sheet",
      sourceId: sheetRowNumber || null,
      points: inputPointValue,
      description: `Input nutrisi: ${foodName}`,
    });

    let nutritionBonusResult: any = {
      ok: true,
      points: 0,
      delta: 0,
      totalCalories: calorieResult.total_calories || 0,
      calorieLimit: 0,
      warning: "",
    };

    try {
      const targets = await resolveParticipantPointTargets(supabase, participant);
      const sheetRead = await fetchWellnessGoogleSheetRows({
        participantId: participant.id,
        code: participant.code,
        logType: "nutrition",
        limit: 10000,
      });

      const rows = googleSheetRowsToFoodLogs(sheetRead?.rows || []).filter(
        (row: any) => {
          const sameParticipant =
            pointNumber(row?.participant_id) === pointNumber(participant.id) ||
            (clean(participant.code) &&
              clean(row?.participant_code) === clean(participant.code));
          return sameParticipant && clean(row?.log_date).slice(0, 10) === logDate;
        },
      );

      const rowMap = new Map<string, any>();
      for (const row of [...rows, returnedLog] as any[]) {
        const rowNumber = pointNumber(
          row?.google_sheet_row_number || row?.raw_payload?._rowNumber,
        );
        const key = rowNumber
          ? `sheet-row:${rowNumber}`
          : clean(row?.id) ||
            JSON.stringify([
              row?.participant_id,
              row?.log_date,
              row?.meal_type,
              row?.food_name,
              row?.created_at,
            ]);
        rowMap.set(key, row);
      }

      const dailyRows = [...rowMap.values()];
      const totalCalories = dailyRows.reduce(
        (sum: number, row: any) =>
          sum +
          pointNumber(
            row?.calories ??
              row?.total_calories ??
              row?.estimated_calories ??
              row?.raw_payload?.["Kalori Makanan"],
          ),
        0,
      );
      const bonusPoints = nutritionDailyBonusPoints({
        totalCalories,
        calorieLimit: targets.nutrition,
        hasNutritionInput: dailyRows.length > 0,
      });

      const savedBonus = await setDailyPoint({
        supabase,
        participant,
        logDate,
        pointKey: "nutrition_daily_bonus",
        sourceType: "nutrition_daily_bonus",
        sourceId: null,
        points: bonusPoints,
        description:
          bonusPoints > 0
            ? `Bonus nutrisi harian (${Math.round(totalCalories)}/${Math.round(targets.nutrition)} kkal)`
            : `Batas kalori nutrisi harian terlampaui (${Math.round(totalCalories)}/${Math.round(targets.nutrition)} kkal)`,
      });

      nutritionBonusResult = {
        ...savedBonus,
        totalCalories,
        calorieLimit: targets.nutrition,
      };
    } catch (bonusError: any) {
      nutritionBonusResult = {
        ok: false,
        points: 0,
        delta: 0,
        totalCalories: calorieResult.total_calories || 0,
        calorieLimit: 0,
        warning: bonusError?.message || "Bonus nutrisi belum dapat dihitung.",
      };
    }

    const total = calorieResult.total_calories;
    const breakdownText = calorieResult.detected_foods_text;
    const pointWarnings = [
      statusMirrorResult.warning,
      inputPointResult.warning,
      nutritionBonusResult.warning,
    ].filter(Boolean);
    const pointDelta =
      (inputPointResult.inserted ? inputPointValue : 0) +
      pointNumber(nutritionBonusResult.delta);

    return NextResponse.json({
      ok: true,
      mode: "google_sheet_only",
      message:
        total !== null
          ? `Berhasil masuk Google Sheet · Total ${total} kalori · Breakdown: ${breakdownText} · Point +${inputPointValue}${nutritionBonusResult.delta > 0 ? ` · Bonus +${nutritionBonusResult.delta}` : ""}`
          : `Berhasil masuk Google Sheet · Kalori belum ditemukan di Master KaloriData · Breakdown: ${breakdownText} · Point +${inputPointValue}`,
      log: returnedLog,
      calories: total,
      point: inputPointValue,
      points_total_delta: pointDelta,
      point_ledger: inputPointResult,
      nutrition_daily_bonus: nutritionBonusResult,
      point_warnings: pointWarnings,
      calorie_match_status: calorieResult.calorie_match_status,
      detected_foods_text: calorieResult.detected_foods_text,
      food_breakdown: calorieResult.breakdown,
      portion_estimate_source: (calorieResult as any).portion_estimate_source || null,
      submitted_calories_v45: (calorieResult as any).submitted_calories_v45 || null,
      status_mirror: statusMirrorResult,
      google_drive: photoResult,
      google_sheet: sheetResult,
    });
  } catch (error: any) {
    console.error(
      "WELLNESS_PARTICIPANT_NUTRITION_GOOGLE_SHEET_ONLY_V402_MULTI_FOOD_ERROR",
      error
    );

    const publicMessage = publicNutritionErrorV126M2(error);

    return NextResponse.json(
      {
        ok: false,
        mode: "google_sheet_only",
        message: publicMessage,
        detail: publicMessage,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { supabase, participant } = await getParticipant(req);

  if (!participant?.id) {
    return NextResponse.json(
      {
        ok: false,
        message: "OTP/session peserta belum aktif.",
      },
      { status: 401 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestedSource = clean(body?.source).toLowerCase();
    const requestedMirrorId = pointNumber(
      body?.mirror_id || body?.supabase_id || body?.id,
    );
    const requestedSubmissionId = clean(
      body?.submission_id || body?.submissionId,
    );
    const requestedSheetRow = pointNumber(
      body?.google_sheet_row_number ||
        body?.sheet_row_number ||
        body?.row_number,
    );
    const requestedDate = safeIsoDate(
      body?.log_date || body?.date || todayDate(),
    );
    const requestedMeal = clean(
      body?.meal_type || body?.meal_time,
    ).toLowerCase();
    const requestedTitle = clean(
      body?.title || body?.food_name || body?.meal_text,
    );
    const requestedCalories = pointNumber(
      body?.calories || body?.total_calories,
    );

    function normalizedDeleteText(value: any) {
      return clean(value)
        .toLowerCase()
        .replace(
          /[^a-z0-9\u00c0-\u024f\u1e00-\u1eff]+/gi,
          " ",
        )
        .replace(/\s+/g, " ")
        .trim();
    }

    function normalizedMeal(value: any) {
      const text = normalizedDeleteText(value);

      if (
        text.includes("breakfast") ||
        text.includes("sarapan") ||
        text === "pagi"
      ) {
        return "breakfast";
      }

      if (text.includes("lunch") || text.includes("siang")) {
        return "lunch";
      }

      if (text.includes("dinner") || text.includes("malam")) {
        return "dinner";
      }

      if (text.includes("snack") || text.includes("camilan")) {
        return "snack";
      }

      return text;
    }

    function rowRaw(row: any) {
      const raw = row?.raw_payload;

      if (raw && typeof raw === "object") return raw;

      if (typeof raw === "string") {
        try {
          return JSON.parse(raw);
        } catch {
          return {};
        }
      }

      return {};
    }

    function rowSubmissionId(row: any) {
      const raw = rowRaw(row);

      return clean(
        row?.submission_id ||
          row?.submissionId ||
          raw?.submission_id ||
          raw?.submissionId ||
          raw?.google_sheet?.submission_id ||
          raw?.google_sheet?.submissionId,
      );
    }

    function rowSheetNumber(row: any) {
      const raw = rowRaw(row);

      return pointNumber(
        row?.google_sheet_row_number ||
          row?.sheet_row_number ||
          row?.row_number ||
          row?._rowNumber ||
          raw?._rowNumber ||
          raw?.google_sheet?.rowNumber ||
          raw?.google_sheet?.row_number,
      );
    }

    function rowDate(row: any) {
      return safeIsoDate(
        row?.log_date ||
          row?.date ||
          row?.created_at ||
          row?.updated_at,
      );
    }

    function rowMeal(row: any) {
      return normalizedMeal(
        row?.meal_type || row?.meal_time || row?.category,
      );
    }

    function rowTitle(row: any) {
      const raw = rowRaw(row);

      return normalizedDeleteText(
        row?.food_name ||
          row?.meal_text ||
          row?.detected_foods ||
          raw?.["Add Options"],
      );
    }

    function rowCalories(row: any) {
      const raw = rowRaw(row);

      return pointNumber(
        row?.calories ??
          row?.total_calories ??
          row?.estimated_calories ??
          raw?.["Kalori Makanan"],
      );
    }

    function sameFoodTitle(left: string, right: string) {
      if (!left || !right) return true;

      return (
        left === right ||
        left.includes(right) ||
        right.includes(left)
      );
    }

    function strictMatch(row: any) {
      if (rowDate(row) !== requestedDate) return false;

      const candidateMeal = rowMeal(row);
      const wantedMeal = normalizedMeal(requestedMeal);

      if (
        wantedMeal &&
        candidateMeal &&
        wantedMeal !== candidateMeal
      ) {
        return false;
      }

      const candidateCalories = rowCalories(row);

      if (
        requestedCalories > 0 &&
        candidateCalories > 0 &&
        Math.abs(requestedCalories - candidateCalories) > 1
      ) {
        return false;
      }

      return sameFoodTitle(
        normalizedDeleteText(requestedTitle),
        rowTitle(row),
      );
    }

    const mirrorsResult = await supabase
      .from("wellness_food_logs")
      .select("*")
      .eq("participant_id", Number(participant.id))
      .limit(2000);

    if (mirrorsResult.error) throw mirrorsResult.error;

    const mirrors = mirrorsResult.data || [];
    const requestedMirror =
      mirrors.find(
        (row: any) =>
          requestedMirrorId > 0 &&
          Number(row?.id) === requestedMirrorId,
      ) || null;

    const resolvedSubmissionId =
      requestedSubmissionId || rowSubmissionId(requestedMirror);
    const resolvedSheetRow =
      requestedSheetRow || rowSheetNumber(requestedMirror);
    const shouldDeleteSheet =
      requestedSource.includes("google_sheet") ||
      Boolean(resolvedSubmissionId) ||
      resolvedSheetRow > 0;

    let sheetDeleteResult: any = {
      ok: true,
      deleted: false,
      skipped: true,
      message: "Tidak ada pasangan Google Sheet pada data ini.",
    };

    if (shouldDeleteSheet) {
      sheetDeleteResult = await postToWebhook({
        action: "deleteSubmission",
        sheet: getSheetName(),
        submissionId: resolvedSubmissionId,
        submission_id: resolvedSubmissionId,
        rowNumber: resolvedSheetRow || null,
        row_number: resolvedSheetRow || null,
        participantId: Number(participant.id),
        participant_id: Number(participant.id),
        logType: "nutrition",
        log_type: "nutrition",
        logDate: requestedDate,
        log_date: requestedDate,
        mealType: requestedMeal,
        meal_type: requestedMeal,
        foodName: requestedTitle,
        food_name: requestedTitle,
        title: requestedTitle,
        calories: requestedCalories,
        expectedCalories: requestedCalories,
        marker:
          "WELLNESS_MOBILE_UPLOAD_LOCAL_DATE_SAFE_DELETE_GOOGLE_FIT_V126M2",
      });

      if (sheetDeleteResult?.deleted !== true) {
        return NextResponse.json(
          {
            ok: false,
            deleted: false,
            deleted_any: false,
            marker:
              "WELLNESS_MOBILE_UPLOAD_LOCAL_DATE_SAFE_DELETE_GOOGLE_FIT_V126M2",
            message:
              sheetDeleteResult?.message ||
              "Data Google Sheet tidak ditemukan sehingga belum dihapus.",
            google_sheet: sheetDeleteResult,
          },
          { status: 409 },
        );
      }
    }

    const mirrorIds = mirrors
      .filter((row: any) => {
        if (
          requestedMirrorId > 0 &&
          Number(row?.id) === requestedMirrorId
        ) {
          return true;
        }

        if (
          resolvedSubmissionId &&
          rowSubmissionId(row) === resolvedSubmissionId
        ) {
          return true;
        }

        if (
          resolvedSheetRow > 0 &&
          rowSheetNumber(row) === resolvedSheetRow &&
          strictMatch(row)
        ) {
          return true;
        }

        return !resolvedSubmissionId && strictMatch(row);
      })
      .map((row: any) => Number(row?.id))
      .filter((id: number) => id > 0);

    const uniqueMirrorIds = Array.from(new Set(mirrorIds));

    if (uniqueMirrorIds.length > 0) {
      const deletedMirrors = await supabase
        .from("wellness_food_logs")
        .delete()
        .in("id", uniqueMirrorIds);

      if (deletedMirrors.error) throw deletedMirrors.error;
    }

    if (resolvedSubmissionId) {
      const deletedInputPoint = await supabase
        .from("wellness_point_logs")
        .delete()
        .eq("participant_id", Number(participant.id))
        .eq(
          "point_key",
          `nutrition_input_${resolvedSubmissionId}`,
        );

      if (deletedInputPoint.error) throw deletedInputPoint.error;
    }

    if (resolvedSheetRow > 0) {
      const deletedRowPoint = await supabase
        .from("wellness_point_logs")
        .delete()
        .eq("participant_id", Number(participant.id))
        .eq("source_type", "nutrition_google_sheet")
        .eq("source_id", resolvedSheetRow);

      if (deletedRowPoint.error) throw deletedRowPoint.error;
    }

    let bonusResult: any = null;

    try {
      const targets = await resolveParticipantPointTargets(
        supabase,
        participant,
      );
      const refreshedSheet = await fetchWellnessGoogleSheetRows({
        participantId: participant.id,
        code: participant.code,
        logType: "nutrition",
        limit: 10000,
      });
      const remainingFoods = googleSheetRowsToFoodLogs(
        refreshedSheet?.rows || [],
      ).filter((row: any) => {
        const sameId =
          pointNumber(row?.participant_id) ===
          pointNumber(participant.id);
        const sameCode =
          clean(participant.code) &&
          clean(row?.participant_code) ===
            clean(participant.code);

        return (
          (sameId || Boolean(sameCode)) &&
          safeIsoDate(
            row?.log_date || row?.created_at,
          ) === requestedDate
        );
      });
      const totalCalories = remainingFoods.reduce(
        (sum: number, row: any) =>
          sum +
          pointNumber(
            row?.total_calories ??
              row?.calories ??
              row?.estimated_calories ??
              row?.raw_payload?.["Kalori Makanan"],
          ),
        0,
      );
      const bonusPoints = nutritionDailyBonusPoints({
        totalCalories,
        calorieLimit: targets.nutrition,
        hasNutritionInput: remainingFoods.length > 0,
      });

      bonusResult = await setDailyPoint({
        supabase,
        participant,
        logDate: requestedDate,
        pointKey: "nutrition_daily_bonus",
        sourceType: "nutrition_daily_bonus",
        sourceId: null,
        points: bonusPoints,
        description:
          remainingFoods.length > 0
            ? `Rekalkulasi bonus nutrisi (${Math.round(
                totalCalories,
              )}/${Math.round(targets.nutrition)} kkal)`
            : "Bonus nutrisi dihapus karena tidak ada input nutrisi.",
      });
    } catch (bonusError: any) {
      bonusResult = {
        ok: false,
        warning:
          bonusError?.message ||
          "Poin bonus nutrisi belum berhasil dihitung ulang.",
      };
    }

    const deletedAny =
      sheetDeleteResult?.deleted === true ||
      uniqueMirrorIds.length > 0;

    if (!deletedAny) {
      return NextResponse.json(
        {
          ok: false,
          deleted: false,
          deleted_any: false,
          message: "Tidak ada data yang berhasil dihapus.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      deleted: true,
      deleted_any: true,
      marker:
        "WELLNESS_MOBILE_UPLOAD_LOCAL_DATE_SAFE_DELETE_GOOGLE_FIT_V126M2",
      message:
        "Riwayat nutrisi berhasil dihapus dari sumber yang terhubung.",
      requested_source: requestedSource || null,
      submission_id: resolvedSubmissionId || null,
      google_sheet_row_number: resolvedSheetRow || null,
      deleted_mirror_rows: uniqueMirrorIds.length,
      google_sheet: sheetDeleteResult,
      nutrition_daily_bonus: bonusResult,
    });
  } catch (error: any) {
    console.error(
      "WELLNESS_MOBILE_UPLOAD_LOCAL_DATE_SAFE_DELETE_GOOGLE_FIT_V126M2_ERROR",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        deleted: false,
        deleted_any: false,
        message:
          error?.message ||
          "Gagal menghapus riwayat nutrisi.",
      },
      { status: 500 },
    );
  }
}



// WELLNESS_HISTORY_EDIT_FOLLOWS_DELETE_V126M6
// WELLNESS_NUTRITION_EDIT_MATCH_INPUT_FORM_V126M7
export async function PATCH(req: NextRequest) {
  const { supabase, participant } =
    await getParticipant(req);

  if (!participant?.id) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "OTP/session peserta belum aktif.",
      },
      { status: 401 },
    );
  }

  try {
    assertWebhookConfigured();

    const { body, photo } =
      await parseRequestBody(req);
    const submissionId = clean(
      body?.submission_id ||
        body?.submissionId,
    );
    const rowNumber = Number(
      body?.google_sheet_row_number ||
        body?.row_number ||
        0,
    );
    const requestedLogDate = clean(
      body?.log_date ||
        body?.logDate,
    );
    const logDate = requestedLogDate
      ? safeIsoDate(requestedLogDate)
      : "";
    const mealType = clean(
      body?.meal_type ||
        body?.mealType,
    );
    const foodName = clean(
      body?.food_name ||
        body?.foodName ||
        body?.title,
    );
    const portion = clean(
      body?.portion ||
        body?.porsi,
    );
    const notes = clean(
      body?.notes ||
        body?.catatan,
    );
    const expectedLogDateText = clean(
      body?.expected_log_date ||
        body?.expectedLogDate,
    );
    const expectedLogDate =
      expectedLogDateText
        ? safeIsoDate(
            expectedLogDateText,
          )
        : "";
    const expectedMealType = clean(
      body?.expected_meal_type ||
        body?.expectedMealType,
    );
    const expectedFoodName = clean(
      body?.expected_food_name ||
        body?.expectedFoodName,
    );
    const expectedCalories =
      toNumberOrNull(
        body?.expected_calories ??
          body?.expectedCalories,
      );

    if (
      !submissionId &&
      (
        !Number.isFinite(rowNumber) ||
        rowNumber < 2
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Submission ID atau nomor row Google Sheet wajib tersedia.",
        },
        { status: 400 },
      );
    }

    if (
      !logDate ||
      !mealType ||
      !foodName
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Tanggal, waktu makan, dan nama makanan wajib diisi.",
        },
        { status: 400 },
      );
    }

    let calorieResult =
      await calculateMultiFoodCalories(
        supabase,
        foodName,
      );

    calorieResult =
      applySubmittedEstimateToCalorieResultV45(
        calorieResult,
        body,
      );

    const calories =
      toNumberOrNull(
        calorieResult?.total_calories,
      ) ?? 0;
    const detectedFoods = clean(
      calorieResult?.detected_foods_text ||
        calorieResult?.original_food_name ||
        foodName,
    );

    const companyName =
      clean(
        participant?.company ||
          participant?.company_name ||
          body?.company ||
          body?.company_name,
      ) || "Tanpa Perusahaan";

    let photoResult: any = null;
    let photoWarning = "";

    if (photo) {
      try {
        photoResult = await uploadNutritionPhoto({
          photo,
          participant,
          companyName,
          logDate,
        });
      } catch (photoError: any) {
        // WELLNESS_STABLE_DELIVERY_V126M17
        photoWarning =
          publicNutritionErrorV126M2(photoError) ||
          "Foto belum berhasil diunggah. Perubahan data tanpa foto tetap diproses.";
      }
    }

    const previewUrl = clean(
      photoResult?.previewUrl ||
        photoResult?.thumbnailUrl ||
        photoResult?.publicUrl ||
        photoResult?.driveUrl,
    );
    const driveUrl = clean(
      photoResult?.driveUrl ||
        photoResult?.publicUrl,
    );

    // WELLNESS_NUTRITION_EDIT_SYNC_V126M16_1
    // Editing a nutrition entry must update both visible date columns.
    // Submission Date keeps the selected operational date and current WIB time;
    // Log Date keeps the selected YYYY-MM-DD value.
    const updates: Record<string, any> = {
      "Submission Date":
        jakartaSubmissionTimestampForLogDateV126M15(logDate),
      "Log Date": logDate,
      "Waktu Makan":
        mealLabel(mealType),
      "Add Options":
        [foodName, portion]
          .filter(Boolean)
          .join(" - "),
      "Catatan Nutrisi": notes,
      "Kalori Makanan": calories,
      "Detected Foods":
        detectedFoods,
    };

    const allowedHeaders = [
      "Submission Date",
      "Log Date",
      "Waktu Makan",
      "Add Options",
      "Catatan Nutrisi",
      "Kalori Makanan",
      "Detected Foods",
    ];

    if (photoResult) {
      updates[
        "Upload Foto Makanan"
      ] = driveUrl;
      updates[
        "Preview Foto Makanan"
      ] = previewUrl;
      updates["Evidence Count"] =
        driveUrl || previewUrl
          ? 1
          : 0;

      allowedHeaders.push(
        "Upload Foto Makanan",
        "Preview Foto Makanan",
        "Evidence Count",
      );
    }

    const result =
      await postToWebhook(
        {
          action:
            "updateSubmissionV126M6",
        sheet: getSheetName(),
        submissionId,
        submission_id:
          submissionId,
        rowNumber,
        row_number: rowNumber,
        participantId:
          Number(participant.id),
        participant_id:
          Number(participant.id),
        participantCode:
          clean(participant?.code),
        participant_code:
          clean(participant?.code),
        logType: "nutrition",
        log_type: "nutrition",
        updates,
        allowedHeaders,
        expected: {
          logDate:
            expectedLogDate,
          mealType:
            expectedMealType,
          title:
            expectedFoodName,
          calories:
            expectedCalories,
        },
          marker:
            "WELLNESS_NUTRITION_EDIT_MATCH_INPUT_FORM_V126M7",
        },
        {
          attempts: 4,
          timeoutMs: 20000,
          requestId:
            submissionId ||
            `nutrition-edit-${participant.id}-${rowNumber}`,
          label: "nutrition_update",
        },
      );

    if (result?.updated !== true) {
      return NextResponse.json(
        {
          ok: false,
          message:
            result?.message ||
            "Data nutrisi belum berhasil diperbarui.",
          google_sheet:
            result,
        },
        { status: 409 },
      );
    }

    if (
      result?.marker !== "WELLNESS_STABLE_DELIVERY_V126M17" &&
      result?.marker !== "WELLNESS_NUTRITION_EDIT_SYNC_V126M16_1"
    ) {
      return NextResponse.json(
        {
          ok: false,
          updated: false,
          message:
            "Google Apps Script belum menggunakan versi edit yang kompatibel. " +
            "Deploy full Apps Script V126M17 sebagai versi Web App baru.",
          google_sheet: result,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      updated: true,
      calories,
      photo_updated:
        Boolean(photoResult),
      photo_warning:
        photoWarning || null,
      message:
        photoWarning
          ? "Data nutrisi berhasil diperbarui. Foto belum berhasil diunggah."
          : "Data nutrisi berhasil diperbarui di Google Sheet.",
      google_sheet: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        message:
          publicNutritionErrorV126M2(
            error,
          ),
      },
      { status: 500 },
    );
  }
}
