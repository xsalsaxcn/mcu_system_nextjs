import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

// WELLNESS_STRAVA_SYNC_EXISTING_ACTIVITIES_V383
// Menarik existing activities dari akun Strava peserta yang sudah connected.

function clean(value: any) {
  return String(value ?? "").trim();
}

function num(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateOnly(value: any) {
  const text = clean(value);
  if (!text) return null;
  return text.slice(0, 10);
}

function estimateCalories(activity: any) {
  const type = clean(activity?.type || activity?.sport_type).toLowerCase();
  const minutes = num(activity?.moving_time)
    ? Number(activity.moving_time) / 60
    : num(activity?.elapsed_time)
      ? Number(activity.elapsed_time) / 60
      : 0;

  if (!minutes) return null;

  let kcalPerMinute = 5;

  if (type.includes("run")) kcalPerMinute = 10;
  else if (type.includes("walk")) kcalPerMinute = 4;
  else if (type.includes("ride") || type.includes("cycling") || type.includes("bike")) kcalPerMinute = 8;
  else if (type.includes("swim")) kcalPerMinute = 9;
  else if (type.includes("workout") || type.includes("training")) kcalPerMinute = 6;

  return Math.round(minutes * kcalPerMinute);
}

async function refreshStravaToken(integration: any) {
  const clientId = clean(process.env.STRAVA_CLIENT_ID);
  const clientSecret = clean(process.env.STRAVA_CLIENT_SECRET);
  const refreshToken = clean(integration?.refresh_token);

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("STRAVA_REFRESH_ENV_MISSING");
  }

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message || data?.error || "STRAVA_REFRESH_FAILED");
  }

  return data;
}

async function getValidAccessToken(supabase: any, integration: any) {
  const accessToken = clean(integration?.access_token);
  const expiresAt = integration?.expires_at ? new Date(integration.expires_at).getTime() : 0;
  const now = Date.now();

  if (accessToken && expiresAt && expiresAt > now + 60 * 1000) {
    return accessToken;
  }

  const refreshed = await refreshStravaToken(integration);

  const newExpiresAt = refreshed.expires_at
    ? new Date(Number(refreshed.expires_at) * 1000).toISOString()
    : null;

  await supabase
    .from("wellness_integrations")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || integration.refresh_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
      raw_payload: refreshed,
    })
    .eq("id", integration.id);

  return clean(refreshed.access_token);
}

async function fetchStravaActivities(accessToken: string) {
  // Ambil existing activity. after dibuat longgar supaya data lama juga ikut terbaca.
  const after = Math.floor(new Date("2020-01-01T00:00:00Z").getTime() / 1000);

  const url = new URL("https://www.strava.com/api/v3/athlete/activities");
  url.searchParams.set("after", String(after));
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", "1");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(data?.message || data?.error || "STRAVA_ACTIVITIES_FETCH_FAILED");
  }

  return Array.isArray(data) ? data : [];
}

async function saveActivity(supabase: any, participantId: number, activity: any) {
  const externalId = clean(activity?.id);
  if (!externalId) return { skipped: true, reason: "NO_EXTERNAL_ID" };

  const startedAt = clean(activity?.start_date || activity?.start_date_local);
  const logDate = dateOnly(activity?.start_date_local || activity?.start_date);
  const distanceKm = num(activity?.distance) ? Number(activity.distance) / 1000 : null;

  const durationMinutes = num(activity?.moving_time)
    ? Math.round((Number(activity.moving_time) / 60) * 10) / 10
    : num(activity?.elapsed_time)
      ? Math.round((Number(activity.elapsed_time) / 60) * 10) / 10
      : null;

  const calories =
    num(activity?.calories) ??
    num(activity?.kilojoules) ??
    estimateCalories(activity);

  const payload: any = {
    participant_id: participantId,
    source: "strava",
    external_activity_id: externalId,
    provider_activity_id: externalId,
    activity_type: clean(activity?.sport_type || activity?.type || "Strava"),
    activity_name: clean(activity?.name || activity?.sport_type || activity?.type || "Strava Activity"),
    log_date: logDate,
    started_at: startedAt || null,
    duration_minutes: durationMinutes,
    calories,
    distance_km: distanceKm,
    raw_payload: activity,
  };

  const { data: existing } = await supabase
    .from("wellness_activity_logs")
    .select("id")
    .eq("participant_id", participantId)
    .eq("source", "strava")
    .eq("external_activity_id", externalId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("wellness_activity_logs")
      .update(payload)
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

async function handleSync(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const participant = await getParticipantFromPortalSession(supabase, req);

  if (!participant?.id) {
    return NextResponse.json(
      { ok: false, message: "OTP/session peserta belum aktif." },
      { status: 401 }
    );
  }

  const { data: integration, error: integrationError } = await supabase
    .from("wellness_integrations")
    .select("*")
    .eq("participant_id", participant.id)
    .eq("provider", "strava")
    .eq("is_active", 1)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (integrationError) {
    return NextResponse.json(
      { ok: false, message: "Gagal membaca koneksi Strava.", detail: integrationError.message },
      { status: 500 }
    );
  }

  if (!integration?.id) {
    return NextResponse.json(
      { ok: false, message: "Strava belum connected untuk peserta ini." },
      { status: 400 }
    );
  }

  try {
    const accessToken = await getValidAccessToken(supabase, integration);
    const activities = await fetchStravaActivities(accessToken);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const activity of activities) {
      const result = await saveActivity(supabase, Number(participant.id), activity);

      if (result.inserted) inserted += 1;
      else if (result.updated) updated += 1;
      else skipped += 1;
    }

    await supabase
      .from("wellness_integrations")
      .update({
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    return NextResponse.json({
      ok: true,
      participant_id: participant.id,
      fetched: activities.length,
      inserted,
      updated,
      skipped,
      message:
        activities.length > 0
          ? "Sync Strava berhasil."
          : "Sync berhasil, tetapi akun Strava belum memiliki activity yang bisa ditarik.",
    });
  } catch (err: any) {
    console.error("STRAVA_SYNC_ERROR", err);

    return NextResponse.json(
      {
        ok: false,
        message: "Sync Strava gagal.",
        detail: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}