import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

// WELLNESS_GOOGLE_FIT_DEBUG_V391
// Diagnostic untuk cek apakah Google Fit API mengembalikan data sources dan aggregate data.

function clean(value: any) {
  return String(value ?? "").trim();
}

function num(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function valueNumber(value: any) {
  if (!value) return 0;
  if (typeof value.intVal !== "undefined") return Number(value.intVal || 0);
  if (typeof value.fpVal !== "undefined") return Number(value.fpVal || 0);
  return 0;
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
        ...(integration.raw_payload || {}),
        debug_refresh: {
          token_type: refreshed.token_type || null,
          expires_in: refreshed.expires_in || null,
          scope: refreshed.scope || integration.scope || null,
          refreshed_at: new Date().toISOString(),
        },
      },
    })
    .eq("id", integration.id);

  return clean(refreshed.access_token);
}

async function fetchProfile(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.json().catch(() => ({}));
}

async function fetchDataSources(accessToken: string) {
  const response = await fetch(
    "https://www.googleapis.com/fitness/v1/users/me/dataSources",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error?.message || data?.error_description || "DATA_SOURCES_FAILED"
    );
  }

  return Array.isArray(data?.dataSource) ? data.dataSource : [];
}

async function fetchAggregate(accessToken: string, days: number) {
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

function summarizeAggregate(data: any) {
  const buckets = Array.isArray(data?.bucket) ? data.bucket : [];

  let bucketWithData = 0;
  let steps = 0;
  let calories = 0;
  let distanceM = 0;
  let points = 0;

  for (const bucket of buckets) {
    let bucketHasData = false;

    const datasets = Array.isArray(bucket?.dataset) ? bucket.dataset : [];

    for (const dataset of datasets) {
      const sourceId = clean(dataset?.dataSourceId).toLowerCase();
      const datasetPoints = Array.isArray(dataset?.point) ? dataset.point : [];

      points += datasetPoints.length;

      for (const point of datasetPoints) {
        const values = Array.isArray(point?.value) ? point.value : [];
        const firstValue = values[0] || {};
        const value = valueNumber(firstValue);

        if (value > 0) bucketHasData = true;

        if (sourceId.includes("step_count")) {
          steps += value;
        } else if (sourceId.includes("calories")) {
          calories += value;
        } else if (sourceId.includes("distance")) {
          distanceM += value;
        }
      }
    }

    if (bucketHasData) bucketWithData += 1;
  }

  return {
    bucket_count: buckets.length,
    bucket_with_data: bucketWithData,
    point_count: points,
    total_steps: Math.round(steps),
    total_calories: Math.round(calories),
    total_distance_km: Math.round((distanceM / 1000) * 100) / 100,
  };
}

export async function GET(req: NextRequest) {
  const days = Math.min(
    Math.max(num(req.nextUrl.searchParams.get("days")) || 7, 1),
    30
  );

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

  const { data: integration, error } = await supabase
    .from("wellness_integrations")
    .select("*")
    .eq("participant_id", participant.id)
    .eq("provider", "google_fit")
    .eq("is_active", 1)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "Gagal membaca integrasi Google Fit.",
        detail: error.message,
      },
      { status: 500 }
    );
  }

  if (!integration?.id) {
    return NextResponse.json(
      {
        ok: false,
        message: "Google Fit belum connected.",
      },
      { status: 400 }
    );
  }

  try {
    const accessToken = await getValidAccessToken(supabase, integration);
    const profile = await fetchProfile(accessToken);
    const dataSources = await fetchDataSources(accessToken);
    const aggregate = await fetchAggregate(accessToken, days);
    const aggregateSummary = summarizeAggregate(aggregate);

    const sourceSummary = dataSources.map((item: any) => ({
      dataSourceId: item.dataStreamId || item.dataSourceId || null,
      dataTypeName: item?.dataType?.name || null,
      device: item?.device?.model || item?.device?.manufacturer || null,
      application: item?.application?.name || item?.application?.packageName || null,
      type: item?.type || null,
    }));

    return NextResponse.json({
      ok: true,
      participant_id: participant.id,
      days,
      google_email: profile?.email || null,
      integration_scope: integration.scope || null,
      data_sources_count: dataSources.length,
      data_sources: sourceSummary,
      aggregate_summary: aggregateSummary,
      interpretation:
        aggregateSummary.total_steps > 0 ||
        aggregateSummary.total_calories > 0 ||
        aggregateSummary.total_distance_km > 0
          ? "Google Fit API mengembalikan data. Kalau sync masih 0, parser sync perlu disesuaikan."
          : "Google Fit API tidak mengembalikan step/calorie/distance untuk akun ini pada rentang hari tersebut.",
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        message: "Debug Google Fit gagal.",
        detail: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}