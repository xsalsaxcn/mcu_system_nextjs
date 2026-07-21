import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

// WELLNESS_PARTICIPANT_NUTRITION_API_V393
// GET/POST nutrition logs for participant portal.

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

async function getParticipant(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const participant = await getParticipantFromPortalSession(supabase, req);

  return { supabase, participant };
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

  const body = await req.json().catch(() => ({}));

  const foodName = clean(body?.food_name);
  if (!foodName) {
    return NextResponse.json(
      { ok: false, message: "Nama makanan wajib diisi." },
      { status: 400 }
    );
  }

  const payload: any = {
    participant_id: Number(participant.id),
    log_date: clean(body?.log_date) || todayDate(),
    meal_type: clean(body?.meal_type) || "meal",
    food_name: foodName,
    portion: clean(body?.portion) || null,
    calories: toNumberOrNull(body?.calories),
    protein_g: toNumberOrNull(body?.protein_g),
    carbs_g: toNumberOrNull(body?.carbs_g),
    fat_g: toNumberOrNull(body?.fat_g),
    notes: clean(body?.notes) || null,
    source: "manual",
    raw_payload: body || {},
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
    message: "Nutrisi berhasil disimpan.",
    log: data,
  });
}
