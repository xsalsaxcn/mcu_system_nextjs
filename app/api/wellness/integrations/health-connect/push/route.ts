import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import {
  loadParticipantControl,
  normalizeFitnessSource,
} from "@/lib/wellness/participantControls";

// WELLNESS_HEALTH_CONNECT_REPORTED_ACTIVE_CALORIE_V71
// WELLNESS_HEALTH_CONNECT_SINGLE_SOURCE_GUARD_V79F
// WELLNESS_PARTICIPANT_FITNESS_SELECTION_SYNC_V79H
// WELLNESS_FITNESS_PROVIDER_ORIGIN_SEPARATION_V79I
// Update dari V421:
// - Menerima data dari Android companion app.
// - Menyimpan daily aggregate ke wellness_activity_logs.
// - Menyimpan workout/session detail ke wellness_activity_logs.
// - Source = health_connect.
// - Tidak mengganggu Google Fit.
// - Tidak butuh Strava API/subscription.
// - Proteksi baru: jika Health Connect membaca data kosong / hampir nol,
//   server tidak overwrite row existing agar data bagus tidak ketimpa 0.

function clean(value: any) {
  return String(value ?? "").trim();
}

function trueValue(value: any) {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "ya", "on"].includes(clean(value).toLowerCase());
}

function participantConfirmedHealthConnect(body: any) {
  const syncMode = clean(body?.sync_mode || body?.diagnostic?.sync_mode)
    .toLowerCase()
    .replace(/-/g, "_");
  const requestedSource = clean(
    body?.requested_fitness_source || "health_connect",
  )
    .toLowerCase()
    .replace(/-/g, "_");
  const originPackage = clean(
    body?.health_connect_origin_package ||
      body?.diagnostic?.selected_origin_package,
  );

  return (
    trueValue(body?.source_selection_confirmed) &&
    requestedSource === "health_connect" &&
    ["manual", "manual_selection"].includes(syncMode) &&
    Boolean(originPackage)
  );
}

function num(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeNumber(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function participantWeightKg(participant: any) {
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
    const value = safeNumber(participant?.[key]);
    if (value > 0) return Math.min(250, Math.max(35, value));
  }

  return 70;
}

function estimateDistanceFromStepsV70(steps: number) {
  if (steps <= 0) return 0;
  return Math.round(steps * 0.0007 * 100) / 100;
}

function validateDailyDistanceV70(steps: number, distanceKm: number) {
  const safeSteps = Math.max(0, safeNumber(steps));
  const rawDistanceKm = Math.max(0, safeNumber(distanceKm));
  const estimatedDistanceKm = estimateDistanceFromStepsV70(safeSteps);

  if (safeSteps <= 0) {
    return {
      distanceKm: rawDistanceKm,
      rawDistanceKm,
      usedEstimate: false,
      reason: rawDistanceKm > 0 ? "NO_STEPS_DISTANCE_PRESERVED" : "NO_DISTANCE",
    };
  }

  const minPlausibleKm = Math.max(0.05, safeSteps * 0.00025);
  const maxPlausibleKm = Math.max(0.3, safeSteps * 0.0015);
  const plausible =
    rawDistanceKm > 0 &&
    rawDistanceKm >= minPlausibleKm &&
    rawDistanceKm <= maxPlausibleKm;

  return {
    distanceKm: plausible ? rawDistanceKm : estimatedDistanceKm,
    rawDistanceKm,
    usedEstimate: !plausible,
    reason: plausible
      ? "HEALTH_CONNECT_DISTANCE_PLAUSIBLE"
      : rawDistanceKm > 0
        ? "HEALTH_CONNECT_DISTANCE_REJECTED_AS_IMPLAUSIBLE"
        : "HEALTH_CONNECT_DISTANCE_MISSING",
    minPlausibleKm,
    maxPlausibleKm,
  };
}

function estimateDailyActiveCaloriesV70(params: {
  steps: number;
  distanceKm: number;
  activeMinutes: number;
  weightKg: number;
}) {
  const steps = Math.max(0, safeNumber(params.steps));
  const distanceKm = Math.max(0, safeNumber(params.distanceKm));
  const activeMinutes = Math.max(0, safeNumber(params.activeMinutes));
  const weightKg = Math.min(250, Math.max(35, safeNumber(params.weightKg) || 70));

  if (steps > 0) {
    const distanceEstimate = distanceKm * weightKg * 0.53;
    const stepCap = steps * 0.1;
    return Math.max(1, Math.round(Math.min(distanceEstimate, stepCap)));
  }

  if (activeMinutes > 0) {
    const perMinute = Math.max(3, weightKg * 0.06);
    return Math.min(1200, Math.max(1, Math.round(activeMinutes * perMinute)));
  }

  return 0;
}


function chooseHealthConnectDailyCaloriesV71(params: {
  reportedCalories: number;
  estimatedCalories: number;
  steps: number;
  activeMinutes: number;
}) {
  const reportedCalories = Math.max(0, safeNumber(params.reportedCalories));
  const estimatedCalories = Math.max(0, safeNumber(params.estimatedCalories));
  const steps = Math.max(0, safeNumber(params.steps));
  const activeMinutes = Math.max(0, safeNumber(params.activeMinutes));

  // Nilai dari Android companion app adalah active calories Health Connect.
  // Pertahankan nilai itu bila masih wajar. Estimasi hanya menjadi fallback.
  const maxPlausibleCalories = Math.min(
    2500,
    Math.max(
      1200,
      steps * 0.25,
      activeMinutes > 0 ? activeMinutes * 25 : 0
    )
  );

  if (reportedCalories > 0 && reportedCalories <= maxPlausibleCalories) {
    return {
      calories: Math.round(reportedCalories * 100) / 100,
      source: "health_connect_reported_active_calories",
      usedReportedCalories: true,
      rejectedReportedCalories: false,
      maxPlausibleCalories,
    };
  }

  return {
    calories: Math.round(estimatedCalories * 100) / 100,
    source:
      reportedCalories > maxPlausibleCalories
        ? "fallback_estimate_reported_value_implausible"
        : "fallback_estimate_reported_value_missing",
    usedReportedCalories: false,
    rejectedReportedCalories: reportedCalories > maxPlausibleCalories,
    maxPlausibleCalories,
  };
}

function dateOnly(value: any) {
  const text = clean(value);
  if (!text) return "";
  return text.slice(0, 10);
}

function todayJakarta() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((item) => item.type === "year")?.value || "";
  const month = parts.find((item) => item.type === "month")?.value || "";
  const day = parts.find((item) => item.type === "day")?.value || "";

  if (!year || !month || !day) return new Date().toISOString().slice(0, 10);

  return `${year}-${month}-${day}`;
}

function normalizeDate(value: any) {
  return dateOnly(value) || todayJakarta();
}

function normalizeStartedAt(value: any, date: string) {
  const text = clean(value);
  if (text) return text;
  return `${date}T00:00:00+07:00`;
}

function activityTypeLabel(value: any) {
  const text = clean(value);
  if (!text) return "Health Connect";

  const lower = text.toLowerCase();

  if (lower.includes("run")) return "Running";
  if (lower.includes("walk")) return "Walking";
  if (lower.includes("bike") || lower.includes("cycle")) return "Cycling";
  if (lower.includes("swim")) return "Swimming";
  if (lower.includes("strength")) return "Strength Training";
  if (lower.includes("yoga")) return "Yoga";
  if (lower.includes("workout") || lower.includes("exercise")) return "Workout";

  return text;
}

function isEmptyDailyPayload({
  steps,
  calories,
  activeMinutes,
  distanceKm,
  workouts,
}: {
  steps: number | null;
  calories: number | null;
  activeMinutes: number | null;
  distanceKm: number | null;
  workouts: any[];
}) {
  const s = safeNumber(steps);
  const c = safeNumber(calories);
  const m = safeNumber(activeMinutes);
  const d = safeNumber(distanceKm);

  // Kalau semua indikator utama kosong, atau calories sangat kecil
  // tanpa steps/distance/minutes, kemungkinan Health Connect belum menerima
  // data dari sumber seperti Mi Fitness/Google Fit/Samsung Health.
  if (workouts.length > 0) return false;

  return s <= 0 && m <= 0 && d <= 0 && c <= 5;
}

async function findParticipant(supabase: any, req: NextRequest, body: any) {
  const sessionParticipant = await getParticipantFromPortalSession(
    supabase,
    req
  ).catch(() => null);

  if (sessionParticipant?.id) return sessionParticipant;

  const expectedSecret = clean(process.env.HEALTH_CONNECT_PUSH_SECRET);
  const suppliedSecret = clean(req.headers.get("x-health-connect-secret"));

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return null;
  }

  const participantId = num(body?.participant_id);
  const code = clean(body?.participant_code || body?.code || body?.employee_code);

  if (participantId) {
    const { data } = await supabase
      .from("wellness_participants")
      .select("*")
      .eq("id", participantId)
      .maybeSingle();

    if (data?.id) return data;
  }

  if (code) {
    const { data } = await supabase
      .from("wellness_participants")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (data?.id) return data;
  }

  return null;
}

async function saveActivityLog(supabase: any, payload: any) {
  const participantId = Number(payload.participant_id);
  const externalId = clean(payload.external_activity_id);

  if (!participantId || !externalId) {
    return { skipped: true, reason: "PARTICIPANT_OR_EXTERNAL_ID_MISSING" };
  }

  const { data: existing, error: existingError } = await supabase
    .from("wellness_activity_logs")
    .select("id, calories, duration_minutes, distance_km, raw_payload")
    .eq("participant_id", participantId)
    .eq("source", "health_connect")
    .eq("external_activity_id", externalId)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    const { error } = await supabase
      .from("wellness_activity_logs")
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
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

async function upsertIntegration(supabase: any, participantId: number, body: any) {
  const nowIso = new Date().toISOString();

  await supabase
    .from("wellness_integrations")
    .update({ is_active: 0, updated_at: nowIso })
    .eq("participant_id", participantId)
    .eq("provider", "google_fit");

  const providerUserId =
    clean(body?.device_id) ||
    clean(body?.android_id) ||
    clean(body?.user_id) ||
    `participant_${participantId}`;

  const rawPayload = {
    marker: "WELLNESS_HEALTH_CONNECT_REPORTED_ACTIVE_CALORIE_V71",
    device_id: body?.device_id || null,
    android_id: body?.android_id || null,
    app_version: body?.app_version || null,
    synced_at: nowIso,
    permissions: body?.permissions || null,
    source: "health_connect",
    health_connect_origin_package:
      body?.health_connect_origin_package ||
      body?.diagnostic?.selected_origin_package ||
      null,
    health_connect_origin_name:
      body?.health_connect_origin_name ||
      body?.diagnostic?.selected_origin_name ||
      null,
    source_selection_confirmed: trueValue(
      body?.source_selection_confirmed,
    ),
    sync_mode: body?.sync_mode || body?.diagnostic?.sync_mode || null,
  };

  const { data: existing, error: existingError } = await supabase
    .from("wellness_integrations")
    .select("id")
    .eq("participant_id", participantId)
    .eq("provider", "health_connect")
    .maybeSingle();

  if (existingError) throw existingError;

  const payload: any = {
    participant_id: participantId,
    provider: "health_connect",
    provider_user_id: providerUserId,
    scope: "steps,exercise,distance,calories",
    is_active: 1,
    updated_at: nowIso,
    raw_payload: rawPayload,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("wellness_integrations")
      .update(payload)
      .eq("id", existing.id);

    if (error) throw error;

    return;
  }

  const { error } = await supabase.from("wellness_integrations").insert({
    ...payload,
    connected_at: nowIso,
  });

  if (error) throw error;
}

async function usableGoogleFitIntegration(
  supabase: any,
  participantId: number,
) {
  const { data, error } = await supabase
    .from("wellness_integrations")
    .select("id,access_token,refresh_token,connected_at,last_sync_at")
    .eq("participant_id", participantId)
    .eq("provider", "google_fit")
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;
  if (!clean(data.access_token) && !clean(data.refresh_token)) return null;
  return data;
}

async function activateProviderFromParticipant(
  supabase: any,
  participantId: number,
  currentControl: any,
  provider: "health_connect" | "google_fit",
) {
  const nowIso = new Date().toISOString();

  if (provider === "google_fit") {
    const googleFit = await usableGoogleFitIntegration(supabase, participantId);
    if (!googleFit) {
      return {
        ok: false,
        status: 409,
        message:
          "Google Fit belum terhubung. Buka Portal Peserta > Device Sync > Reconnect Google Fit terlebih dahulu.",
      };
    }
  }

  const { error: controlError } = await supabase
    .from("wellness_participant_controls")
    .upsert(
      {
        participant_id: participantId,
        session_enabled: currentControl?.session_enabled !== false,
        fitness_enabled: true,
        fitness_source: provider,
        updated_at: nowIso,
      },
      { onConflict: "participant_id" },
    );

  if (controlError) throw controlError;

  const { error: disableError } = await supabase
    .from("wellness_integrations")
    .update({ is_active: 0, updated_at: nowIso })
    .eq("participant_id", participantId)
    .in("provider", ["health_connect", "google_fit"]);

  if (disableError) throw disableError;

  if (provider === "google_fit") {
    const { error: activateError } = await supabase
      .from("wellness_integrations")
      .update({ is_active: 1, updated_at: nowIso })
      .eq("participant_id", participantId)
      .eq("provider", "google_fit");
    if (activateError) throw activateError;
  }

  return { ok: true, status: 200, message: "Provider berhasil diaktifkan." };
}

async function handlePush(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json().catch(() => ({}));

  const participant = await findParticipant(supabase, req, body);

  if (!participant?.id) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Participant tidak ditemukan atau akses Health Connect tidak valid.",
      },
      { status: 401 }
    );
  }

  const participantId = Number(participant.id);
  let control = await loadParticipantControl(supabase, participantId);
  if (!control.session_enabled) {
    return NextResponse.json(
      {
        ok: false,
        participant_id: participantId,
        message: "Session Wellness dinonaktifkan oleh Admin.",
      },
      { status: 403 },
    );
  }

  const requestedSource = normalizeFitnessSource(
    body?.requested_fitness_source,
  );
  const explicitProviderSelection =
    trueValue(body?.selection_only) &&
    trueValue(body?.provider_selection_confirmed);

  if (explicitProviderSelection) {
    if (requestedSource !== "health_connect" && requestedSource !== "google_fit") {
      return NextResponse.json(
        {
          ok: false,
          participant_id: participantId,
          message: "Pilih Health Connect atau Google Fit.",
        },
        { status: 400 },
      );
    }

    if (
      requestedSource === "health_connect" &&
      !clean(
        body?.health_connect_origin_package ||
          body?.diagnostic?.selected_origin_package,
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          participant_id: participantId,
          message:
            "Pilih satu aplikasi asal data Health Connect sebelum mengaktifkannya.",
        },
        { status: 400 },
      );
    }

    const activation = await activateProviderFromParticipant(
      supabase,
      participantId,
      control,
      requestedSource,
    );

    if (!activation.ok) {
      return NextResponse.json(
        {
          ok: false,
          participant_id: participantId,
          fitness_source: control.fitness_source,
          message: activation.message,
        },
        { status: activation.status },
      );
    }

    if (requestedSource === "health_connect") {
      await upsertIntegration(supabase, participantId, body);
    }

    control = await loadParticipantControl(supabase, participantId);

    return NextResponse.json({
      ok: true,
      marker: "WELLNESS_FITNESS_PROVIDER_ORIGIN_SEPARATION_V79I",
      participant_id: participantId,
      control,
      fitness_enabled: control.fitness_enabled,
      fitness_source: control.fitness_source,
      source_connected: control.source_connected,
      message:
        requestedSource === "health_connect"
          ? "Health Connect menjadi sumber aktif. Aplikasi asal data disimpan terpisah."
          : "Google Fit langsung menjadi sumber aktif. Auto Sync Health Connect dihentikan.",
    });
  }

  let sourceChangedByParticipant = false;

  if (!control.fitness_enabled || control.fitness_source !== "health_connect") {
    return NextResponse.json(
      {
        ok: false,
        participant_id: participantId,
        fitness_source: control.fitness_source,
        message:
          "Health Connect bukan sumber fitness aktif. Pilih sumber di aplikasi peserta atau Portal Admin.",
      },
      { status: 409 },
    );
  }

  const date = normalizeDate(body?.date || body?.log_date);
  const nowIso = new Date().toISOString();

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const workouts = Array.isArray(body?.workouts)
    ? body.workouts
    : Array.isArray(body?.exercises)
      ? body.exercises
      : [];

  const steps = num(body?.steps ?? body?.total_steps);

  // WELLNESS_HEALTH_CONNECT_ACTIVE_CALORIES_ONLY_V79F
  // Workout achievement must never use total calories (active + resting/BMR).
  // Android sends final active calories in `calories`; `total_calories`, when
  // present, is retained only inside original_payload for audit.
  const calories = num(
    body?.active_calories ??
      body?.calories ??
      body?.calories_burned
  );

  const activeMinutes = num(
    body?.active_minutes ??
      body?.duration_minutes ??
      body?.exercise_minutes
  );

  const distanceKm = num(body?.distance_km);

  const hasDailyData =
    steps !== null ||
    calories !== null ||
    activeMinutes !== null ||
    distanceKm !== null;

  const distanceValidation = validateDailyDistanceV70(
    safeNumber(steps),
    safeNumber(distanceKm)
  );
  const estimatedDailyCalories = estimateDailyActiveCaloriesV70({
    steps: safeNumber(steps),
    distanceKm: distanceValidation.distanceKm,
    activeMinutes: safeNumber(activeMinutes),
    weightKg: participantWeightKg(participant),
  });

  const calorieSelection = chooseHealthConnectDailyCaloriesV71({
    reportedCalories: safeNumber(calories),
    estimatedCalories: estimatedDailyCalories,
    steps: safeNumber(steps),
    activeMinutes: safeNumber(activeMinutes),
  });

  const selectedDailyCalories = calorieSelection.calories;

  const emptyDailyPayload = isEmptyDailyPayload({
    steps,
    calories: selectedDailyCalories,
    activeMinutes,
    distanceKm: distanceValidation.distanceKm,
    workouts,
  });

  if (hasDailyData && !emptyDailyPayload) {
    const dailyPayload: any = {
      participant_id: participantId,
      source: "health_connect",
      external_activity_id: `health_connect_daily_${participantId}_${date}`,
      activity_type: "Health Connect",
      activity_name: "Health Connect Daily",
      log_date: date,
      started_at: normalizeStartedAt(body?.started_at, date),
      duration_minutes: activeMinutes,
      calories: selectedDailyCalories,
      distance_km: distanceValidation.distanceKm,
      raw_payload: {
        marker: "WELLNESS_HEALTH_CONNECT_REPORTED_ACTIVE_CALORIE_V71",
        provider: "health_connect",
        sync_mode: "daily_aggregate",
        health_connect_steps: steps,
        health_connect_active_minutes: activeMinutes,
        health_connect_calories_original: calories,
        health_connect_calories_used: calorieSelection.usedReportedCalories,
        health_connect_calories_rejected:
          calorieSelection.rejectedReportedCalories,
        health_connect_calories_max_plausible:
          calorieSelection.maxPlausibleCalories,
        health_connect_distance_km_original: distanceKm,
        health_connect_distance_km: distanceValidation.distanceKm,
        distance_validation_reason: distanceValidation.reason,
        estimated_distance_used: distanceValidation.usedEstimate,
        estimated_active_calories: estimatedDailyCalories,
        selected_active_calories: selectedDailyCalories,
        calories_source: calorieSelection.source,
        calculation_note:
          "Health Connect reported active calories are preserved when plausible. Step-based estimation is used only when the reported value is missing or clearly implausible.",
        health_connect_last_sync_at: nowIso,
        original_payload: body,
      },
    };

    const result = await saveActivityLog(supabase, dailyPayload);

    if (result.inserted) inserted += 1;
    else if (result.updated) updated += 1;
    else skipped += 1;
  } else if (hasDailyData && emptyDailyPayload) {
    skipped += 1;
  }

  for (const workout of workouts) {
    const workoutDate = normalizeDate(
      workout?.date ||
        workout?.log_date ||
        workout?.start_time ||
        workout?.started_at
    );

    const externalId =
      clean(workout?.id || workout?.uid || workout?.external_id) ||
      `health_connect_workout_${participantId}_${workoutDate}_${clean(
        workout?.start_time || workout?.started_at || workout?.activity_type || ""
      ).replace(/\W+/g, "_")}`;

    const duration = num(
      workout?.duration_minutes ??
        workout?.active_minutes ??
        workout?.exercise_minutes
    );

    const workoutCalories = num(
      workout?.calories ??
        workout?.active_calories ??
        workout?.calories_burned
    );

    const workoutDistance = num(workout?.distance_km);
    const workoutSteps = num(workout?.steps);

    const workoutIsEmpty =
      safeNumber(duration) <= 0 &&
      safeNumber(workoutCalories) <= 5 &&
      safeNumber(workoutDistance) <= 0 &&
      safeNumber(workoutSteps) <= 0;

    if (workoutIsEmpty) {
      skipped += 1;
      continue;
    }

    const payload: any = {
      participant_id: participantId,
      source: "health_connect",
      external_activity_id: externalId,
      activity_type: activityTypeLabel(workout?.activity_type || workout?.type),
      activity_name:
        clean(workout?.activity_name || workout?.name) ||
        activityTypeLabel(workout?.activity_type || workout?.type),
      log_date: workoutDate,
      started_at: normalizeStartedAt(
        workout?.started_at || workout?.start_time,
        workoutDate
      ),
      duration_minutes: duration,
      calories: workoutCalories,
      distance_km: workoutDistance,
      raw_payload: {
        marker: "WELLNESS_HEALTH_CONNECT_REPORTED_ACTIVE_CALORIE_V71",
        provider: "health_connect",
        sync_mode: "exercise_session",
        health_connect_steps: workoutSteps,
        health_connect_active_minutes: duration,
        health_connect_calories: workoutCalories,
        health_connect_distance_km: workoutDistance,
        health_connect_last_sync_at: nowIso,
        original_payload: workout,
      },
    };

    const result = await saveActivityLog(supabase, payload);

    if (result.inserted) inserted += 1;
    else if (result.updated) updated += 1;
    else skipped += 1;
  }

  await upsertIntegration(supabase, participantId, body);

  return NextResponse.json({
    ok: true,
    marker: "WELLNESS_HEALTH_CONNECT_REPORTED_ACTIVE_CALORIE_V71",
    participant_id: participantId,
    date,
    inserted,
    updated,
    skipped,
    skipped_empty_daily_payload: emptyDailyPayload,
    source_changed_by_participant: sourceChangedByParticipant,
    fitness_source: "health_connect",
    message: emptyDailyPayload
      ? `Health Connect terbaca kosong, data tidak dioverwrite. ${inserted} baru, ${updated} update, ${skipped} skip.`
      : `Health Connect diterima. ${inserted} baru, ${updated} update, ${skipped} skip.`,
  });
}

export async function GET(req: NextRequest) {
  const expectedSecret = clean(process.env.HEALTH_CONNECT_PUSH_SECRET);
  const suppliedSecret = clean(req.headers.get("x-health-connect-secret"));

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return NextResponse.json(
      { ok: false, message: "Akses status fitness tidak valid." },
      { status: 401 },
    );
  }

  const participantId = Number(
    req.nextUrl.searchParams.get("participant_id") || 0,
  );
  if (!participantId) {
    return NextResponse.json(
      { ok: false, message: "participant_id wajib diisi." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: participant, error } = await supabase
    .from("wellness_participants")
    .select("id,code,name")
    .eq("id", participantId)
    .maybeSingle();

  if (error) throw error;
  if (!participant?.id) {
    return NextResponse.json(
      { ok: false, message: "Participant tidak ditemukan." },
      { status: 404 },
    );
  }

  const control = await loadParticipantControl(supabase, participantId);
  return NextResponse.json({
    ok: true,
    marker: "WELLNESS_FITNESS_PROVIDER_ORIGIN_SEPARATION_V79I",
    participant,
    control,
  });
}

export async function POST(req: NextRequest) {
  return handlePush(req);
}
