import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

// WELLNESS_PARTICIPANT_WORKOUT_API_V393
// Manual workout input for participant portal.

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

function isoFromLocal(value: any) {
  const text = clean(value);
  if (!text) return null;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function estimateCalories(activityType: string, durationMinutes: number | null) {
  if (!durationMinutes || durationMinutes <= 0) return null;

  const type = activityType.toLowerCase();
  let kcalPerMinute = 5;

  if (type.includes("run")) kcalPerMinute = 10;
  else if (type.includes("jog")) kcalPerMinute = 8;
  else if (type.includes("walk")) kcalPerMinute = 4;
  else if (type.includes("cycl") || type.includes("bike")) kcalPerMinute = 8;
  else if (type.includes("swim")) kcalPerMinute = 9;
  else if (type.includes("strength") || type.includes("gym")) kcalPerMinute = 6;
  else if (type.includes("yoga")) kcalPerMinute = 3;

  return Math.round(durationMinutes * kcalPerMinute);
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
    .from("wellness_activity_logs")
    .select("*")
    .eq("participant_id", participant.id)
    .eq("source", "manual")
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { ok: false, message: "Gagal membaca workout manual.", detail: error.message },
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

  const activityType = clean(body?.activity_type) || "Workout";
  const durationMinutes = toNumberOrNull(body?.duration_minutes);

  if (!durationMinutes || durationMinutes <= 0) {
    return NextResponse.json(
      { ok: false, message: "Durasi workout wajib diisi." },
      { status: 400 }
    );
  }

  const logDate = clean(body?.log_date) || todayDate();
  const startedAt = isoFromLocal(body?.started_at) || `${logDate}T00:00:00.000Z`;
  const activityName = clean(body?.activity_name) || activityType;
  const providedCalories = toNumberOrNull(body?.calories);
  const calories = providedCalories ?? estimateCalories(activityType, durationMinutes);

  const externalId = `manual_${participant.id}_${Date.now()}`;

  const payload: any = {
    participant_id: Number(participant.id),
    source: "manual",
    external_activity_id: externalId,
    provider_activity_id: externalId,
    activity_type: activityType,
    activity_name: activityName,
    log_date: logDate,
    started_at: startedAt,
    duration_minutes: durationMinutes,
    calories,
    distance_km: toNumberOrNull(body?.distance_km),
    raw_payload: {
      ...body,
      notes: clean(body?.notes) || null,
      estimated_calories: providedCalories === null,
      saved_at: new Date().toISOString(),
    },
  };

  const { data, error } = await supabase
    .from("wellness_activity_logs")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, message: "Gagal menyimpan workout.", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Workout berhasil disimpan.",
    log: data,
  });
}
