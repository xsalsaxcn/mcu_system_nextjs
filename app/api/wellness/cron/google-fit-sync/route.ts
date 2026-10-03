import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { reconcileWorkoutDailyPoint } from "@/lib/wellness/pointWriter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// WELLNESS_GOOGLE_FIT_AUTOSYNC_V1
// Nightly server-side backfill for active Google Fit participants.
// Uses the same Google Fit aggregate data types as the participant sync route.
// Does NOT change streak/point rules. It only refreshes canonical activity rows
// and runs the existing idempotent workout_daily reconciliation afterward.

const TZ = "Asia/Jakarta";
const MARKER = "WELLNESS_GOOGLE_FIT_AUTOSYNC_V1";
const DAYS = 3;
const CONCURRENCY = 4;

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const text = clean(value);
  if (!text) return 0;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function active(value: any) {
  return ![false, 0, "0", "false", "inactive", "nonaktif"].includes(
    typeof value === "string" ? value.toLowerCase() : value,
  );
}

function authorized(req: NextRequest) {
  const secret = clean(process.env.CRON_SECRET);
  if (!secret) return false;
  return clean(req.headers.get("authorization")) === `Bearer ${secret}`;
}

function jakartaDateKey(ms: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const y = parts.find((item) => item.type === "year")?.value;
  const m = parts.find((item) => item.type === "month")?.value;
  const d = parts.find((item) => item.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : new Date(ms).toISOString().slice(0, 10);
}

function todayKey() {
  return jakartaDateKey(Date.now());
}

function dayStartUtc(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0));
}

function addDays(dateKey: string, days: number) {
  return jakartaDateKey(dayStartUtc(dateKey).getTime() + days * 86400000);
}

function fitValue(value: any) {
  if (!value) return 0;
  if (value.intVal !== undefined && value.intVal !== null) return Number(value.intVal) || 0;
  if (value.fpVal !== undefined && value.fpVal !== null) return Number(value.fpVal) || 0;
  if (value.stringVal !== undefined && value.stringVal !== null) return Number(value.stringVal) || 0;
  return 0;
}

function estimateDistance(steps: number) {
  return steps > 0 ? Math.round(steps * 0.0007 * 100) / 100 : 0;
}

function estimateMinutes(steps: number) {
  return steps > 0 ? Math.round((steps / 100) * 10) / 10 : 0;
}

function participantWeight(participant: any) {
  for (const key of [
    "current_weight_kg",
    "latest_weight_kg",
    "weight_kg",
    "baseline_weight_kg",
    "initial_weight_kg",
    "bb",
    "berat_badan",
  ]) {
    const value = numberValue(participant?.[key]);
    if (value > 0) return value;
  }
  return 70;
}

function estimateCalories(steps: number, distanceKm: number, weightKg: number) {
  if (!(steps > 0)) return 0;
  const distance = distanceKm > 0 ? distanceKm : estimateDistance(steps);
  return Math.max(1, Math.round(distance * (weightKg || 70) * 0.53));
}

async function refreshAccessToken(supabase: any, integration: any) {
  const expiresAt = integration?.expires_at
    ? new Date(integration.expires_at).getTime()
    : 0;

  if (clean(integration?.access_token) && expiresAt > Date.now() + 60000) {
    return clean(integration.access_token);
  }

  const refreshToken = clean(integration?.refresh_token);
  if (!refreshToken) {
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

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
    cache: "no-store",
  });

  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok || !clean(payload?.access_token)) {
    throw new Error(
      `TOKEN_ERROR: ${
        clean(payload?.error_description || payload?.error) ||
        "Gagal refresh Google token."
      }`,
    );
  }

  const accessToken = clean(payload.access_token);
  const expiresAtIso = new Date(
    Date.now() + Number(payload.expires_in || 3600) * 1000,
  ).toISOString();

  const saved = await supabase
    .from("wellness_integrations")
    .update({
      access_token: accessToken,
      expires_at: expiresAtIso,
      updated_at: new Date().toISOString(),
    })
    .eq("id", integration.id);

  if (saved.error) throw saved.error;
  return accessToken;
}

async function aggregate(
  accessToken: string,
  dataTypeName: string,
  start: Date,
  end: Date,
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
        aggregateBy: [{ dataTypeName }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis: start.getTime(),
        endTimeMillis: end.getTime(),
      }),
      cache: "no-store",
    },
  );

  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        payload?.error ||
        `Google Fit HTTP ${response.status}`,
    );
  }

  const rows = new Map<string, number>();

  for (const bucket of Array.isArray(payload?.bucket) ? payload.bucket : []) {
    const date = bucket?.startTimeMillis
      ? jakartaDateKey(Number(bucket.startTimeMillis))
      : "";
    if (!date) continue;

    let total = 0;
    for (const dataset of Array.isArray(bucket?.dataset) ? bucket.dataset : []) {
      for (const point of Array.isArray(dataset?.point) ? dataset.point : []) {
        total += (Array.isArray(point?.value) ? point.value : []).reduce(
          (sum: number, item: any) => sum + fitValue(item),
          0,
        );
      }
    }

    if (total > 0) rows.set(date, (rows.get(date) || 0) + total);
  }

  return rows;
}

async function safeAggregate(
  accessToken: string,
  dataTypeName: string,
  start: Date,
  end: Date,
) {
  try {
    return {
      ok: true,
      rows: await aggregate(accessToken, dataTypeName, start, end),
      message: "",
    };
  } catch (error: any) {
    return {
      ok: false,
      rows: new Map<string, number>(),
      message: error?.message || String(error),
    };
  }
}

async function upsertDailyRow(params: {
  supabase: any;
  participant: any;
  date: string;
  steps: number;
  distanceKm: number;
  durationMinutes: number;
  calories: number;
  googleDistance: number;
  googleMinutes: number;
  googleCalories: number;
  syncedAt: string;
}) {
  const participantId = Number(params.participant.id);
  const externalId = `google_fit_daily_${participantId}_${params.date}`;

  const existing = await params.supabase
    .from("wellness_activity_logs")
    .select("id,raw_payload")
    .eq("participant_id", participantId)
    .eq("source", "google_fit")
    .eq("external_activity_id", externalId)
    .maybeSingle();

  if (existing.error) throw existing.error;

  const raw = existing.data?.raw_payload || {};
  const nativeProtected =
    raw?.native_snapshot_persisted === true &&
    clean(raw?.exact_snapshot?.date || raw?.log_date).slice(0, 10) === params.date;

  if (nativeProtected) {
    return { action: "skipped_native" };
  }

  const payload = {
    participant_id: participantId,
    source: "google_fit",
    external_activity_id: externalId,
    provider_activity_id: externalId,
    activity_type: "Google Fit Daily",
    activity_name: `Google Fit Daily - ${params.steps} steps`,
    log_date: params.date,
    started_at: params.syncedAt,
    duration_minutes: params.durationMinutes,
    calories: params.calories,
    distance_km: params.distanceKm,
    steps: params.steps,
    raw_payload: {
      marker: MARKER,
      provider: "google_fit",
      sync_mode: "cron_aggregate_daily",
      log_date: params.date,
      last_sync_at: params.syncedAt,
      synced_at: params.syncedAt,
      google_fit_steps: params.steps,
      google_fit_distance_km: params.googleDistance,
      google_fit_calories_expended: params.googleCalories,
      google_fit_active_minutes: params.googleMinutes,
      estimated_distance_used: !(params.googleDistance > 0) && params.steps > 0,
      estimated_active_minutes_used: !(params.googleMinutes > 0) && params.steps > 0,
      estimated_calories_used: !(params.googleCalories > 0) && params.steps > 0,
      calories_source:
        params.googleCalories > 0
          ? "google_fit_calories_expended"
          : "estimated_from_steps_distance_weight",
      distance_source:
        params.googleDistance > 0
          ? "google_fit_distance_delta"
          : "estimated_from_steps",
      duration_source:
        params.googleMinutes > 0
          ? "google_fit_active_minutes"
          : "estimated_from_steps",
    },
  };

  if (existing.data?.id) {
    const saved = await params.supabase
      .from("wellness_activity_logs")
      .update(payload)
      .eq("id", existing.data.id);
    if (saved.error) throw saved.error;
    return { action: "updated" };
  }

  const saved = await params.supabase
    .from("wellness_activity_logs")
    .insert(payload);
  if (saved.error) throw saved.error;
  return { action: "inserted" };
}

async function syncOne(params: {
  supabase: any;
  participant: any;
  integration: any;
}) {
  const { supabase, participant, integration } = params;
  const participantId = Number(participant.id);

  const accessToken = await refreshAccessToken(supabase, integration);

  const today = todayKey();
  const startKey = addDays(today, -(DAYS - 1));
  const start = dayStartUtc(startKey);
  const end = dayStartUtc(addDays(today, 1));

  const [stepsResult, distanceResult, caloriesResult, minutesResult] =
    await Promise.all([
      safeAggregate(accessToken, "com.google.step_count.delta", start, end),
      safeAggregate(accessToken, "com.google.distance.delta", start, end),
      safeAggregate(accessToken, "com.google.calories.expended", start, end),
      safeAggregate(accessToken, "com.google.active_minutes", start, end),
    ]);

  if (!stepsResult.ok) {
    throw new Error(`STEPS_READ_FAILED: ${stepsResult.message}`);
  }

  const dates = new Set<string>();
  for (let i = 0; i < DAYS; i += 1) dates.add(addDays(startKey, i));
  for (const result of [
    stepsResult,
    distanceResult,
    caloriesResult,
    minutesResult,
  ]) {
    for (const key of result.rows.keys()) dates.add(key);
  }

  const programStartDate = clean(participant?.program_start_date).slice(0, 10);
  const weightKg = participantWeight(participant);
  const syncedAt = new Date().toISOString();

  let inserted = 0;
  let updated = 0;
  let skippedNative = 0;
  const pointReconciliation: any[] = [];

  for (const date of [...dates].sort()) {
    if (programStartDate && date < programStartDate) continue;

    const steps = Math.round(Number(stepsResult.rows.get(date) || 0));
    const googleDistance =
      Math.round(
        (Number(distanceResult.rows.get(date) || 0) / 1000) * 100,
      ) / 100;
    const distanceKm =
      googleDistance > 0 ? googleDistance : estimateDistance(steps);
    const googleMinutes =
      Math.round(Number(minutesResult.rows.get(date) || 0) * 10) / 10;
    const durationMinutes =
      googleMinutes > 0 ? googleMinutes : estimateMinutes(steps);
    const googleCalories =
      Math.round(Number(caloriesResult.rows.get(date) || 0) * 10) / 10;
    const calories =
      googleCalories > 0
        ? googleCalories
        : estimateCalories(steps, distanceKm, weightKg);

    if (!(steps > 0 || distanceKm > 0 || durationMinutes > 0 || calories > 0)) {
      continue;
    }

    const saved = await upsertDailyRow({
      supabase,
      participant,
      date,
      steps,
      distanceKm,
      durationMinutes,
      calories,
      googleDistance,
      googleMinutes,
      googleCalories,
      syncedAt,
    });

    if (saved.action === "inserted") inserted += 1;
    if (saved.action === "updated") updated += 1;
    if (saved.action === "skipped_native") {
      skippedNative += 1;
      continue;
    }

    const pointResult = await reconcileWorkoutDailyPoint({
      supabase,
      participant,
      logDate: date,
    });

    pointReconciliation.push({
      date,
      ok: pointResult.ok,
      points: pointResult.points,
      calories: pointResult.calories,
      target: pointResult.target,
      warning: pointResult.warning || "",
    });
  }

  const integrationUpdate = await supabase
    .from("wellness_integrations")
    .update({
      last_sync_at: syncedAt,
      updated_at: syncedAt,
    })
    .eq("id", integration.id);

  if (integrationUpdate.error) throw integrationUpdate.error;

  return {
    participant_id: participantId,
    inserted,
    updated,
    skipped_native: skippedNative,
    warnings: [
      distanceResult.ok ? "" : `Distance: ${distanceResult.message}`,
      caloriesResult.ok ? "" : `Calories: ${caloriesResult.message}`,
      minutesResult.ok ? "" : `Active minutes: ${minutesResult.message}`,
    ].filter(Boolean),
    point_reconciliation: pointReconciliation,
  };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json(
      { ok: false, marker: MARKER, message: "Cron authorization tidak valid." },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  const startedAt = new Date().toISOString();

  try {
    const integrationsResult = await supabase
      .from("wellness_integrations")
      .select("*")
      .eq("provider", "google_fit")
      .neq("is_active", 0)
      .order("participant_id", { ascending: true })
      .limit(2000);

    if (integrationsResult.error) throw integrationsResult.error;

    const integrations = integrationsResult.data || [];
    const participantIds = Array.from(
      new Set(
        integrations
          .map((row: any) => Number(row?.participant_id || 0))
          .filter((id: number) => id > 0),
      ),
    );

    const [participantsResult, controlsResult] = participantIds.length
      ? await Promise.all([
          supabase
            .from("wellness_participants")
            .select("*")
            .in("id", participantIds),
          supabase
            .from("wellness_participant_controls")
            .select("*")
            .in("participant_id", participantIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];

    if (participantsResult.error) throw participantsResult.error;
    if (
      controlsResult.error &&
      !/does not exist|schema cache/i.test(clean(controlsResult.error.message))
    ) {
      throw controlsResult.error;
    }

    const participantsById = new Map<number, any>(
      (participantsResult.data || []).map((row: any) => [Number(row.id), row]),
    );
    const controlsByParticipant = new Map<number, any>(
      (controlsResult.data || []).map((row: any) => [
        Number(row.participant_id),
        row,
      ]),
    );

    const targets = integrations.filter((integration: any) => {
      const participantId = Number(integration?.participant_id || 0);
      const participant = participantsById.get(participantId);
      if (!participant?.id) return false;

      const control = controlsByParticipant.get(participantId);
      if (!control) return true;

      const source = clean(control?.fitness_source || "none")
        .toLowerCase()
        .replace(/-/g, "_");

      if (control?.session_enabled === false || control?.session_enabled === 0) {
        return false;
      }
      if (
        control?.fitness_enabled === false ||
        control?.fitness_enabled === 0 ||
        source !== "google_fit"
      ) {
        return false;
      }

      return true;
    });

    const results: any[] = [];

    for (let index = 0; index < targets.length; index += CONCURRENCY) {
      const group = targets.slice(index, index + CONCURRENCY);

      const groupResults = await Promise.all(
        group.map(async (integration: any) => {
          const participantId = Number(integration?.participant_id || 0);
          const participant = participantsById.get(participantId);

          try {
            const result = await syncOne({
              supabase,
              participant,
              integration,
            });

            return {
              ok: true,
              participant: {
                id: participantId,
                code: clean(participant?.code),
                name: clean(participant?.name),
              },
              ...result,
            };
          } catch (error: any) {
            return {
              ok: false,
              participant: {
                id: participantId,
                code: clean(participant?.code),
                name: clean(participant?.name),
              },
              error: error?.message || String(error),
            };
          }
        }),
      );

      results.push(...groupResults);
    }

    const successRows = results.filter((row) => row.ok);
    const failedRows = results.filter((row) => !row.ok);

    return NextResponse.json({
      ok: failedRows.length === 0,
      marker: MARKER,
      mode: "nightly_server_backfill",
      timezone: TZ,
      days: DAYS,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      integrations_found: integrations.length,
      eligible: targets.length,
      skipped_by_source_control: integrations.length - targets.length,
      successful: successRows.length,
      failed: failedRows.length,
      inserted: successRows.reduce(
        (sum, row) => sum + Number(row.inserted || 0),
        0,
      ),
      updated: successRows.reduce(
        (sum, row) => sum + Number(row.updated || 0),
        0,
      ),
      skipped_native: successRows.reduce(
        (sum, row) => sum + Number(row.skipped_native || 0),
        0,
      ),
      failures: failedRows.slice(0, 100),
      results,
      note:
        "Canonical Google Fit aggregate backfill. Existing streak/point rules are unchanged; workout_daily uses the existing idempotent reconciliation after activity updates.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        marker: MARKER,
        message: error?.message || "Google Fit autosync cron gagal.",
      },
      { status: 500 },
    );
  }
}
