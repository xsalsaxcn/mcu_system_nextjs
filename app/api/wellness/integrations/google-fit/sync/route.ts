// WELLNESS_GOOGLE_FIT_SYNC_V404_REALISTIC_DAILY
// Fix Google Fit daily sync:
// - skip cumulative step sources
// - do not use Google Fit daily calories as workout calories because it may include total daily/BMR calories
// - pick daily steps from delta sources only
// - estimate daily calories from steps/distance + participant weight
// - update existing google_fit_daily rows instead of duplicating
// - keep session/workout data separate when available

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

export const runtime = "nodejs";

function clean(value: any) {
  return String(value ?? "").trim();
}

function toNumberOrNull(value: any) {
  const text = clean(value);
  if (!text) return null;

  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function jakartaDateKey(ms: number) {
  const offsetMs = 7 * 60 * 60 * 1000;
  return new Date(ms + offsetMs).toISOString().slice(0, 10);
}

function jakartaTodayKey() {
  return jakartaDateKey(Date.now());
}

function jakartaDayStartUtc(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0));
}

function addDays(dateKey: string, days: number) {
  const start = jakartaDayStartUtc(dateKey);
  const next = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  return jakartaDateKey(next.getTime());
}

function nanos(date: Date) {
  return `${date.getTime()}000000`;
}

function nanosToMs(value: any) {
  const text = String(value || "").trim();

  if (!text) return Date.now();

  if (text.length > 6) {
    const msText = text.slice(0, -6);
    const ms = Number(msText);
    return Number.isFinite(ms) ? ms : Date.now();
  }

  const n = Number(text);
  return Number.isFinite(n) ? Math.floor(n / 1000000) : Date.now();
}

function pointStartMs(point: any) {
  if (point?.startTimeNanos) {
    return nanosToMs(point.startTimeNanos);
  }

  const value = point?.modifiedTimeMillis || null;
  return Number(value) || Date.now();
}

function pointEndMs(point: any) {
  if (point?.endTimeNanos) {
    return nanosToMs(point.endTimeNanos);
  }

  return pointStartMs(point);
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
function isStepDeltaSource(source: any) {
  const id = clean(source?.dataStreamId).toLowerCase();
  const type = clean(source?.dataType?.name).toLowerCase();

  if (type !== "com.google.step_count.delta") return false;
  if (id.includes("cumulative")) return false;

  return true;
}

function isDistanceDeltaSource(source: any) {
  const type = clean(source?.dataType?.name).toLowerCase();
  return type === "com.google.distance.delta";
}

function isActiveMinutesSource(source: any) {
  const type = clean(source?.dataType?.name).toLowerCase();
  return type === "com.google.active_minutes";
}

function sourcePriority(sourceId: string) {
  const id = clean(sourceId).toLowerCase();

  let score = 0;

  if (id.startsWith("derived:")) score += 100;
  if (id.includes("estimated_steps")) score += 80;
  if (id.includes("com.google.android.gms")) score += 70;
  if (id.includes("com.google.android.fit")) score += 60;
  if (id.includes("samsung")) score += 40;
  if (id.startsWith("raw:")) score += 20;
  if (id.includes("user_input")) score -= 100;
  if (id.includes("cumulative")) score -= 1000;

  return score;
}

function safeDurationFromSteps(steps: number, activeMinutes: number) {
  if (!steps || steps <= 0) return 0;

  const estimatedBySteps = steps / 100;

  if (activeMinutes > 0) {
    const upperReasonable = Math.max(5, steps / 50);

    if (activeMinutes <= upperReasonable) {
      return Math.round(activeMinutes * 10) / 10;
    }
  }

  return Math.round(estimatedBySteps * 10) / 10;
}

function estimateDistanceFromSteps(steps: number) {
  if (!steps || steps <= 0) return 0;

  return Math.round(steps * 0.0007 * 100) / 100;
}

function estimateActiveCalories(params: {
  steps: number;
  distanceKm: number;
  weightKg: number;
}) {
  const steps = Number(params.steps || 0);
  const weightKg = Number(params.weightKg || 70);
  const distanceKm =
    Number(params.distanceKm || 0) > 0
      ? Number(params.distanceKm)
      : estimateDistanceFromSteps(steps);

  if (!steps || steps <= 0) return 0;

  const calories = distanceKm * weightKg * 0.53;

  return Math.max(1, Math.round(calories));
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

async function googleGet(accessToken: string, url: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const json: any = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(json?.error?.message || json?.error || `Google Fit HTTP ${response.status}`);
  }

  return json;
}

async function readDataset(params: {
  accessToken: string;
  dataStreamId: string;
  start: Date;
  end: Date;
}) {
  const encoded = encodeURIComponent(params.dataStreamId);
  const datasetId = `${nanos(params.start)}-${nanos(params.end)}`;
  const url = `https://www.googleapis.com/fitness/v1/users/me/dataSources/${encoded}/datasets/${datasetId}`;

  const json = await googleGet(params.accessToken, url);
  return Array.isArray(json.point) ? json.point : [];
}

async function upsertDailyRow(params: {
  supabase: any;
  participant: any;
  row: any;
}) {
  const externalId = `google_fit_daily_${params.participant.id}_${params.row.date}`;

  const payload: any = {
    participant_id: Number(params.participant.id),
    source: "google_fit",
    external_activity_id: externalId,
    provider_activity_id: externalId,
    activity_type: "Google Fit Daily",
    activity_name: `Google Fit Daily - ${params.row.steps} steps`,
    log_date: params.row.date,
    started_at: `${params.row.date}T00:00:00.000Z`,
    duration_minutes: params.row.duration_minutes,
    calories: params.row.calories,
    distance_km: params.row.distance_km,
    steps: params.row.steps,
    raw_payload: {
      marker: "WELLNESS_GOOGLE_FIT_SYNC_V404_REALISTIC_DAILY",
      selected_step_source: params.row.selected_step_source,
      selected_distance_source: params.row.selected_distance_source,
      selected_active_minutes_source: params.row.selected_active_minutes_source,
      calculation_note:
        "Daily calories estimated from steps/distance. Google Fit total daily calories are not used to avoid BMR/total-calorie overcount.",
      synced_at: new Date().toISOString(),
    },
  };

  const existing = await params.supabase
    .from("wellness_activity_logs")
    .select("id")
    .eq("participant_id", params.participant.id)
    .eq("source", "google_fit")
    .eq("external_activity_id", externalId)
    .maybeSingle();

  if (existing.error) throw existing.error;

  if (existing.data?.id) {
    const updated = await params.supabase
      .from("wellness_activity_logs")
      .update(payload)
      .eq("id", existing.data.id)
      .select("*")
      .single();

    if (updated.error) throw updated.error;
    return { action: "updated", row: updated.data };
  }

  const inserted = await params.supabase
    .from("wellness_activity_logs")
    .insert(payload)
    .select("*")
    .single();

  if (inserted.error) throw inserted.error;
  return { action: "inserted", row: inserted.data };
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
    const weightKg = await readLatestWeight(supabase, participant);

    const today = jakartaTodayKey();
    const startKey = addDays(today, -(days - 1));
    const start = jakartaDayStartUtc(startKey);
    const end = jakartaDayStartUtc(addDays(today, 1));

    const dataSourcesJson = await googleGet(
      accessToken,
      "https://www.googleapis.com/fitness/v1/users/me/dataSources"
    );

    const dataSources = Array.isArray(dataSourcesJson.dataSource)
      ? dataSourcesJson.dataSource
      : [];

    const stepSources = dataSources.filter(isStepDeltaSource);
    const distanceSources = dataSources.filter(isDistanceDeltaSource);
    const activeMinuteSources = dataSources.filter(isActiveMinutesSource);

    const dailyByDate = new Map<string, any>();

    function ensureDay(date: string) {
      const existing = dailyByDate.get(date);
      if (existing) return existing;

      const row = {
        date,
        stepCandidates: new Map<string, any>(),
        distanceCandidates: new Map<string, any>(),
        activeMinuteCandidates: new Map<string, any>(),
      };

      dailyByDate.set(date, row);
      return row;
    }

    for (const source of stepSources) {
      const sourceId = source.dataStreamId;
      const points = await readDataset({ accessToken, dataStreamId: sourceId, start, end }).catch(() => []);

      for (const point of points) {
        const ms = pointEndMs(point);
        const date = jakartaDateKey(ms);
        const value = (point.value || []).reduce((sum: number, item: any) => sum + valueNumber(item), 0);

        if (!value || value < 0) continue;

        const day = ensureDay(date);
        const current = day.stepCandidates.get(sourceId) || {
          sourceId,
          value: 0,
          priority: sourcePriority(sourceId),
        };

        current.value += value;
        day.stepCandidates.set(sourceId, current);
      }
    }

    for (const source of distanceSources) {
      const sourceId = source.dataStreamId;
      const points = await readDataset({ accessToken, dataStreamId: sourceId, start, end }).catch(() => []);

      for (const point of points) {
        const ms = pointEndMs(point);
        const date = jakartaDateKey(ms);
        const meters = (point.value || []).reduce((sum: number, item: any) => sum + valueNumber(item), 0);

        if (!meters || meters < 0) continue;

        const day = ensureDay(date);
        const current = day.distanceCandidates.get(sourceId) || {
          sourceId,
          value: 0,
          priority: sourcePriority(sourceId),
        };

        current.value += meters / 1000;
        day.distanceCandidates.set(sourceId, current);
      }
    }

    for (const source of activeMinuteSources) {
      const sourceId = source.dataStreamId;
      const points = await readDataset({ accessToken, dataStreamId: sourceId, start, end }).catch(() => []);

      for (const point of points) {
        const ms = pointEndMs(point);
        const date = jakartaDateKey(ms);
        const minutes = (point.value || []).reduce((sum: number, item: any) => sum + valueNumber(item), 0);

        if (!minutes || minutes < 0) continue;

        const day = ensureDay(date);
        const current = day.activeMinuteCandidates.get(sourceId) || {
          sourceId,
          value: 0,
          priority: sourcePriority(sourceId),
        };

        current.value += minutes;
        day.activeMinuteCandidates.set(sourceId, current);
      }
    }

    function pickBest(candidates: Map<string, any>) {
      const rows = [...candidates.values()].filter((item) => Number(item.value || 0) > 0);

      rows.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return Number(b.value || 0) - Number(a.value || 0);
      });

      return rows[0] || null;
    }

    const dailyRows = [...dailyByDate.values()]
      .map((day) => {
        const stepPick = pickBest(day.stepCandidates);
        const distancePick = pickBest(day.distanceCandidates);
        const activePick = pickBest(day.activeMinuteCandidates);

        const steps = Math.round(Number(stepPick?.value || 0));
        const distanceKmRaw = Number(distancePick?.value || 0);
        const distanceKm =
          distanceKmRaw > 0
            ? Math.round(distanceKmRaw * 100) / 100
            : estimateDistanceFromSteps(steps);

        const activeMinutesRaw = Number(activePick?.value || 0);
        const durationMinutes = safeDurationFromSteps(steps, activeMinutesRaw);
        const calories = estimateActiveCalories({ steps, distanceKm, weightKg });

        return {
          date: day.date,
          steps,
          distance_km: distanceKm,
          duration_minutes: durationMinutes,
          calories,
          selected_step_source: stepPick?.sourceId || null,
          selected_distance_source: distancePick?.sourceId || null,
          selected_active_minutes_source: activePick?.sourceId || null,
        };
      })
      .filter((row) => row.steps > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    let inserted = 0;
    let updated = 0;

    for (const row of dailyRows) {
      const saved = await upsertDailyRow({ supabase, participant, row });
      if (saved.action === "inserted") inserted += 1;
      if (saved.action === "updated") updated += 1;
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
      marker: "WELLNESS_GOOGLE_FIT_SYNC_V404_REALISTIC_DAILY",
      message: `Google Fit sync selesai. ${inserted} baru, ${updated} update.`,
      data_sources_count: dataSources.length,
      step_sources_count: stepSources.length,
      distance_sources_count: distanceSources.length,
      active_minutes_sources_count: activeMinuteSources.length,
      fetched_daily: dailyRows.length,
      inserted,
      updated,
      daily: dailyRows,
    });
  } catch (error: any) {
    console.error("WELLNESS_GOOGLE_FIT_SYNC_V404_REALISTIC_DAILY_ERROR", error);

    return NextResponse.json(
      {
        ok: false,
        marker: "WELLNESS_GOOGLE_FIT_SYNC_V404_REALISTIC_DAILY",
        message: error?.message || "Gagal sync Google Fit.",
      },
      { status: 500 }
    );
  }
}