// WELLNESS_COMPANY_ISOLATION_V126C_FINAL
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { canManageWellness } from "@/lib/wellness/auth";
import { calculateBmi } from "@/lib/wellness/bmi";
import { classifyWellnessRisk } from "@/lib/wellness/riskRules";

export const runtime = "nodejs";

// WELLNESS_HISTORY_IMPORT_V352_API
// WELLNESS_HISTORY_AUTO_MAPPING_V353_API
// WELLNESS_HISTORY_GROUP_FILTER_V354_API
// Wellness-only import untuk history pemeriksaan MCU / Mini MCU / Final MCU.

function clean(value: any) {
  return String(value ?? "").trim();
}

function norm(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/[._\-\/()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value: any) {
  const raw = clean(value);
  if (!raw) return null;
  const text = raw.replace(",", ".").replace(/[^0-9.\-]/g, "");
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function toInteger(value: any) {
  const numeric = toNumber(value);
  if (numeric === null) return null;
  return Math.round(numeric);
}

function toBool(value: any) {
  const text = norm(value);
  if (!text) return null;
  if (["1", "y", "ya", "yes", "true", "tinggi", "high", "abnormal", "positif"].includes(text)) return true;
  if (["0", "n", "tidak", "no", "false", "normal", "negatif"].includes(text)) return false;
  return null;
}

function parseDateValue(value: any) {
  if (!value) return null;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const mm = String(parsed.m).padStart(2, "0");
      const dd = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${mm}-${dd}`;
    }
  }
  const raw = clean(value);
  if (!raw) return null;
  const slash = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slash) {
    const dd = String(slash[1]).padStart(2, "0");
    const mm = String(slash[2]).padStart(2, "0");
    const yyyy = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return null;
}

function normalizeGender(value: any) {
  const text = norm(value);
  if (["l", "laki", "laki laki", "pria", "putra", "male", "m"].includes(text)) return "Laki-laki";
  if (["p", "perempuan", "wanita", "putri", "female", "f"].includes(text)) return "Perempuan";
  return clean(value) || null;
}

function parseBloodPressure(raw: any) {
  const text = clean(raw);
  if (!text) return { systolic: null as number | null, diastolic: null as number | null };
  const match = text.match(/(\d{2,3})\s*[/\\-]\s*(\d{2,3})/);
  if (!match) return { systolic: null, diastolic: null };
  return { systolic: toNumber(match[1]), diastolic: toNumber(match[2]) };
}

function findColumn(headers: any[], candidates: string[]) {
  const normalized = headers.map(norm);
  const normalizedCandidates = candidates.map(norm);

  for (const candidate of normalizedCandidates) {
    const index = normalized.findIndex((header) => header === candidate);
    if (index >= 0) return index;
  }
  for (const candidate of normalizedCandidates) {
    const index = normalized.findIndex((header) => header.includes(candidate) || candidate.includes(header));
    if (index >= 0) return index;
  }
  return -1;
}

function pick(row: any[], headers: any[], candidates: string[]) {
  const index = findColumn(headers, candidates);
  return index >= 0 ? row[index] : "";
}

function parseColumnMapping(value: any) {
  if (!value) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(clean(value));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {} as Record<string, string>;
    const mapping: Record<string, string> = {};
    Object.entries(parsed).forEach(([key, header]) => {
      const cleanKey = clean(key);
      const cleanHeader = clean(header);
      if (cleanKey && cleanHeader) mapping[cleanKey] = cleanHeader;
    });
    return mapping;
  } catch {
    return {} as Record<string, string>;
  }
}

function pickMapped(row: any[], headers: any[], mapping: Record<string, string>, key: string, candidates: string[]) {
  const mappedHeader = clean(mapping[key]);
  if (mappedHeader) {
    const mappedNorm = norm(mappedHeader);
    const index = headers.findIndex((header) => norm(header) === mappedNorm || clean(header) === mappedHeader);
    if (index >= 0) return row[index];
  }
  return pick(row, headers, candidates);
}

function chooseHeaderRow(rows: any[][]) {
  const known = ["kode", "no lab", "nama karyawan", "tanggal periksa", "hba1c", "sistolik", "diastolik", "tensi", "bmi", "risk score", "fokus intervensi"];
  let bestIndex = 0;
  let bestScore = -1;
  rows.slice(0, 25).forEach((row, index) => {
    const values = row.map(norm);
    const score = values.reduce((sum, value) => sum + (known.some((item) => value.includes(item)) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function rowPayload(row: any[], headers: any[]) {
  const payload: Record<string, any> = {};
  headers.forEach((header, index) => {
    const key = clean(header) || `Column ${index + 1}`;
    payload[key] = row[index] ?? "";
  });
  return payload;
}

function normalizeHistoryType(value: any) {
  const text = norm(value);
  if (text.includes("final") || text.includes("akhir")) return "final_mcu";
  if (text.includes("mini") && text.includes("8")) return "mini_mcu_week_8";
  if (text.includes("mini") && text.includes("4")) return "mini_mcu_week_4";
  if (text.includes("mini")) return "mini_mcu";
  if (text.includes("baseline") || text.includes("awal") || text.includes("mcu lama")) return "baseline_mcu";
  return clean(value) || "baseline_mcu";
}

function historyTypeLabel(value: string) {
  return {
    baseline_mcu: "Baseline MCU",
    mini_mcu: "Mini MCU",
    mini_mcu_week_4: "Mini MCU Week 4",
    mini_mcu_week_8: "Mini MCU Week 8",
    final_mcu: "Final MCU",
  }[value] || value;
}

async function getOrCreateGroup(supabase: any, name = "Wellness Default") {
  const groupName = clean(name) || "Wellness Default";
  const { data: existing, error: selectError } = await supabase.from("wellness_groups").select("id").eq("name", groupName).maybeSingle();
  if (selectError) throw selectError;
  if (existing?.id) return existing.id;
  const { data, error } = await supabase.from("wellness_groups").insert({ name: groupName }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function findParticipant(
  supabase: any,
  employeeCode: string,
  companyId: number | null,
  _kelompokId: number | null,
  _groupUnitId: number | null,
) {
  const code = clean(employeeCode);

  if (!code) {
    return null;
  }

  if (!companyId) {
    throw new Error(
      "Perusahaan tujuan wajib dipilih sebelum import history MCU.",
    );
  }

  const { data, error } = await supabase
    .from("wellness_participants")
    .select("*")
    .eq("wellness_company_id", companyId)
    .eq("code", code)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function createParticipantFromHistory(supabase: any, payload: any) {
  const groupId = await getOrCreateGroup(supabase, payload.group_name || "Wellness Default");
  const participantPayload: any = {
    code: payload.employee_code,
    name: payload.participant_name,
    group_id: groupId,
    gender: payload.sex,
    height_cm: payload.height_cm,
    initial_weight_kg: payload.weight_kg,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (payload.company_id) participantPayload.wellness_company_id = payload.company_id;
  if (payload.kelompok_id) participantPayload.wellness_kelompok_id = payload.kelompok_id;
  if (payload.group_unit_id) participantPayload.wellness_group_unit_id = payload.group_unit_id;
  if (payload.checkup_date && payload.history_type === "baseline_mcu") participantPayload.baseline_mcu_date = payload.checkup_date;
  if (payload.history_type === "baseline_mcu") {
    participantPayload.baseline_hba1c = payload.hba1c_percent;
    participantPayload.baseline_glucose = payload.glucose_value;
    participantPayload.baseline_sbp = payload.systolic;
    participantPayload.baseline_dbp = payload.diastolic;
    participantPayload.baseline_bmi = payload.bmi;
    participantPayload.baseline_waist_cm = payload.waist_cm;
    participantPayload.baseline_risk_group = payload.risk_cluster;
    participantPayload.baseline_notes = payload.medical_validation_notes || payload.selection_reason;
  }

  Object.keys(participantPayload).forEach((key) => {
    if (participantPayload[key] === "" || participantPayload[key] === undefined) participantPayload[key] = null;
  });

  const { data, error } = await supabase.from("wellness_participants").insert(participantPayload).select("*").single();
  if (error) throw error;
  return data;
}

async function updateParticipantBaseline(supabase: any, participantId: any, payload: any) {
  if (payload.history_type !== "baseline_mcu") return;
  const updatePayload: any = {
    baseline_mcu_date: payload.checkup_date,
    baseline_hba1c: payload.hba1c_percent,
    baseline_glucose: payload.glucose_value,
    baseline_sbp: payload.systolic,
    baseline_dbp: payload.diastolic,
    baseline_bmi: payload.bmi,
    baseline_waist_cm: payload.waist_cm,
    baseline_risk_group: payload.risk_cluster,
    baseline_notes: payload.medical_validation_notes || payload.selection_reason,
    updated_at: new Date().toISOString(),
  };
  if (payload.height_cm !== null) updatePayload.height_cm = payload.height_cm;
  if (payload.weight_kg !== null) updatePayload.initial_weight_kg = payload.weight_kg;
  Object.keys(updatePayload).forEach((key) => {
    if (updatePayload[key] === "" || updatePayload[key] === undefined) updatePayload[key] = null;
  });
  const { error } = await supabase.from("wellness_participants").update(updatePayload).eq("id", participantId);
  if (error) throw error;
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canManageWellness(user)) return fail("Akses ditolak.", 403);

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return fail("File Excel history MCU wajib diupload.");

  const companyId = toInteger(form.get("company_id"));
  const kelompokId = toInteger(form.get("kelompok_id"));
  const groupUnitId = toInteger(form.get("group_unit_id"));
  const defaultHistoryType = normalizeHistoryType(form.get("history_type") || "baseline_mcu");
  const defaultVisitLabel = clean(form.get("visit_label")) || historyTypeLabel(defaultHistoryType);
  const createMissingParticipants = clean(form.get("create_missing_participants")) === "1";
  const columnMapping = parseColumnMapping(form.get("column_mapping"));

  if (!companyId) {
    return fail(
      "Perusahaan tujuan wajib dipilih sebelum import history MCU.",
      400,
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = clean(form.get("sheet_name")) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return fail(`Sheet ${sheetName} tidak ditemukan.`);

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    if (!rows.length) return fail("Sheet kosong.");

    const headerRowIndex = chooseHeaderRow(rows);
    const headers = rows[headerRowIndex] || [];
    const dataRows = rows.slice(headerRowIndex + 1);
    const supabase = getSupabaseAdmin();

    let inserted = 0;
    let updatedBaseline = 0;
    let createdParticipants = 0;
    let skipped = 0;
    const missingParticipants: string[] = [];
    const errors: string[] = [];

    for (const [offset, row] of dataRows.entries()) {
      const rowNumber = headerRowIndex + offset + 2;
      const get = (key: string, candidates: string[]) => pickMapped(row, headers, columnMapping, key, candidates);
      const employeeCode = clean(get("employee_code", ["KODE", "Kode", "No Karyawan", "Nomor Karyawan", "Employee No", "Employee ID", "NIK", "Nomor Induk"]));
      const participantName = clean(get("participant_name", ["Nama Karyawan", "Nama", "Nama Peserta", "Nama Lengkap", "Name"]));
      if (!employeeCode || !participantName) {
        skipped += 1;
        continue;
      }

      const rawBp = get("bp_raw", ["Tensi Raw", "Tekanan Darah", "Tensi", "BP", "Blood Pressure"]);
      const bp = parseBloodPressure(rawBp);
      const heightCm = toNumber(get("height_cm", ["Tinggi Badan", "TB", "Height", "Height Cm"]));
      const weightKg = toNumber(get("weight_kg", ["Berat Badan", "BB", "BB Awal", "Berat Badan Awal", "Weight", "Initial Weight"]));
      const importedBmi = toNumber(get("bmi", ["BMI", "IMT", "Body Mass Index"]));
      const systolic = toNumber(get("systolic", ["Sistolik", "Sistol", "SBP", "Systolic", "Systolic BP"])) ?? bp.systolic;
      const diastolic = toNumber(get("diastolic", ["Diastolik", "Diastol", "DBP", "Diastolic", "Diastolic BP"])) ?? bp.diastolic;
      const historyType = normalizeHistoryType(get("history_type", ["Jenis History", "History Type", "Visit Type", "Tipe Pemeriksaan"]) || defaultHistoryType);
      const checkupDate = parseDateValue(get("checkup_date", ["Tanggal Periksa", "Tanggal Pemeriksaan", "Tanggal MCU", "MCU Date", "Exam Date", "Checkup Date"])) || parseDateValue(form.get("checkup_date"));
      const visitLabel = clean(get("visit_label", ["Visit Label", "Label Pemeriksaan", "Periode", "Week", "Minggu"])) || defaultVisitLabel;

      let participant = await findParticipant(supabase, employeeCode, companyId, kelompokId, groupUnitId);
      if (!participant && createMissingParticipants) {
        try {
          participant = await createParticipantFromHistory(supabase, {
            employee_code: employeeCode,
            participant_name: participantName,
            sex: normalizeGender(get("sex", ["Sex", "Jenis Kelamin", "Gender"])),
            height_cm: heightCm,
            weight_kg: weightKg,
            bmi: importedBmi,
            checkup_date: checkupDate,
            history_type: historyType,
            company_id: companyId,
            kelompok_id: kelompokId,
            group_unit_id: groupUnitId,
            group_name: clean(get("group_name", ["Kelompok", "Group", "Nama Grup", "Divisi", "Departemen"])),
          });
          createdParticipants += 1;
        } catch (error: any) {
          errors.push(`Baris ${rowNumber}: gagal membuat peserta ${employeeCode} - ${error.message}`);
          continue;
        }
      }

      if (!participant?.id) {
        skipped += 1;
        if (missingParticipants.length < 20) missingParticipants.push(`${employeeCode} - ${participantName}`);
        continue;
      }

      const bmi = importedBmi ?? calculateBmi(weightKg, heightCm ?? participant.height_cm);
      const hba1cPercent = toNumber(get("hba1c_percent", ["HbA1c %", "HbA1c", "HBA1C", "A1C", "Hb A1c"]));
      const glucoseValue = toNumber(get("glucose_value", ["Gula Darah", "Glucose", "GDP", "GDS", "Fasting Glucose", "Random Glucose", "Blood Glucose"]));
      const risk = classifyWellnessRisk({ hba1c: hba1cPercent, glucose: glucoseValue, bmi, sbp: systolic, dbp: diastolic });

      const historyPayload: any = {
        participant_id: participant.id,
        company_id: companyId || participant.wellness_company_id || null,
        employee_code: employeeCode,
        participant_name: participantName,
        lab_no: clean(get("lab_no", ["NO. LAB", "No Lab", "Nomor Lab", "Lab No"])),
        sex: normalizeGender(get("sex", ["Sex", "Jenis Kelamin", "Gender"])),
        department: clean(get("department", ["Departemen", "Department", "Divisi", "Unit"])),
        position: clean(get("position", ["Jabatan", "Position", "Job Title"])),
        checkup_date: checkupDate,
        history_type: historyType,
        visit_label: visitLabel,
        risk_cluster: clean(get("risk_cluster", ["Nama Grup", "Risk Cluster", "Risk Group", "Kelompok Risiko", "Kategori Risiko"])) || risk.group,
        risk_level: clean(get("risk_level", ["Risk Level", "Level Risiko", "Prioritas"])),
        selection_reason: clean(get("selection_reason", ["Selection Reason", "Alasan Seleksi", "Alasan Masuk Program"])),
        hba1c_raw: clean(get("hba1c_raw", ["HbA1c Raw", "HBA1C Raw", "A1C Raw"])),
        hba1c_percent: hba1cPercent,
        hba1c_flag: toBool(get("hba1c_flag", ["HbA1c >6.4?", "HbA1c Tinggi", "A1C High"])),
        bp_raw: clean(rawBp),
        systolic,
        diastolic,
        bp_flag: toBool(get("bp_flag", ["Tensi >150/100?", "Tekanan Darah Tinggi", "BP High"])),
        height_cm: heightCm,
        weight_kg: weightKg,
        bmi,
        bmi_flag: toBool(get("bmi_flag", ["BMI >30?", "BMI Tinggi", "Obesity"])),
        waist_cm: toNumber(get("waist_cm", ["Lingkar Perut", "Waist", "Waist Cm", "Waist Circumference"])),
        glucose_value: glucoseValue,
        criteria_count: toInteger(get("criteria_count", ["Jumlah Kriteria", "Criteria Count", "Jumlah Risk"])),
        risk_score: toNumber(get("risk_score", ["Risk Score", "Skor Risiko"])),
        intervention_focus: clean(get("intervention_focus", ["Fokus Intervensi", "Intervention Focus", "Treatment Plan"])),
        monitoring_plan: clean(get("monitoring_plan", ["Monitoring Day-by-Day", "Monitoring Plan", "Rencana Monitoring"])),
        medical_validation_notes: clean(get("medical_validation_notes", ["Catatan Validasi Medis", "Catatan MCU", "Catatan", "Notes", "Remark"])),
        program_status: clean(get("program_status", ["Status Program", "Program Status", "Status"])),
        raw_payload: rowPayload(row, headers),
        created_by: user.id || null,
        updated_at: new Date().toISOString(),
      };

      Object.keys(historyPayload).forEach((key) => {
        if (historyPayload[key] === "" || historyPayload[key] === undefined) historyPayload[key] = null;
      });

      const { error } = await supabase.from("wellness_checkup_history").insert(historyPayload);
      if (error) {
        errors.push(`Baris ${rowNumber}: ${error.message}`);
        continue;
      }

      inserted += 1;
      if (historyPayload.history_type === "baseline_mcu") {
        try {
          await updateParticipantBaseline(supabase, participant.id, historyPayload);
          updatedBaseline += 1;
        } catch (error: any) {
          errors.push(`Baris ${rowNumber}: history tersimpan, tetapi update baseline peserta gagal - ${error.message}`);
        }
      }
    }

    return ok({
      inserted,
      updatedBaseline,
      createdParticipants,
      skipped,
      missingParticipants,
      errors,
      sheetName,
      headerRow: headerRowIndex + 1,
      historyType: defaultHistoryType,
      matchScope: { companyId, kelompokId, groupUnitId },
      mappedColumns: Object.keys(columnMapping).length,
      message: inserted
        ? "Import history MCU selesai. Auto mapping sudah dipakai bila tersedia, dan data akan muncul di grafik peserta sebagai titik pemeriksaan."
        : "Tidak ada history MCU yang terimport. Pastikan KODE peserta sudah ada di Import Peserta Wellness dan mapping kolom sudah benar.",
    });
  } catch (error: any) {
    return fail(error?.message || "Import history MCU gagal. Pastikan sql/wellness_history_v352.sql sudah dijalankan.", 500);
  }
}
