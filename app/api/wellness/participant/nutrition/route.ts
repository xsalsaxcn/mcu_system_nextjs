import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

// WELLNESS_PARTICIPANT_AUTO_NUTRITION_API_V395
// GET/POST nutrition logs for participant portal.
// V395:
// - participant does not input calorie/macros manually
// - calories are matched from wellness_food_calories master KaloriData
// - optional food photo is uploaded to Supabase Storage bucket wellness-nutrition-photos

export const runtime = "nodejs";

const FOOD_PHOTO_BUCKET = "wellness-nutrition-photos";

function clean(value: any) {
  return String(value ?? "").trim();
}

function toNumberOrNull(value: any) {
  const text = clean(value);
  if (!text) return null;

  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeText(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitAliases(value: any) {
  return clean(value)
    .split(/[,;|]/g)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function safeExtension(fileName: string, fallback = "jpg") {
  const ext = clean(fileName).split(".").pop()?.toLowerCase() || fallback;
  if (!/^[a-z0-9]{2,5}$/.test(ext)) return fallback;
  return ext;
}

async function getParticipant(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const participant = await getParticipantFromPortalSession(supabase, req);

  return { supabase, participant };
}

async function findFoodReference(supabase: any, foodName: string) {
  const wanted = normalizeText(foodName);
  if (!wanted) return null;

  const { data, error } = await supabase
    .from("wellness_food_calories")
    .select("id,food_name,calories,category,aliases,is_active")
    .eq("is_active", 1)
    .limit(2000);

  if (error) throw error;

  const foods = data || [];

  const exact = foods.find((food: any) => normalizeText(food.food_name) === wanted);
  if (exact) return { ...exact, match_status: "exact_food_name" };

  const aliasMatch = foods.find((food: any) =>
    splitAliases(food.aliases).some((alias) => alias === wanted)
  );
  if (aliasMatch) return { ...aliasMatch, match_status: "exact_alias" };

  const contains = foods.find((food: any) => {
    const name = normalizeText(food.food_name);
    if (!name) return false;
    return name.includes(wanted) || wanted.includes(name);
  });
  if (contains) return { ...contains, match_status: "partial_food_name" };

  const aliasContains = foods.find((food: any) =>
    splitAliases(food.aliases).some(
      (alias) => alias.includes(wanted) || wanted.includes(alias)
    )
  );
  if (aliasContains) return { ...aliasContains, match_status: "partial_alias" };

  return null;
}

async function ensureNutritionPhotoBucket(supabase: any) {
  const { data } = await supabase.storage.getBucket(FOOD_PHOTO_BUCKET);
  if (data?.name) return;

  const { error } = await supabase.storage.createBucket(FOOD_PHOTO_BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  });

  if (error && !String(error.message || "").toLowerCase().includes("already exists")) {
    throw error;
  }
}

async function uploadFoodPhoto(params: {
  supabase: any;
  participantId: number;
  file: File | null;
  logDate: string;
}) {
  const { supabase, participantId, file, logDate } = params;
  if (!file) return { photo_url: null, photo_path: null };

  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("File foto makanan harus berupa gambar.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Ukuran foto makanan maksimal 5 MB.");
  }

  await ensureNutritionPhotoBucket(supabase);

  const ext = safeExtension(file.name);
  const path = `${participantId}/${logDate}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(FOOD_PHOTO_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(FOOD_PHOTO_BUCKET).getPublicUrl(path);

  return {
    photo_url: data?.publicUrl || null,
    photo_path: path,
  };
}

async function readBody(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    return {
      body: {
        log_date: form.get("log_date"),
        meal_type: form.get("meal_type"),
        food_name: form.get("food_name"),
        portion: form.get("portion"),
        notes: form.get("notes"),
      },
      photo: form.get("photo") instanceof File ? (form.get("photo") as File) : null,
    };
  }

  const body = await req.json().catch(() => ({}));
  return { body, photo: null };
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
    const { body, photo } = await readBody(req);

    const foodName = clean(body?.food_name);
    if (!foodName) {
      return NextResponse.json(
        { ok: false, message: "Nama makanan wajib diisi." },
        { status: 400 }
      );
    }

    const logDate = clean(body?.log_date) || todayDate();
    const foodRef = await findFoodReference(supabase, foodName);
    const calories = foodRef ? toNumberOrNull(foodRef.calories) : null;

    const uploaded = await uploadFoodPhoto({
      supabase,
      participantId: Number(participant.id),
      file: photo,
      logDate,
    });

    const payload: any = {
      participant_id: Number(participant.id),
      log_date: logDate,
      meal_type: clean(body?.meal_type) || "meal",
      food_name: foodName,
      portion: clean(body?.portion) || null,
      calories,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      notes: clean(body?.notes) || null,
      source: "participant",
      photo_url: uploaded.photo_url,
      photo_path: uploaded.photo_path,
      calorie_source: foodRef ? "master_kaloridata" : "not_matched",
      calorie_reference_id: foodRef?.id || null,
      calorie_match_status: foodRef?.match_status || "not_found",
      raw_payload: {
        food_name_input: foodName,
        matched_food_name: foodRef?.food_name || null,
        matched_category: foodRef?.category || null,
        matched_aliases: foodRef?.aliases || null,
        uploaded_photo: Boolean(uploaded.photo_url),
        saved_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("wellness_food_logs")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, message: "Gagal menyimpan nutrisi.", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: foodRef
        ? `Nutrisi berhasil disimpan. Kalori otomatis: ${calories ?? 0} kkal dari Master KaloriData.`
        : "Nutrisi berhasil disimpan, tetapi makanan belum ditemukan di Master KaloriData.",
      log: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal menyimpan nutrisi." },
      { status: 500 }
    );
  }
}
