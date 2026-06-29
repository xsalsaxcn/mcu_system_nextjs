import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

// WELLNESS_GOOGLE_FIT_SYNC_V390_AGGREGATE_AND_SESSIONS
// Sync Google Fit daily aggregate + workout sessions.
// Fix: activity yang muncul sebagai record/session di Google Fit ikut masuk log workout.

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

function isInactiveActivityCode(code: number) {
  return code === 3 || code === 72 || code === 108;
}

function activityNameFromCode(code: any) {
  const n = Number(code);

  const map: Record<number, string> = {
    0: "In vehicle",
    1: "Biking",
    2: "On foot",
    3: "Still",
    7: "Walking",
    8: "Running",
    9: "Aerobics",
    10: "Badminton",
    11: "Baseball",
    12: "Basketball",
    13: "Biathlon",
    14: "Handbiking",
    15: "Mountain biking",
    16: "Road biking",
    17: "Spinning",
    18: "Stationary biking",
    19: "Utility biking",
    20: "Boxing",
    21: "Calisthenics",
    22: "Circuit training",
    23: "Cricket",
    24: "Dancing",
    25: "Elliptical",
    26: "Fencing",
    27: "Football",
    28: "Gardening",
    29: "Golf",
    30: "Gymnastics",
    31: "Handball",
    32: "Hiking",
    33: "Hockey",
    34: "Horseback riding",
    35: "Housework",
    36: "Jump rope",
    37: "Kayaking",
    38: "Kettlebell training",
    39: "Kickboxing",
    40: "Kitesurfing",
    41: "Martial arts",
    42: "Meditation",
    43: "Mixed martial arts",
    44: "P90X",
    45: "Paragliding",
    46: "Pilates",
    47: "Polo",
    48: "Racquetball",
    49: "Rock climbing",
    50: "Rowing",
    51: "Rowing machine",
    52: "Rugby",
    53: "Jogging",
    54: "Running on sand",
    55: "Running treadmill",
    56: "Sailing",
    57: "Scuba diving",
    58: "Skateboarding",
    59: "Skating",
    60: "Cross skating",
    61: "Indoor skating",
    62: "Inline skating",
    63: "Skiing",
    64: "Back-country skiing",
    65: "Cross-country skiing",
    66: "Downhill skiing",
    67: "Kite skiing",
    68: "Roller skiing",
    69: "Sledding",
    70: "Sleeping",
    71: "Snowboarding",
    72: "Snowmobile",
    73: "Snowshoeing",
    74: "Squash",
    75: "Stair climbing",
    76: "Stair-climbing machine",
    77: "Stand-up paddleboarding",
    78: "Strength training",
    79: "Surfing",
    80: "Swimming",
    81: "Swimming pool",
    82: "Swimming open water",
    83: "Table tennis",
    84: "Team sports",
    85: "Tennis",
    86: "Treadmill",
    87: "Volleyball",
    88: "Volleyball beach",
    89: "Volleyball indoor",
    90: "Wakeboarding",
    91: "Walking fitness",
    92: "Nording walking",
    93: "Walking treadmill",
    94: "Waterpolo",
    95: "Weightlifting",
    96: "Wheelchair",
    97: "Windsurfing",
    98: "Yoga",
    108: "Sleeping",
  };

  return map[n] || `Google Fit Activity ${Number.isFinite(n) ? n : ""}`.trim();
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

async function fetchGoogleFitAggregateRange(
  accessToken: string,
  startTimeMillis: number,
  endTimeMillis: number
) {
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
        data?.message ||
        "GOOGLE_FIT_AGGREGATE_FAILED"
    );
  }

  return data;
}

async function fetchGoogleFitSessions(
  accessToken: string,
  startTimeMillis: number,
  endTimeMillis: number
) {
  const url = new URL("https://www.googleapis.com/fitness/v1/users/me/sessions");
  url.searchParams.set("startTime", new Date(startTimeMillis).toISOString());
  url.searchParams.set("endTime", new Date(endTimeMillis).toISOString());
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

function mergeRows(rows: DailyBucket[]) {
  const map = new Map<string, DailyBucket>();

  for (const row of rows) {
    const existing = map.get(row.date);

    if (!existing) {
      map.set(row.date, row);
      continue;
    }

    existing.steps += row.steps;
    existing.calories += row.calories;
    existing.distanceM += row.distanceM;
    existing.activeMillis += row.activeMillis;
    existing.raw = {
      merged: true,
      rows: [existing.raw, row.raw],
    };
  }

  return Array.from(map.values()).sort((a, b) => b.startMs - a.startMs);
}

async function fetchGoogleFitAggregateChunked(accessToken: string, days = 30) {
  const safeDays = Math.min(Math.max(days || 30, 1), 365);
  const chunkDays = 30;

  const endMs = Date.now();
  const startMs = endMs - safeDays * 24 * 60 * 60 * 1000;

  let cursorStart = startMs;
  const allRows: DailyBucket[] = [];

  while (cursorStart < endMs) {
    const cursorEnd = Math.min(
      cursorStart + chunkDays * 24 * 60 * 60 * 1000,
      endMs
    );

    const aggregate = await fetchGoogleFitAggregateRange(
      accessToken,
      cursorStart,
      cursorEnd
    );

    const rows = parseGoogleFitBuckets(aggregate);
    allRows.push(...rows);

    cursorStart = cursorEnd;
  }

  return mergeRows(allRows);
}

async function saveDailyActivity(
  supabase: any,
  participantId: number,
  row: DailyBucket
) {
  const externalId = `google_fit_daily_${participantId}_${row.date}`;
  const distanceKm = row.distanceM > 0 ? round(row.distanceM / 1000, 2) : null;
  const durationMinutes =
    row.activeMillis > 0 ? round(row.activeMillis / 60000, 1) : null;

  const activityName =
    row.steps > 0
      ? `Google Fit Daily - ${new Intl.NumberFormat("id-ID").format(row.steps)} steps`
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
      kind: "daily_aggregate",
      date: row.date,
      steps: row.steps,
      calories: row.calories,
      distance_m: row.distanceM,
      active_millis: row.activeMillis,
      synced_at: new Date().toISOString(),
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

async function saveWorkoutSession(
  supabase: any,
  participantId: number,
  session: FitSession
) {
  const sessionId =
    clean(session?.id) ||
    clean(session?.name) ||
    `${clean(session?.startTimeMillis)}_${clean(session?.endTimeMillis)}`;

  if (!sessionId) {
    return { skipped: true };
  }

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

  const { error } = await supabase
    .from("wellness_activity_logs")
    .insert(payload);

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

    const rows = await fetchGoogleFitAggregateChunked(accessToken, days);
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
      fetched_sessions: sessions.length,
      fetched_daily: rows.length,
      fetched: sessions.length + rows.length,
      inserted,
      updated,
      skipped,
      message:
        sessions.length + rows.length > 0
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