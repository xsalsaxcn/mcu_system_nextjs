// WELLNESS_PARTICIPANT_ALL_FORMS_EXISTING_GS_V398_WORKOUT
// WELLNESS_WORKOUT_IDEMPOTENCY_V126L
// Manual workout route using the existing Apps Script v370:
// - optional workout evidence -> Google Drive by action=uploadEvidence
// - workout submission row -> Google Sheet Form Responses
// - mirror -> wellness_activity_logs so dashboard/history stay working

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import {
  buildBaseFormRow,
  getCompanyName,
  getDriveUrl,
  getPreviewUrl,
  getWellnessSheetName,
  postToWellnessWebhook,
  safeLogDate,
  uploadEvidenceToDrive,
} from "@/lib/wellness/googleSheetWebhook";
import { reconcileWorkoutDailyPoint } from "@/lib/wellness/pointWriter";

export const runtime = "nodejs";

const MARKER = "WELLNESS_PARTICIPANT_ALL_FORMS_EXISTING_GS_V398_WORKOUT";

function clean(value: any) {
  return String(value ?? "").trim();
}

function toNumberOrNull(value: any) {
  const text = clean(value);
  if (!text) return null;

  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function isoFromLocal(value: any) {
  const text = clean(value);
  if (!text) return null;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function normalizeText(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function parseRequestBody(req: NextRequest) {
  const contentType = clean(req.headers.get("content-type")).toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const body: Record<string, any> = {};

    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") body[key] = value;
    }

    const evidence =
      formData.get("activity_evidence") ||
      formData.get("workout_evidence") ||
      formData.get("evidence") ||
      formData.get("photo") ||
      formData.get("file") ||
      null;

    return { body, evidence };
  }

  const body = await req.json().catch(() => ({}));
  return { body: body || {}, evidence: null };
}

async function getParticipant(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const participant = await getParticipantFromPortalSession(supabase, req);

  return { supabase, participant };
}

function fallbackMet(activityType: string) {
  const type = normalizeText(activityType);

  if (type.includes("run")) return 9.8;
  if (type.includes("jog")) return 7.0;
  if (type.includes("walk") || type.includes("jalan")) return 3.5;
  if (type.includes("cycl") || type.includes("bike") || type.includes("sepeda")) return 7.5;
  if (type.includes("swim") || type.includes("renang")) return 8.0;
  if (type.includes("strength") || type.includes("gym") || type.includes("angkat")) return 5.0;
  if (type.includes("yoga")) return 3.0;

  return 5.0;
}

function getWeightFromObject(value: any) {
  const candidateKeys = [
    "weight_kg",
    "baseline_weight_kg",
    "initial_weight_kg",
    "latest_weight_kg",
    "body_weight",
    "weight",
    "bb",
    "berat_badan",
  ];

  for (const key of candidateKeys) {
    const n = toNumberOrNull(value?.[key]);
    if (n && n > 0) return n;
  }

  return null;
}

async function getLatestWeightKg(supabase: any, participant: any) {
  const fromParticipant = getWeightFromObject(participant);
  if (fromParticipant) return fromParticipant;

  const { data } = await supabase
    .from("wellness_weight_logs")
    .select("*")
    .eq("participant_id", participant.id)
    .order("log_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const fromLog = getWeightFromObject(data);
  if (fromLog) return fromLog;

  return 70;
}

async function findActivityReference(supabase: any, activityType: string, activityName: string) {
  const wantedType = normalizeText(activityType);
  const wantedName = normalizeText(activityName);
  const wanted = wantedName || wantedType;

  const { data, error } = await supabase
    .from("wellness_activity_calories")
    .select("id,activity_name,met,calories_per_km,unit,category")
    .limit(1000);

  if (error) throw error;

  const rows = data || [];
  if (!wanted) return null;

  const exact = rows.find((row: any) => normalizeText(row.activity_name) === wanted);
  if (exact) return { ...exact, match_status: "exact_activity_name" };

  const exactType = rows.find((row: any) => normalizeText(row.activity_name) === wantedType);
  if (exactType) return { ...exactType, match_status: "exact_activity_type" };

  const partial = rows.find((row: any) => {
    const name = normalizeText(row.activity_name);
    return name && (name.includes(wanted) || wanted.includes(name));
  });
  if (partial) return { ...partial, match_status: "partial_activity_name" };

  const partialType = rows.find((row: any) => {
    const name = normalizeText(row.activity_name);
    return name && (name.includes(wantedType) || wantedType.includes(name));
  });
  if (partialType) return { ...partialType, match_status: "partial_activity_type" };

  return null;
}

function calculateCalories(params: {
  activityType: string;
  durationMinutes: number;
  distanceKm: number | null;
  weightKg: number;
  activityRef: any;
}) {
  const { activityType, durationMinutes, distanceKm, weightKg, activityRef } = params;

  const caloriesPerKm = toNumberOrNull(activityRef?.calories_per_km);
  if (caloriesPerKm && distanceKm && distanceKm > 0) {
    return {
      calories: Math.round(caloriesPerKm * distanceKm),
      method: "master_calories_per_km",
      met: null,
      calories_per_km: caloriesPerKm,
    };
  }

  const met = toNumberOrNull(activityRef?.met) || fallbackMet(activityType);
  const calories = Math.round((met * 3.5 * weightKg * durationMinutes) / 200);

  return {
    calories,
    method: activityRef?.met ? "master_met" : "fallback_met",
    met,
    calories_per_km: caloriesPerKm || null,
  };
}

function buildWorkoutRow(params: {
  participant: any;
  body: any;
  logDate: string;
  activityType: string;
  activityName: string;
  durationMinutes: number;
  distanceKm: number | null;
  steps: number | null;
  notes: string | null;
  calories: number;
  evidenceResult: any;
}) {
  const row: any = buildBaseFormRow({
    participant: params.participant,
    body: params.body,
    logDate: params.logDate,
    logType: "workout",
    marker: MARKER,
  });

  row["Submission ID"] = clean(
    params.body?.submission_id ||
      params.body?.submissionId,
  );

  const driveUrl = getDriveUrl(params.evidenceResult);
  const previewUrl = getPreviewUrl(params.evidenceResult);
  const achievements = [
    params.notes,
    params.steps ? `${params.steps} langkah` : "",
    params.distanceKm ? `${params.distanceKm} km` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  row["Melakukan Workout/Aktifitas Ringan?"] = "Ya";
  row["Jenis Workout/Aktifitas"] = params.activityName || params.activityType;
  row["Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)"] = achievements;
  row["Berapa Menit anda melakukan nya ?"] = params.durationMinutes;
  row["Kalori Aktivitas"] = params.calories;
  row["Bukti Aktivitas"] = driveUrl;
  row["Preview Bukti Aktivitas"] = previewUrl;
  row["Evidence Count"] = driveUrl ? 1 : 0;

  return row;
}

export async function GET(req: NextRequest) {
  const { supabase, participant } = await getParticipant(req);

  if (!participant?.id) {
    return NextResponse.json(
      { ok: false, message: "OTP/session peserta belum aktif." },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("wellness_activity_logs")
    .select("*")
    .eq("participant_id", participant.id)
    .eq("source", "manual")
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { ok: false, message: "Gagal membaca workout manual.", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    participant_id: participant.id,
    logs: data || [],
  });
}

export async function POST(req: NextRequest) {
  const { supabase, participant } = await getParticipant(req);

  if (!participant?.id) {
    return NextResponse.json(
      { ok: false, message: "OTP/session peserta belum aktif." },
      { status: 401 }
    );
  }

  try {
    const { body, evidence } = await parseRequestBody(req);

    const submissionId = clean(
      body?.submission_id ||
        body?.submissionId ||
        req.headers.get("x-submission-id"),
    );

    if (!submissionId) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Submission ID workout tidak tersedia. Silakan refresh aplikasi.",
        },
        { status: 400 },
      );
    }

    body.submission_id = submissionId;

    const activityType =
      clean(
        body?.activity_type ||
          body?.activityType,
      ) || "Workout";

    const durationMinutes =
      toNumberOrNull(
        body?.duration_minutes ||
          body?.durationMinutes,
      );

    if (!durationMinutes || durationMinutes <= 0) {
      return NextResponse.json(
        { ok: false, message: "Durasi workout wajib diisi." },
        { status: 400 }
      );
    }

    const logDate = safeLogDate(body?.log_date || body?.logDate) || todayDate();
    const startedAt = isoFromLocal(body?.started_at) || `${logDate}T00:00:00.000Z`;
    const activityName = clean(body?.activity_name || body?.activityName) || activityType;
    const distanceKm = toNumberOrNull(body?.distance_km || body?.distanceKm);
    const steps = toNumberOrNull(body?.steps);
    const notes = clean(body?.notes || body?.catatan) || null;
    const companyName =
      getCompanyName(participant, body);

    const externalId =
      `manual_${participant.id}_${submissionId}`;

    const existingResult = await supabase
      .from("wellness_activity_logs")
      .select("*")
      .eq(
        "participant_id",
        Number(participant.id),
      )
      .eq("source", "manual")
      .eq(
        "external_activity_id",
        externalId,
      )
      .limit(1)
      .maybeSingle();

    if (existingResult.error) {
      throw existingResult.error;
    }

    if (existingResult.data?.id) {
      return NextResponse.json({
        ok: true,
        deduplicated: true,
        message:
          "Workout ini sudah tersimpan sebelumnya.",
        log: existingResult.data,
        points_total_delta: 0,
      });
    }

    const weightKg =
      await getLatestWeightKg(
        supabase,
        participant,
      );
    const activityRef = await findActivityReference(supabase, activityType, activityName);
    const calculated = calculateCalories({
      activityType,
      durationMinutes,
      distanceKm,
      weightKg,
      activityRef,
    });

    const evidenceResult = await uploadEvidenceToDrive({
      file: evidence,
      participant,
      companyName,
      category: "Workout",
      activeTab: "activity",
      fieldKey: "activity_evidence",
      logDate,
      marker: MARKER,
    });

    const sheetRow = buildWorkoutRow({
      participant,
      body,
      logDate,
      activityType,
      activityName,
      durationMinutes,
      distanceKm,
      steps,
      notes,
      calories: calculated.calories,
      evidenceResult,
    });

    const sheetResult =
      await postToWellnessWebhook({
        sheet: getWellnessSheetName(),
        row: sheetRow,
        submissionId,
        submission_id: submissionId,
        marker: MARKER,
      });

    const payload: any = {
      participant_id: Number(participant.id),
      source: "manual",
      external_activity_id: externalId,
      provider_activity_id: externalId,
      activity_type: activityType,
      activity_name: activityName,
      log_date: logDate,
      started_at: startedAt,
      duration_minutes: durationMinutes,
      calories: calculated.calories,
      distance_km: distanceKm,
      steps,
      raw_payload: {
        ...body,
        notes,
        participant_weight_kg_used: weightKg,
        activity_reference_id: activityRef?.id || null,
        activity_reference_name: activityRef?.activity_name || null,
        calorie_method: calculated.method,
        met_used: calculated.met,
        calories_per_km_used: calculated.calories_per_km,
        calorie_match_status: activityRef?.match_status || "not_found",
        google_drive: evidenceResult || null,
        google_sheet: sheetResult || null,
        saved_at: new Date().toISOString(),
        marker: MARKER,
      },
    };

    const { data, error } = await supabase
      .from("wellness_activity_logs")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    const workoutPoint = await reconcileWorkoutDailyPoint({
      supabase,
      participant,
      logDate,
      sourceId: data?.id || null,
    });

    return NextResponse.json({
      ok: true,
      message: `Workout berhasil disimpan ke Google Sheet. Kalori otomatis: ${calculated.calories} kkal. Point harian: +${workoutPoint.points || 0}.`,
      log: data,
      points_total_delta: workoutPoint.delta || 0,
      workout_point: workoutPoint,
      point_warnings: workoutPoint.warning ? [workoutPoint.warning] : [],
      google_drive: evidenceResult,
      google_sheet: sheetResult,
    });
  } catch (error: any) {
    console.error("WELLNESS_PARTICIPANT_ALL_FORMS_EXISTING_GS_V398_WORKOUT_ERROR", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Gagal menyimpan workout.",
        detail: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
