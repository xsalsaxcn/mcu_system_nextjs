// WELLNESS_GOOGLE_FIT_NATIVE_LIVE_PUSH_V79N
// Exact Android HistoryClient.readDailyTotal snapshot. No calorie estimation.
// WELLNESS_GOOGLE_FIT_STABLE_NATIVE_V79R3
// WELLNESS_GOOGLE_FIT_NATIVE_SNAPSHOT_ONLY_V86B
// WELLNESS_PROFILE_AND_SYNC_CUTOFF_V126F

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import { loadParticipantControl } from "@/lib/wellness/participantControls";
import { reconcileWorkoutDailyPoint } from "@/lib/wellness/pointWriter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MARKER =
  "WELLNESS_GOOGLE_FIT_NATIVE_SNAPSHOT_ONLY_V86B";
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

// WELLNESS_GOOGLE_FIT_NATIVE_DAILY_ROW_V126M29_1
// Persist the exact Android daily snapshot into the same daily activity row
// already consumed by Participant, Coach, points, and streak.
async function upsertNativeGoogleFitDailyRow(params: {
  supabase: any;
  participantId: number;
  snapshot: any;
  syncedAt: string;
}) {
  const date = normalizeDate(params.snapshot?.date);
  const externalId = `google_fit_daily_${params.participantId}_${date}`;

  const existingResult = await params.supabase
    .from("wellness_activity_logs")
    .select("*")
    .eq("participant_id", params.participantId)
    .eq("source", "google_fit")
    .eq("external_activity_id", externalId)
    .maybeSingle();

  if (existingResult.error) throw existingResult.error;

  const existing = existingResult.data || null;
  const existingRaw = parseRawPayload(existing?.raw_payload);
  const steps = Math.max(0, Math.round(numberValue(params.snapshot?.steps)));
  const totalCalories =
    Math.round(Math.max(0, numberValue(params.snapshot?.total_calories)) * 100) /
    100;
  const distanceKm =
    Math.round(Math.max(0, numberValue(params.snapshot?.distance_km)) * 100) /
    100;
  const activeCaloriesAvailable =
    params.snapshot?.active_calories_available === true;
  const activeCalories = activeCaloriesAvailable
    ? Math.round(
        Math.max(0, numberValue(params.snapshot?.active_calories)) * 100,
      ) / 100
    : 0;

  const payload = {
    participant_id: params.participantId,
    source: "google_fit",
    external_activity_id: externalId,
    provider_activity_id: externalId,
    activity_type: "Google Fit Daily",
    activity_name: `Google Fit Daily - ${steps} steps`,
    log_date: date,
    started_at: params.syncedAt,
    duration_minutes: numberValue(existing?.duration_minutes),
    calories: totalCalories,
    distance_km: distanceKm,
    steps,
    raw_payload: {
      ...existingRaw,
      marker: MARKER,
      provider: "google_fit",
      source: "google_fit",
      sync_mode: "aggregate_daily",
      log_date: date,
      last_sync_at: params.syncedAt,
      synced_at: params.syncedAt,
      native_snapshot_persisted: true,
      exact_snapshot: params.snapshot,
      google_fit_steps: steps,
      google_fit_distance_km: distanceKm,
      google_fit_total_calories: totalCalories,
      google_fit_calories_expended: totalCalories,
      google_fit_active_calories_exact:
        activeCaloriesAvailable ? activeCalories : null,
      google_fit_active_calories:
        activeCaloriesAvailable ? activeCalories : null,
      active_calories_available: activeCaloriesAvailable,
      calories_source: activeCaloriesAvailable
        ? "google_fit_native_total_with_active_snapshot"
        : "google_fit_native_total_energy",
      calculation_note:
        "Native Google Fit daily total persisted so Participant and Coach read the same daily row.",
    },
  };

  if (existing?.id) {
    const updated = await params.supabase
      .from("wellness_activity_logs")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (updated.error) throw updated.error;
    return "updated";
  }

  const inserted = await params.supabase
    .from("wellness_activity_logs")
    .insert(payload)
    .select("*")
    .single();

  if (inserted.error) throw inserted.error;
  return "inserted";
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

    const programStartDate =
      clean(
        participant?.program_start_date,
      ).slice(0, 10);

    if (
      programStartDate &&
      date < programStartDate
    ) {
      return NextResponse.json(
        {
          ok: true,
          marker: MARKER,
          action:
            "before_program_start_skipped",
          message:
            `Data ${date} tidak disimpan karena program dimulai ${programStartDate}.`,
          program_start_date:
            programStartDate,
          skipped_date: date,
        },
        { status: 200 },
      );
    }

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

    const previousSnapshot =
      integrationRaw
        ?.native_last_snapshot || null;

    const previousMeasuredAtText =
      clean(
        previousSnapshot?.measured_at,
      );

    const previousMeasuredAtMs =
      new Date(
        previousMeasuredAtText,
      ).getTime();

    if (
      Number.isFinite(
        previousMeasuredAtMs,
      ) &&
      previousMeasuredAtMs >
        measuredAtMs
    ) {
      return NextResponse.json({
        ok: true,
        marker: MARKER,
        action:
          "newer_native_preserved",
        message:
          "Snapshot native yang lebih baru sudah tersimpan.",
        last_sync_at:
          clean(
            integration?.last_sync_at,
          ) || nowIso,
        last_sync_snapshot:
          previousSnapshot,
        active_calories_available:
          previousSnapshot
            ?.active_calories_available ===
          true,
      });
    }

    // WELLNESS_GOOGLE_FIT_NATIVE_DAILY_ROW_V126M29_1
    // Save the native snapshot to the canonical daily activity row first.
    const dailyRowAction = await upsertNativeGoogleFitDailyRow({
      supabase,
      participantId,
      snapshot: exactSnapshot,
      syncedAt: nowIso,
    });

    // WELLNESS_PROVIDER_SYNC_WORKOUT_RECONCILIATION_V126M119_27
    const workoutPointReconciliation = await reconcileWorkoutDailyPoint({
      supabase,
      participant,
      logDate: normalizeDate(exactSnapshot?.date),
    });

    const action =
      `native_snapshot_${dailyRowAction}`;

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
          native_last_snapshot:
            exactSnapshot,
          native_snapshot_only: false,
          native_daily_row_action: dailyRowAction,
          marker: MARKER,
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
      daily_row_action: dailyRowAction,
      workout_point_reconciliation: {
        ok: workoutPointReconciliation.ok,
        points: workoutPointReconciliation.points,
        calories: workoutPointReconciliation.calories,
        target: workoutPointReconciliation.target,
        warning: workoutPointReconciliation.warning || "",
      },
    });
  } catch (error: any) {
    console.error("WELLNESS_GOOGLE_FIT_NATIVE_LIVE_PUSH_ERROR", error);
    return NextResponse.json(
      { ok: false, marker: MARKER, message: error?.message || "Google Fit native push gagal." },
      { status: 500 },
    );
  }
}

