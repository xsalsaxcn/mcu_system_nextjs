import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const HEADER_ALIASES = [
  "nama", "nama peserta", "nama karyawan", "nomcu", "no mcu", "no.mcu", "nomor mcu",
  "nik", "jk", "jenis kelamin", "usia", "umur", "departemen", "department", "paket",
  "tb", "bb", "bmi", "imt", "tensi", "tekanan darah", "hb", "hemoglobin", "gdp", "gds",
  "kolesterol", "hdl", "ldl", "trigliserida", "ureum", "kreatinin", "asam urat", "sgot",
  "sgpt", "hbsag", "kesimpulan", "saran", "status"
].map(norm);

function headerScore(row: any[], nextRows: any[][] = []) {
  const values = row.map(cleanText).filter(Boolean);
  if (values.length < 3) return 0;

  let score = Math.min(values.length, 25) * 0.5;
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

    if (value.length > 40) score -= 6;
  }

  const nextDensity = nextRows
    .slice(0, 5)
    .map((r) => r.map(cleanText).filter(Boolean).length)
    .filter((count) => count >= Math.min(values.length, 5)).length;

  score += nextDensity * 2;
  if (exactMatches >= 2) score += 25;
  if (exactMatches >= 4) score += 25;

  return score;
}

function detectHeaderRow(rows: any[][]) {
  let bestIndex = 0;
  let bestScore = -999;

  for (let i = 0; i < Math.min(rows.length, 120); i += 1) {
    const score = headerScore(rows[i] || [], rows.slice(i + 1, i + 8));
    if (score > bestScore) {
      bestIndex = i;
      bestScore = score;
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

function valueFromMapping(row: Record<string, any>, mapping: Record<string, string>, key: string) {
  const header = mapping?.[key];
  if (!header) return "";
  return cleanText(row?.[header]);
}

function pickValue(row: Record<string, any>, aliases: string[]) {
  const keyMap = new Map<string, string>();

  for (const key of Object.keys(row || {})) {
    keyMap.set(norm(key), key);
  }

  for (const alias of aliases) {
    const exactKey = keyMap.get(norm(alias));
    if (exactKey) {
      const value = cleanText(row[exactKey]);
      if (value) return value;
    }
  }

  for (const alias of aliases) {
    const aliasNorm = norm(alias);

    for (const [keyNorm, originalKey] of keyMap.entries()) {
      if (aliasNorm && aliasNorm.length >= 2 && (keyNorm.includes(aliasNorm) || aliasNorm.includes(keyNorm))) {
        const value = cleanText(row[originalKey]);
        if (value) return value;
      }
    }
  }

  return "";
}

function detectName(row: Record<string, any>, mapping: Record<string, string>) {
  return valueFromMapping(row, mapping, "NAMA") || pickValue(row, [
    "NAMA", "Nama", "Nama Peserta", "Nama Karyawan", "Nama Lengkap", "Name", "Patient Name", "Employee Name"
  ]);
}

function detectMcuId(row: Record<string, any>, mapping: Record<string, string>) {
  return valueFromMapping(row, mapping, "NOMCU") || pickValue(row, [
    "NOMCU", "NO MCU", "NO.MCU", "No MCU", "Nomor MCU", "MCU ID", "mcu_id", "Barcode", "barcode_value", "No Peserta", "No Urut", "NO.URUT", "NO"
  ]);
}

function detectNik(row: Record<string, any>, mapping: Record<string, string>) {
  return valueFromMapping(row, mapping, "NIK") || pickValue(row, [
    "NIK", "KTP", "NIK/NRP/ID", "NIK NRP ID", "NRP", "ID Karyawan", "Employee ID", "external_id"
  ]);
}

function mapped(row: Record<string, any>, mapping: Record<string, string>, key: string, fallbackAliases: string[] = []) {
  return valueFromMapping(row, mapping, key) || pickValue(row, fallbackAliases);
}

function buildCanonicalRow(row: Record<string, any>, mapping: Record<string, string>, context: {
  companyName: string;
  databaseName: string;
  programType: string;
  detectedName: string;
  detectedMcuId: string;
  detectedNik: string;
}) {
  const canonical: Record<string, any> = { ...row };

  for (const [targetKey, sourceHeader] of Object.entries(mapping || {})) {
    if (!targetKey || !sourceHeader) continue;
    canonical[targetKey] = row[sourceHeader] ?? "";
  }

  canonical.NAMA = context.detectedName;
  canonical.Nama = context.detectedName;
  canonical.NOMCU = context.detectedMcuId;
  canonical["NO MCU"] = context.detectedMcuId;
  canonical["NO.MCU"] = context.detectedMcuId;
  canonical.NIK = context.detectedNik;
  canonical["NIK/NRP/ID"] = context.detectedNik;

  canonical.JK = canonical.JK || mapped(row, mapping, "JK", ["JK", "Jenis Kelamin", "Gender", "Sex"]);
  canonical.TGLLAHIR = canonical.TGLLAHIR || mapped(row, mapping, "TGLLAHIR", ["TGLLAHIR", "Tanggal Lahir", "Tgl Lahir", "Birth Date"]);
  canonical.USIA = canonical.USIA || mapped(row, mapping, "USIA", ["USIA", "Usia", "Umur", "Age"]);
  canonical.DEPARTEMEN = canonical.DEPARTEMEN || mapped(row, mapping, "DEPARTEMEN", ["DEPARTEMEN", "Department", "Departemen", "Bagian", "Unit"]);
  canonical.PAKET = canonical.PAKET || mapped(row, mapping, "PAKET", ["PAKET", "Paket", "Package"]);

  canonical["Nama PT"] = context.companyName;
  canonical.Perusahaan = context.companyName;
  canonical.DATABASE_NAME = context.databaseName;
  canonical.PROGRAM_TYPE = context.programType;
  canonical._AI_MCU_FIELD_MAPPING = mapping;

  return canonical;
}

async function readWorkbook(file: File, sheetName: string, headerRowIndexRaw: number) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    raw: false,
  });

  const selectedSheetName = sheetName && workbook.Sheets[sheetName]
    ? sheetName
    : workbook.SheetNames?.[0];

  if (!selectedSheetName) {
    return { sheetName: "", headers: [], rows: [] as Record<string, any>[], headerRowIndex: 0 };
  }

  const sheet = workbook.Sheets[selectedSheetName];
  const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });

  if (!rawRows.length) {
    return { sheetName: selectedSheetName, headers: [], rows: [] as Record<string, any>[], headerRowIndex: 0 };
  }

  const headerRowIndex = Number.isFinite(headerRowIndexRaw) && headerRowIndexRaw >= 0
    ? Math.min(headerRowIndexRaw, rawRows.length - 1)
    : detectHeaderRow(rawRows);

  const headers = uniqueHeaders(rawRows[headerRowIndex] || []);
  const rows = rawRows
    .slice(headerRowIndex + 1)
    .map((row) => rowToObject(headers, row || []))
    .filter((row) => Object.values(row).some((value) => Boolean(cleanText(value))));

  return {
    sheetName: selectedSheetName,
    headers,
    rows,
    headerRowIndex,
  };
}

async function findOrCreateCompany(supabase: any, name: string) {
  const cleanName = cleanText(name);
  if (!cleanName) return null;

  const existing = await supabase
    .from("companies")
    .select("id,name")
    .eq("name", cleanName)
    .maybeSingle();

  if (existing.data?.id) return existing.data;

  const inserted = await supabase
    .from("companies")
    .insert({ name: cleanName })
    .select("id,name")
    .single();

  if (inserted.error) return null;
  return inserted.data;
}

async function findOrCreateSource(
  supabase: any,
  payload: {
    name: string;
    institution_name: string;
    program_type: string;
  }
) {
  const existing = await supabase
    .from("participant_sources")
    .select("id,name,institution_name,program_type")
    .eq("name", payload.name)
    .eq("program_type", payload.program_type)
    .maybeSingle();

  if (existing.data?.id) return existing.data;

  const inserted = await supabase
    .from("participant_sources")
    .insert(payload)
    .select("id,name,institution_name,program_type")
    .single();

  if (inserted.error) throw new Error(inserted.error.message);
  return inserted.data;
}

export async function POST(req: NextRequest) {
  try {
    const user = getSessionUser(req);
    if (!user) return fail("Unauthorized", 401);

    const form = await req.formData();

    const file = form.get("file");
    const programType = cleanText(form.get("programType")) || "corporate";
    const companyName = cleanText(form.get("companyName"));
    const databaseName = cleanText(form.get("databaseName"));
    const presetMapping = cleanText(form.get("presetMapping")) || "auto";
    const sheetName = cleanText(form.get("sheetName"));
    const headerRowIndex = Number(form.get("headerRowIndex"));

    let fieldMapping: Record<string, string> = {};
    try {
      fieldMapping = JSON.parse(String(form.get("fieldMapping") || "{}"));
    } catch {
      fieldMapping = {};
    }

    if (!(file instanceof File)) return fail("File Excel wajib diupload.");
    if (!databaseName) return fail("Nama database wajib diisi.");
    if (!companyName) return fail("Nama perusahaan / instansi wajib diisi.");
    if (!fieldMapping.NAMA || !fieldMapping.NOMCU) {
      return fail("Mapping wajib belum lengkap. Minimal mapping Nama Peserta dan No MCU harus dipilih.");
    }

    const fileName = file.name || "upload.xlsx";
    const lowerName = fileName.toLowerCase();
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
      return fail("Format file harus .xlsx atau .xls.");
    }

    const supabase = getSupabaseAdmin();

    const workbook = await readWorkbook(file, sheetName, headerRowIndex);

    if (!workbook.rows.length) {
      return fail("File Excel kosong atau data setelah header tidak terbaca.");
    }

    const company = await findOrCreateCompany(supabase, companyName);

    const source = await findOrCreateSource(supabase, {
      name: databaseName,
      institution_name: companyName,
      program_type: programType,
    });

    const preparedRows = workbook.rows
      .map((row, index) => {
        const detectedName = detectName(row, fieldMapping);
        if (!detectedName) return null;

        const detectedMcuId = detectMcuId(row, fieldMapping) || `${databaseName}-${index + 1}`;
        const detectedNik = detectNik(row, fieldMapping);

        const canonicalRow = buildCanonicalRow(row, fieldMapping, {
          companyName,
          databaseName,
          programType,
          detectedName,
          detectedMcuId,
          detectedNik,
        });

        return {
          canonicalRow,
          participant: {
            source_id: source.id,
            company_id: company?.id || null,
            program_type: programType,
            name: detectedName,
            mcu_id: detectedMcuId,
            external_id: detectedNik || detectedMcuId,
            nik: detectedNik || null,
            gender: canonicalRow.JK || null,
            birth_date: canonicalRow.TGLLAHIR || null,
            department: canonicalRow.DEPARTEMEN || null,
          },
          meta: {
            detectedName,
            detectedMcuId,
            detectedNik,
            sheetName: workbook.sheetName,
            rowIndex: workbook.headerRowIndex + index + 2,
          },
        };
      })
      .filter(Boolean) as any[];

    if (!preparedRows.length) {
      return fail("Tidak ada baris peserta yang punya kolom nama. Periksa pilihan baris header dan mapping Nama Peserta.");
    }

    const insertedParticipants = await supabase
      .from("participants")
      .insert(preparedRows.map((row) => row.participant))
      .select("id,name,mcu_id,nik,external_id");

    if (insertedParticipants.error) {
      return fail(insertedParticipants.error.message, 500, {
        hint: "Cek kolom participants. Route upload memakai source_id, company_id, program_type, name, mcu_id, external_id, nik, gender, birth_date, department.",
      });
    }

    const participants = insertedParticipants.data || [];

    const importRows = participants.map((participant: any, index: number) => {
      const prepared = preparedRows[index];

      return {
        source_id: source.id,
        participant_id: participant.id,
        program_type: programType,
        company_name: companyName,
        database_name: databaseName,
        sheet_name: prepared.meta.sheetName,
        row_index: prepared.meta.rowIndex,
        participant_name: prepared.meta.detectedName,
        mcu_id: prepared.meta.detectedMcuId,
        nik: prepared.meta.detectedNik,
        row_data: prepared.canonicalRow,
      };
    });

    const savedRows = await supabase
      .from("ai_mcu_import_rows")
      .insert(importRows)
      .select("id");

    if (savedRows.error) {
      return fail(savedRows.error.message, 500, {
        hint: "Jalankan dulu SQL migration ai_mcu_import_rows di Supabase SQL Editor.",
      });
    }

    return ok({
      message: "Excel berhasil diupload, mapping tersimpan, dan data masuk ke database AI MCU.",
      source,
      company,
      fileName,
      presetMapping,
      fieldMapping,
      headerRowIndex: workbook.headerRowIndex,
      sheetName: workbook.sheetName,
      totalExcelRows: workbook.rows.length,
      totalParticipants: participants.length,
      totalStoredRows: savedRows.data?.length || 0,
      next: {
        analyzeUrl: `/ai-mcu/analyze?source_id=${source.id}`,
        generateUrl: `/ai-mcu/generate?source_id=${source.id}`,
      },
    });
  } catch (error: any) {
    return fail(error?.message || "Upload Excel gagal.", 500);
  }
}
