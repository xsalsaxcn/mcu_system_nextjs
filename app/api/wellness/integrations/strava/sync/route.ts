import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import { reconcileWorkoutDailyPoint } from "@/lib/wellness/pointWriter";

// WELLNESS_STRAVA_SYNC_SCOPE_DETAIL_FIX_V419
// Fix:
// - Cek scope sebelum request activities.
// - Kalau Forbidden/403, tampilkan detail jelas: perlu Reconnect Strava.
// - Refresh token tetap aman dan menyimpan refresh_token terbaru.
// - Tidak duplicate activity, update by participant + source + external_activity_id.
// - Tidak mengganggu Google Fit.

function clean(value: any) {
  return String(value ?? "").trim();
}

function num(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeScope(value: any) {
  return clean(value).replace(/\s+/g, ",");
}

function hasActivityReadScope(scope: any) {
  const normalized = `,${normalizeScope(scope)},`.toLowerCase();
  return (
    normalized.includes(",activity:read,") ||
    normalized.includes(",activity:read_all,")
  );
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
  else if (
    type.includes("ride") ||
    type.includes("cycling") ||
    type.includes("bike")
  ) {
    kcalPerMinute = 8;
  } else if (type.includes("swim")) kcalPerMinute = 9;
  else if (type.includes("workout") || type.includes("training")) {
    kcalPerMinute = 6;
  }

  return Math.round(minutes * kcalPerMinute);
}

function stravaErrorMessage(status: number, data: any) {
  const message =
    data?.message ||
    data?.error ||
    data?.errors?.[0]?.message ||
    `HTTP ${status}`;

  if (status === 401) {
    return "Strava token sudah tidak valid. Silakan Reconnect Strava.";
  }

  if (status === 403) {
    return "Strava menolak akses activity. Silakan Reconnect Strava dan pastikan izin activity dicentang.";
  }

  return `Strava error: ${message}`;
}

async function refreshStravaToken(supabase: any, integration: any) {
  const clientId = clean(process.env.STRAVA_CLIENT_ID);
  const clientSecret = clean(process.env.STRAVA_CLIENT_SECRET);
  const refreshToken = clean(integration?.refresh_token);

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "STRAVA_REFRESH_ENV_MISSING: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, atau refresh_token belum tersedia."
    );
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
    throw new Error(
      data?.message ||
        data?.error ||
        "STRAVA_REFRESH_FAILED: Silakan Reconnect Strava."
    );
  }

  const newExpiresAt = data.expires_at
    ? new Date(Number(data.expires_at) * 1000).toISOString()
    : null;

  await supabase
    .from("wellness_integrations")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token || integration.refresh_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
      raw_payload: {
        ...(integration.raw_payload || {}),
        marker: "WELLNESS_STRAVA_SYNC_SCOPE_DETAIL_FIX_V419_REFRESH",
        refreshed_at: new Date().toISOString(),
        expires_at: data.expires_at || null,
        token_type: data.token_type || null,
      },
    })
    .eq("id", integration.id);

  return {
    accessToken: clean(data.access_token),
    integration: {
      ...integration,
      access_token: data.access_token,
      refresh_token: data.refresh_token || integration.refresh_token,
      expires_at: newExpiresAt,
    },
  };
}

async function getValidAccessToken(supabase: any, integration: any) {
  const accessToken = clean(integration?.access_token);
  const expiresAt = integration?.expires_at
    ? new Date(integration.expires_at).getTime()
    : 0;

  const now = Date.now();

  if (accessToken && expiresAt && expiresAt > now + 60 * 1000) {
    return accessToken;
  }

  const refreshed = await refreshStravaToken(supabase, integration);
  return refreshed.accessToken;
}

async function fetchStravaActivities(accessToken: string, days: number) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const afterSeconds =
    days > 0
      ? nowSeconds - days * 24 * 60 * 60
      : Math.floor(new Date("2020-01-01T00:00:00Z").getTime() / 1000);

  const allActivities: any[] = [];
  const maxPages = 3;

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL("https://www.strava.com/api/v3/athlete/activities");
    url.searchParams.set("after", String(afterSeconds));
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await response.json().catch(() => []);

    if (!response.ok) {
      throw new Error(stravaErrorMessage(response.status, data));
    }

    const activities = Array.isArray(data) ? data : [];
    allActivities.push(...activities);

    if (activities.length < 100) break;
  }

  return allActivities;
}

async function saveActivity(
  supabase: any,
  participantId: number,
  activity: any
) {
  const externalId = clean(activity?.id);
  if (!externalId) return { skipped: true, reason: "NO_EXTERNAL_ID" };

  const startedAt = clean(activity?.start_date || activity?.start_date_local);
  const logDate = dateOnly(activity?.start_date_local || activity?.start_date);
  const distanceKm = num(activity?.distance)
    ? Math.round((Number(activity.distance) / 1000) * 100) / 100
    : null;

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
    activity_name: clean(
      activity?.name || activity?.sport_type || activity?.type || "Strava Activity"
    ),
    log_date: logDate,
    started_at: startedAt || null,
    duration_minutes: durationMinutes,
    calories,
    distance_km: distanceKm,
    raw_payload: {
      ...activity,
      marker: "WELLNESS_STRAVA_SYNC_SCOPE_DETAIL_FIX_V419",
      synced_at: new Date().toISOString(),
    },
  };

  const { data: existing, error: existingError } = await supabase
    .from("wellness_activity_logs")
    .select("id")
    .eq("participant_id", participantId)
    .eq("source", "strava")
    .eq("external_activity_id", externalId)
    .maybeSingle();

  if (existingError) throw existingError;

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

  const body = await req.json().catch(() => ({}));
  const days = Math.min(Math.max(Number(body?.days || 30), 1), 365);

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
      {
        ok: false,
        message: "Gagal membaca koneksi Strava.",
        detail: integrationError.message,
      },
      { status: 500 }
    );
  }

  if (!integration?.id) {
    return NextResponse.json(
      { ok: false, message: "Strava belum connected untuk peserta ini." },
      { status: 400 }
    );
  }

  const acceptedScope = normalizeScope(integration?.scope);

  if (!hasActivityReadScope(acceptedScope)) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Strava belum memberi izin membaca activity. Klik Reconnect Strava, lalu centang izin activity.",
        detail: `Scope saat ini: ${acceptedScope || "-"}`,
        action_required: "RECONNECT_STRAVA_WITH_ACTIVITY_SCOPE",
      },
      { status: 403 }
    );
  }

  try {
    const accessToken = await getValidAccessToken(supabase, integration);
    const activities = await fetchStravaActivities(accessToken, days);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const workoutReconcileDates = new Set<string>();

    for (const activity of activities) {
      const result = await saveActivity(
        supabase,
        Number(participant.id),
        activity
      );

      if (result.inserted) {
        inserted += 1;
        const logDate = dateOnly(activity?.start_date_local || activity?.start_date);
        if (logDate) workoutReconcileDates.add(logDate);
      } else if (result.updated) {
        updated += 1;
        const logDate = dateOnly(activity?.start_date_local || activity?.start_date);
        if (logDate) workoutReconcileDates.add(logDate);
      } else skipped += 1;
    }

    // WELLNESS_PROVIDER_SYNC_WORKOUT_RECONCILIATION_V126M119_27
    const workoutPointReconciliation = [];
    for (const logDate of Array.from(workoutReconcileDates).sort()) {
      const result = await reconcileWorkoutDailyPoint({
        supabase,
        participant,
        logDate,
      });
      workoutPointReconciliation.push({
        date: logDate,
        ok: result.ok,
        points: result.points,
        calories: result.calories,
        target: result.target,
        warning: result.warning || "",
      });
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
      marker: "WELLNESS_STRAVA_SYNC_SCOPE_DETAIL_FIX_V419",
      participant_id: participant.id,
      fetched: activities.length,
      inserted,
      updated,
      skipped,
      scope: acceptedScope,
      workout_point_reconciliation: workoutPointReconciliation,
      message:
        activities.length > 0
          ? `Sync Strava berhasil. ${inserted} baru, ${updated} update.`
          : "Sync Strava berhasil, tetapi belum ada activity baru pada periode ini.",
    });
  } catch (err: any) {
    console.error("STRAVA_SYNC_ERROR", err);

    return NextResponse.json(
      {
        ok: false,
        marker: "WELLNESS_STRAVA_SYNC_SCOPE_DETAIL_FIX_V419",
        message: err?.message || "Sync Strava gagal.",
        detail: err?.message || String(err),
        action_required:
          String(err?.message || "").toLowerCase().includes("reconnect") ||
          String(err?.message || "").toLowerCase().includes("izin")
            ? "RECONNECT_STRAVA"
            : null,
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