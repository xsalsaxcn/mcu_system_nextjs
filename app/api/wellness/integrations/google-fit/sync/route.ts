import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

// WELLNESS_GOOGLE_FIT_SYNC_V392_DIRECT_DATASOURCES
// Fix: aggregate_summary Google Fit bisa 0 walaupun data sources ada.
// Sync membaca langsung dari dataSources/datasets Google Fit.

type DailyRow = {
  date: string;
  startMs: number;
  endMs: number;
  steps: number;
  calories: number;
  distanceM: number;
  activeMinutes: number;
  raw: any[];
};

type FitSession = Record<string, any>;

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

function pointStartMs(point: any) {
  return Number(point?.startTimeNanos || 0) / 1000000;
}

function pointEndMs(point: any) {
  return Number(point?.endTimeNanos || 0) / 1000000;
}

function dateKeyFromPoint(point: any) {
  const ms = pointEndMs(point) || pointStartMs(point);
  if (!ms) return null;
  return dateOnlyFromMs(ms);
}

function getOrCreateDaily(map: Map<string, DailyRow>, date: string, ms: number) {
  const existing = map.get(date);
  if (existing) return existing;

  const start = new Date(`${date}T00:00:00.000Z`).getTime();
  const end = start + 24 * 60 * 60 * 1000 - 1;

  const row: DailyRow = {
    date,
    startMs: start || ms,
    endMs: end || ms,
    steps: 0,
    calories: 0,
    distanceM: 0,
    activeMinutes: 0,
    raw: [],
  };

  map.set(date, row);
  return row;
}

function activityNameFromCode(code: any) {
  const n = Number(code);

  const map: Record<number, string> = {
    1: "Biking",
    2: "On foot",
    7: "Walking",
    8: "Running",
    9: "Aerobics",
    10: "Badminton",
    12: "Basketball",
    21: "Calisthenics",
    22: "Circuit training",
    24: "Dancing",
    32: "Hiking",
    50: "Rowing",
    53: "Jogging",
    55: "Running treadmill",
    75: "Stair climbing",
    78: "Strength training",
    80: "Swimming",
    86: "Treadmill",
    91: "Walking fitness",
    93: "Walking treadmill",
    95: "Weightlifting",
    98: "Yoga",
  };

  return map[n] || `Google Fit Activity ${Number.isFinite(n) ? n : ""}`.trim();
}

function isInactiveActivityCode(code: number) {
  return code === 3 || code === 70 || code === 72 || code === 108;
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
        refreshed_at: new Date().toISOString(),
        token_type: refreshed.token_type || null,
        expires_in: refreshed.expires_in || null,
        scope: refreshed.scope || integration.scope || null,
      },
    })
    .eq("id", integration.id);

  return clean(refreshed.access_token);
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
      data?.error?.message || data?.error_description || "GOOGLE_FIT_DATASOURCES_FAILED"
    );
  }

  return Array.isArray(data?.dataSource) ? data.dataSource : [];
}

async function fetchDataset(
  accessToken: string,
  dataSourceId: string,
  startMs: number,
  endMs: number
) {
  const startNanos = Math.floor(startMs * 1000000);
  const endNanos = Math.floor(endMs * 1000000);

  const encodedSource = encodeURIComponent(dataSourceId);
  const datasetId = `${startNanos}-${endNanos}`;

  const url = `https://www.googleapis.com/fitness/v1/users/me/dataSources/${encodedSource}/datasets/${datasetId}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        data?.error_description ||
        `GOOGLE_FIT_DATASET_FAILED_${dataSourceId}`
    );
  }

  return data;
}

async function fetchGoogleFitSessions(
  accessToken: string,
  startMs: number,
  endMs: number
) {
  const url = new URL("https://www.googleapis.com/fitness/v1/users/me/sessions");
  url.searchParams.set("startTime", new Date(startMs).toISOString());
  url.searchParams.set("endTime", new Date(endMs).toISOString());
  url.searchParams.set("includeDeleted", "false");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        data?.error_description ||
        data?.message ||
        "GOOGLE_FIT_SESSIONS_FAILED"
    );
  }

  return Array.isArray(data?.session) ? data.session : [];
}

function parseDatasetIntoDailyRows(
  map: Map<string, DailyRow>,
  dataSource: any,
  dataset: any
) {
  const dataSourceId = clean(dataSource?.dataStreamId || dataSource?.dataSourceId);
  const dataTypeName = clean(dataSource?.dataType?.name);
  const points = Array.isArray(dataset?.point) ? dataset.point : [];

  if (!points.length) return;

  const cumulativeByDate = new Map<string, number[]>();

  for (const point of points) {
    const date = dateKeyFromPoint(point);
    if (!date) continue;

    const values = Array.isArray(point?.value) ? point.value : [];
    const firstValue = values[0] || {};
    const value = valueNumber(firstValue);
    const startMs = pointStartMs(point);
    const endMs = pointEndMs(point);
    const row = getOrCreateDaily(map, date, endMs || startMs || Date.now());

    row.raw.push({
      source: dataSourceId,
      type: dataTypeName,
      startTimeNanos: point?.startTimeNanos || null,
      endTimeNanos: point?.endTimeNanos || null,
      value: firstValue,
    });

    if (dataTypeName === "com.google.step_count.delta") {
      row.steps += value;
    } else if (dataTypeName === "com.google.step_count.cumulative") {
      const list = cumulativeByDate.get(date) || [];
      list.push(value);
      cumulativeByDate.set(date, list);
    } else if (dataTypeName === "com.google.calories.expended") {
      row.calories += value;
    } else if (dataTypeName === "com.google.distance.delta") {
      row.distanceM += value;
    } else if (dataTypeName === "com.google.active_minutes") {
      row.activeMinutes += value;
    } else if (dataTypeName === "com.google.activity.segment") {
      const code = Number(firstValue?.intVal || 0);

      if (
        startMs &&
        endMs &&
        endMs > startMs &&
        !isInactiveActivityCode(code)
      ) {
        row.activeMinutes += (endMs - startMs) / 60000;
      }
    }
  }

  for (const [date, values] of cumulativeByDate.entries()) {
    const cleanValues = values.filter((value) => Number.isFinite(value));

    if (!cleanValues.length) continue;

    const min = Math.min(...cleanValues);
    const max = Math.max(...cleanValues);

    // Untuk beberapa device, cumulative harian hanya muncul 1 point.
    // Kalau max-min = 0, pakai max sebagai fallback.
    const delta = max - min > 0 ? max - min : max;

    const row = getOrCreateDaily(map, date, Date.now());

    if (row.steps <= 0 && delta > 0) {
      row.steps = delta;
    }
  }
}

async function fetchDailyRowsFromDataSources(
  accessToken: string,
  days: number
) {
  const safeDays = Math.min(Math.max(days || 30, 1), 365);
  const endMs = Date.now();
  const startMs = endMs - safeDays * 24 * 60 * 60 * 1000;

  const dataSources = await fetchDataSources(accessToken);

  const allowedTypes = new Set([
    "com.google.step_count.delta",
    "com.google.step_count.cumulative",
    "com.google.calories.expended",
    "com.google.distance.delta",
    "com.google.active_minutes",
    "com.google.activity.segment",
  ]);

  const selectedSources = dataSources.filter((source: any) => {
    const type = clean(source?.dataType?.name);
    return allowedTypes.has(type);
  });

  const map = new Map<string, DailyRow>();
  let datasetsRead = 0;
  let datasetsWithPoints = 0;

  for (const source of selectedSources) {
    const dataSourceId = clean(source?.dataStreamId || source?.dataSourceId);
    if (!dataSourceId) continue;

    const dataset = await fetchDataset(accessToken, dataSourceId, startMs, endMs);
    datasetsRead += 1;

    if (Array.isArray(dataset?.point) && dataset.point.length > 0) {
      datasetsWithPoints += 1;
    }

    parseDatasetIntoDailyRows(map, source, dataset);
  }

  const rows = Array.from(map.values())
    .filter((row) => {
      return (
        row.steps > 0 ||
        row.calories > 0 ||
        row.distanceM > 0 ||
        row.activeMinutes > 0
      );
    })
    .sort((a, b) => b.startMs - a.startMs);

  return {
    rows,
    dataSourcesCount: dataSources.length,
    selectedSourcesCount: selectedSources.length,
    datasetsRead,
    datasetsWithPoints,
  };
}

async function saveDailyActivity(
  supabase: any,
  participantId: number,
  row: DailyRow
) {
  const externalId = `google_fit_daily_${participantId}_${row.date}`;
  const distanceKm = row.distanceM > 0 ? round(row.distanceM / 1000, 2) : null;
  const durationMinutes =
    row.activeMinutes > 0 ? round(row.activeMinutes, 1) : null;

  const formattedSteps = new Intl.NumberFormat("id-ID").format(
    Math.round(row.steps || 0)
  );

  const activityName =
    row.steps > 0
      ? `Google Fit Daily - ${formattedSteps} steps`
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
      kind: "direct_datasource_daily",
      date: row.date,
      steps: row.steps,
      calories: row.calories,
      distance_m: row.distanceM,
      active_minutes: row.activeMinutes,
      synced_at: new Date().toISOString(),
      raw: row.raw,
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

  const { error } = await supabase.from("wellness_activity_logs").insert(payload);

  if (error) throw error;

  return { inserted: true };
}

async function saveWorkoutSession(
  supabase: any,
  participantId: number,
  session: FitSession
) {
  const sessionId =
    clean(session?.id) ||
    clean(session?.name) ||
    `${clean(session?.startTimeMillis)}_${clean(session?.endTimeMillis)}`;

  if (!sessionId) return { skipped: true };

  const startMs = Number(session?.startTimeMillis || 0);
  const endMs = Number(session?.endTimeMillis || 0);

  if (!startMs || !endMs || endMs <= startMs) {
    return { skipped: true };
  }

  const activityType = activityNameFromCode(session?.activityType);
  const activityName =
    clean(session?.name) ||
    clean(session?.description) ||
    `Google Fit - ${activityType}`;

  const durationMinutes = round((endMs - startMs) / 60000, 1);
  const date = dateOnlyFromMs(startMs);
  const externalId = `google_fit_session_${participantId}_${sessionId}`;

  const payload: any = {
    participant_id: participantId,
    source: "google_fit",
    external_activity_id: externalId,
    provider_activity_id: sessionId,
    activity_type: activityType,
    activity_name: activityName,
    log_date: date,
    started_at: new Date(startMs).toISOString(),
    duration_minutes: durationMinutes,
    calories: null,
    distance_km: null,
    steps: null,
    raw_payload: {
      kind: "session",
      session,
      synced_at: new Date().toISOString(),
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

  const { error } = await supabase.from("wellness_activity_logs").insert(payload);

  if (error) throw error;

  return { inserted: true };
}

async function getRequestedDays(req: NextRequest) {
  if (req.method === "GET") {
    const queryDays = num(req.nextUrl.searchParams.get("days"));
    return Math.min(Math.max(queryDays || 30, 1), 365);
  }

  const body = await req.json().catch(() => ({}));
  const bodyDays = num(body?.days);

  return Math.min(Math.max(bodyDays || 30, 1), 365);
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

    const endMs = Date.now();
    const startMs = endMs - days * 24 * 60 * 60 * 1000;

    const dailyResult = await fetchDailyRowsFromDataSources(accessToken, days);
    const sessions = await fetchGoogleFitSessions(accessToken, startMs, endMs);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const session of sessions) {
      const result = await saveWorkoutSession(
        supabase,
        Number(participant.id),
        session
      );

      if (result.inserted) inserted += 1;
      else if (result.updated) updated += 1;
      else skipped += 1;
    }

    for (const row of dailyResult.rows) {
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
      data_sources_count: dailyResult.dataSourcesCount,
      selected_sources_count: dailyResult.selectedSourcesCount,
      datasets_read: dailyResult.datasetsRead,
      datasets_with_points: dailyResult.datasetsWithPoints,
      fetched_sessions: sessions.length,
      fetched_daily: dailyResult.rows.length,
      fetched: sessions.length + dailyResult.rows.length,
      inserted,
      updated,
      skipped,
      message:
        sessions.length + dailyResult.rows.length > 0
          ? "Sync Google Fit berhasil."
          : "Sync berhasil, tetapi belum ada activity Google Fit yang bisa ditarik dari dataSources.",
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