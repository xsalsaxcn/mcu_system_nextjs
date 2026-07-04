import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

// WELLNESS_HEALTH_CONNECT_PUSH_RECEIVER_V421
// Receiver Health Connect:
// - Menerima data dari Android companion app.
// - Menyimpan daily aggregate ke wellness_activity_logs.
// - Menyimpan workout/session detail ke wellness_activity_logs.
// - Source = health_connect.
// - Tidak mengganggu Google Fit.
// - Tidak butuh Strava API/subscription.

function clean(value: any) {
  return String(value ?? "").trim();
}

function num(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateOnly(value: any) {
  const text = clean(value);
  if (!text) return "";
  return text.slice(0, 10);
}

function todayJakarta() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((item) => item.type === "year")?.value || "";
  const month = parts.find((item) => item.type === "month")?.value || "";
  const day = parts.find((item) => item.type === "day")?.value || "";

  if (!year || !month || !day) return new Date().toISOString().slice(0, 10);

  return `${year}-${month}-${day}`;
}

function normalizeDate(value: any) {
  return dateOnly(value) || todayJakarta();
}

function normalizeStartedAt(value: any, date: string) {
  const text = clean(value);
  if (text) return text;
  return `${date}T00:00:00+07:00`;
}

function activityTypeLabel(value: any) {
  const text = clean(value);
  if (!text) return "Health Connect";

  const lower = text.toLowerCase();

  if (lower.includes("run")) return "Running";
  if (lower.includes("walk")) return "Walking";
  if (lower.includes("bike") || lower.includes("cycle")) return "Cycling";
  if (lower.includes("swim")) return "Swimming";
  if (lower.includes("strength")) return "Strength Training";
  if (lower.includes("yoga")) return "Yoga";
  if (lower.includes("workout") || lower.includes("exercise")) return "Workout";

  return text;
}

async function findParticipant(supabase: any, req: NextRequest, body: any) {
  const sessionParticipant = await getParticipantFromPortalSession(
    supabase,
    req
  ).catch(() => null);

  if (sessionParticipant?.id) return sessionParticipant;

  const expectedSecret = clean(process.env.HEALTH_CONNECT_PUSH_SECRET);
  const suppliedSecret = clean(req.headers.get("x-health-connect-secret"));

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return null;
  }

  const participantId = num(body?.participant_id);
  const code = clean(body?.participant_code || body?.code || body?.employee_code);

  if (participantId) {
    const { data } = await supabase
      .from("wellness_participants")
      .select("*")
      .eq("id", participantId)
      .maybeSingle();

    if (data?.id) return data;
  }

  if (code) {
    const { data } = await supabase
      .from("wellness_participants")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (data?.id) return data;
  }

  return null;
}

async function saveActivityLog(supabase: any, payload: any) {
  const participantId = Number(payload.participant_id);
  const externalId = clean(payload.external_activity_id);

  if (!participantId || !externalId) {
    return { skipped: true, reason: "PARTICIPANT_OR_EXTERNAL_ID_MISSING" };
  }

  const { data: existing, error: existingError } = await supabase
    .from("wellness_activity_logs")
    .select("id")
    .eq("participant_id", participantId)
    .eq("source", "health_connect")
    .eq("external_activity_id", externalId)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    const { error } = await supabase
      .from("wellness_activity_logs")
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) throw error;

    return { updated: true };
  }

  const { error } = await supabase
    .from("wellness_activity_logs")
    .insert(payload);

  if (error) throw error;

  return { inserted: true };
}

async function upsertIntegration(supabase: any, participantId: number, body: any) {
  const nowIso = new Date().toISOString();

  const providerUserId =
    clean(body?.device_id) ||
    clean(body?.android_id) ||
    clean(body?.user_id) ||
    `participant_${participantId}`;

  const rawPayload = {
    marker: "WELLNESS_HEALTH_CONNECT_PUSH_RECEIVER_V421",
    device_id: body?.device_id || null,
    android_id: body?.android_id || null,
    app_version: body?.app_version || null,
    synced_at: nowIso,
    permissions: body?.permissions || null,
    source: "health_connect",
  };

  const { data: existing, error: existingError } = await supabase
    .from("wellness_integrations")
    .select("id")
    .eq("participant_id", participantId)
    .eq("provider", "health_connect")
    .maybeSingle();

  if (existingError) throw existingError;

  const payload: any = {
    participant_id: participantId,
    provider: "health_connect",
    provider_user_id: providerUserId,
    scope: "steps,exercise,distance,calories",
    is_active: 1,
    updated_at: nowIso,
    raw_payload: rawPayload,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("wellness_integrations")
      .update(payload)
      .eq("id", existing.id);

    if (error) throw error;

    return;
  }

  const { error } = await supabase.from("wellness_integrations").insert({
    ...payload,
    connected_at: nowIso,
  });

  if (error) throw error;
}

async function handlePush(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json().catch(() => ({}));

  const participant = await findParticipant(supabase, req, body);

  if (!participant?.id) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Participant tidak ditemukan atau akses Health Connect tidak valid.",
      },
      { status: 401 }
    );
  }

  const participantId = Number(participant.id);
  const date = normalizeDate(body?.date || body?.log_date);
  const nowIso = new Date().toISOString();

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const steps = num(body?.steps ?? body?.total_steps);

  const calories = num(
    body?.calories ??
      body?.active_calories ??
      body?.calories_burned ??
      body?.total_calories
  );

  const activeMinutes = num(
    body?.active_minutes ??
      body?.duration_minutes ??
      body?.exercise_minutes
  );

  const distanceKm = num(body?.distance_km);

  const hasDailyData =
    steps !== null ||
    calories !== null ||
    activeMinutes !== null ||
    distanceKm !== null;

  if (hasDailyData) {
    const dailyPayload: any = {
      participant_id: participantId,
      source: "health_connect",
      external_activity_id: `health_connect_daily_${participantId}_${date}`,
      activity_type: "Health Connect",
      activity_name: "Health Connect Daily",
      log_date: date,
      started_at: normalizeStartedAt(body?.started_at, date),
      duration_minutes: activeMinutes,
      calories,
      distance_km: distanceKm,
      raw_payload: {
        marker: "WELLNESS_HEALTH_CONNECT_PUSH_RECEIVER_V421",
        provider: "health_connect",
        sync_mode: "daily_aggregate",
        health_connect_steps: steps,
        health_connect_active_minutes: activeMinutes,
        health_connect_calories: calories,
        health_connect_distance_km: distanceKm,
        health_connect_last_sync_at: nowIso,
        original_payload: body,
      },
    };

    const result = await saveActivityLog(supabase, dailyPayload);

    if (result.inserted) inserted += 1;
    else if (result.updated) updated += 1;
    else skipped += 1;
  }

  const workouts = Array.isArray(body?.workouts)
    ? body.workouts
    : Array.isArray(body?.exercises)
      ? body.exercises
      : [];

  for (const workout of workouts) {
    const workoutDate = normalizeDate(
      workout?.date ||
        workout?.log_date ||
        workout?.start_time ||
        workout?.started_at
    );

    const externalId =
      clean(workout?.id || workout?.uid || workout?.external_id) ||
      `health_connect_workout_${participantId}_${workoutDate}_${clean(
        workout?.start_time || workout?.started_at || workout?.activity_type || ""
      ).replace(/\W+/g, "_")}`;

    const duration = num(
      workout?.duration_minutes ??
        workout?.active_minutes ??
        workout?.exercise_minutes
    );

    const workoutCalories = num(
      workout?.calories ??
        workout?.active_calories ??
        workout?.calories_burned
    );

    const workoutDistance = num(workout?.distance_km);
    const workoutSteps = num(workout?.steps);

    const payload: any = {
      participant_id: participantId,
      source: "health_connect",
      external_activity_id: externalId,
      activity_type: activityTypeLabel(workout?.activity_type || workout?.type),
      activity_name:
        clean(workout?.activity_name || workout?.name) ||
        activityTypeLabel(workout?.activity_type || workout?.type),
      log_date: workoutDate,
      started_at: normalizeStartedAt(
        workout?.started_at || workout?.start_time,
        workoutDate
      ),
      duration_minutes: duration,
      calories: workoutCalories,
      distance_km: workoutDistance,
      raw_payload: {
        marker: "WELLNESS_HEALTH_CONNECT_PUSH_RECEIVER_V421",
        provider: "health_connect",
        sync_mode: "exercise_session",
        health_connect_steps: workoutSteps,
        health_connect_active_minutes: duration,
        health_connect_calories: workoutCalories,
        health_connect_distance_km: workoutDistance,
        health_connect_last_sync_at: nowIso,
        original_payload: workout,
      },
    };

    const result = await saveActivityLog(supabase, payload);

    if (result.inserted) inserted += 1;
    else if (result.updated) updated += 1;
    else skipped += 1;
  }

  await upsertIntegration(supabase, participantId, body);

  return NextResponse.json({
    ok: true,
    marker: "WELLNESS_HEALTH_CONNECT_PUSH_RECEIVER_V421",
    participant_id: participantId,
    date,
    inserted,
    updated,
    skipped,
    message: `Health Connect diterima. ${inserted} baru, ${updated} update, ${skipped} skip.`,
  });
}

export async function POST(req: NextRequest) {
  return handlePush(req);
}