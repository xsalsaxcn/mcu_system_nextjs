import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ParsedRow = {
  rowData: Record<string, any>;
  sheetName: string;
  rowIndex: number;
  headerRowIndex: number;
  fieldMapping: Record<string, string>;
  name: string;
  mcuId: string;
  nik: string;
};

function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

function ok(payload: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...payload });
}

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || ["null", "undefined", "nan", "-"].includes(text.toLowerCase())) return "";
  return text;
}

function norm(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const HEADER_ALIASES = [
  "nama", "nama peserta", "nama karyawan", "nomcu", "no mcu", "no.mcu", "nomor mcu",
  "nik", "jk", "jenis kelamin", "usia", "umur", "departemen", "department", "paket",
  "tb", "bb", "bmi", "imt", "tensi", "tekanan darah", "hb", "hemoglobin", "gdp", "gds",
  "kolesterol", "hdl", "ldl", "trigliserida", "ureum", "kreatinin", "asam urat", "sgot",
  "sgpt", "hbsag", "kesimpulan", "saran", "status",
].map(norm);

const FIELD_ALIASES: Record<string, string[]> = {
  NAMA: ["NAMA", "Nama", "Nama Peserta", "Nama Karyawan", "Nama Lengkap", "Name", "Patient Name", "Employee Name"],
  NOMCU: ["NOMCU", "NO MCU", "NO.MCU", "No MCU", "Nomor MCU", "MCU ID", "mcu_id", "Barcode", "barcode_value", "No Peserta", "No Urut", "NO.URUT", "NO"],
  NIK: ["NIK", "KTP", "NIK/NRP/ID", "NIK NRP ID", "NRP", "ID Karyawan", "Employee ID", "external_id"],
  JK: ["JK", "Jenis Kelamin", "Gender", "Sex"],
  TGLLAHIR: ["TGLLAHIR", "Tanggal Lahir", "Tgl Lahir", "Birth Date", "DOB"],
  USIA: ["USIA", "Usia", "Umur", "Age"],
  DEPARTEMEN: ["DEPARTEMEN", "Department", "Departemen", "Bagian", "Unit", "Divisi"],
  PAKET: ["PAKET", "Paket", "Package", "Paket Pemeriksaan"],
  "FS:TB": ["TB", "Tinggi Badan", "Height", "FS:TB"],
  "FS:BB": ["BB", "Berat Badan", "Weight", "FS:BB"],
  "FS:BMI": ["BMI", "IMT", "FS:BMI"],
  "FS:Tensi": ["Tensi", "TD", "Tekanan Darah", "Blood Pressure", "FS:Tensi"],
  "DL:Hb": ["Hb", "HB", "Hemoglobin", "DL:Hb"],
  "DL:Leu": ["Leukosit", "Leu", "WBC", "DL:Leu"],
  "DL:Ht": ["Hematokrit", "Ht", "HCT", "DL:Ht"],
  "DL:Trom": ["Trombosit", "Platelet", "Trom", "PLT", "DL:Trom"],
  "DL:Eri": ["Eritrosit", "Eri", "RBC", "DL:Eri"],
  "GD:GDP": ["GDP", "Gula Darah Puasa", "Glukosa Puasa", "GD:GDP"],
  "GD:Sewaktu": ["GDS", "Gula Darah Sewaktu", "Glukosa Sewaktu", "GD:Sewaktu"],
  "LD:Chol": ["Chol", "Kolesterol", "Kolesterol Total", "LD:Chol"],
  "LD:HDL": ["HDL", "LD:HDL"],
  "LD:LDL": ["LDL", "LD:LDL"],
  "LD:Trig": ["Trigliserida", "Trig", "TG", "LD:Trig"],
  "FK:Ureum": ["Ureum", "FK:Ureum"],
  "FK:Kreatinin": ["Kreatinin", "Creatinine", "Creat", "FK:Kreatinin"],
  "FK:AsamUrat": ["Asam Urat", "Uric Acid", "FK:AsamUrat"],
  "FH:SGOT": ["SGOT", "AST", "FH:SGOT"],
  "FH:SGPT": ["SGPT", "ALT", "FH:SGPT"],
  "HP:HBsAg": ["HBsAg", "HP:HBsAg"],
  KESIMPULAN: ["Kesimpulan", "Conclusion"],
  SARAN: ["Saran", "Recommendation", "Rekomendasi"],
  FIT_STATUS: ["Fit Status", "FIT_STATUS", "Status Fit", "Status"],
};

function headerScore(row: any[], nextRows: any[][] = []) {
  const values = row.map(cleanText).filter(Boolean);
  if (values.length < 3) return 0;

  let score = 0;
  let exactMatches = 0;

  for (const value of values) {
    const normalized = norm(value);
    if (!normalized) continue;

    if (HEADER_ALIASES.includes(normalized)) {
      score += 12;
      exactMatches += 1;
      continue;
    }

    if (HEADER_ALIASES.some((alias) => alias.length >= 3 && (normalized.includes(alias) || alias.includes(normalized)))) {
      score += 3;
    }
  }

  const nextDensity = nextRows
    .slice(0, 5)
    .map((r) => r.map(cleanText).filter(Boolean).length)
    .filter((count) => count >= Math.min(values.length, 5)).length;

  score += Math.min(values.length, 20) * 0.5;
  score += nextDensity * 2;
  if (exactMatches >= 2) score += 25;
  if (exactMatches >= 4) score += 25;
  score -= values.filter((v) => v.length > 40).length * 6;
  return score;
}

function detectHeaderRow(rows: any[][]) {
  let bestIndex = 0;
  let bestScore = -999;
  const maxRows = Math.min(rows.length, 120);
  for (let i = 0; i < maxRows; i += 1) {
    const score = headerScore(rows[i] || [], rows.slice(i + 1, i + 8));
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function uniqueHeaders(row: any[]) {
  const used = new Map<string, number>();
  return row.map((cell, index) => {
    const raw = cleanText(cell) || `__EMPTY_${index + 1}`;
    const base = raw.replace(/\s+/g, " ").trim();
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return count ? `${base}__${count + 1}` : base;
  });
}

function rowToObject(headers: string[], row: any[]) {
  const out: Record<string, any> = {};
  headers.forEach((header, index) => {
    out[header] = row?.[index] ?? "";
  });
  return out;
}

function autoDetect(headers: string[]) {
  const mapping: Record<string, string> = {};
  for (const [targetKey, aliasesRaw] of Object.entries(FIELD_ALIASES)) {
    const aliases = aliasesRaw.map(norm);
    let found = "";
    for (const header of headers) {
      const headerNorm = norm(header);
      if (aliases.includes(headerNorm) || headerNorm === norm(targetKey)) {
        found = header;
        break;
      }
    }
    if (!found) {
      for (const header of headers) {
        const headerNorm = norm(header);
        if (aliases.some((alias) => alias && alias.length >= 3 && (headerNorm.includes(alias) || alias.includes(headerNorm)))) {
          found = header;
          break;
        }
      }
    }
    if (found) mapping[targetKey] = found;
  }
  return mapping;
}

function mapped(row: Record<string, any>, mapping: Record<string, string>, key: string) {
  const header = mapping[key];
  return header ? cleanText(row[header]) : "";
}

function pickMapped(row: Record<string, any>, mapping: Record<string, string>, key: string, aliases: string[] = []) {
  const v = mapped(row, mapping, key);
  if (v) return v;
  const normMap = new Map<string, string>();
  for (const col of Object.keys(row || {})) normMap.set(norm(col), col);
  for (const alias of aliases) {
    const col = normMap.get(norm(alias));
    if (col) {
      const text = cleanText(row[col]);
      if (text) return text;
    }
  }
  return "";
}

function canonicalize(row: Record<string, any>, mapping: Record<string, string>, ctx: { companyName: string; databaseName: string; programType: string }) {
  const rowData: Record<string, any> = { ...row };
  for (const [targetKey, sourceHeader] of Object.entries(mapping || {})) {
    if (!targetKey || !sourceHeader) continue;
    rowData[targetKey] = row[sourceHeader] ?? "";
  }

  const name = pickMapped(row, mapping, "NAMA", FIELD_ALIASES.NAMA);
  const mcuId = pickMapped(row, mapping, "NOMCU", FIELD_ALIASES.NOMCU);
  const nik = pickMapped(row, mapping, "NIK", FIELD_ALIASES.NIK);

  rowData.NAMA = name;
  rowData.Nama = name;
  rowData.NOMCU = mcuId;
  rowData["NO MCU"] = mcuId;
  rowData["NO.MCU"] = mcuId;
  rowData.NIK = nik;
  rowData["NIK/NRP/ID"] = nik;
  rowData.JK = rowData.JK || pickMapped(row, mapping, "JK", FIELD_ALIASES.JK);
  rowData.TGLLAHIR = rowData.TGLLAHIR || pickMapped(row, mapping, "TGLLAHIR", FIELD_ALIASES.TGLLAHIR);
  rowData.USIA = rowData.USIA || pickMapped(row, mapping, "USIA", FIELD_ALIASES.USIA);
  rowData.DEPARTEMEN = rowData.DEPARTEMEN || pickMapped(row, mapping, "DEPARTEMEN", FIELD_ALIASES.DEPARTEMEN);
  rowData.PAKET = rowData.PAKET || pickMapped(row, mapping, "PAKET", FIELD_ALIASES.PAKET);
  rowData["Nama PT"] = ctx.companyName;
  rowData.Perusahaan = ctx.companyName;
  rowData.DATABASE_NAME = ctx.databaseName;
  rowData.PROGRAM_TYPE = ctx.programType;
  rowData._AI_MCU_FIELD_MAPPING = mapping;

  return { rowData, name, mcuId, nik };
}

function mergeRows(rows: ParsedRow[]) {
  const merged = new Map<string, ParsedRow>();
  for (const row of rows) {
    const key = norm(row.mcuId) || norm(row.name);
    if (!key) continue;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, row);
    } else {
      merged.set(key, {
        ...prev,
        rowData: { ...prev.rowData, ...row.rowData },
        fieldMapping: { ...prev.fieldMapping, ...row.fieldMapping },
        name: prev.name || row.name,
        mcuId: prev.mcuId || row.mcuId,
        nik: prev.nik || row.nik,
      });
    }
  }
  return Array.from(merged.values());
}

async function parseWorkbook(file: File, ctx: { companyName: string; databaseName: string; programType: string }) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
  const parsedRows: ParsedRow[] = [];

  for (const sheetName of workbook.SheetNames || []) {
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    if (!rawRows.length) continue;

    const headerRowIndex = detectHeaderRow(rawRows);
    const headers = uniqueHeaders(rawRows[headerRowIndex] || []);
    const mapping = autoDetect(headers);

    const dataRows = rawRows.slice(headerRowIndex + 1).map((row, i) => ({
      object: rowToObject(headers, row || []),
      rowIndex: headerRowIndex + i + 2,
    }));

    for (const item of dataRows) {
      if (!Object.values(item.object).some((v) => cleanText(v))) continue;
      const canonical = canonicalize(item.object, mapping, ctx);
      if (!canonical.name && !canonical.mcuId) continue;

      parsedRows.push({
        rowData: canonical.rowData,
        sheetName,
        rowIndex: item.rowIndex,
        headerRowIndex,
        fieldMapping: mapping,
        name: canonical.name,
        mcuId: canonical.mcuId || `${ctx.databaseName}-${parsedRows.length + 1}`,
        nik: canonical.nik,
      });
    }
  }

  return mergeRows(parsedRows);
}

async function findOrCreateCompany(supabase: any, name: string) {
  const cleanName = cleanText(name);
  if (!cleanName) return null;
  const existing = await supabase.from("companies").select("id,name").eq("name", cleanName).maybeSingle();
  if (existing.data?.id) return existing.data;
  const inserted = await supabase.from("companies").insert({ name: cleanName }).select("id,name").single();
  if (inserted.error) return null;
  return inserted.data;
}

async function findOrCreateSource(supabase: any, payload: { name: string; institution_name: string; program_type: string }) {
  const existing = await supabase
    .from("participant_sources")
    .select("id,name,institution_name,program_type")
    .eq("name", payload.name)
    .eq("program_type", payload.program_type)
    .maybeSingle();
  if (existing.data?.id) return existing.data;
  const inserted = await supabase.from("participant_sources").insert(payload).select("id,name,institution_name,program_type").single();
  if (inserted.error) throw new Error(inserted.error.message);
  return inserted.data;
}

function validateExcel(file: File | null, label: string) {
  if (!file) return;
  const lowerName = (file.name || "").toLowerCase();
  if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
    throw new Error(`${label} harus berformat .xlsx atau .xls.`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getSessionUser(req);
    if (!user) return fail("Unauthorized", 401);

    const form = await req.formData();
    const programType = cleanText(form.get("programType")) || "corporate";
    const companyName = cleanText(form.get("companyName"));
    const databaseName = cleanText(form.get("databaseName"));
    const thresholdPct = Number(form.get("thresholdPct") || 10);
    const newFile = form.get("newFile") instanceof File ? (form.get("newFile") as File) : null;
    const oldFile = form.get("oldFile") instanceof File ? (form.get("oldFile") as File) : null;

    if (!companyName) return fail("Nama perusahaan / instansi wajib diisi.");
    if (!databaseName) return fail("Nama database wajib diisi.");
    if (!newFile) return fail("MCU Baru wajib diupload.");
    validateExcel(newFile, "MCU Baru");
    validateExcel(oldFile, "MCU Lama");

    const supabase = getSupabaseAdmin();
    const company = await findOrCreateCompany(supabase, companyName);
    const source = await findOrCreateSource(supabase, {
      name: databaseName,
      institution_name: companyName,
      program_type: programType,
    });

    const uploadBatchId = `batch-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Date.now()}`;
    const ctx = { companyName, databaseName, programType };

    const newRows = await parseWorkbook(newFile, ctx);
    const oldRows = oldFile ? await parseWorkbook(oldFile, ctx) : [];

    if (!newRows.length) {
      return fail("MCU Baru tidak menghasilkan data peserta. Pastikan file punya kolom Nama atau No MCU.");
    }

    const participantRows = newRows.map((row) => ({
      source_id: source.id,
      company_id: company?.id || null,
      program_type: programType,
      name: row.name || row.mcuId,
      mcu_id: row.mcuId,
      external_id: row.nik || row.mcuId,
      nik: row.nik || null,
      gender: row.rowData.JK || null,
      birth_date: row.rowData.TGLLAHIR || null,
      department: row.rowData.DEPARTEMEN || null,
    }));

    const insertedParticipants = await supabase
      .from("participants")
      .insert(participantRows)
      .select("id,name,mcu_id,nik,external_id");

    if (insertedParticipants.error) {
      return fail(insertedParticipants.error.message, 500, {
        hint: "Cek struktur tabel participants.",
      });
    }

    const participants = insertedParticipants.data || [];
    const importRows: any[] = [];

    newRows.forEach((row, index) => {
      const participant = participants[index];
      importRows.push({
        source_id: source.id,
        participant_id: participant?.id || null,
        program_type: programType,
        company_name: companyName,
        database_name: databaseName,
        sheet_name: row.sheetName,
        row_index: row.rowIndex,
        participant_name: row.name || participant?.name || "",
        mcu_id: row.mcuId || participant?.mcu_id || "",
        nik: row.nik || participant?.nik || "",
        row_data: row.rowData,
        upload_batch_id: uploadBatchId,
        dataset_role: "new",
        source_file_name: newFile.name,
        header_row_index: row.headerRowIndex,
        field_mapping: row.fieldMapping,
        analysis_meta: { thresholdPct },
      });
    });

    oldRows.forEach((row) => {
      importRows.push({
        source_id: source.id,
        participant_id: null,
        program_type: programType,
        company_name: companyName,
        database_name: databaseName,
        sheet_name: row.sheetName,
        row_index: row.rowIndex,
        participant_name: row.name,
        mcu_id: row.mcuId,
        nik: row.nik,
        row_data: row.rowData,
        upload_batch_id: uploadBatchId,
        dataset_role: "old",
        source_file_name: oldFile?.name || null,
        header_row_index: row.headerRowIndex,
        field_mapping: row.fieldMapping,
        analysis_meta: { thresholdPct },
      });
    });

    const savedRows = await supabase.from("ai_mcu_import_rows").insert(importRows).select("id,dataset_role");
    if (savedRows.error) {
      return fail(savedRows.error.message, 500, {
        hint: "Jalankan SQL patch ai_mcu_import_rows terlebih dahulu.",
      });
    }

    return ok({
      message: "MCU lama/baru berhasil diupload dan siap dianalisis.",
      source,
      company,
      uploadBatchId,
      newRows: newRows.length,
      oldRows: oldRows.length,
      totalParticipants: participants.length,
      totalStoredRows: savedRows.data?.length || 0,
      thresholdPct,
      next: {
        analyzeUrl: `/ai-mcu/analyze?source_id=${source.id}`,
        generateUrl: `/ai-mcu/generate?source_id=${source.id}`,
      },
    });
  } catch (error: any) {
    return fail(error?.message || "Upload Excel gagal.", 500);
  }
}
