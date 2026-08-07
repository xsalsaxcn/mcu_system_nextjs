import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// WELLNESS_GOOGLE_FIT_PARTICIPANT_REPAIR_CENTER_V126M50A_2

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "supervisor",
  "doctor",
  "wellness_admin",
]);
const TZ = "Asia/Jakarta";

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const text = clean(value);
  if (!text) return 0;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function adminUser(request: NextRequest) {
  const user: any = getSessionUser(request);
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
  const y = parts.find((item) => item.type === "year")?.value;
  const m = parts.find((item) => item.type === "month")?.value;
  const d = parts.find((item) => item.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : new Date(ms).toISOString().slice(0, 10);
}

function jakartaTodayKey() {
  return jakartaDateKey(Date.now());
}

function jakartaDayStartUtc(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0));
}

function addDays(dateKey: string, days: number) {
  return jakartaDateKey(jakartaDayStartUtc(dateKey).getTime() + days * 86400000);
}

function jakartaLabel(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return clean(value) || "-";
  return date.toLocaleString("id-ID", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
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

function estimateCalories(steps: number, distanceKm: number, weightKg: number) {
  if (steps <= 0) return 0;
  const distance = distanceKm > 0 ? distanceKm : estimateDistance(steps);
  return Math.max(1, Math.round(distance * (weightKg || 70) * 0.53));
}

async function participantById(supabase: any, participantId: number) {
  const result = await supabase
    .from("wellness_participants")
    .select("*")
    .eq("id", participantId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Peserta Wellness tidak ditemukan.");
  return result.data;
}

async function integrationRows(supabase: any, participantId: number) {
  const result = await supabase
    .from("wellness_integrations")
    .select("*")
    .eq("participant_id", participantId)
    .in("provider", ["google_fit", "health_connect"])
    .order("created_at", { ascending: false });
  if (result.error) throw result.error;
  return result.data || [];
}

async function googleRows(supabase: any, participantId: number) {
  const result = await supabase
    .from("wellness_activity_logs")
    .select("id,participant_id,source,external_activity_id,provider_activity_id,log_date,started_at,steps,calories,duration_minutes,distance_km,raw_payload,created_at,updated_at")
    .eq("participant_id", participantId)
    .eq("source", "google_fit")
    .order("log_date", { ascending: false })
    .order("started_at", { ascending: false })
    .limit(120);
  if (result.error) throw result.error;
  return result.data || [];
}

async function participantControl(supabase: any, participantId: number) {
  const result = await supabase
    .from("wellness_participant_controls")
    .select("*")
    .eq("participant_id", participantId)
    .maybeSingle();
  if (result.error && !/does not exist|schema cache/i.test(clean(result.error.message))) {
    throw result.error;
  }
  return result.data || null;
}

async function diagnose(supabase: any, participantId: number) {
  const participant = await participantById(supabase, participantId);
  const [integrations, activities, control] = await Promise.all([
    integrationRows(supabase, participantId),
    googleRows(supabase, participantId),
    participantControl(supabase, participantId),
  ]);

  const googleIntegrations = integrations.filter((row: any) => clean(row.provider) === "google_fit");
  const google = googleIntegrations[0] || null;
  const activeProviders = Array.from(
    new Set(
      integrations
        .filter((row: any) => ![false, 0, "0"].includes(row.is_active))
        .map((row: any) => clean(row.provider))
        .filter(Boolean),
    ),
  );

  const dateCounts = new Map<string, number>();
  for (const row of activities) {
    const date = clean(row.log_date).slice(0, 10);
    if (date) dateCounts.set(date, (dateCounts.get(date) || 0) + 1);
  }
  const duplicateDates = [...dateCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([date, count]) => ({ date, count }));

  const latest = activities[0] || null;
  const lastSyncRaw = clean(google?.last_sync_at || google?.updated_at || "");
  const lastSyncMs = lastSyncRaw ? new Date(lastSyncRaw).getTime() : 0;
  const syncAgeHours = lastSyncMs > 0 ? Math.max(0, (Date.now() - lastSyncMs) / 3600000) : null;
  const latestDate = clean(latest?.log_date).slice(0, 10);
  const today = jakartaTodayKey();
  const controlSource = clean(control?.fitness_source || "none");
  const googleActive = google && ![false, 0, "0"].includes(google.is_active);

  let status = "HEALTHY";
  let message = "Koneksi Google Fit terlihat sehat.";
  let canForceSync = true;
  let reconnectRequired = false;

  if (!google) {
    status = "NOT_CONNECTED";
    message = "Belum ada koneksi Google Fit untuk peserta ini.";
    canForceSync = false;
    reconnectRequired = true;
  } else if (!clean(google.refresh_token) && !clean(google.access_token)) {
    status = "TOKEN_ERROR";
    message = "Token Google Fit tidak tersedia. Peserta perlu menghubungkan ulang akun Google Fit.";
    canForceSync = false;
    reconnectRequired = true;
  } else if (activeProviders.length > 1) {
    status = "DUPLICATE_SOURCE";
    message = "Lebih dari satu sumber fitness masih aktif. Normalisasi sumber diperlukan.";
  } else if (!googleActive || controlSource !== "google_fit") {
    status = "SOURCE_MISMATCH";
    message = "Google Fit terkoneksi tetapi bukan sumber fitness aktif peserta.";
  } else if (duplicateDates.length > 0) {
    status = "DUPLICATE_SNAPSHOT";
    message = "Ditemukan lebih dari satu snapshot Google Fit pada tanggal yang sama.";
  } else if (syncAgeHours === null || syncAgeHours > 12) {
    status = "STALE";
    message = "Last sync Google Fit sudah terlalu lama. Jalankan sinkron ulang.";
  } else if (latestDate && latestDate < today && syncAgeHours <= 2) {
    status = "NO_NEW_DATA";
    message = "Sync baru berjalan, tetapi Google Fit belum mengembalikan data untuk hari ini.";
  }

  return {
    participant: {
      id: Number(participant.id),
      code: clean(participant.code),
      name: clean(participant.name),
    },
    status,
    message,
    can_force_sync: canForceSync,
    reconnect_required: reconnectRequired,
    control_source: controlSource,
    active_providers: activeProviders,
    integration: google
      ? {
          id: google.id,
          is_active: googleActive,
          last_sync_at: lastSyncRaw || null,
          last_sync_at_jakarta: lastSyncRaw ? jakartaLabel(lastSyncRaw) : "-",
          token_expires_at: google.expires_at || null,
          token_expires_at_jakarta: google.expires_at ? jakartaLabel(google.expires_at) : "-",
        }
      : null,
    latest_data: latest
      ? {
          log_date: latestDate || null,
          steps: Math.round(numberValue(latest.steps)),
          calories: Math.round(numberValue(latest.calories) * 10) / 10,
          duration_minutes: Math.round(numberValue(latest.duration_minutes) * 10) / 10,
          distance_km: Math.round(numberValue(latest.distance_km) * 100) / 100,
          synced_at: clean(latest?.raw_payload?.last_sync_at || latest?.started_at || latest?.updated_at || latest?.created_at) || null,
        }
      : null,
    sync_age_hours: syncAgeHours === null ? null : Math.round(syncAgeHours * 10) / 10,
    google_fit_rows: activities.length,
    duplicate_dates: duplicateDates,
  };
}

async function refreshAccessToken(supabase: any, integration: any) {
  const expiresAt = integration?.expires_at ? new Date(integration.expires_at).getTime() : 0;
  if (clean(integration?.access_token) && expiresAt > Date.now() + 60000) return clean(integration.access_token);

  const refreshToken = clean(integration?.refresh_token);
  if (!refreshToken) throw new Error("TOKEN_ERROR: refresh_token Google Fit tidak tersedia.");
  const clientId = clean(process.env.GOOGLE_FIT_CLIENT_ID) || clean(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = clean(process.env.GOOGLE_FIT_CLIENT_SECRET) || clean(process.env.GOOGLE_CLIENT_SECRET);
  if (!clientId || !clientSecret) throw new Error("Konfigurasi Google Fit server belum lengkap.");

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`TOKEN_ERROR: ${payload?.error_description || payload?.error || "Gagal refresh Google token."}`);

  const token = clean(payload.access_token);
  const expiresAtIso = new Date(Date.now() + Number(payload.expires_in || 3600) * 1000).toISOString();
  await supabase
    .from("wellness_integrations")
    .update({ access_token: token, expires_at: expiresAtIso, updated_at: new Date().toISOString() })
    .eq("id", integration.id);
  return token;
}

async function aggregate(accessToken: string, dataTypeName: string, start: Date, end: Date) {
  const response = await fetch("https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      aggregateBy: [{ dataTypeName }],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: start.getTime(),
      endTimeMillis: end.getTime(),
    }),
    cache: "no-store",
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || `Google Fit HTTP ${response.status}`);
  const rows = new Map<string, number>();
  for (const bucket of Array.isArray(payload.bucket) ? payload.bucket : []) {
    const date = bucket.startTimeMillis ? jakartaDateKey(Number(bucket.startTimeMillis)) : "";
    if (!date) continue;
    let total = 0;
    for (const dataset of bucket.dataset || []) {
      for (const point of dataset.point || []) {
        total += (point.value || []).reduce((sum: number, item: any) => sum + fitValue(item), 0);
      }
    }
    if (total > 0) rows.set(date, (rows.get(date) || 0) + total);
  }
  return rows;
}

async function safeAggregate(accessToken: string, dataTypeName: string, start: Date, end: Date) {
  try {
    return { ok: true, rows: await aggregate(accessToken, dataTypeName, start, end), message: "" };
  } catch (error: any) {
    return { ok: false, rows: new Map<string, number>(), message: error?.message || String(error) };
  }
}

function weightKg(participant: any) {
  for (const key of ["current_weight_kg", "latest_weight_kg", "weight_kg", "baseline_weight_kg", "initial_weight_kg", "bb", "berat_badan"]) {
    const value = numberValue(participant?.[key]);
    if (value > 0) return value;
  }
  return 70;
}

async function forceSync(supabase: any, participantId: number, days = 3) {
  const participant = await participantById(supabase, participantId);
  const integrations = await integrationRows(supabase, participantId);
  const integration = integrations.find((row: any) => clean(row.provider) === "google_fit");
  if (!integration) throw new Error("Google Fit belum terkoneksi untuk peserta ini.");

  const accessToken = await refreshAccessToken(supabase, integration);
  const today = jakartaTodayKey();
  const safeDays = Math.min(Math.max(Number(days || 3), 1), 7);
  const startKey = addDays(today, -(safeDays - 1));
  const start = jakartaDayStartUtc(startKey);
  const end = jakartaDayStartUtc(addDays(today, 1));

  const [stepsResult, distanceResult, caloriesResult, minutesResult] = await Promise.all([
    safeAggregate(accessToken, "com.google.step_count.delta", start, end),
    safeAggregate(accessToken, "com.google.distance.delta", start, end),
    safeAggregate(accessToken, "com.google.calories.expended", start, end),
    safeAggregate(accessToken, "com.google.active_minutes", start, end),
  ]);

  const dates = new Set<string>();
  for (let i = 0; i < safeDays; i += 1) dates.add(addDays(startKey, i));
  for (const result of [stepsResult, distanceResult, caloriesResult, minutesResult]) {
    for (const key of result.rows.keys()) dates.add(key);
  }

  let inserted = 0;
  let updated = 0;
  const syncedAt = new Date().toISOString();
  for (const date of [...dates].sort()) {
    const steps = Math.round(Number(stepsResult.rows.get(date) || 0));
    const googleDistance = Math.round((Number(distanceResult.rows.get(date) || 0) / 1000) * 100) / 100;
    const distanceKm = googleDistance > 0 ? googleDistance : estimateDistance(steps);
    const googleMinutes = Math.round(Number(minutesResult.rows.get(date) || 0) * 10) / 10;
    const durationMinutes = googleMinutes > 0 ? googleMinutes : estimateMinutes(steps);
    const googleCalories = Math.round(Number(caloriesResult.rows.get(date) || 0) * 10) / 10;
    const calories = googleCalories > 0 ? googleCalories : estimateCalories(steps, distanceKm, weightKg(participant));
    if (!(steps > 0 || distanceKm > 0 || durationMinutes > 0 || calories > 0)) continue;

    const externalId = `google_fit_daily_${participantId}_${date}`;
    const payload = {
      participant_id: participantId,
      source: "google_fit",
      external_activity_id: externalId,
      provider_activity_id: externalId,
      activity_type: "Google Fit Daily",
      activity_name: `Google Fit Daily - ${steps} steps`,
      log_date: date,
      started_at: syncedAt,
      duration_minutes: durationMinutes,
      calories,
      distance_km: distanceKm,
      steps,
      raw_payload: {
        marker: "WELLNESS_GOOGLE_FIT_PARTICIPANT_REPAIR_CENTER_V126M50A_2",
        provider: "google_fit",
        sync_mode: "admin_force_aggregate_daily",
        log_date: date,
        last_sync_at: syncedAt,
        google_fit_steps: steps,
        google_fit_distance_km: googleDistance,
        google_fit_calories_expended: googleCalories,
        google_fit_active_minutes: googleMinutes,
        repair_sync: true,
      },
    };

    const existing = await supabase
      .from("wellness_activity_logs")
      .select("id")
      .eq("participant_id", participantId)
      .eq("source", "google_fit")
      .eq("external_activity_id", externalId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.id) {
      const saved = await supabase.from("wellness_activity_logs").update(payload).eq("id", existing.data.id);
      if (saved.error) throw saved.error;
      updated += 1;
    } else {
      const saved = await supabase.from("wellness_activity_logs").insert(payload);
      if (saved.error) throw saved.error;
      inserted += 1;
    }
  }

  await supabase
    .from("wellness_integrations")
    .update({ last_sync_at: syncedAt, updated_at: syncedAt })
    .eq("id", integration.id);

  return {
    inserted,
    updated,
    warnings: [
      stepsResult.ok ? "" : `Steps: ${stepsResult.message}`,
      distanceResult.ok ? "" : `Distance: ${distanceResult.message}`,
      caloriesResult.ok ? "" : `Calories: ${caloriesResult.message}`,
      minutesResult.ok ? "" : `Active minutes: ${minutesResult.message}`,
    ].filter(Boolean),
  };
}

async function normalizeSource(supabase: any, participantId: number, user: any) {
  const now = new Date().toISOString();
  const integrations = await integrationRows(supabase, participantId);
  const google = integrations.find((row: any) => clean(row.provider) === "google_fit");
  if (!google) throw new Error("Google Fit belum terkoneksi untuk peserta ini.");

  const disabled = await supabase
    .from("wellness_integrations")
    .update({ is_active: 0, updated_at: now })
    .eq("participant_id", participantId)
    .in("provider", ["health_connect", "google_fit"]);
  if (disabled.error) throw disabled.error;

  const enabled = await supabase
    .from("wellness_integrations")
    .update({ is_active: 1, updated_at: now })
    .eq("id", google.id);
  if (enabled.error) throw enabled.error;

  const control = await participantControl(supabase, participantId);
  const controlPayload = {
    participant_id: participantId,
    session_enabled: control?.session_enabled !== false,
    fitness_enabled: true,
    fitness_source: "google_fit",
    updated_by: Number(user?.id || user?.user_id || 0) || null,
    updated_at: now,
  };
  const controlWrite = await supabase
    .from("wellness_participant_controls")
    .upsert(controlPayload, { onConflict: "participant_id" });
  if (controlWrite.error) throw controlWrite.error;
}

export async function GET(request: NextRequest) {
  if (!adminUser(request)) return json({ ok: false, message: "Akses Admin Wellness diperlukan." }, 401);
  const participantId = Number(request.nextUrl.searchParams.get("participant_id") || 0);
  if (!participantId) return json({ ok: false, message: "participant_id wajib diisi." }, 400);
  try {
    return json({ ok: true, diagnosis: await diagnose(getSupabaseAdmin(), participantId) });
  } catch (error: any) {
    return json({ ok: false, message: error?.message || "Diagnosa Google Fit gagal." }, 500);
  }
}

export async function POST(request: NextRequest) {
  const user: any = adminUser(request);
  if (!user) return json({ ok: false, message: "Akses Admin Wellness diperlukan." }, 401);
  const body = await request.json().catch(() => ({}));
  const participantId = Number(body?.participant_id || 0);
  const action = clean(body?.action);
  if (!participantId) return json({ ok: false, message: "participant_id wajib diisi." }, 400);

  const supabase = getSupabaseAdmin();
  try {
    let result: any = null;
    if (action === "force_resync") {
      result = await forceSync(supabase, participantId, Number(body?.days || 3));
    } else if (action === "normalize_source") {
      await normalizeSource(supabase, participantId, user);
      result = { normalized: true };
    } else {
      return json({ ok: false, message: "Action Google Fit repair tidak dikenali." }, 400);
    }

    return json({
      ok: true,
      action,
      result,
      diagnosis: await diagnose(supabase, participantId),
      message:
        action === "force_resync"
          ? "Sinkron ulang Google Fit selesai dan data peserta telah dibaca ulang."
          : "Sumber fitness peserta telah dinormalisasi ke Google Fit.",
    });
  } catch (error: any) {
    const message = error?.message || "Perbaikan Google Fit gagal.";
    const tokenError = /TOKEN_ERROR|invalid_grant|refresh_token|unauthorized/i.test(message);
    return json(
      {
        ok: false,
        status: tokenError ? "TOKEN_ERROR" : "REPAIR_FAILED",
        reconnect_required: tokenError,
        message: tokenError
          ? "Token Google Fit tidak dapat diperbarui. Peserta perlu menghubungkan ulang akun Google Fit."
          : message,
      },
      tokenError ? 409 : 500,
    );
  }
}
