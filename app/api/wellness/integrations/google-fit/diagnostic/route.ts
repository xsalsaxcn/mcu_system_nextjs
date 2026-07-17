// WELLNESS_GOOGLE_FIT_RAW_DIAGNOSTIC_V79L
// Read-only diagnostic. It does not write activity rows or change the active provider.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JAKARTA_TIME_ZONE = "Asia/Jakarta";
const MARKER = "WELLNESS_GOOGLE_FIT_RAW_DIAGNOSTIC_V79L";

function clean(value: any) {
  return String(value ?? "").trim();
}

function valueNumber(value: any) {
  if (!value) return 0;
  if (value.intVal !== undefined && value.intVal !== null) {
    return Number(value.intVal) || 0;
  }
  if (value.fpVal !== undefined && value.fpVal !== null) {
    return Number(value.fpVal) || 0;
  }
  if (value.stringVal !== undefined && value.stringVal !== null) {
    return Number(value.stringVal) || 0;
  }
  return 0;
}

function jakartaDateKey(ms: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));

  const year = parts.find((item) => item.type === "year")?.value;
  const month = parts.find((item) => item.type === "month")?.value;
  const day = parts.find((item) => item.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date(ms).toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

function jakartaDayStartUtc(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0));
}

function sourceLabel(source: any) {
  return {
    dataStreamId: clean(source?.dataStreamId),
    dataStreamName: clean(source?.dataStreamName),
    type: clean(source?.type),
    dataTypeName: clean(source?.dataType?.name),
    applicationName: clean(source?.application?.name),
    applicationPackageName: clean(source?.application?.packageName),
    applicationVersion: clean(source?.application?.version),
    deviceManufacturer: clean(source?.device?.manufacturer),
    deviceModel: clean(source?.device?.model),
    deviceType: clean(source?.device?.type),
    deviceUid: clean(source?.device?.uid),
  };
}

async function refreshAccessTokenIfNeeded(supabase: any, integration: any) {
  const expiresAt = integration?.expires_at
    ? new Date(integration.expires_at).getTime()
    : 0;

  if (
    integration?.access_token &&
    expiresAt &&
    expiresAt > Date.now() + 60 * 1000
  ) {
    return clean(integration.access_token);
  }

  const refreshToken = clean(integration?.refresh_token);
  if (!refreshToken) {
    throw new Error("Google Fit refresh_token tidak tersedia.");
  }

  const clientId =
    clean(process.env.GOOGLE_FIT_CLIENT_ID) ||
    clean(process.env.GOOGLE_CLIENT_ID);
  const clientSecret =
    clean(process.env.GOOGLE_FIT_CLIENT_SECRET) ||
    clean(process.env.GOOGLE_CLIENT_SECRET);

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_FIT_CLIENT_ID / GOOGLE_FIT_CLIENT_SECRET belum diatur.",
    );
  }

  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("refresh_token", refreshToken);
  params.set("grant_type", "refresh_token");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
  });

  const json: any = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      json?.error_description || json?.error || "Gagal refresh Google token.",
    );
  }

  const accessToken = clean(json.access_token);
  const expiresIn = Number(json.expires_in || 3600);
  const newExpiresAt = new Date(
    Date.now() + expiresIn * 1000,
  ).toISOString();

  const updated = await supabase
    .from("wellness_integrations")
    .update({
      access_token: accessToken,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", integration.id);

  if (updated.error) throw updated.error;
  return accessToken;
}

async function googleGet(accessToken: string, url: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const json: any = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      json?.error?.message ||
        json?.error_description ||
        json?.error ||
        `Google HTTP ${response.status}`,
    );
  }

  return json;
}

async function googlePost(accessToken: string, url: string, body: any) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json: any = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      json?.error?.message ||
        json?.error_description ||
        json?.error ||
        `Google HTTP ${response.status}`,
    );
  }

  return json;
}

async function listDataSources(
  accessToken: string,
  dataTypeName: string,
) {
  const url =
    "https://www.googleapis.com/fitness/v1/users/me/dataSources" +
    `?dataTypeName=${encodeURIComponent(dataTypeName)}`;

  const json = await googleGet(accessToken, url);
  return Array.isArray(json.dataSource) ? json.dataSource : [];
}

function aggregateTotalFromResponse(json: any) {
  let total = 0;
  const details: any[] = [];

  for (const bucket of Array.isArray(json?.bucket) ? json.bucket : []) {
    for (const dataset of Array.isArray(bucket?.dataset)
      ? bucket.dataset
      : []) {
      for (const point of Array.isArray(dataset?.point)
        ? dataset.point
        : []) {
        const pointTotal = (point?.value || []).reduce(
          (sum: number, item: any) => sum + valueNumber(item),
          0,
        );

        total += pointTotal;
        details.push({
          dataSourceId: clean(point?.dataSourceId),
          startTimeNanos: clean(point?.startTimeNanos),
          endTimeNanos: clean(point?.endTimeNanos),
          value: pointTotal,
          rawValues: point?.value || [],
        });
      }
    }
  }

  return { total, details };
}

async function aggregateSource(params: {
  accessToken: string;
  dataSourceId?: string;
  dataTypeName?: string;
  startMs: number;
  endMs: number;
}) {
  const aggregateBy = params.dataSourceId
    ? [{ dataSourceId: params.dataSourceId }]
    : [{ dataTypeName: params.dataTypeName }];

  const json = await googlePost(
    params.accessToken,
    "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
    {
      aggregateBy,
      bucketByTime: {
        durationMillis: Math.max(1, params.endMs - params.startMs),
      },
      startTimeMillis: params.startMs,
      endTimeMillis: params.endMs,
    },
  );

  const parsed = aggregateTotalFromResponse(json);

  return {
    ok: true,
    total: parsed.total,
    points: parsed.details,
    rawBucketCount: Array.isArray(json?.bucket) ? json.bucket.length : 0,
  };
}

async function safeAggregate(params: {
  accessToken: string;
  dataSourceId?: string;
  dataTypeName?: string;
  startMs: number;
  endMs: number;
}) {
  try {
    return await aggregateSource(params);
  } catch (error: any) {
    return {
      ok: false,
      total: null,
      points: [],
      rawBucketCount: 0,
      error: error?.message || String(error),
    };
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  callback: (item: T, index: number) => Promise<R>,
) {
  const result = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await callback(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length || 1) },
    () => worker(),
  );

  await Promise.all(workers);
  return result;
}

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const participant = await getParticipantFromPortalSession(supabase, req);

  if (!participant?.id) {
    return NextResponse.json(
      {
        ok: false,
        marker: MARKER,
        message:
          "Session peserta belum aktif. Login OTP di browser yang sama.",
      },
      { status: 401 },
    );
  }

  try {
    const integrationQuery = await supabase
      .from("wellness_integrations")
      .select("*")
      .eq("participant_id", participant.id)
      .eq("provider", "google_fit")
      .neq("is_active", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (integrationQuery.error) throw integrationQuery.error;

    const integration = integrationQuery.data;

    if (!integration) {
      return NextResponse.json(
        {
          ok: false,
          marker: MARKER,
          message: "Google Fit belum terkoneksi untuk peserta ini.",
        },
        { status: 400 },
      );
    }

    const accessToken = await refreshAccessTokenIfNeeded(
      supabase,
      integration,
    );

    const now = new Date();
    const todayKey = jakartaDateKey(now.getTime());
    const start = jakartaDayStartUtc(todayKey);
    const startMs = start.getTime();
    const endMs = now.getTime();

    const [
      stepSources,
      calorieSources,
      aggregateStepsByType,
      aggregateEstimatedSteps,
      aggregateCaloriesByType,
      userInfo,
    ] = await Promise.all([
      listDataSources(accessToken, "com.google.step_count.delta"),
      listDataSources(accessToken, "com.google.calories.expended"),
      safeAggregate({
        accessToken,
        dataTypeName: "com.google.step_count.delta",
        startMs,
        endMs,
      }),
      safeAggregate({
        accessToken,
        dataSourceId:
          "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps",
        startMs,
        endMs,
      }),
      safeAggregate({
        accessToken,
        dataTypeName: "com.google.calories.expended",
        startMs,
        endMs,
      }),
      googleGet(
        accessToken,
        "https://www.googleapis.com/oauth2/v2/userinfo",
      ).catch((error: any) => ({
        error: error?.message || String(error),
      })),
    ]);

    const stepSourceResults = await mapLimit(
      stepSources.slice(0, 40),
      5,
      async (source: any) => ({
        source: sourceLabel(source),
        aggregate: await safeAggregate({
          accessToken,
          dataSourceId: clean(source?.dataStreamId),
          startMs,
          endMs,
        }),
      }),
    );

    const calorieSourceResults = await mapLimit(
      calorieSources.slice(0, 30),
      5,
      async (source: any) => ({
        source: sourceLabel(source),
        aggregate: await safeAggregate({
          accessToken,
          dataSourceId: clean(source?.dataStreamId),
          startMs,
          endMs,
        }),
      }),
    );

    const storedActivityQuery = await supabase
      .from("wellness_activity_logs")
      .select(
        "id,participant_id,source,activity_name,log_date,started_at,steps,calories,distance_km,duration_minutes,raw_payload,created_at,updated_at",
      )
      .eq("participant_id", participant.id)
      .eq("source", "google_fit")
      .eq("log_date", todayKey)
      .order("updated_at", { ascending: false })
      .limit(5);

    if (storedActivityQuery.error) throw storedActivityQuery.error;

    const sortedStepSources = stepSourceResults.sort(
      (left: any, right: any) =>
        Number(right.aggregate?.total || 0) -
        Number(left.aggregate?.total || 0),
    );

    const sortedCalorieSources = calorieSourceResults.sort(
      (left: any, right: any) =>
        Number(right.aggregate?.total || 0) -
        Number(left.aggregate?.total || 0),
    );

    return NextResponse.json({
      ok: true,
      marker: MARKER,
      read_only: true,
      participant: {
        id: participant.id,
        code: participant.code,
        name: participant.name,
      },
      oauth_account: {
        email: clean(userInfo?.email),
        name: clean(userInfo?.name),
        id: clean(userInfo?.id),
        verified_email: userInfo?.verified_email === true,
        error: clean(userInfo?.error),
      },
      integration: {
        id: integration.id,
        provider: integration.provider,
        is_active: integration.is_active,
        created_at: integration.created_at,
        updated_at: integration.updated_at,
        last_sync_at: integration.last_sync_at,
        expires_at: integration.expires_at,
        has_access_token: Boolean(clean(integration.access_token)),
        has_refresh_token: Boolean(clean(integration.refresh_token)),
      },
      exact_window: {
        timezone: JAKARTA_TIME_ZONE,
        date: todayKey,
        start_iso: start.toISOString(),
        end_iso: now.toISOString(),
        start_ms: startMs,
        end_ms: endMs,
      },
      canonical_aggregates: {
        step_count_by_type: aggregateStepsByType,
        estimated_steps_source: aggregateEstimatedSteps,
        calories_expended_by_type: aggregateCaloriesByType,
      },
      all_step_sources: sortedStepSources,
      all_calorie_sources: sortedCalorieSources,
      stored_google_fit_rows_today: storedActivityQuery.data || [],
      interpretation_guide: {
        account_check:
          "oauth_account.email harus sama dengan akun yang terlihat pada aplikasi Google Fit.",
        exact_match:
          "Cari source dengan aggregate.total yang sama dengan angka aplikasi Google Fit pada waktu end_iso.",
        no_match:
          "Jika tidak ada source yang menghasilkan angka aplikasi, angka tersebut belum tersedia pada Google Fitness REST store untuk akun dan waktu ini.",
        no_write:
          "Endpoint ini tidak mengubah provider, poin, activity log, atau pilihan Admin.",
      },
    });
  } catch (error: any) {
    console.error("WELLNESS_GOOGLE_FIT_RAW_DIAGNOSTIC_V79L_ERROR", error);

    return NextResponse.json(
      {
        ok: false,
        marker: MARKER,
        message: error?.message || "Diagnostik Google Fit gagal.",
      },
      { status: 500 },
    );
  }
}
