import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import { canManageWellness } from "@/lib/wellness/auth";
import { calculateBmi } from "@/lib/wellness/bmi";
import { classifyWellnessRisk } from "@/lib/wellness/riskRules";

export const runtime = "nodejs";

// WELLNESS_SETTINGS_PARAMETER_V350_IMPORT_API

function clean(value: any) {
  return String(value ?? "").trim();
}

function norm(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/[._\-\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value: any) {
  const text = clean(value).replace(",", ".").replace(/[^0-9.\-]/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
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
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function normalizeGender(value: any) {
  const text = norm(value);
  if (["l", "laki", "laki laki", "pria", "putra", "male", "m"].includes(text)) return "Laki-laki";
  if (["p", "perempuan", "wanita", "putri", "female", "f"].includes(text)) return "Perempuan";
  return clean(value);
}

function normalizePhone(value: any) {
  let text = clean(value).replace(/[^0-9+]/g, "");
  if (text.startsWith("+62")) text = `0${text.slice(3)}`;
  if (text.startsWith("62")) text = `0${text.slice(2)}`;
  return text;
}

function isBadLooseMatch(header: string, candidate: string) {
  // WELLNESS_PRO_WORKSPACE_V357_MAPPING_FIX
  // Prevent generic candidate "Nama" from matching "Nama Grup" / "Nama Kelompok".
  // This was the reason Risk Cluster appeared as participant name after import.
  if (candidate === "nama" && header !== "nama") {
    return ["grup", "group", "kelompok", "divisi", "departemen", "department", "unit", "risk"].some((word) => header.includes(word));
  }
  if (candidate === "group" && ["risk", "risiko", "cluster"].some((word) => header.includes(word))) return true;
  return false;
}

function findColumn(headers: any[], candidates: string[]) {
  const normalized = headers.map(norm);
  const normalizedCandidates = candidates.map(norm).filter(Boolean);

  // 1) Exact match, candidate order matters.
  for (const c of normalizedCandidates) {
    const idx = normalized.findIndex((h) => h === c);
    if (idx >= 0) return idx;
  }

  // 2) Prefer header starts with candidate, but block known ambiguous names.
  for (const c of normalizedCandidates) {
    const idx = normalized.findIndex((h) => !isBadLooseMatch(h, c) && (h.startsWith(`${c} `) || h.startsWith(`${c}:`)));
    if (idx >= 0) return idx;
  }

  // 3) Loose contains as last fallback.
  for (const c of normalizedCandidates) {
    const idx = normalized.findIndex((h) => !isBadLooseMatch(h, c) && (h.includes(c) || c.includes(h)));
    if (idx >= 0) return idx;
  }
  return -1;
}

function pick(row: any[], headers: any[], candidates: string[]) {
  const idx = findColumn(headers, candidates);
  return idx >= 0 ? row[idx] : "";
}

function chooseHeaderRow(rows: any[][]) {
  const known = ["nama", "nama peserta", "no karyawan", "nik", "employee", "email", "hp", "phone", "tinggi", "berat", "hba1c", "gula", "sistol", "diastol"];
  let best = 0;
  let score = -1;
  rows.slice(0, 20).forEach((row, idx) => {
    const values = row.map(norm);
    const rowScore = values.reduce((acc, value) => acc + (known.some((key) => value.includes(key)) ? 1 : 0), 0);
    if (rowScore > score) {
      best = idx;
      score = rowScore;
    }
  });
  return best;
}

function parseBloodPressure(raw: any) {
  const text = clean(raw);
  if (!text) return { sbp: null as number | null, dbp: null as number | null };
  const match = text.match(/(\d{2,3})\s*[/\\-]\s*(\d{2,3})/);
  if (!match) return { sbp: null, dbp: null };
  return { sbp: toNumber(match[1]), dbp: toNumber(match[2]) };
}

function isMissingWellnessColumn(error: any) {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return message.includes("column") || message.includes("schema cache") || message.includes("could not find");
}

async function getOrCreateGroup(supabase: any, name: string) {
  const groupName = clean(name) || "Wellness Default";
  const { data: existing, error: selectError } = await supabase
    .from("wellness_groups")
    .select("id")
    .eq("name", groupName)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("wellness_groups")
    .insert({ name: groupName })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function maybeGetOrCreateCompany(supabase: any, companyId: any, companyName: string) {
  const id = toNumber(companyId);
  if (id) return id;
  const name = clean(companyName);
  if (!name) return null;

  try {
    const { data: existing, error: selectError } = await supabase
      .from("wellness_companies")
      .select("id")
      .eq("name", name)
      .maybeSingle();
    if (selectError) throw selectError;
    if (existing?.id) return existing.id;

    const { data, error } = await supabase
      .from("wellness_companies")
      .insert({ name, is_active: 1 })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  } catch {
    return null;
  }
}

async function findExistingParticipantScoped(supabase: any, employeeNo: string, companyId: any, kelompokId: any, groupUnitId: any) {
  // WELLNESS_IMPORT_EXISTING_COMPANY_V355_API: match peserta by KODE + selected company/kelompok/group when available.
  const code = clean(employeeNo);
  const companyIdNum = toNumber(companyId);
  const kelompokIdNum = toNumber(kelompokId);
  const groupUnitIdNum = toNumber(groupUnitId);

  try {
    let query = supabase.from("wellness_participants").select("id").eq("code", code);
    if (companyIdNum) query = query.eq("wellness_company_id", companyIdNum);
    if (kelompokIdNum) query = query.eq("wellness_kelompok_id", kelompokIdNum);
    if (groupUnitIdNum) query = query.eq("wellness_group_unit_id", groupUnitIdNum);
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw error;
    return data;
  } catch (error: any) {
    if (!isMissingWellnessColumn(error)) throw error;
    const { data, error: fallbackError } = await supabase
      .from("wellness_participants")
      .select("id")
      .eq("code", code)
      .limit(1)
      .maybeSingle();
    if (fallbackError) throw fallbackError;
    return data;
  }
}

async function saveParticipant(supabase: any, existingId: any, basePayload: any, extendedPayload: any) {
  if (existingId) {
    const { error } = await supabase.from("wellness_participants").update(extendedPayload).eq("id", existingId);
    if (!error) return { fallback: false };
    if (!isMissingWellnessColumn(error)) throw error;
    const { error: fallbackError } = await supabase.from("wellness_participants").update(basePayload).eq("id", existingId);
    if (fallbackError) throw fallbackError;
    return { fallback: true };
  }

  const { error } = await supabase.from("wellness_participants").insert({ ...extendedPayload, created_at: new Date().toISOString() });
  if (!error) return { fallback: false };
  if (!isMissingWellnessColumn(error)) throw error;
  const { error: fallbackError } = await supabase.from("wellness_participants").insert({ ...basePayload, created_at: new Date().toISOString() });
  if (fallbackError) throw fallbackError;
  return { fallback: true };
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canManageWellness(user)) return fail("Akses ditolak.", 403);

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const defaultGroupName = clean(form.get("group_name")) || "Wellness Default";
  const companyName = clean(form.get("companyName") || form.get("wellnessCompanyName") || form.get("entityCompanyName"));
  const requestedCompanyId = clean(form.get("company_id"));
  const requestedKelompokId = clean(form.get("kelompok_id"));
  const requestedGroupUnitId = clean(form.get("group_unit_id"));
  if (!file) return fail("File Excel wajib diupload.");

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
    const companyId = await maybeGetOrCreateCompany(supabase, requestedCompanyId, companyName);
    const defaultGroupId = await getOrCreateGroup(supabase, defaultGroupName);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let baselineRows = 0;
    let fallbackRows = 0;
    const errors: string[] = [];

    for (const [offset, row] of dataRows.entries()) {
      const rowNumber = headerRowIndex + offset + 2;
      const employeeNo = clean(pick(row, headers, ["No Karyawan", "Nomor Karyawan", "Employee No", "Employee ID", "Employee Code", "NIK", "KODE", "Kode", "ID Peserta", "Nomor Induk"]));
      const name = clean(pick(row, headers, ["Nama Karyawan", "Nama Peserta", "Nama Lengkap", "Employee Name", "Full Name", "Name", "Nama"]));
      if (!employeeNo || !name) {
        skipped += 1;
        errors.push(`Baris ${rowNumber}: dilewati karena ${!employeeNo ? "KODE/No Karyawan kosong" : "Nama Karyawan kosong"}.`);
        continue;
      }

      // If Group Upload is selected, do not let Excel Department/Divisi override upload scope.
      const excelGroupName = requestedGroupUnitId ? "" : clean(pick(row, headers, ["Kelompok", "Group", "Divisi", "Department", "Departemen", "Unit", "Shift"]));
      const groupName = excelGroupName || defaultGroupName;
      const groupId = groupName === defaultGroupName ? defaultGroupId : await getOrCreateGroup(supabase, groupName);
      const heightCm = toNumber(pick(row, headers, ["Tinggi Badan", "TB", "Height", "Height Cm"]));
      const initialWeightKg = toNumber(pick(row, headers, ["Berat Badan Awal", "BB Awal", "Initial Weight", "Berat Awal", "BB", "Berat Badan"]));
      const importedBmi = toNumber(pick(row, headers, ["BMI", "IMT", "Body Mass Index"]));
      const baselineBmi = importedBmi ?? calculateBmi(initialWeightKg, heightCm);
      const bpCombined = parseBloodPressure(pick(row, headers, ["Tekanan Darah", "Tensi", "BP", "Blood Pressure"]));
      const baselineSbp = toNumber(pick(row, headers, ["Sistol", "Sistole", "SBP", "Systolic", "Systolic BP"])) ?? bpCombined.sbp;
      const baselineDbp = toNumber(pick(row, headers, ["Diastol", "Diastole", "DBP", "Diastolic", "Diastolic BP"])) ?? bpCombined.dbp;
      const baselineHba1c = toNumber(pick(row, headers, ["HbA1c", "HBA1C", "A1C", "Hb A1c"]));
      const baselineGlucose = toNumber(pick(row, headers, ["Gula Darah", "Glucose", "GDP", "GDS", "Fasting Glucose", "Random Glucose", "Blood Glucose"]));
      const baselineWaist = toNumber(pick(row, headers, ["Lingkar Perut", "Waist", "Waist Cm", "Waist Circumference"]));
      const baselineMcuDate = parseDateValue(pick(row, headers, ["Tanggal Periksa", "Tanggal MCU", "MCU Date", "Tanggal Pemeriksaan", "Exam Date"]));
      const notes = clean(pick(row, headers, ["Catatan Validasi Medis", "Catatan MCU", "Catatan", "Notes", "Remark", "Keterangan"]));
      const importedRisk = clean(pick(row, headers, ["Nama Grup", "Risk Cluster", "Risk Group", "Kelompok Risiko", "Kategori Risiko", "Risk", "Fokus Intervensi"]));
      const risk = classifyWellnessRisk({ hba1c: baselineHba1c, glucose: baselineGlucose, bmi: baselineBmi, sbp: baselineSbp, dbp: baselineDbp });
      const baselineRiskGroup = importedRisk || risk.group;

      if ([baselineHba1c, baselineGlucose, baselineSbp, baselineDbp, baselineWaist, baselineBmi].some((value) => value !== null) || baselineRiskGroup) baselineRows += 1;

      const basePayload: any = {
        code: employeeNo,
        name,
        group_id: groupId,
        gender: normalizeGender(pick(row, headers, ["Jenis Kelamin", "Gender", "Sex"])),
        phone: normalizePhone(pick(row, headers, ["No HP", "Nomor HP", "HP", "Phone", "Whatsapp", "WA", "Telepon"])),
        email: clean(pick(row, headers, ["Email", "Alamat Email", "E-mail"])).toLowerCase(),
        birth_date: parseDateValue(pick(row, headers, ["Tanggal Lahir", "Birth Date", "DOB"])),
        height_cm: heightCm,
        initial_weight_kg: initialWeightKg,
        target_weight_kg: toNumber(pick(row, headers, ["Target Berat", "Target BB", "Target Weight"])),
        program_start_date: parseDateValue(pick(row, headers, ["Tanggal Mulai", "Program Start", "Start Date"])),
        is_active: 1,
        updated_at: new Date().toISOString(),
      };

      const extendedPayload: any = {
        ...basePayload,
        wellness_company_id: companyId,
        wellness_kelompok_id: toNumber(requestedKelompokId),
        wellness_group_unit_id: toNumber(requestedGroupUnitId),
        baseline_mcu_date: baselineMcuDate,
        baseline_hba1c: baselineHba1c,
        baseline_glucose: baselineGlucose,
        baseline_sbp: baselineSbp,
        baseline_dbp: baselineDbp,
        baseline_waist_cm: baselineWaist,
        baseline_bmi: baselineBmi,
        baseline_risk_group: baselineRiskGroup,
        baseline_notes: notes,
      };

      Object.keys(basePayload).forEach((key) => {
        if (basePayload[key] === "" || basePayload[key] === undefined) basePayload[key] = null;
      });
      Object.keys(extendedPayload).forEach((key) => {
        if (extendedPayload[key] === "" || extendedPayload[key] === undefined) extendedPayload[key] = null;
      });

      const existing = await findExistingParticipantScoped(supabase, employeeNo, companyId, requestedKelompokId, requestedGroupUnitId);

      try {
        const saved = await saveParticipant(supabase, existing?.id, basePayload, extendedPayload);
        if (saved.fallback) fallbackRows += 1;
        if (existing?.id) updated += 1;
        else inserted += 1;
      } catch (error: any) {
        errors.push(`Baris ${rowNumber}: ${error.message}`);
      }
    }

    return ok({
      inserted,
      updated,
      skipped,
      baselineRows,
      errors,
      sheetName,
      headerRow: headerRowIndex + 1,
      extendedPayloadWarning: fallbackRows ? `${fallbackRows} baris tersimpan tanpa kolom baseline/settings karena sql/wellness_settings_v350.sql belum dijalankan.` : "",
    });
  } catch (error: any) {
    return fail(error?.message || "Import peserta Wellness gagal. Pastikan SQL wellness sudah dijalankan.", 500);
  }
}
