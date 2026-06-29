import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

// WELLNESS_GOOGLE_FIT_SYNC_V388
// Sync existing Google Fit daily activity into wellness_activity_logs.

type DailyBucket = {
  date: string;
  startMs: number;
  endMs: number;
  steps: number;
  calories: number;
  distanceM: number;
  activeMillis: number;
  raw: any;
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function num(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateOnlyFromMs(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function round(value: number, digits = 1) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function valueNumber(value: any) {
  if (!value) return 0;

  if (typeof value.intVal !== "undefined") return Number(value.intVal || 0);
  if (typeof value.fpVal !== "undefined") return Number(value.fpVal || 0);

  return 0;
}

function isInactiveActivityCode(code: number) {
  // Common Google Fit activity codes:
  // 3 = still, 72 = sleeping, 108 = sleeping.
  return code === 3 || code === 72 || code === 108;
}

async function refreshGoogleToken(integration: any) {
  const clientId =
    clean(process.env.GOOGLE_FIT_CLIENT_ID) ||
    clean(process.env.GOOGLE_CLIENT_ID);

  const clientSecret =
    clean(process.env.GOOGLE_FIT_CLIENT_SECRET) ||
    clean(process.env.GOOGLE_CLIENT_SECRET);

  const refreshToken = clean(integration?.refresh_token);

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("GOOGLE_FIT_REFRESH_ENV_MISSING");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error_description || data?.error || "GOOGLE_FIT_REFRESH_FAILED"
    );
  }

  return data;
}

async function getValidAccessToken(supabase: any, integration: any) {
  const accessToken = clean(integration?.access_token);
  const expiresAt = integration?.expires_at
    ? new Date(integration.expires_at).getTime()
    : 0;

  if (accessToken && expiresAt && expiresAt > Date.now() + 60 * 1000) {
    return accessToken;
  }

  const refreshed = await refreshGoogleToken(integration);

  const newExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString()
    : null;

  await supabase
    .from("wellness_integrations")
    .update({
      access_token: refreshed.access_token,
      expires_at: newExpiresAt,
      token_type: clean(refreshed.token_type) || "Bearer",
      scope: clean(refreshed.scope || integration.scope),
      updated_at: new Date().toISOString(),
      raw_payload: {
        token_type: refreshed.token_type || null,
        expires_in: refreshed.expires_in || null,
        scope: refreshed.scope || integration.scope || null,
        refreshed_at: new Date().toISOString(),
      },
    })
    .eq("id", integration.id);

  return clean(refreshed.access_token);
}

async function fetchGoogleFitAggregate(accessToken: string, days = 180) {
  const endTimeMillis = Date.now();
  const startTimeMillis = endTimeMillis - days * 24 * 60 * 60 * 1000;

  const response = await fetch(
    "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        aggregateBy: [
          { dataTypeName: "com.google.step_count.delta" },
          { dataTypeName: "com.google.calories.expended" },
          { dataTypeName: "com.google.distance.delta" },
          { dataTypeName: "com.google.activity.segment" },
        ],
        bucketByTime: {
          durationMillis: 86400000,
        },
        startTimeMillis,
        endTimeMillis,
      }),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        data?.error_description ||
        "GOOGLE_FIT_AGGREGATE_FAILED"
    );
  }

  return data;
}

function parseGoogleFitBuckets(data: any): DailyBucket[] {
  const buckets = Array.isArray(data?.bucket) ? data.bucket : [];

  const rows: DailyBucket[] = [];

  for (const bucket of buckets) {
    const startMs = Number(bucket.startTimeMillis || 0);
    const endMs = Number(bucket.endTimeMillis || 0);

    if (!startMs || !endMs) continue;

    const row: DailyBucket = {
      date: dateOnlyFromMs(startMs),
      startMs,
      endMs,
      steps: 0,
      calories: 0,
      distanceM: 0,
      activeMillis: 0,
      raw: bucket,
    };

    const datasets = Array.isArray(bucket.dataset) ? bucket.dataset : [];

    for (const dataset of datasets) {
      const sourceId = clean(dataset?.dataSourceId).toLowerCase();
      const points = Array.isArray(dataset?.point) ? dataset.point : [];

      for (const point of points) {
        const values = Array.isArray(point?.value) ? point.value : [];
        const firstValue = values[0] || {};
        const pointStart = Number(point.startTimeNanos || 0) / 1000000;
        const pointEnd = Number(point.endTimeNanos || 0) / 1000000;

        if (sourceId.includes("step_count")) {
          row.steps += valueNumber(firstValue);
        } else if (sourceId.includes("calories")) {
          row.calories += valueNumber(firstValue);
        } else if (sourceId.includes("distance")) {
          row.distanceM += valueNumber(firstValue);
        } else if (sourceId.includes("activity.segment")) {
          const activityCode = Number(firstValue.intVal || 0);

          if (
            pointStart &&
            pointEnd &&
            pointEnd > pointStart &&
            !isInactiveActivityCode(activityCode)
          ) {
            row.activeMillis += pointEnd - pointStart;
          }
        }
      }
    }

    const hasData =
      row.steps > 0 ||
      row.calories > 0 ||
      row.distanceM > 0 ||
      row.activeMillis > 0;

    if (hasData) rows.push(row);
  }

  return rows;
}

async function saveDailyActivity(
  supabase: any,
  participantId: number,
  row: DailyBucket
) {
  const externalId = `google_fit_${participantId}_${row.date}`;
  const distanceKm = row.distanceM > 0 ? round(row.distanceM / 1000, 2) : null;
  const durationMinutes =
    row.activeMillis > 0 ? round(row.activeMillis / 60000, 1) : null;

  const activityName =
    row.steps > 0
      ? `Google Fit - ${new Intl.NumberFormat("id-ID").format(row.steps)} steps`
      : "Google Fit Daily Activity";

  const payload: any = {
    participant_id: participantId,
    source: "google_fit",
    external_activity_id: externalId,
    provider_activity_id: externalId,
    activity_type: "Google Fit Daily",
    activity_name: activityName,
    log_date: row.date,
    started_at: new Date(row.startMs).toISOString(),
    duration_minutes: durationMinutes,
    calories: row.calories > 0 ? Math.round(row.calories) : null,
    distance_km: distanceKm,
    steps: Math.round(row.steps || 0),
    raw_payload: {
      date: row.date,
      steps: row.steps,
      calories: row.calories,
      distance_m: row.distanceM,
      active_millis: row.activeMillis,
      bucket: row.raw,
    },
  };

  const { data: existing, error: existingError } = await supabase
    .from("wellness_activity_logs")
    .select("id")
    .eq("participant_id", participantId)
    .eq("source", "google_fit")
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

async function getRequestedDays(req: NextRequest) {
  if (req.method === "GET") {
    const queryDays = num(req.nextUrl.searchParams.get("days"));
    return Math.min(Math.max(queryDays || 180, 30), 365);
  }

  const body = await req.json().catch(() => ({}));
  const bodyDays = num(body?.days);

  // Minimal 180 hari supaya existing Google Fit lebih mudah ikut tertarik.
  return Math.min(Math.max(bodyDays || 180, 180), 365);
}

async function handleSync(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const participant = await getParticipantFromPortalSession(supabase, req);

  if (!participant?.id) {
    return NextResponse.json(
      {
        ok: false,
        message: "OTP/session peserta belum aktif.",
      },
      { status: 401 }
    );
  }

  const { data: integration, error: integrationError } = await supabase
    .from("wellness_integrations")
    .select("*")
    .eq("participant_id", participant.id)
    .eq("provider", "google_fit")
    .eq("is_active", 1)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (integrationError) {
    return NextResponse.json(
      {
        ok: false,
        message: "Gagal membaca koneksi Google Fit.",
        detail: integrationError.message,
      },
      { status: 500 }
    );
  }

  if (!integration?.id) {
    return NextResponse.json(
      {
        ok: false,
        message: "Google Fit belum connected untuk peserta ini.",
      },
      { status: 400 }
    );
  }

  try {
    const days = await getRequestedDays(req);
    const accessToken = await getValidAccessToken(supabase, integration);
    const aggregate = await fetchGoogleFitAggregate(accessToken, days);
    const rows = parseGoogleFitBuckets(aggregate);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const result = await saveDailyActivity(
        supabase,
        Number(participant.id),
        row
      );

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
      source: "google_fit",
      participant_id: participant.id,
      days,
      fetched: rows.length,
      inserted,
      updated,
      skipped,
      message:
        rows.length > 0
          ? "Sync Google Fit berhasil."
          : "Sync berhasil, tetapi belum ada activity Google Fit yang bisa ditarik.",
    });
  } catch (err: any) {
    console.error("GOOGLE_FIT_SYNC_ERROR", err);

    return NextResponse.json(
      {
        ok: false,
        message: "Sync Google Fit gagal.",
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