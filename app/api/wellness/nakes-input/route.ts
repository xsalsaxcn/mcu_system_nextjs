import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

// WELLNESS_NAKES_GENERAL_CHECKUP_INPUT_V372_API
// WELLNESS_NAKES_ROLE_ACCESS_FIX_V380_API
// Input klinis NAKES khusus modul Wellness.
// Data masuk ke wellness_checkup_history agar terbaca di dashboard before-after.
// Tidak menyentuh modul MCU, CAPASKA, Corporate MCU, atau Vaksinasi.

function clean(value: any) {
  return String(value ?? "").trim();
}

function nullableText(value: any) {
  const text = clean(value);
  return text ? text : null;
}

function nullableNumber(value: any) {
  if (value === null || value === undefined || value === "") return null;

  const text = String(value).replace(",", ".").trim();
  if (!text) return null;

  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function nullableDate(value: any) {
  const text = clean(value);
  if (!text) return null;

  const dateOnly = text.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return dateOnly;

  return null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeHistoryType(value: any) {
  const text = clean(value);

  const allowed = new Set([
    "baseline_checkup",
    "periodic_checkup",
    "final_evaluation",
    "clinical_follow_up",
    "custom_checkup",
    "baseline_mcu",
    "mini_mcu",
    "final_mcu",
  ]);

  return allowed.has(text) ? text : "periodic_checkup";
}

function defaultVisitLabel(historyType: string) {
  const map: Record<string, string> = {
    baseline_checkup: "Pemeriksaan Awal",
    periodic_checkup: "Pemeriksaan Berkala",
    final_evaluation: "Evaluasi Akhir",
    clinical_follow_up: "Follow-up Klinis",
    custom_checkup: "Pemeriksaan Custom",
    baseline_mcu: "Baseline MCU",
    mini_mcu: "Mini MCU",
    final_mcu: "Final MCU",
  };

  return map[historyType] || "Pemeriksaan Berkala";
}

function userRole(user: any) {
  return clean(user?.role || user?.user_role || user?.type).toLowerCase();
}

function canAccessNakesInput(user: any) {
  const role = userRole(user);

  const allowedRoles = new Set([
    "admin",
    "administrator",
    "superadmin",
    "super_admin",
    "coach",
    "dokter",
    "doctor",
    "dr",
    "nakes",
    "medic",
    "medical",
    "perawat",
    "nurse",
    "petugas_wellness",
    "wellness_staff",
    "wellness",
  ]);

  return allowedRoles.has(role);
}

async function getParticipant(supabase: any, participantId: any) {
  const id = Number(participantId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const { data, error } = await supabase
    .from("wellness_participants")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return null;
  return data || null;
}

function computeBmi(weightKg: any, heightCm: any) {
  const weight = nullableNumber(weightKg);
  const height = nullableNumber(heightCm);

  if (weight === null || height === null || height <= 0) return null;

  const meter = height / 100;
  const bmi = weight / (meter * meter);

  return Math.round(bmi * 10) / 10;
}

function buildRiskCluster(payload: any) {
  const manual = nullableText(payload.risk_cluster);
  if (manual) return manual;

  const hba1c = nullableNumber(payload.hba1c_percent);
  const glucose = nullableNumber(payload.glucose_value);
  const bmi = nullableNumber(payload.bmi);
  const systolic = nullableNumber(payload.systolic);
  const diastolic = nullableNumber(payload.diastolic);

  const flags: string[] = [];

  if (hba1c !== null && hba1c >= 6.5) flags.push("Glucose");
  if (glucose !== null && glucose >= 200) flags.push("Glucose");
  if (bmi !== null && bmi >= 30) flags.push("Obesity");

  if (
    (systolic !== null && systolic >= 140) ||
    (diastolic !== null && diastolic >= 90)
  ) {
    flags.push("Hypertension");
  }

  const unique = Array.from(new Set(flags));

  if (unique.length >= 3) return "Triple Risk";
  if (unique.length === 2) return unique.join(" + ");
  if (unique.length === 1) return unique[0];

  return null;
}

function buildProgramStatus(payload: any) {
  const manual = nullableText(payload.program_status);
  if (manual) return manual;

  const systolic = nullableNumber(payload.systolic);
  const diastolic = nullableNumber(payload.diastolic);
  const hba1c = nullableNumber(payload.hba1c_percent);
  const glucose = nullableNumber(payload.glucose_value);

  if (
    (systolic !== null && systolic >= 180) ||
    (diastolic !== null && diastolic >= 110) ||
    (hba1c !== null && hba1c >= 9) ||
    (glucose !== null && glucose >= 300)
  ) {
    return "Perlu follow-up medis segera";
  }

  if (
    (systolic !== null && systolic >= 140) ||
    (diastolic !== null && diastolic >= 90) ||
    (hba1c !== null && hba1c >= 6.5) ||
    (glucose !== null && glucose >= 200)
  ) {
    return "Perlu monitoring";
  }

  return null;
}

function normalizePayload(body: any, participant: any, user: any) {
  const historyType = normalizeHistoryType(body.history_type);
  const visitLabel =
    nullableText(body.visit_label) || defaultVisitLabel(historyType);

  const weightKg = nullableNumber(body.weight_kg);
  const heightCm =
    nullableNumber(body.height_cm) || nullableNumber(participant?.height_cm);
  const bmi =
    nullableNumber(body.bmi) ||
    computeBmi(weightKg, heightCm) ||
    nullableNumber(participant?.bmi);

  const employeeCode =
    nullableText(body.employee_code) ||
    nullableText(participant?.code) ||
    nullableText(participant?.employee_code) ||
    nullableText(participant?.no_karyawan);

  const companyName =
    nullableText(body.company_name) ||
    nullableText(participant?.company_name) ||
    null;

  const systolic = nullableNumber(body.systolic);
  const diastolic = nullableNumber(body.diastolic);

  const normalized: any = {
    company_name: companyName,
    participant_id: participant?.id ? Number(participant.id) : null,
    employee_code: employeeCode,
    lab_no: nullableText(body.lab_no),

    checkup_date: nullableDate(body.checkup_date) || today(),
    history_type: historyType,
    visit_label: visitLabel,

    risk_cluster: null,
    risk_level: nullableText(body.risk_level),
    selection_reason: nullableText(body.selection_reason),

    hba1c_raw: nullableText(body.hba1c_raw),
    hba1c_percent: nullableNumber(body.hba1c_percent),
    glucose_value: nullableNumber(body.glucose_value),

    bp_raw:
      nullableText(body.bp_raw) ||
      (systolic !== null || diastolic !== null
        ? `${systolic ?? ""}/${diastolic ?? ""}`
        : null),
    systolic,
    diastolic,
    pulse: nullableNumber(body.pulse),

    bmi,
    weight_kg: weightKg,
    height_cm: heightCm,
    waist_cm: nullableNumber(body.waist_cm),

    cholesterol_total: nullableNumber(body.cholesterol_total),
    ldl: nullableNumber(body.ldl),
    hdl: nullableNumber(body.hdl),
    triglyceride: nullableNumber(body.triglyceride),
    uric_acid: nullableNumber(body.uric_acid),
    sgot: nullableNumber(body.sgot),
    sgpt: nullableNumber(body.sgpt),

    risk_score: nullableNumber(body.risk_score),
    criteria_count: nullableNumber(body.criteria_count),

    intervention_focus: nullableText(body.intervention_focus),
    monitoring_plan: nullableText(body.monitoring_plan),
    medical_validation_notes: nullableText(body.medical_validation_notes),
    program_status: null,
    next_followup_date:
      nullableDate(body.next_followup_date) || nullableDate(body.follow_up_date),

    raw_payload: {
      ...body,
      input_source: "nakes_input",
      submitted_by: user?.username || user?.name || user?.id || null,
      submitted_by_role: user?.role || null,
      submitted_at: new Date().toISOString(),
      participant_snapshot: participant
        ? {
            id: participant.id,
            code: participant.code,
            name: participant.name,
            height_cm: participant.height_cm,
            wellness_company_id: participant.wellness_company_id,
            wellness_kelompok_id: participant.wellness_kelompok_id,
            wellness_group_unit_id: participant.wellness_group_unit_id,
          }
        : null,
    },
  };

  normalized.risk_cluster = buildRiskCluster({
    ...body,
    bmi: normalized.bmi,
  });

  normalized.program_status = buildProgramStatus({
    ...body,
    bmi: normalized.bmi,
  });

  return normalized;
}

function removeUndefinedValues(payload: any) {
  const result: any = {};

  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) result[key] = value;
  }

  return result;
}

function summarize(row: any) {
  return {
    id: row?.id,
    participant_id: row?.participant_id,
    employee_code: row?.employee_code,
    checkup_date: row?.checkup_date,
    history_type: row?.history_type,
    visit_label: row?.visit_label,
    weight_kg: row?.weight_kg,
    waist_cm: row?.waist_cm,
    bmi: row?.bmi,
    systolic: row?.systolic,
    diastolic: row?.diastolic,
    hba1c_percent: row?.hba1c_percent,
    glucose_value: row?.glucose_value,
    risk_cluster: row?.risk_cluster,
    program_status: row?.program_status,
  };
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);

  if (!user) {
    return fail("Unauthorized", 401);
  }

  if (!canAccessNakesInput(user)) {
    return fail(
      "Akses ditolak. Input NAKES hanya untuk admin, coach, dokter, nakes, atau petugas Wellness.",
      403,
      {
        role: user?.role || null,
        username: user?.username || null,
      }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));

    const participantId = Number(body.participant_id);
    if (!Number.isFinite(participantId) || participantId <= 0) {
      return fail("Pilih peserta terlebih dahulu.", 400);
    }

    const supabase = getSupabaseAdmin();
    const participant = await getParticipant(supabase, participantId);

    if (!participant) {
      return fail("Peserta Wellness tidak ditemukan.", 404);
    }

    const insertPayload = removeUndefinedValues(
      normalizePayload(body, participant, user)
    );

    const { data, error } = await supabase
      .from("wellness_checkup_history")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      const message = String(error?.message || "");

      if (
        message.includes("wellness_checkup_history") ||
        message.includes("schema cache") ||
        message.includes("Could not find the table")
      ) {
        return fail(
          "Tabel wellness_checkup_history belum tersedia. Jalankan sql/wellness_nakes_general_checkup_v372_guard.sql atau sql/wellness_history_v352.sql di Supabase SQL Editor.",
          500,
          { detail: message }
        );
      }

      return fail("Gagal menyimpan input NAKES.", 500, {
        detail: message,
      });
    }

    return ok({
      message:
        "Input NAKES berhasil disimpan. Data akan masuk ke dashboard dan grafik before-after Wellness.",
      inserted: 1,
      row: data,
      summary: summarize(data),
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan input NAKES.", 500);
  }
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);

  if (!user) {
    return fail("Unauthorized", 401);
  }

  if (!canAccessNakesInput(user)) {
    return fail(
      "Akses ditolak. Input NAKES hanya untuk admin, coach, dokter, nakes, atau petugas Wellness.",
      403,
      {
        role: user?.role || null,
        username: user?.username || null,
      }
    );
  }

  return ok({
    message: "Input NAKES tersedia.",
    role: user?.role || null,
    username: user?.username || null,
  });
}