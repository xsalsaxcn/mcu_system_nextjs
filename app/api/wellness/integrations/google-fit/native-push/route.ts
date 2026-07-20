// WELLNESS_GOOGLE_FIT_NATIVE_LIVE_PUSH_V79N
// Exact Android HistoryClient.readDailyTotal snapshot. No calorie estimation.
// WELLNESS_GOOGLE_FIT_STABLE_NATIVE_V79R3

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import { loadParticipantControl } from "@/lib/wellness/participantControls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MARKER = "WELLNESS_GOOGLE_FIT_NATIVE_LIVE_PUSH_V79N";
const JAKARTA_TIME_ZONE = "Asia/Jakarta";

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function trueValue(value: any) {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "ya", "on"].includes(clean(value).toLowerCase());
}

function todayJakarta() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((item) => item.type === "year")?.value || "";
  const month = parts.find((item) => item.type === "month")?.value || "";
  const day = parts.find((item) => item.type === "day")?.value || "";
  return year && month && day
    ? `${year}-${month}-${day}`
    : new Date().toISOString().slice(0, 10);
}

function normalizeDate(value: any) {
  const text = clean(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : todayJakarta();
}

function parseRawPayload(value: any) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

async function findParticipant(supabase: any, req: NextRequest, body: any) {
  const sessionParticipant = await getParticipantFromPortalSession(
    supabase,
    req,
  ).catch(() => null);
  if (sessionParticipant?.id) return sessionParticipant;

  const suppliedSecret = clean(req.headers.get("x-health-connect-secret"));
  const expectedSecret = clean(process.env.HEALTH_CONNECT_PUSH_SECRET);
  if (!expectedSecret || suppliedSecret !== expectedSecret) return null;

  const participantId = Number(body?.participant_id || 0);
  if (!(participantId > 0)) return null;

  const result = await supabase
    .from("wellness_participants")
    .select("*")
    .eq("id", participantId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json().catch(() => ({}));

  try {
    const participant = await findParticipant(supabase, req, body);
    if (!participant?.id) {
      return NextResponse.json(
        { ok: false, marker: MARKER, message: "Participant atau akses native tidak valid." },
        { status: 401 },
      );
    }

    const participantId = Number(participant.id);
    const control = await loadParticipantControl(supabase, participantId);
    if (!control.session_enabled) {
      return NextResponse.json(
        { ok: false, marker: MARKER, message: "Session Wellness peserta nonaktif." },
        { status: 409 },
      );
    }
    if (!control.fitness_enabled || control.fitness_source !== "google_fit") {
      return NextResponse.json(
        {
          ok: false,
          marker: MARKER,
          message: "Google Fit bukan sumber fitness aktif. Pilih Google Fit dari Portal Admin.",
        },
        { status: 409 },
      );
    }

    const integrationResult = await supabase
      .from("wellness_integrations")
      .select("*")
      .eq("participant_id", participantId)
      .eq("provider", "google_fit")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (integrationResult.error) throw integrationResult.error;
    const integration = integrationResult.data;
    if (!integration?.id) {
      return NextResponse.json(
        { ok: false, marker: MARKER, message: "Google Fit belum terkoneksi." },
        { status: 409 },
      );
    }

    const integrationRaw = parseRawPayload(integration.raw_payload);
    const expectedEmail = clean(
      integrationRaw?.profile?.email || integrationRaw?.native_account_email,
    ).toLowerCase();
    const nativeEmail = clean(body?.account_email).toLowerCase();
    if (expectedEmail && nativeEmail && expectedEmail !== nativeEmail) {
      return NextResponse.json(
        {
          ok: false,
          marker: MARKER,
          message: `Akun Google Fit Android (${nativeEmail}) berbeda dari akun OAuth portal (${expectedEmail}).`,
        },
        { status: 409 },
      );
    }

    const date = normalizeDate(body?.date);
    const measuredAtText = clean(body?.measured_at) || new Date().toISOString();
    const measuredAtMs = new Date(measuredAtText).getTime();
    if (!Number.isFinite(measuredAtMs)) {
      return NextResponse.json(
        { ok: false, marker: MARKER, message: "Waktu snapshot native tidak valid." },
        { status: 400 },
      );
    }

    const ageMs = Math.abs(Date.now() - measuredAtMs);
    if (ageMs > 15 * 60 * 1000) {
      return NextResponse.json(
        { ok: false, marker: MARKER, message: "Snapshot Google Fit native sudah terlalu lama. Sync ulang." },
        { status: 409 },
      );
    }

    const steps = Math.max(0, Math.round(numberValue(body?.steps)));
    const totalCalories = Math.max(0, numberValue(body?.total_calories));
    const distanceKm = Math.max(0, numberValue(body?.distance_km));
    const activeCaloriesAvailable = trueValue(body?.active_calories_available);
    const activeCalories = activeCaloriesAvailable
      ? Math.max(0, numberValue(body?.active_calories))
      : 0;
    const nowIso = new Date().toISOString();
    const externalId = `google_fit_daily_${participantId}_${date}`;

    const exactSnapshot = {
      date,
      measured_at: measuredAtText,
      synced_at: nowIso,
      steps,
      total_calories: Math.round(totalCalories * 100) / 100,
      distance_km: Math.round(distanceKm * 100) / 100,
      active_calories: activeCaloriesAvailable
        ? Math.round(activeCalories * 100) / 100
        : null,
      active_calories_available: activeCaloriesAvailable,
      source: "google_fit_android_read_daily_total",
      account_email: nativeEmail || null,
    };

    const payload: any = {
      participant_id: participantId,
      source: "google_fit",
      external_activity_id: externalId,
      provider_activity_id: externalId,
      activity_type: "Google Fit Daily",
      activity_name: `Google Fit Live - ${steps} steps`,
      log_date: date,
      started_at: measuredAtText,
      duration_minutes: 0,
      calories: Math.round(totalCalories * 100) / 100,
      distance_km: distanceKm,
      steps,
      updated_at: nowIso,
      raw_payload: {
        marker: MARKER,
        provider: "google_fit",
        sync_mode: "native_live_daily",
        native_live: true,
        native_measured_at: measuredAtText,
        native_account_email: nativeEmail || null,
        google_fit_steps: steps,
        google_fit_total_calories: totalCalories,
        google_fit_calories_expended: totalCalories,
        google_fit_active_calories: activeCaloriesAvailable
          ? activeCalories
          : null,
        active_calories_available: activeCaloriesAvailable,
        sanitized_active_calories: activeCaloriesAvailable
          ? activeCalories
          : 0,
        calories_source: activeCaloriesAvailable
          ? "google_fit_native_reported_active"
          : "google_fit_native_total_only_no_active_guess",
        google_fit_calories_include_bmr: true,
        exact_snapshot: exactSnapshot,
        calculation_note:
          "Steps and total calories are read directly with Google Fit Android HistoryClient.readDailyTotal. Active calories are never estimated.",
        synced_at: nowIso,
        last_sync_at: nowIso,
      },
    };

    const existingResult = await supabase
      .from("wellness_activity_logs")
      .select("id,raw_payload,updated_at")
      .eq("participant_id", participantId)
      .eq("source", "google_fit")
      .eq("external_activity_id", externalId)
      .maybeSingle();
    if (existingResult.error) throw existingResult.error;

    const previousRaw = parseRawPayload(existingResult.data?.raw_payload);
    const previousMeasuredAtText = clean(
      previousRaw?.native_measured_at || previousRaw?.exact_snapshot?.measured_at,
    );
    const previousMeasuredAtMs = new Date(previousMeasuredAtText).getTime();
    if (
      existingResult.data?.id &&
      Number.isFinite(previousMeasuredAtMs) &&
      previousMeasuredAtMs > measuredAtMs
    ) {
      return NextResponse.json({
        ok: true,
        marker: MARKER,
        action: "newer_native_preserved",
        message: "Snapshot native yang lebih baru sudah tersimpan.",
        last_sync_at: clean(existingResult.data?.updated_at) || nowIso,
        last_sync_snapshot: previousRaw?.exact_snapshot || null,
        active_calories_available:
          previousRaw?.active_calories_available === true,
      });
    }

    let action = "inserted";
    if (existingResult.data?.id) {
      const update = await supabase
        .from("wellness_activity_logs")
        .update(payload)
        .eq("id", existingResult.data.id);
      if (update.error) throw update.error;
      action = "updated";
    } else {
      const insert = await supabase.from("wellness_activity_logs").insert(payload);
      if (insert.error) throw insert.error;
    }

    const integrationUpdate = await supabase
      .from("wellness_integrations")
      .update({
        is_active: 1,
        last_sync_at: nowIso,
        updated_at: nowIso,
        raw_payload: {
          ...integrationRaw,
          native_account_email: nativeEmail || expectedEmail || null,
          native_last_sync_at: nowIso,
          native_last_snapshot: exactSnapshot,
          marker: integrationRaw?.marker || MARKER,
        },
      })
      .eq("id", integration.id);
    if (integrationUpdate.error) throw integrationUpdate.error;

    return NextResponse.json({
      ok: true,
      marker: MARKER,
      action,
      message: `Google Fit tersinkron dari perangkat: ${steps.toLocaleString("id-ID")} steps, ${Math.round(totalCalories).toLocaleString("id-ID")} kkal total.`,
      last_sync_at: nowIso,
      last_sync_snapshot: exactSnapshot,
      active_calories_available: activeCaloriesAvailable,
    });
  } catch (error: any) {
    console.error("WELLNESS_GOOGLE_FIT_NATIVE_LIVE_PUSH_ERROR", error);
    return NextResponse.json(
      { ok: false, marker: MARKER, message: error?.message || "Google Fit native push gagal." },
      { status: 500 },
    );
  }
}

