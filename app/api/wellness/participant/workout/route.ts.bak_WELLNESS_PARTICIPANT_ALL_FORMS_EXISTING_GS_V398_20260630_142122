import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

// WELLNESS_PARTICIPANT_AUTO_WORKOUT_API_V395
// Manual workout input for participant portal.
// V395:
// - participant does not input calories manually
// - calories are calculated using wellness_activity_calories master KaloriOlahraga when available
// - fallback uses MET-style estimate with participant weight/default 70 kg

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

function normalizeText(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getParticipant(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const participant = await getParticipantFromPortalSession(supabase, req);

  return { supabase, participant };
}

function fallbackMet(activityType: string) {
  const type = normalizeText(activityType);

  if (type.includes("run")) return 9.8;
  if (type.includes("jog")) return 7.0;
  if (type.includes("walk") || type.includes("jalan")) return 3.5;
  if (type.includes("cycl") || type.includes("bike") || type.includes("sepeda")) return 7.5;
  if (type.includes("swim") || type.includes("renang")) return 8.0;
  if (type.includes("strength") || type.includes("gym") || type.includes("angkat")) return 5.0;
  if (type.includes("yoga")) return 3.0;

  return 5.0;
}

function getWeightFromParticipant(participant: any) {
  const candidateKeys = [
    "weight_kg",
    "baseline_weight_kg",
    "initial_weight_kg",
    "latest_weight_kg",
    "body_weight",
    "weight",
    "bb",
    "berat_badan",
  ];

  for (const key of candidateKeys) {
    const value = toNumberOrNull(participant?.[key]);
    if (value && value > 0) return value;
  }

  return null;
}

async function getLatestWeightKg(supabase: any, participant: any) {
  const fromParticipant = getWeightFromParticipant(participant);
  if (fromParticipant) return fromParticipant;

  const { data } = await supabase
    .from("wellness_weight_logs")
    .select("*")
    .eq("participant_id", participant.id)
    .order("log_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const fromLog = getWeightFromParticipant(data);
  if (fromLog) return fromLog;

  return 70;
}

async function findActivityReference(supabase: any, activityType: string, activityName: string) {
  const wantedType = normalizeText(activityType);
  const wantedName = normalizeText(activityName);
  const wanted = wantedName || wantedType;

  const { data, error } = await supabase
    .from("wellness_activity_calories")
    .select("id,activity_name,met,calories_per_km,unit,category")
    .limit(1000);

  if (error) throw error;

  const rows = data || [];
  if (!wanted) return null;

  const exact = rows.find((row: any) => normalizeText(row.activity_name) === wanted);
  if (exact) return { ...exact, match_status: "exact_activity_name" };

  const exactType = rows.find((row: any) => normalizeText(row.activity_name) === wantedType);
  if (exactType) return { ...exactType, match_status: "exact_activity_type" };

  const partial = rows.find((row: any) => {
    const name = normalizeText(row.activity_name);
    return name && (name.includes(wanted) || wanted.includes(name));
  });
  if (partial) return { ...partial, match_status: "partial_activity_name" };

  const partialType = rows.find((row: any) => {
    const name = normalizeText(row.activity_name);
    return name && (name.includes(wantedType) || wantedType.includes(name));
  });
  if (partialType) return { ...partialType, match_status: "partial_activity_type" };

  return null;
}

function calculateCalories(params: {
  activityType: string;
  activityName: string;
  durationMinutes: number;
  distanceKm: number | null;
  weightKg: number;
  activityRef: any;
}) {
  const { activityType, durationMinutes, distanceKm, weightKg, activityRef } = params;

  const caloriesPerKm = toNumberOrNull(activityRef?.calories_per_km);
  if (caloriesPerKm && distanceKm && distanceKm > 0) {
    return {
      calories: Math.round(caloriesPerKm * distanceKm),
      method: "master_calories_per_km",
      met: null,
      calories_per_km: caloriesPerKm,
    };
  }

  const met = toNumberOrNull(activityRef?.met) || fallbackMet(activityType);
  const calories = Math.round((met * 3.5 * weightKg * durationMinutes) / 200);

  return {
    calories,
    method: activityRef?.met ? "master_met" : "fallback_met",
    met,
    calories_per_km: caloriesPerKm || null,
  };
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

  try {
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
    const distanceKm = toNumberOrNull(body?.distance_km);
    const steps = toNumberOrNull(body?.steps);

    const weightKg = await getLatestWeightKg(supabase, participant);
    const activityRef = await findActivityReference(supabase, activityType, activityName);
    const calculated = calculateCalories({
      activityType,
      activityName,
      durationMinutes,
      distanceKm,
      weightKg,
      activityRef,
    });

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
      calories: calculated.calories,
      distance_km: distanceKm,
      steps,
      raw_payload: {
        ...body,
        notes: clean(body?.notes) || null,
        participant_weight_kg_used: weightKg,
        activity_reference_id: activityRef?.id || null,
        activity_reference_name: activityRef?.activity_name || null,
        calorie_method: calculated.method,
        met_used: calculated.met,
        calories_per_km_used: calculated.calories_per_km,
        calorie_match_status: activityRef?.match_status || "not_found",
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
      message: `Workout berhasil disimpan. Kalori otomatis: ${calculated.calories} kkal.`,
      log: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal menyimpan workout." },
      { status: 500 }
    );
  }
}
