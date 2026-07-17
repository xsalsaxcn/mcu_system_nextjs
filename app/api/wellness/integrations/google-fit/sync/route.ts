// WELLNESS_GOOGLE_FIT_ACTIVE_CALORIE_GUARD_V70
// WELLNESS_GOOGLE_FIT_EXACT_LAST_SYNC_V79K
// WELLNESS_GOOGLE_FIT_CLOUD_RECONCILIATION_V79M
// Google Fit daily sync using Google Fit aggregate API.
// Goals:
// - Read daily aggregate numbers closer to Google Fit App.
// - Steps: com.google.step_count.delta
// - Distance: com.google.distance.delta
// - Calories: com.google.calories.expended
// - Move minutes: com.google.active_minutes
// - One Google Fit Daily row per participant per date.
// - Update same date row, do not duplicate.
// - started_at uses latest sync time, so UI no longer shows 07.00 bucket time.
// - log_date remains the wellness daily date in Asia/Jakarta.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

export const runtime = "nodejs";

const MARKER = "WELLNESS_GOOGLE_FIT_CLOUD_RECONCILIATION_V79M";
const JAKARTA_TIME_ZONE = "Asia/Jakarta";
const CLOUD_RECONCILIATION_DELAYS_MS = [0, 3500, 6500] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clean(value: any) {
  return String(value ?? "").trim();
}

function toNumberOrNull(value: any) {
  const text = clean(value);
  if (!text) return null;

  const numeric = Number(text.replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
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

function jakartaTodayKey() {
  return jakartaDateKey(Date.now());
}

function jakartaDayStartUtc(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);

  // Jakarta midnight = UTC previous day 17:00.
  return new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0));
}

function addDays(dateKey: string, days: number) {
  const start = jakartaDayStartUtc(dateKey);
  const next = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  return jakartaDateKey(next.getTime());
}

function jakartaNowLabel() {
  return new Date().toLocaleString("id-ID", {
    timeZone: JAKARTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function estimateDistanceFromSteps(steps: number) {
  if (!steps || steps <= 0) return 0;

  return Math.round(steps * 0.0007 * 100) / 100;
}

function validateDailyDistanceFromSteps(steps: number, googleDistanceKm: number) {
  const safeSteps = Math.max(0, Number(steps || 0));
  const rawDistanceKm = Math.max(0, Number(googleDistanceKm || 0));
  const estimatedDistanceKm = estimateDistanceFromSteps(safeSteps);

  if (safeSteps <= 0) {
    return {
      distanceKm: rawDistanceKm,
      usedEstimate: false,
      reason: rawDistanceKm > 0 ? "NO_STEPS_DISTANCE_PRESERVED" : "NO_DISTANCE",
      rawDistanceKm,
      estimatedDistanceKm,
    };
  }

  // Plausible stride range 0.25-1.50 meter per step.
  // Outside this range the aggregate is likely cumulative, duplicated, or unit-mismatched.
  const minPlausibleKm = Math.max(0.05, safeSteps * 0.00025);
  const maxPlausibleKm = Math.max(0.3, safeSteps * 0.0015);
  const plausible =
    rawDistanceKm > 0 &&
    rawDistanceKm >= minPlausibleKm &&
    rawDistanceKm <= maxPlausibleKm;

  return {
    distanceKm: plausible ? rawDistanceKm : estimatedDistanceKm,
    usedEstimate: !plausible,
    reason: plausible
      ? "GOOGLE_DISTANCE_PLAUSIBLE"
      : rawDistanceKm > 0
        ? "GOOGLE_DISTANCE_REJECTED_AS_IMPLAUSIBLE"
        : "GOOGLE_DISTANCE_MISSING",
    rawDistanceKm,
    estimatedDistanceKm,
    minPlausibleKm,
    maxPlausibleKm,
  };
}

function estimateActiveMinutesFromSteps(steps: number) {
  if (!steps || steps <= 0) return 0;

  // Approximate 100 steps/minute for ordinary walking.
  return Math.min(1440, Math.round((steps / 100) * 10) / 10);
}

function estimateActiveCalories(params: {
  steps: number;
  distanceKm: number;
  weightKg: number;
  activeMinutes?: number;
}) {
  const steps = Math.max(0, Number(params.steps || 0));
  const weightKg = Math.min(250, Math.max(35, Number(params.weightKg || 70)));
  const distanceKm =
    Number(params.distanceKm || 0) > 0
      ? Number(params.distanceKm)
      : estimateDistanceFromSteps(steps);
  const activeMinutes = Math.max(0, Number(params.activeMinutes || 0));

  if (steps > 0) {
    // Active walking/running estimate. Hard cap prevents total-energy/BMR values
    // from becoming workout calories (for example 8,878 kkal for ~1,000 steps).
    const distanceEstimate = distanceKm * weightKg * 0.53;
    const stepCap = steps * 0.1;
    const calories = Math.min(distanceEstimate, stepCap);

    return Math.max(1, Math.round(calories));
  }

  if (activeMinutes > 0) {
    const perMinute = Math.max(3, weightKg * 0.06);
    return Math.min(1200, Math.max(1, Math.round(activeMinutes * perMinute)));
  }

  return 0;
}

function getWeightKg(participant: any) {
  const keys = [
    "current_weight_kg",
    "latest_weight_kg",
    "weight_kg",
    "baseline_weight_kg",
    "initial_weight_kg",
    "bb",
    "berat_badan",
  ];

  for (const key of keys) {
    const value = toNumberOrNull(participant?.[key]);
    if (value && value > 0) return value;
  }

  return 70;
}

async function readLatestWeight(supabase: any, participant: any) {
  const fromParticipant = getWeightKg(participant);
  if (fromParticipant) return fromParticipant;

  const { data } = await supabase
    .from("wellness_weight_logs")
    .select("*")
    .eq("participant_id", participant.id)
    .order("log_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return getWeightKg(data);
}

async function refreshAccessTokenIfNeeded(supabase: any, integration: any) {
  const expiresAt = integration?.expires_at
    ? new Date(integration.expires_at).getTime()
    : 0;

  const stillValid = expiresAt && expiresAt > Date.now() + 60 * 1000;

  if (integration?.access_token && stillValid) {
    return integration.access_token;
  }

  const refreshToken = clean(integration?.refresh_token);
  if (!refreshToken) throw new Error("Google Fit refresh_token tidak tersedia.");

  const clientId =
    clean(process.env.GOOGLE_FIT_CLIENT_ID) || clean(process.env.GOOGLE_CLIENT_ID);
  const clientSecret =
    clean(process.env.GOOGLE_FIT_CLIENT_SECRET) ||
    clean(process.env.GOOGLE_CLIENT_SECRET);

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_FIT_CLIENT_ID / GOOGLE_FIT_CLIENT_SECRET belum diatur.");
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
  });

  const json: any = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(json?.error_description || json?.error || "Gagal refresh Google token.");
  }

  const accessToken = clean(json.access_token);
  const expiresIn = Number(json.expires_in || 3600);
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  await supabase
    .from("wellness_integrations")
    .update({
      access_token: accessToken,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", integration.id);

  return accessToken;
}

async function googlePost(accessToken: string, url: string, body: any) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json: any = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(json?.error?.message || json?.error || `Google Fit HTTP ${response.status}`);
  }

  return json;
}

async function readAggregateByDataType(params: {
  accessToken: string;
  dataTypeName?: string;
  dataSourceId?: string;
  start: Date;
  end: Date;
}) {
  const startTimeMillis = params.start.getTime();
  const endTimeMillis = params.end.getTime();

  const body = {
    aggregateBy: [
      params.dataSourceId
        ? { dataSourceId: params.dataSourceId }
        : { dataTypeName: params.dataTypeName },
    ],
    bucketByTime: {
      durationMillis: 24 * 60 * 60 * 1000,
    },
    startTimeMillis,
    endTimeMillis,
  };

  const json = await googlePost(
    params.accessToken,
    "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
    body
  );

  const buckets = Array.isArray(json.bucket) ? json.bucket : [];
  const rows = new Map<string, number>();

  for (const bucket of buckets) {
    const startMs = Number(bucket.startTimeMillis || 0);
    const date = startMs ? jakartaDateKey(startMs) : "";

    if (!date) continue;

    let total = 0;

    for (const dataset of bucket.dataset || []) {
      for (const point of dataset.point || []) {
        total += (point.value || []).reduce(
          (sum: number, item: any) => sum + valueNumber(item),
          0
        );
      }
    }

    if (total > 0) {
      rows.set(date, (rows.get(date) || 0) + total);
    }
  }

  return rows;
}

async function safeReadAggregate(params: {
  accessToken: string;
  dataTypeName?: string;
  dataSourceId?: string;
  start: Date;
  end: Date;
}) {
  try {
    return {
      ok: true,
      dataTypeName: params.dataTypeName || params.dataSourceId || "",
      dataSourceId: params.dataSourceId || "",
      rows: await readAggregateByDataType(params),
      message: "",
    };
  } catch (error: any) {
    return {
      ok: false,
      dataTypeName: params.dataTypeName || params.dataSourceId || "",
      dataSourceId: params.dataSourceId || "",
      rows: new Map<string, number>(),
      message: error?.message || String(error),
    };
  }
}


function mergeAggregatePasses(passes: any[]) {
  const rows = new Map<string, number>();
  const messages: string[] = [];
  let successCount = 0;
  let dataTypeName = "";
  let dataSourceId = "";

  for (const pass of passes) {
    dataTypeName ||= clean(pass?.dataTypeName);
    dataSourceId ||= clean(pass?.dataSourceId);

    if (!pass?.ok) {
      if (clean(pass?.message)) messages.push(clean(pass.message));
      continue;
    }

    successCount += 1;
    for (const [date, value] of pass.rows.entries()) {
      rows.set(date, Math.max(Number(rows.get(date) || 0), Number(value || 0)));
    }
  }

  return {
    ok: successCount > 0,
    dataTypeName,
    dataSourceId,
    rows,
    message: messages.join(" | "),
    successCount,
    passCount: passes.length,
  };
}

function rawPayloadTotalCalories(rawPayload: any) {
  return Math.max(
    0,
    Number(rawPayload?.google_fit_total_calories || 0),
    Number(rawPayload?.google_fit_calories_expended || 0),
    Number(rawPayload?.exact_snapshot?.total_calories || 0),
  );
}

async function upsertDailyRow(params: {
  supabase: any;
  participant: any;
  row: any;
}) {
  const nowIso = new Date().toISOString();
  const nowJakarta = jakartaNowLabel();
  const externalId = `google_fit_daily_${params.participant.id}_${params.row.date}`;

  const existing = await params.supabase
    .from("wellness_activity_logs")
    .select("id,steps,distance_km,duration_minutes,calories,raw_payload")
    .eq("participant_id", params.participant.id)
    .eq("source", "google_fit")
    .eq("external_activity_id", externalId)
    .maybeSingle();

  if (existing.error) throw existing.error;

  const previousSteps = Math.max(0, Number(existing.data?.steps || 0));
  const previousDistanceKm = Math.max(
    0,
    Number(existing.data?.distance_km || 0),
  );
  const previousDurationMinutes = Math.max(
    0,
    Number(existing.data?.duration_minutes || 0),
  );
  const previousTotalCalories = rawPayloadTotalCalories(
    existing.data?.raw_payload,
  );

  // Daily cumulative Google Fit values must never regress during the same day.
  // A temporary cloud lag can return a smaller partial value; preserve the
  // highest canonical value already observed for this participant and date.
  const resolvedRow = {
    ...params.row,
    steps: Math.max(previousSteps, Number(params.row.steps || 0)),
    distance_km: Math.max(
      previousDistanceKm,
      Number(params.row.distance_km || 0),
    ),
    duration_minutes: Math.max(
      previousDurationMinutes,
      Number(params.row.duration_minutes || 0),
    ),
    google_fit_total_calories: Math.max(
      previousTotalCalories,
      Number(params.row.google_fit_total_calories || 0),
    ),
  };

  const payload: any = {
    participant_id: Number(params.participant.id),
    source: "google_fit",
    external_activity_id: externalId,
    provider_activity_id: externalId,
    activity_type: "Google Fit Daily",
    activity_name: `Google Fit Daily - ${resolvedRow.steps} steps`,
    log_date: resolvedRow.date,
    started_at: nowIso,
    duration_minutes: resolvedRow.duration_minutes,
    calories: 0,
    distance_km: resolvedRow.distance_km,
    steps: resolvedRow.steps,
    updated_at: nowIso,
    raw_payload: {
      marker: MARKER,
      log_date: resolvedRow.date,
      provider: "google_fit",
      sync_mode: "aggregate_daily_cloud_reconciled",
      display_time_note:
        "started_at is latest sync time. log_date is the Google Fit daily date in Asia/Jakarta.",
      last_sync_at: nowIso,
      last_sync_at_jakarta: nowJakarta,
      google_fit_steps: resolvedRow.steps,
      google_fit_step_data_source_id: resolvedRow.step_data_source_id,
      google_fit_distance_km: resolvedRow.distance_km,
      google_fit_distance_km_original:
        resolvedRow.google_fit_distance_km_original,
      google_fit_calories_expended:
        resolvedRow.google_fit_total_calories,
      google_fit_total_calories:
        resolvedRow.google_fit_total_calories,
      google_fit_calories_include_bmr: true,
      google_fit_active_calories: null,
      active_calories_available: false,
      google_fit_active_minutes:
        resolvedRow.google_fit_active_minutes,
      estimated_distance_used: resolvedRow.estimated_distance_used,
      distance_validation_reason:
        resolvedRow.distance_validation_reason,
      distance_min_plausible_km:
        resolvedRow.distance_min_plausible_km,
      distance_max_plausible_km:
        resolvedRow.distance_max_plausible_km,
      estimated_active_minutes_used:
        resolvedRow.estimated_active_minutes_used,
      estimated_calories_used: false,
      sanitized_active_calories: 0,
      calories_source: "google_fit_total_exact_no_active_guess",
      distance_source: resolvedRow.distance_source,
      duration_source: resolvedRow.duration_source,
      cloud_reconciliation: resolvedRow.cloud_reconciliation,
      monotonic_floor: {
        previous_steps: previousSteps,
        previous_total_calories: previousTotalCalories,
        previous_distance_km: previousDistanceKm,
        previous_duration_minutes: previousDurationMinutes,
      },
      exact_snapshot: {
        synced_at: nowIso,
        date: resolvedRow.date,
        steps: resolvedRow.steps,
        total_calories: resolvedRow.google_fit_total_calories,
        distance_km: resolvedRow.distance_km,
        active_minutes: resolvedRow.google_fit_active_minutes,
        step_data_source_id: resolvedRow.step_data_source_id,
        calories_data_type: "com.google.calories.expended",
      },
      calculation_note:
        "Steps use estimated_steps. Google Fit cloud is read repeatedly and the highest canonical cumulative value is persisted. Total calories are com.google.calories.expended including BMR. No active-calorie estimate is fabricated.",
      synced_at: nowIso,
    },
  };

  if (existing.data?.id) {
    const updated = await params.supabase
      .from("wellness_activity_logs")
      .update(payload)
      .eq("id", existing.data.id)
      .select("*")
      .single();

    if (updated.error) throw updated.error;
    return { action: "updated", row: updated.data, resolvedRow };
  }

  const inserted = await params.supabase
    .from("wellness_activity_logs")
    .insert(payload)
    .select("*")
    .single();

  if (inserted.error) throw inserted.error;
  return { action: "inserted", row: inserted.data, resolvedRow };
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const participant = await getParticipantFromPortalSession(supabase, req);

  if (!participant?.id) {
    return NextResponse.json(
      { ok: false, message: "OTP/session peserta belum aktif." },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body?.days || 2), 1), 30);

    const { data: integration, error: integrationError } = await supabase
      .from("wellness_integrations")
      .select("*")
      .eq("participant_id", participant.id)
      .eq("provider", "google_fit")
      .neq("is_active", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (integrationError) throw integrationError;

    if (!integration) {
      return NextResponse.json(
        { ok: false, message: "Google Fit belum terkoneksi." },
        { status: 400 }
      );
    }

    const accessToken = await refreshAccessTokenIfNeeded(supabase, integration);
    const today = jakartaTodayKey();
    const startKey = addDays(today, -(days - 1));
    const start = jakartaDayStartUtc(startKey);

    // Diagnostic V79L proved that the first Google Fit REST read can be stale
    // while the same canonical estimated_steps source catches up minutes later.
    // Read the exact same sources repeatedly, then persist the highest canonical
    // cumulative value observed. No source substitution and no estimation.
    const cloudPasses: any[] = [];

    for (const delayMs of CLOUD_RECONCILIATION_DELAYS_MS) {
      if (delayMs > 0) await sleep(delayMs);
      const passEnd = new Date();

      const [steps, distance, calories, activeMinutes] = await Promise.all([
        safeReadAggregate({
          accessToken,
          dataTypeName: "com.google.step_count.delta",
          dataSourceId:
            "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps",
          start,
          end: passEnd,
        }),
        safeReadAggregate({
          accessToken,
          dataTypeName: "com.google.distance.delta",
          start,
          end: passEnd,
        }),
        safeReadAggregate({
          accessToken,
          dataTypeName: "com.google.calories.expended",
          start,
          end: passEnd,
        }),
        safeReadAggregate({
          accessToken,
          dataTypeName: "com.google.active_minutes",
          start,
          end: passEnd,
        }),
      ]);

      cloudPasses.push({
        ended_at: passEnd.toISOString(),
        steps,
        distance,
        calories,
        activeMinutes,
      });
    }

    const stepsResult = mergeAggregatePasses(
      cloudPasses.map((item) => item.steps),
    );
    const distanceResult = mergeAggregatePasses(
      cloudPasses.map((item) => item.distance),
    );
    const caloriesResult = mergeAggregatePasses(
      cloudPasses.map((item) => item.calories),
    );
    const activeMinutesResult = mergeAggregatePasses(
      cloudPasses.map((item) => item.activeMinutes),
    );

    const dateKeys = new Set<string>();

    for (let index = 0; index < days; index += 1) {
      dateKeys.add(addDays(startKey, index));
    }

    for (const key of stepsResult.rows.keys()) dateKeys.add(key);
    for (const key of distanceResult.rows.keys()) dateKeys.add(key);
    for (const key of caloriesResult.rows.keys()) dateKeys.add(key);
    for (const key of activeMinutesResult.rows.keys()) dateKeys.add(key);

    const dailyRows = [...dateKeys]
      .sort((a, b) => a.localeCompare(b))
      .map((date) => {
        const steps = Math.round(Number(stepsResult.rows.get(date) || 0));

        const distanceKmFromGoogle =
          Math.round((Number(distanceResult.rows.get(date) || 0) / 1000) * 100) / 100;

        const distanceValidation = validateDailyDistanceFromSteps(
          steps,
          distanceKmFromGoogle
        );
        const distanceKm = distanceValidation.distanceKm;

        const activeMinutesFromGoogle =
          Math.round(Number(activeMinutesResult.rows.get(date) || 0) * 10) / 10;

        const estimatedActiveMinutes = estimateActiveMinutesFromSteps(steps);
        const durationMinutes =
          activeMinutesFromGoogle > 0 ? activeMinutesFromGoogle : estimatedActiveMinutes;

        const googleCalories =
          Math.round(Number(caloriesResult.rows.get(date) || 0) * 10) / 10;

        return {
          date,
          steps,
          distance_km: distanceKm,
          duration_minutes: durationMinutes,
          // No active-calorie guess. Google Fit REST returns total calories here.
          calories: 0,
          google_fit_total_calories: googleCalories,
          step_data_source_id:
            "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps",
          google_fit_distance_km_original: distanceKmFromGoogle,
          google_fit_active_minutes: activeMinutesFromGoogle,
          estimated_distance_used: distanceValidation.usedEstimate,
          distance_validation_reason: distanceValidation.reason,
          distance_min_plausible_km: distanceValidation.minPlausibleKm || null,
          distance_max_plausible_km: distanceValidation.maxPlausibleKm || null,
          estimated_active_minutes_used: activeMinutesFromGoogle <= 0 && steps > 0,
          estimated_calories_used: false,
          calories_source: "google_fit_total_exact_no_active_guess",
          distance_source: distanceValidation.usedEstimate
            ? "estimated_from_steps"
            : "google_fit_distance_delta_validated",
          duration_source:
            activeMinutesFromGoogle > 0
              ? "google_fit_active_minutes"
              : "estimated_from_steps",
          cloud_reconciliation: {
            marker: MARKER,
            selected_rule:
              "maximum canonical value across repeated reads of the same Google Fit REST sources",
            passes: cloudPasses.map((pass) => ({
              ended_at: pass.ended_at,
              steps: Number(pass.steps.rows.get(date) || 0),
              total_calories: Number(pass.calories.rows.get(date) || 0),
              distance_m: Number(pass.distance.rows.get(date) || 0),
              active_minutes: Number(pass.activeMinutes.rows.get(date) || 0),
            })),
          },
        };
      })
      .filter((row) => {
        return (
          row.steps > 0 ||
          row.distance_km > 0 ||
          row.duration_minutes > 0 ||
          row.google_fit_total_calories > 0
        );
      });

    let inserted = 0;
    let updated = 0;
    const persistedRows: any[] = [];

    for (const row of dailyRows) {
      const saved = await upsertDailyRow({ supabase, participant, row });
      if (saved.action === "inserted") inserted += 1;
      if (saved.action === "updated") updated += 1;
      persistedRows.push(saved.resolvedRow);
    }

    const nowIso = new Date().toISOString();

    await supabase
      .from("wellness_integrations")
      .update({
        last_sync_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", integration.id);

    const warningMessages = [
      stepsResult.ok ? "" : `Steps: ${stepsResult.message}`,
      distanceResult.ok ? "" : `Distance: ${distanceResult.message}`,
      caloriesResult.ok ? "" : `Calories: ${caloriesResult.message}`,
      activeMinutesResult.ok ? "" : `Active minutes: ${activeMinutesResult.message}`,
    ].filter(Boolean);

    const todaySnapshot =
      persistedRows.find((row) => row.date === today) ||
      dailyRows.find((row) => row.date === today) ||
      null;

    const todayPasses = cloudPasses.map((pass) => ({
      ended_at: pass.ended_at,
      steps: Number(pass.steps.rows.get(today) || 0),
      total_calories: Number(pass.calories.rows.get(today) || 0),
      distance_m: Number(pass.distance.rows.get(today) || 0),
      active_minutes: Number(pass.activeMinutes.rows.get(today) || 0),
    }));

    return NextResponse.json({
      ok: true,
      marker: MARKER,
      message: todaySnapshot
        ? `Google Fit cloud sync selesai. ${todaySnapshot.steps} steps dan ${Math.round(Number(todaySnapshot.google_fit_total_calories || 0) * 10) / 10} kkal total pada Last Sync.`
        : `Google Fit sync selesai. ${inserted} baru, ${updated} update.`,
      sync_mode: "aggregate_daily",
      timezone: JAKARTA_TIME_ZONE,
      last_sync_at: nowIso,
      last_sync_at_jakarta: jakartaNowLabel(),
      last_sync_snapshot: todaySnapshot
        ? {
            date: todaySnapshot.date,
            steps: todaySnapshot.steps,
            total_calories: todaySnapshot.google_fit_total_calories,
            distance_km: todaySnapshot.distance_km,
            active_minutes: todaySnapshot.google_fit_active_minutes,
            step_data_source_id: todaySnapshot.step_data_source_id,
            calories_data_type: "com.google.calories.expended",
            active_calories_available: false,
          }
        : null,
      date_range: {
        start: startKey,
        end: today,
        days,
      },
      aggregate_status: {
        steps: stepsResult.ok,
        distance: distanceResult.ok,
        calories: caloriesResult.ok,
        active_minutes: activeMinutesResult.ok,
      },
      cloud_reconciliation: {
        marker: MARKER,
        pass_count: cloudPasses.length,
        delays_ms: [...CLOUD_RECONCILIATION_DELAYS_MS],
        selected_rule:
          "highest canonical cumulative value from repeated reads; same-day stored value is a non-regression floor",
        today_passes: todayPasses,
        persisted_today: todaySnapshot
          ? {
              steps: todaySnapshot.steps,
              total_calories: todaySnapshot.google_fit_total_calories,
              distance_km: todaySnapshot.distance_km,
              active_minutes: todaySnapshot.google_fit_active_minutes,
            }
          : null,
      },
      warnings: warningMessages,
      fetched_daily: dailyRows.length,
      inserted,
      updated,
      daily: dailyRows,
    });
  } catch (error: any) {
    console.error("WELLNESS_GOOGLE_FIT_CLOUD_RECONCILIATION_V79M_ERROR", error);

    return NextResponse.json(
      {
        ok: false,
        marker: MARKER,
        message: error?.message || "Gagal sync Google Fit.",
      },
      { status: 500 }
    );
  }
}