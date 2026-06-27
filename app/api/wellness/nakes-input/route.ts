import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { canManageWellness, isWellnessCoach } from "@/lib/wellness/auth";
import { calculateBmi, interpretBmi } from "@/lib/wellness/bmi";

// WELLNESS_NAKES_GENERAL_CHECKUP_INPUT_V372_API
// Wellness-only API for NAKES/company medical team input.
// Stores generalized clinical checkpoints into wellness_checkup_history so dashboard before-after charts can read them.

function clean(value: any) {
  return String(value ?? "").trim();
}

function toNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(",", ".").replace(/[^0-9.\-]/g, "");
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function parseBpRaw(systolic: any, diastolic: any, bpRaw: any) {
  const raw = clean(bpRaw);
  let sbp = toNumber(systolic);
  let dbp = toNumber(diastolic);
  if ((!sbp || !dbp) && raw.includes("/")) {
    const [a, b] = raw.split("/");
    sbp = sbp || toNumber(a);
    dbp = dbp || toNumber(b);
  }
  const normalizedRaw = raw || (sbp && dbp ? `${sbp}/${dbp}` : "");
  return { sbp, dbp, bpRaw: normalizedRaw };
}

function buildRiskCluster(body: any, sbp: number | null, dbp: number | null, bmi: number | null, hba1c: number | null) {
  const explicit = clean(body.risk_cluster || body.baseline_risk_group);
  if (explicit) return explicit;
  const glucoseRisk = hba1c !== null && hba1c >= 6.5;
  const obesityRisk = bmi !== null && bmi >= 30;
  const hypertensionRisk = (sbp !== null && sbp >= 150) || (dbp !== null && dbp >= 100);
  if (glucoseRisk && obesityRisk && hypertensionRisk) return "Triple Risk";
  if (glucoseRisk && obesityRisk) return "Glucose + Obesity";
  if (glucoseRisk && hypertensionRisk) return "Glucose + Hypertension";
  if (obesityRisk && hypertensionRisk) return "Obesity + Hypertension";
  if (glucoseRisk) return "Glucose Risk";
  if (obesityRisk) return "Obesity Risk";
  if (hypertensionRisk) return "Hypertension Risk";
  return "Monitoring";
}

function classifyProgramStatus(body: any, sbp: number | null, dbp: number | null, bmi: number | null, hba1c: number | null) {
  const explicit = clean(body.program_status);
  if (explicit) return explicit;
  if ((sbp !== null && sbp >= 180) || (dbp !== null && dbp >= 110) || (hba1c !== null && hba1c >= 8.5)) return "Perlu follow-up prioritas";
  if ((sbp !== null && sbp >= 150) || (dbp !== null && dbp >= 100) || (bmi !== null && bmi >= 30) || (hba1c !== null && hba1c >= 6.5)) return "Perlu monitoring";
  return "Monitoring rutin";
}

async function safeInsertWeightLog(supabase: any, userId: any, participantId: number, date: string, weight: number | null, waist: number | null, bmi: number | null, notes: string) {
  if (weight === null && waist === null && bmi === null) return;
  try {
    await supabase.from("wellness_weight_logs").insert({
      participant_id: participantId,
      log_date: date,
      weight_kg: weight,
      waist_cm: waist,
      bmi,
      bmi_status: bmi !== null ? interpretBmi(bmi) : null,
      notes,
      created_by: userId || null,
    });
  } catch {
    // Do not block Mini MCU save if weight log table is unavailable.
  }
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canManageWellness(user) && !isWellnessCoach(user)) return fail("Akses ditolak. Input NAKES hanya untuk admin, coach, dokter, atau petugas Wellness.", 403);

  const body = await req.json().catch(() => ({}));
  const participantId = Number(body.participant_id || body.participantId || 0);
  if (!participantId) return fail("Peserta wajib dipilih.");

  const checkupDate = clean(body.checkup_date || body.log_date) || today();
  const historyType = clean(body.history_type) || "periodic_checkup";
  const defaultVisitLabels: Record<string, string> = {
    baseline_checkup: "Pemeriksaan Awal",
    periodic_checkup: "Pemeriksaan Berkala",
    final_evaluation: "Evaluasi Akhir",
    clinical_follow_up: "Follow-up Klinis",
    custom_checkup: "Pemeriksaan Custom",

    // Backward-compatible legacy values from v371.
    baseline_mcu: "Baseline MCU",
    mini_mcu: "Mini MCU",
    mini_mcu_week_4: "Mini MCU Week 4",
    mini_mcu_week_8: "Mini MCU Week 8",
    final_mcu: "Final MCU",
    follow_up: "Follow-up NAKES",
  };
  const visitSequence = clean(body.visit_sequence || body.visit_no || body.period_label) || null;
  const visitLabel = clean(body.visit_label) || defaultVisitLabels[historyType] || "Pemeriksaan NAKES";

  const weight = toNumber(body.weight_kg || body.bb || body.current_weight_kg);
  const height = toNumber(body.height_cm || body.tb);
  const waist = toNumber(body.waist_cm || body.lingkar_perut);
  const manualBmi = toNumber(body.bmi);
  const computedBmi = manualBmi ?? (weight !== null && height !== null ? calculateBmi(weight, height) : null);
  const hba1c = toNumber(body.hba1c_percent || body.hba1c || body.hba1c_pct);
  const glucose = toNumber(body.glucose_value || body.gula_darah || body.gds || body.gdp);
  const { sbp, dbp, bpRaw } = parseBpRaw(body.systolic || body.sbp, body.diastolic || body.dbp, body.bp_raw || body.tensi_raw);
  const riskCluster = buildRiskCluster(body, sbp, dbp, computedBmi, hba1c);
  const programStatus = classifyProgramStatus(body, sbp, dbp, computedBmi, hba1c);

  try {
    const supabase = getSupabaseAdmin();
    const { data: participant, error: participantError } = await supabase
      .from("wellness_participants")
      .select("id, code, name, wellness_company_id, wellness_kelompok_id, wellness_group_unit_id, height_cm")
      .eq("id", participantId)
      .single();

    if (participantError || !participant) return fail("Peserta Wellness tidak ditemukan.", 404);

    const finalHeight = height ?? toNumber(participant.height_cm);
    const finalBmi = manualBmi ?? (weight !== null && finalHeight !== null ? calculateBmi(weight, finalHeight) : computedBmi);

    const rawPayload = {
      marker: "WELLNESS_NAKES_GENERAL_CHECKUP_INPUT_V372",
      input_source: "nakes_input",
      visit_sequence: visitSequence,
      submitted_by: user?.id || null,
      submitted_by_role: user?.role || null,
      participant_name: participant.name || null,
      cholesterol_total: toNumber(body.cholesterol_total || body.total_cholesterol),
      ldl: toNumber(body.ldl),
      hdl: toNumber(body.hdl),
      triglyceride: toNumber(body.triglyceride || body.trigliserida),
      uric_acid: toNumber(body.uric_acid || body.asam_urat),
      sgot: toNumber(body.sgot),
      sgpt: toNumber(body.sgpt),
      creatinine: toNumber(body.creatinine || body.kreatinin),
      spo2: toNumber(body.spo2),
      pulse: toNumber(body.pulse || body.nadi),
      respiratory_rate: toNumber(body.respiratory_rate || body.rr),
      temperature_c: toNumber(body.temperature_c || body.suhu),
      follow_up_date: clean(body.follow_up_date) || null,
      next_plan: clean(body.next_plan) || null,
      clinical_alert: clean(body.clinical_alert) || null,
      all_fields: body,
    };

    const historyPayload: any = {
      company_name: clean(body.company_name) || null,
      participant_id: participantId,
      employee_code: clean(body.employee_code || participant.code) || null,
      lab_no: clean(body.lab_no || body.no_lab) || null,
      checkup_date: checkupDate,
      history_type: historyType,
      visit_label: visitLabel,
      risk_cluster: riskCluster,
      risk_level: clean(body.risk_level) || null,
      selection_reason: clean(body.selection_reason) || null,
      hba1c_raw: clean(body.hba1c_raw) || (hba1c !== null ? String(hba1c) : null),
      hba1c_percent: hba1c,
      glucose_value: glucose,
      bp_raw: bpRaw || null,
      systolic: sbp,
      diastolic: dbp,
      bmi: finalBmi,
      weight_kg: weight,
      height_cm: finalHeight,
      waist_cm: waist,
      risk_score: toNumber(body.risk_score),
      criteria_count: toNumber(body.criteria_count),
      intervention_focus: clean(body.intervention_focus || body.fokus_intervensi) || null,
      monitoring_plan: clean(body.monitoring_plan || body.monitoring_day_by_day) || null,
      medical_validation_notes: clean(body.medical_validation_notes || body.catatan_validasi_medis || body.notes) || null,
      program_status: programStatus,
      raw_payload: rawPayload,
      updated_at: new Date().toISOString(),
    };

    const { data: history, error: historyError } = await supabase
      .from("wellness_checkup_history")
      .insert(historyPayload)
      .select("*")
      .single();

    if (historyError) {
      const message = String(historyError.message || "");
      if (message.includes("wellness_checkup_history") || message.includes("schema cache")) {
        return fail("Tabel wellness_checkup_history belum tersedia. Jalankan sql/wellness_nakes_general_checkup_v372_guard.sql atau sql/wellness_history_v352.sql di Supabase SQL Editor.", 500, { detail: message });
      }
      throw historyError;
    }

    await safeInsertWeightLog(supabase, user?.id, participantId, checkupDate, weight, waist, finalBmi, `${visitLabel} - input NAKES`);

    return ok({
      message: "Input NAKES berhasil disimpan.",
      participant,
      history,
      summary: {
        checkup_date: checkupDate,
        visit_label: visitLabel,
        weight_kg: weight,
        bmi: finalBmi,
        systolic: sbp,
        diastolic: dbp,
        hba1c_percent: hba1c,
        glucose_value: glucose,
        waist_cm: waist,
        risk_cluster: riskCluster,
        program_status: programStatus,
      },
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan input NAKES.", 500);
  }
}
