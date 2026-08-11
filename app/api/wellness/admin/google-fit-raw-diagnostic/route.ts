import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// WELLNESS_GOOGLE_FIT_RAW_DIAGNOSTIC_V126M58_1
// Admin-only, read-only diagnostic. No Supabase writes, no Google Fit writes.

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "supervisor",
  "doctor",
  "wellness_admin",
]);
const TZ = "Asia/Jakarta";
const TYPES = [
  "com.google.step_count.delta",
  "com.google.distance.delta",
  "com.google.calories.expended",
  "com.google.active_minutes",
  "com.google.activity.segment",
] as const;

function clean(value: any) {
  return String(value ?? "").trim();
}
function num(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function adminUser(req: NextRequest) {
  const user: any = getSessionUser(req);
  return user && ADMIN_ROLES.has(clean(user?.role).toLowerCase()) ? user : null;
}
function json(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
function jakartaDateKey(ms: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : new Date(ms).toISOString().slice(0, 10);
}
function jakartaStart(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, -7, 0, 0, 0));
}
function addDays(dateKey: string, delta: number) {
  return jakartaDateKey(jakartaStart(dateKey).getTime() + delta * 86400000);
}
function fitValue(value: any) {
  if (!value) return 0;
  if (value.intVal !== undefined && value.intVal !== null) return num(value.intVal);
  if (value.fpVal !== undefined && value.fpVal !== null) return num(value.fpVal);
  if (value.stringVal !== undefined && value.stringVal !== null) return num(value.stringVal);
  return 0;
}
function pointValue(point: any) {
  return (Array.isArray(point?.value) ? point.value : []).reduce(
    (sum: number, item: any) => sum + fitValue(item),
    0,
  );
}
async function googleJson(url: string, token: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = clean(body?.error?.message || body?.error_description || body?.error) || `Google HTTP ${res.status}`;
    throw new Error(message);
  }
  return body;
}
async function ephemeralAccessToken(integration: any) {
  const stored = clean(integration?.access_token);
  const expires = integration?.expires_at ? new Date(integration.expires_at).getTime() : 0;
  if (stored && (!expires || expires > Date.now() + 60000)) {
    return { token: stored, mode: "stored_access_token" };
  }
  const refresh = clean(integration?.refresh_token);
  if (!refresh) throw new Error("TOKEN_ERROR: refresh_token Google Fit tidak tersedia.");
  const clientId = clean(process.env.GOOGLE_FIT_CLIENT_ID) || clean(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = clean(process.env.GOOGLE_FIT_CLIENT_SECRET) || clean(process.env.GOOGLE_CLIENT_SECRET);
  if (!clientId || !clientSecret) throw new Error("Konfigurasi Google Fit server belum lengkap.");
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || !clean(body?.access_token)) {
    throw new Error(`TOKEN_ERROR: ${clean(body?.error_description || body?.error) || "gagal refresh token"}`);
  }
  return { token: clean(body.access_token), mode: "ephemeral_refresh_not_persisted" };
}
async function aggregateDaily(token: string, type: string, start: Date, end: Date) {
  const body = await googleJson(
    "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        aggregateBy: [{ dataTypeName: type }],
        bucketByTime: { period: { type: "day", value: 1, timeZoneId: TZ } },
        startTimeMillis: start.getTime(),
        endTimeMillis: end.getTime(),
      }),
    },
  );
  return (Array.isArray(body?.bucket) ? body.bucket : []).map((bucket: any) => {
    let total = 0;
    let pointCount = 0;
    for (const dataset of Array.isArray(bucket?.dataset) ? bucket.dataset : []) {
      for (const point of Array.isArray(dataset?.point) ? dataset.point : []) {
        total += pointValue(point);
        pointCount += 1;
      }
    }
    return {
      date: jakartaDateKey(Number(bucket?.startTimeMillis || 0)),
      total: Math.round(total * 100) / 100,
      point_count: pointCount,
    };
  });
}
async function dataSources(token: string, type: string) {
  const url = new URL("https://www.googleapis.com/fitness/v1/users/me/dataSources");
  url.searchParams.set("dataTypeName", type);
  const body = await googleJson(url.toString(), token);
  return (Array.isArray(body?.dataSource) ? body.dataSource : []).map((s: any) => ({
    data_stream_id: clean(s?.dataStreamId),
    data_stream_name: clean(s?.dataStreamName),
    type: clean(s?.type),
    data_type: clean(s?.dataType?.name),
    application: {
      name: clean(s?.application?.name),
      package_name: clean(s?.application?.packageName),
      version: clean(s?.application?.version),
    },
    device: s?.device
      ? {
          manufacturer: clean(s.device.manufacturer),
          model: clean(s.device.model),
          type: clean(s.device.type),
          uid: clean(s.device.uid),
          version: clean(s.device.version),
        }
      : null,
  }));
}
async function rawDataset(token: string, sourceId: string, start: Date, end: Date) {
  const datasetId = `${Math.floor(start.getTime() * 1e6)}-${Math.floor(end.getTime() * 1e6)}`;
  const url = new URL(
    `https://www.googleapis.com/fitness/v1/users/me/dataSources/${encodeURIComponent(sourceId)}/datasets/${datasetId}`,
  );
  url.searchParams.set("limit", "100");
  const body = await googleJson(url.toString(), token);
  const points = Array.isArray(body?.point) ? body.point : [];
  return {
    point_count_returned: points.length,
    next_page_token: clean(body?.nextPageToken) || null,
    samples: points.slice(0, 12).map((p: any) => ({
      start_time_nanos: clean(p?.startTimeNanos),
      end_time_nanos: clean(p?.endTimeNanos),
      data_type_name: clean(p?.dataTypeName),
      origin_data_source_id: clean(p?.originDataSourceId),
      modified_time_millis: clean(p?.modifiedTimeMillis),
      value: p?.value || [],
      numeric_sum: Math.round(pointValue(p) * 100) / 100,
    })),
  };
}

export async function GET(req: NextRequest) {
  if (!adminUser(req)) return json({ ok: false, message: "Akses Admin Wellness diperlukan." }, 401);
  const participantId = Number(req.nextUrl.searchParams.get("participant_id") || 0);
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days") || 3), 1), 7);
  if (!participantId) return json({ ok: false, message: "participant_id wajib diisi." }, 400);

  const supabase = getSupabaseAdmin();
  try {
    const [participantResult, integrationResult, rowsResult] = await Promise.all([
      supabase.from("wellness_participants").select("*").eq("id", participantId).maybeSingle(),
      supabase
        .from("wellness_integrations")
        .select("*")
        .eq("participant_id", participantId)
        .eq("provider", "google_fit")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("wellness_activity_logs")
        .select("id,log_date,started_at,steps,calories,duration_minutes,distance_km,external_activity_id,raw_payload,created_at,updated_at")
        .eq("participant_id", participantId)
        .eq("source", "google_fit")
        .order("log_date", { ascending: false })
        .limit(30),
    ]);
    if (participantResult.error) throw participantResult.error;
    if (integrationResult.error) throw integrationResult.error;
    if (rowsResult.error) throw rowsResult.error;
    const participant: any = participantResult.data;
    const integration: any = integrationResult.data;
    if (!participant) return json({ ok: false, message: "Peserta Wellness tidak ditemukan." }, 404);
    if (!integration) return json({ ok: false, message: "Google Fit belum terkoneksi untuk peserta ini." }, 409);

    const tokenInfo = await ephemeralAccessToken(integration);
    const today = jakartaDateKey(Date.now());
    const startKey = addDays(today, -(days - 1));
    const start = jakartaStart(startKey);
    const end = jakartaStart(addDays(today, 1));

    const errors: Record<string, string> = {};
    let account: any = null;
    try {
      const u = await googleJson("https://openidconnect.googleapis.com/v1/userinfo", tokenInfo.token);
      account = { sub: clean(u?.sub), email: clean(u?.email), name: clean(u?.name), picture: clean(u?.picture) };
    } catch (e: any) {
      errors.userinfo = e?.message || String(e);
    }

    const aggregates: Record<string, any[]> = {};
    const sources: Record<string, any[]> = {};
    await Promise.all(
      TYPES.map(async (type) => {
        try {
          aggregates[type] = await aggregateDaily(tokenInfo.token, type, start, end);
        } catch (e: any) {
          aggregates[type] = [];
          errors[`aggregate:${type}`] = e?.message || String(e);
        }
        try {
          sources[type] = await dataSources(tokenInfo.token, type);
        } catch (e: any) {
          sources[type] = [];
          errors[`sources:${type}`] = e?.message || String(e);
        }
      }),
    );

    let sessions: any[] = [];
    try {
      const url = new URL("https://www.googleapis.com/fitness/v1/users/me/sessions");
      url.searchParams.set("startTime", start.toISOString());
      url.searchParams.set("endTime", end.toISOString());
      const s = await googleJson(url.toString(), tokenInfo.token);
      sessions = (Array.isArray(s?.session) ? s.session : []).map((x: any) => ({
        id: clean(x?.id),
        name: clean(x?.name),
        description: clean(x?.description),
        activity_type: x?.activityType ?? null,
        start_time_millis: clean(x?.startTimeMillis),
        end_time_millis: clean(x?.endTimeMillis),
        active_time_millis: clean(x?.activeTimeMillis),
        application: {
          name: clean(x?.application?.name),
          package_name: clean(x?.application?.packageName),
          version: clean(x?.application?.version),
        },
      }));
    } catch (e: any) {
      errors.sessions = e?.message || String(e);
    }

    const rawSources = Object.values(sources)
      .flat()
      .filter((x: any) => clean(x?.data_stream_id))
      .slice(0, 12) as any[];
    const raw_points: any[] = [];
    for (const source of rawSources) {
      try {
        raw_points.push({
          data_stream_id: source.data_stream_id,
          data_type: source.data_type,
          application: source.application,
          device: source.device,
          ...(await rawDataset(tokenInfo.token, source.data_stream_id, start, end)),
        });
      } catch (e: any) {
        raw_points.push({
          data_stream_id: source.data_stream_id,
          data_type: source.data_type,
          application: source.application,
          device: source.device,
          error: e?.message || String(e),
          point_count_returned: 0,
          samples: [],
        });
      }
    }

    const meaningfulAggregate = Object.values(aggregates)
      .flat()
      .some((x: any) => num(x?.total) > 0 || num(x?.point_count) > 0);
    const meaningfulRaw = raw_points.some((x: any) => num(x?.point_count_returned) > 0);
    const dbRows = Array.isArray(rowsResult.data) ? rowsResult.data : [];
    let verdict = "GOOGLE_CLOUD_NO_ACTIVITY_IN_RANGE";
    if (meaningfulAggregate || meaningfulRaw || sessions.length > 0) {
      verdict = dbRows.length > 0 ? "CLOUD_AND_DB_HAVE_DATA" : "CLOUD_HAS_DATA_BUT_DB_EMPTY";
    }
    if (!meaningfulAggregate && !meaningfulRaw && sessions.length > 0) {
      verdict = "SESSIONS_EXIST_BUT_ACTIVITY_AGGREGATE_EMPTY";
    }

    return json({
      ok: true,
      marker: "WELLNESS_GOOGLE_FIT_RAW_DIAGNOSTIC_V126M58_1",
      read_only: true,
      participant: {
        id: Number(participant.id),
        code: clean(participant.code),
        name: clean(participant.name),
        participant_email: clean(participant.email),
      },
      oauth_account: account,
      oauth_email_signal:
        clean(participant.email) && clean(account?.email)
          ? clean(participant.email).toLowerCase() === clean(account.email).toLowerCase()
            ? "SAME_AS_PARTICIPANT_EMAIL"
            : "DIFFERENT_FROM_PARTICIPANT_EMAIL_NOT_NECESSARILY_ERROR"
          : "UNKNOWN",
      integration: {
        id: integration.id,
        is_active: ![false, 0, "0"].includes(integration.is_active),
        provider_user_id: clean(integration.provider_user_id),
        scope: clean(integration.scope),
        accepted_scope: clean(integration?.raw_payload?.scope),
        connected_at: integration.connected_at || null,
        last_sync_at: integration.last_sync_at || null,
        expires_at: integration.expires_at || null,
        token_mode: tokenInfo.mode,
        has_access_token: Boolean(clean(integration.access_token)),
        has_refresh_token: Boolean(clean(integration.refresh_token)),
      },
      range: { days, start_date: startKey, end_date: today, timezone: TZ },
      verdict,
      db_google_fit_rows: dbRows,
      cloud: { aggregates, sessions, data_sources: sources, raw_points },
      errors,
      note: "Diagnostic only. No Supabase or Google Fit write was executed.",
    });
  } catch (e: any) {
    const message = e?.message || "Raw Google Fit diagnostic gagal.";
    return json(
      {
        ok: false,
        marker: "WELLNESS_GOOGLE_FIT_RAW_DIAGNOSTIC_V126M58_1",
        read_only: true,
        message,
      },
      /TOKEN_ERROR|invalid_grant|unauthorized/i.test(message) ? 409 : 500,
    );
  }
}
