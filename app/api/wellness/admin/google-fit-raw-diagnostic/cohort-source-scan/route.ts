import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// WELLNESS_GOOGLE_FIT_COHORT_SOURCE_SCAN_V1
// Admin-only + READ ONLY.
// Purpose: detect cross-participant Google Fit source divergence.
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

const KEY_SOURCE_NAMES = new Set([
  "estimated_steps",
  "merge_step_deltas",
  "HealthSync - steps",
]);

function clean(value: any) {
  return String(value ?? "").trim();
}

function num(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
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

  return y && m && d
    ? `${y}-${m}-${d}`
    : new Date(ms).toISOString().slice(0, 10);
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
  const expires = integration?.expires_at
    ? new Date(integration.expires_at).getTime()
    : 0;

  if (stored && (!expires || expires > Date.now() + 60000)) {
    return { token: stored, mode: "stored_access_token" };
  }

  const refresh = clean(integration?.refresh_token);
  if (!refresh) {
    throw new Error("TOKEN_ERROR: refresh_token Google Fit tidak tersedia.");
  }

  const clientId =
    clean(process.env.GOOGLE_FIT_CLIENT_ID) ||
    clean(process.env.GOOGLE_CLIENT_ID);
  const clientSecret =
    clean(process.env.GOOGLE_FIT_CLIENT_SECRET) ||
    clean(process.env.GOOGLE_CLIENT_SECRET);

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
      `TOKEN_ERROR: ${
        clean(payload?.error_description || payload?.error) ||
        "gagal refresh token"
      }`,
    );
  }

  return {
    token: clean(payload.access_token),
    mode: "ephemeral_refresh_not_persisted",
  };
}

async function listStepSources(token: string) {
  const url = new URL(
    "https://www.googleapis.com/fitness/v1/users/me/dataSources",
  );
  url.searchParams.set("dataTypeName", STEP_TYPE);

  const probe = await probeJson(url.toString(), token);

  if (!probe.ok) {
    throw new Error(
      probe.error || "Gagal membaca Google Fit step data sources.",
    );
  }

  const rows = Array.isArray(probe.body?.dataSource)
    ? probe.body.dataSource
    : [];

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

async function aggregateByDataType(
  token: string,
  start: Date,
  end: Date,
) {
  const probe = await probeJson(
    "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        aggregateBy: [{ dataTypeName: STEP_TYPE }],
        bucketByTime: {
          period: { type: "day", value: 1, timeZoneId: TZ },
        },
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
        bucketByTime: {
          period: { type: "day", value: 1, timeZoneId: TZ },
        },
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

function divergencePercent(base: number, candidate: number | null) {
  if (candidate === null) return null;
  const denominator = Math.max(Math.abs(base), 1);
  return round2((Math.abs(candidate - base) / denominator) * 100);
}

function classifyDivergence(values: Array<number | null>, base: number) {
  const present = values.filter(
    (value): value is number =>
      value !== null && Number.isFinite(value),
  );

  if (!present.length) return "NO_KEY_SOURCE_TOTALS";

  const maxPct = Math.max(
    ...present.map((value) => divergencePercent(base, value) || 0),
  );

  if (maxPct >= 15) return "MULTI_SOURCE_DIVERGENCE";
  if (maxPct >= 5) return "MIXED_SOURCE_VARIANCE";
  return "SOURCES_ALIGNED";
}

export async function GET(req: NextRequest) {
  if (!adminUser(req)) {
    return json(
      { ok: false, message: "Akses Admin Wellness diperlukan." },
      401,
    );
  }

  const exact =
    clean(req.nextUrl.searchParams.get("date")) ||
    jakartaDateKey(Date.now());

  if (!/^\d{4}-\d{2}-\d{2}$/.test(exact)) {
    return json(
      { ok: false, message: "date harus YYYY-MM-DD." },
      400,
    );
  }

  const limitRaw = Number(req.nextUrl.searchParams.get("limit") || 10);
  const offsetRaw = Number(req.nextUrl.searchParams.get("offset") || 0);

  const limit = Math.min(
    Math.max(Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 10, 1),
    10,
  );
  const offset = Math.max(
    Number.isFinite(offsetRaw) ? Math.trunc(offsetRaw) : 0,
    0,
  );

  const supabase = getSupabaseAdmin();
  const start = jakartaStart(exact);
  const end = jakartaStart(addDays(exact, 1));

  try {
    const integrationsResult = await supabase
      .from("wellness_integrations")
      .select("*")
      .eq("provider", "google_fit")
      .eq("is_active", true)
      .order("participant_id", { ascending: true })
      .range(offset, offset + limit - 1);

    if (integrationsResult.error) throw integrationsResult.error;

    const integrations = Array.isArray(integrationsResult.data)
      ? integrationsResult.data
      : [];

    const participantIds = Array.from(
      new Set(
        integrations
          .map((row: any) => Number(row?.participant_id || 0))
          .filter((id: number) => id > 0),
      ),
    );

    const [participantsResult, dbRowsResult] = participantIds.length
      ? await Promise.all([
          supabase
            .from("wellness_participants")
            .select("*")
            .in("id", participantIds),
          supabase
            .from("wellness_activity_logs")
            .select(
              "id,participant_id,log_date,started_at,steps,external_activity_id,raw_payload,created_at,updated_at",
            )
            .in("participant_id", participantIds)
            .eq("source", "google_fit")
            .eq("log_date", exact),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];

    if (participantsResult.error) throw participantsResult.error;
    if (dbRowsResult.error) throw dbRowsResult.error;

    const participantsById = new Map<number, any>(
      (participantsResult.data || []).map((row: any) => [
        Number(row.id),
        row,
      ]),
    );

    const dbRowsByParticipant = new Map<number, any[]>();

    for (const row of dbRowsResult.data || []) {
      const id = Number((row as any)?.participant_id || 0);
      if (!dbRowsByParticipant.has(id)) {
        dbRowsByParticipant.set(id, []);
      }
      dbRowsByParticipant.get(id)!.push(row);
    }

    const results: any[] = [];

    // Sequential on purpose: keep Google API pressure low.
    for (const integration of integrations) {
      const participantId = Number(integration?.participant_id || 0);
      const participant = participantsById.get(participantId) || null;
      const dbRows = dbRowsByParticipant.get(participantId) || [];
      const dbSteps = dbRows.length
        ? Math.max(...dbRows.map((row: any) => num(row?.steps)))
        : null;

      try {
        const tokenInfo = await ephemeralAccessToken(integration);

        const [defaultAggregate, sources] = await Promise.all([
          aggregateByDataType(tokenInfo.token, start, end),
          listStepSources(tokenInfo.token),
        ]);

        const keySources = sources.filter((source: any) =>
          KEY_SOURCE_NAMES.has(source.data_stream_name),
        );

        const keyTotals: Record<string, any> = {};

        for (const source of keySources) {
          const aggregate = await aggregateBySource(
            tokenInfo.token,
            source.data_stream_id,
            start,
            end,
          );

          keyTotals[source.data_stream_name] = {
            data_stream_id: source.data_stream_id,
            application: source.application,
            device: source.device,
            total: aggregate.http_ok ? aggregate.total : null,
            http_status: aggregate.http_status,
            http_ok: aggregate.http_ok,
            error: aggregate.error,
          };
        }

        const defaultTotal = num(defaultAggregate.total);
        const estimated =
          keyTotals["estimated_steps"]?.total ?? null;
        const merged =
          keyTotals["merge_step_deltas"]?.total ?? null;
        const healthSync =
          keyTotals["HealthSync - steps"]?.total ?? null;

        const classification = classifyDivergence(
          [estimated, merged, healthSync],
          defaultTotal,
        );

        results.push({
          participant: {
            id: participantId,
            code: clean(participant?.code),
            name: clean(participant?.name),
            email: clean(
              participant?.participant_email || participant?.email,
            ),
          },
          integration: {
            id: Number(integration?.id || 0),
            token_mode: tokenInfo.mode,
            connected_at: integration?.connected_at || null,
            last_sync_at: integration?.last_sync_at || null,
          },
          date: exact,
          source_count: sources.length,
          default_google_fit_aggregate: defaultAggregate,
          db: {
            row_count: dbRows.length,
            steps: dbSteps,
            difference_from_cloud:
              dbSteps === null
                ? null
                : round2(dbSteps - defaultTotal),
          },
          key_sources: {
            estimated_steps: keyTotals["estimated_steps"] || null,
            merge_step_deltas:
              keyTotals["merge_step_deltas"] || null,
            healthsync_steps:
              keyTotals["HealthSync - steps"] || null,
          },
          divergence: {
            classification,
            estimated_vs_default_pct:
              divergencePercent(defaultTotal, estimated),
            merge_vs_default_pct:
              divergencePercent(defaultTotal, merged),
            healthsync_vs_default_pct:
              divergencePercent(defaultTotal, healthSync),
          },
          signals: {
            healthsync_present: Boolean(
              keyTotals["HealthSync - steps"],
            ),
            multiple_step_sources: sources.length > 1,
            db_cloud_match:
              dbSteps === null
                ? null
                : Math.abs(dbSteps - defaultTotal) < 0.5,
          },
        });
      } catch (error: any) {
        results.push({
          participant: {
            id: participantId,
            code: clean(participant?.code),
            name: clean(participant?.name),
            email: clean(
              participant?.participant_email || participant?.email,
            ),
          },
          date: exact,
          error: error?.message || String(error),
          read_only: true,
        });
      }
    }

    const successful = results.filter((row) => !row.error);
    const divergenceCount = successful.filter(
      (row) =>
        row?.divergence?.classification ===
        "MULTI_SOURCE_DIVERGENCE",
    ).length;
    const mixedCount = successful.filter(
      (row) =>
        row?.divergence?.classification ===
        "MIXED_SOURCE_VARIANCE",
    ).length;
    const alignedCount = successful.filter(
      (row) =>
        row?.divergence?.classification === "SOURCES_ALIGNED",
    ).length;
    const dbCloudMismatchCount = successful.filter(
      (row) => row?.signals?.db_cloud_match === false,
    ).length;

    return json({
      ok: true,
      marker: "WELLNESS_GOOGLE_FIT_COHORT_SOURCE_SCAN_V1",
      read_only: true,
      date: exact,
      timezone: TZ,
      utc_window: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      paging: {
        offset,
        limit,
        returned: results.length,
        next_offset:
          results.length === limit ? offset + limit : null,
      },
      summary: {
        successful: successful.length,
        errors: results.length - successful.length,
        multi_source_divergence: divergenceCount,
        mixed_source_variance: mixedCount,
        sources_aligned: alignedCount,
        db_cloud_mismatch: dbCloudMismatchCount,
        note:
          "This scan detects cloud datasource divergence; it cannot prove what a participant phone app displayed without device evidence.",
      },
      results,
      note:
        "READ ONLY. Tidak ada sync, update DB, write Google Fit, atau perubahan streak/point. Diagnostic cohort dibatasi maksimal 10 integrasi per request untuk menjaga tekanan API.",
    });
  } catch (error: any) {
    return json(
      {
        ok: false,
        marker: "WELLNESS_GOOGLE_FIT_COHORT_SOURCE_SCAN_V1",
        read_only: true,
        message:
          error?.message || "Google Fit cohort source scan gagal.",
      },
      500,
    );
  }
}
