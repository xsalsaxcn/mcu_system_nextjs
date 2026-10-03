import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// WELLNESS_GOOGLE_FIT_SOURCE_TOTALS_DIAGNOSTIC_V1
// Admin-only + READ ONLY.
// No Supabase write, no Google Fit write, no streak/point recalculation.

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "supervisor",
  "doctor",
  "wellness_admin",
]);
const TZ = "Asia/Jakarta";
const STEP_TYPE = "com.google.step_count.delta";
const MAX_DATASET_PAGES = 20;
const DATASET_PAGE_LIMIT = 1000;

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

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

async function probeJson(url: string, token: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const body: any = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    body,
    error: response.ok
      ? null
      : clean(body?.error?.message || body?.error_description || body?.error) ||
        `Google HTTP ${response.status}`,
  };
}

async function ephemeralAccessToken(integration: any) {
  const stored = clean(integration?.access_token);
  const expires = integration?.expires_at ? new Date(integration.expires_at).getTime() : 0;
  if (stored && (!expires || expires > Date.now() + 60000)) {
    return { token: stored, mode: "stored_access_token" };
  }

  const refresh = clean(integration?.refresh_token);
  if (!refresh) throw new Error("TOKEN_ERROR: refresh_token Google Fit tidak tersedia.");

  const clientId =
    clean(process.env.GOOGLE_FIT_CLIENT_ID) || clean(process.env.GOOGLE_CLIENT_ID);
  const clientSecret =
    clean(process.env.GOOGLE_FIT_CLIENT_SECRET) || clean(process.env.GOOGLE_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    throw new Error("Konfigurasi Google Fit server belum lengkap.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refresh,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok || !clean(payload?.access_token)) {
    throw new Error(
      `TOKEN_ERROR: ${clean(payload?.error_description || payload?.error) || "gagal refresh token"}`,
    );
  }

  return { token: clean(payload.access_token), mode: "ephemeral_refresh_not_persisted" };
}

async function listStepSources(token: string) {
  const url = new URL("https://www.googleapis.com/fitness/v1/users/me/dataSources");
  url.searchParams.set("dataTypeName", STEP_TYPE);
  const probe = await probeJson(url.toString(), token);
  if (!probe.ok) {
    throw new Error(probe.error || "Gagal membaca Google Fit step data sources.");
  }

  const rows = Array.isArray(probe.body?.dataSource) ? probe.body.dataSource : [];
  return rows.map((source: any) => ({
    data_stream_id: clean(source?.dataStreamId),
    data_stream_name: clean(source?.dataStreamName),
    type: clean(source?.type),
    data_type: clean(source?.dataType?.name),
    application: {
      name: clean(source?.application?.name),
      package_name: clean(source?.application?.packageName),
      version: clean(source?.application?.version),
    },
    device: source?.device
      ? {
          manufacturer: clean(source.device.manufacturer),
          model: clean(source.device.model),
          type: clean(source.device.type),
          uid: clean(source.device.uid),
          version: clean(source.device.version),
        }
      : null,
  }));
}

function aggregateSummary(body: any) {
  const buckets = Array.isArray(body?.bucket) ? body.bucket : [];
  let pointCount = 0;
  let total = 0;

  for (const bucket of buckets) {
    for (const dataset of Array.isArray(bucket?.dataset) ? bucket.dataset : []) {
      for (const point of Array.isArray(dataset?.point) ? dataset.point : []) {
        pointCount += 1;
        total += pointValue(point);
      }
    }
  }

  return {
    bucket_count: buckets.length,
    point_count: pointCount,
    total: round2(total),
  };
}

async function aggregateByDataType(token: string, start: Date, end: Date) {
  const probe = await probeJson(
    "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        aggregateBy: [{ dataTypeName: STEP_TYPE }],
        bucketByTime: { period: { type: "day", value: 1, timeZoneId: TZ } },
        startTimeMillis: start.getTime(),
        endTimeMillis: end.getTime(),
      }),
    },
  );

  return {
    http_status: probe.status,
    http_ok: probe.ok,
    error: probe.error,
    ...aggregateSummary(probe.body),
  };
}

async function aggregateBySource(
  token: string,
  sourceId: string,
  start: Date,
  end: Date,
) {
  const probe = await probeJson(
    "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        aggregateBy: [{ dataSourceId: sourceId }],
        bucketByTime: { period: { type: "day", value: 1, timeZoneId: TZ } },
        startTimeMillis: start.getTime(),
        endTimeMillis: end.getTime(),
      }),
    },
  );

  return {
    http_status: probe.status,
    http_ok: probe.ok,
    error: probe.error,
    ...aggregateSummary(probe.body),
  };
}

function nanosFromMillis(ms: number) {
  return (BigInt(Math.trunc(ms)) * BigInt(1000000)).toString();
}

async function rawDatasetTotal(
  token: string,
  sourceId: string,
  start: Date,
  end: Date,
) {
  const datasetId = `${nanosFromMillis(start.getTime())}-${nanosFromMillis(end.getTime())}`;
  const base = `https://www.googleapis.com/fitness/v1/users/me/dataSources/${encodeURIComponent(
    sourceId,
  )}/datasets/${datasetId}`;

  let pageToken = "";
  let pages = 0;
  let pointCount = 0;
  let total = 0;
  let truncated = false;
  let lastStatus = 200;
  let lastError: string | null = null;
  const samples: any[] = [];

  while (pages < MAX_DATASET_PAGES) {
    const url = new URL(base);
    url.searchParams.set("limit", String(DATASET_PAGE_LIMIT));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const probe = await probeJson(url.toString(), token);
    lastStatus = probe.status;
    lastError = probe.error;
    if (!probe.ok) {
      return {
        http_status: probe.status,
        http_ok: false,
        error: probe.error,
        pages,
        point_count: pointCount,
        total: round2(total),
        truncated,
        samples,
      };
    }

    pages += 1;
    const points = Array.isArray(probe.body?.point) ? probe.body.point : [];
    for (const point of points) {
      const value = pointValue(point);
      pointCount += 1;
      total += value;
      if (samples.length < 8) {
        samples.push({
          start_time_nanos: clean(point?.startTimeNanos),
          end_time_nanos: clean(point?.endTimeNanos),
          origin_data_source_id: clean(point?.originDataSourceId),
          numeric_sum: round2(value),
        });
      }
    }

    const next = clean(probe.body?.nextPageToken);
    if (!next) {
      pageToken = "";
      break;
    }
    pageToken = next;
  }

  if (pageToken) truncated = true;

  return {
    http_status: lastStatus,
    http_ok: !lastError,
    error: lastError,
    pages,
    point_count: pointCount,
    total: round2(total),
    truncated,
    samples,
  };
}

export async function GET(req: NextRequest) {
  if (!adminUser(req)) {
    return json({ ok: false, message: "Akses Admin Wellness diperlukan." }, 401);
  }

  const participantId = Number(req.nextUrl.searchParams.get("participant_id") || 0);
  if (!participantId) {
    return json({ ok: false, message: "participant_id wajib diisi." }, 400);
  }

  const exact = clean(req.nextUrl.searchParams.get("date")) || jakartaDateKey(Date.now());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exact)) {
    return json({ ok: false, message: "date harus YYYY-MM-DD." }, 400);
  }

  const expectedStepsRaw = clean(req.nextUrl.searchParams.get("expected_steps"));
  const expectedSteps = expectedStepsRaw ? Number(expectedStepsRaw) : null;
  if (expectedSteps !== null && (!Number.isFinite(expectedSteps) || expectedSteps < 0)) {
    return json({ ok: false, message: "expected_steps harus berupa angka >= 0." }, 400);
  }

  const supabase = getSupabaseAdmin();

  try {
    const [participantResult, integrationResult, dbResult] = await Promise.all([
      supabase
        .from("wellness_participants")
        .select("*")
        .eq("id", participantId)
        .maybeSingle(),
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
        .select(
          "id,log_date,started_at,steps,external_activity_id,raw_payload,created_at,updated_at",
        )
        .eq("participant_id", participantId)
        .eq("source", "google_fit")
        .eq("log_date", exact)
        .order("updated_at", { ascending: false }),
    ]);

    if (participantResult.error) throw participantResult.error;
    if (integrationResult.error) throw integrationResult.error;
    if (dbResult.error) throw dbResult.error;
    if (!participantResult.data) {
      return json({ ok: false, message: "Peserta Wellness tidak ditemukan." }, 404);
    }
    if (!integrationResult.data) {
      return json({ ok: false, message: "Google Fit belum terkoneksi." }, 409);
    }

    const tokenInfo = await ephemeralAccessToken(integrationResult.data);
    const start = jakartaStart(exact);
    const end = jakartaStart(addDays(exact, 1));

    const [userinfo, defaultAggregate, sources] = await Promise.all([
      probeJson("https://openidconnect.googleapis.com/v1/userinfo", tokenInfo.token),
      aggregateByDataType(tokenInfo.token, start, end),
      listStepSources(tokenInfo.token),
    ]);

    const sourceTotals = await Promise.all(
      sources.map(async (source: any) => {
        const [aggregate, raw] = await Promise.all([
          aggregateBySource(tokenInfo.token, source.data_stream_id, start, end),
          rawDatasetTotal(tokenInfo.token, source.data_stream_id, start, end),
        ]);

        const comparisonTotal = aggregate.http_ok ? aggregate.total : raw.total;
        const difference =
          expectedSteps === null ? null : round2(comparisonTotal - expectedSteps);

        return {
          ...source,
          aggregate,
          raw_dataset: raw,
          comparison_total: comparisonTotal,
          difference_from_expected: difference,
          exact_expected_match:
            expectedSteps === null ? null : Math.abs(comparisonTotal - expectedSteps) < 0.5,
        };
      }),
    );

    const ranked = [...sourceTotals].sort((a, b) => {
      if (expectedSteps !== null) {
        return (
          Math.abs(num(a.comparison_total) - expectedSteps) -
          Math.abs(num(b.comparison_total) - expectedSteps)
        );
      }
      return num(b.comparison_total) - num(a.comparison_total);
    });

    const dbRows = Array.isArray(dbResult.data) ? dbResult.data : [];
    const exactMatches =
      expectedSteps === null
        ? []
        : ranked
            .filter((row) => row.exact_expected_match)
            .map((row) => ({
              data_stream_id: row.data_stream_id,
              data_stream_name: row.data_stream_name,
              application: row.application,
              device: row.device,
              total: row.comparison_total,
            }));

    return json({
      ok: true,
      marker: "WELLNESS_GOOGLE_FIT_SOURCE_TOTALS_DIAGNOSTIC_V1",
      read_only: true,
      participant: {
        id: Number(participantResult.data.id),
        code: clean(participantResult.data.code),
        name: clean(participantResult.data.name),
        email: clean(
          participantResult.data.participant_email || participantResult.data.email,
        ),
      },
      date: exact,
      timezone: TZ,
      utc_window: { start: start.toISOString(), end: end.toISOString() },
      oauth: {
        email: clean(userinfo.body?.email),
        name: clean(userinfo.body?.name),
        http_status: userinfo.status,
        token_mode: tokenInfo.mode,
      },
      expected_steps: expectedSteps,
      default_google_fit_aggregate: defaultAggregate,
      db_rows: dbRows,
      source_count: sourceTotals.length,
      exact_matches: exactMatches,
      ranked_sources: ranked,
      note:
        "READ ONLY. Membandingkan total step per Google Fit datasource untuk satu tanggal Asia/Jakarta. Tidak ada sync, update DB, write Google Fit, atau perubahan streak/point.",
    });
  } catch (error: any) {
    const message = error?.message || "Source totals diagnostic gagal.";
    return json(
      {
        ok: false,
        marker: "WELLNESS_GOOGLE_FIT_SOURCE_TOTALS_DIAGNOSTIC_V1",
        read_only: true,
        message,
      },
      /TOKEN_ERROR|invalid_grant|unauthorized/i.test(message) ? 409 : 500,
    );
  }
}
