import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

function ok(payload: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...payload });
}

function normalizeKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || ["null", "undefined", "nan", "-"].includes(text.toLowerCase())) return "";
  return text;
}

function pickValue(row: Record<string, any>, aliases: string[]) {
  const keyMap = new Map<string, string>();

  for (const key of Object.keys(row || {})) {
    keyMap.set(normalizeKey(key), key);
  }

  for (const alias of aliases) {
    const key = keyMap.get(normalizeKey(alias));
    if (key) {
      const value = cleanText(row[key]);
      if (value) return value;
    }
  }

  for (const alias of aliases) {
    const aliasNorm = normalizeKey(alias);

    for (const [keyNorm, originalKey] of keyMap.entries()) {
      if (aliasNorm && (keyNorm.includes(aliasNorm) || aliasNorm.includes(keyNorm))) {
        const value = cleanText(row[originalKey]);
        if (value) return value;
      }
    }
  }

  return "";
}

function detectName(row: Record<string, any>) {
  return pickValue(row, [
    "NAMA",
    "Nama",
    "Nama Peserta",
    "Nama Karyawan",
    "Nama Lengkap",
    "Name",
    "Patient Name",
    "Employee Name",
  ]);
}

function detectMcuId(row: Record<string, any>) {
  return pickValue(row, [
    "NOMCU",
    "NO MCU",
    "NO.MCU",
    "No MCU",
    "Nomor MCU",
    "MCU ID",
    "mcu_id",
    "Barcode",
    "barcode_value",
    "No Peserta",
    "No Urut",
    "NO.URUT",
  ]);
}

function detectNik(row: Record<string, any>) {
  return pickValue(row, [
    "NIK",
    "KTP",
    "NIK/NRP/ID",
    "NIK NRP ID",
    "NRP",
    "ID Karyawan",
    "Employee ID",
    "external_id",
  ]);
}

function detectGender(row: Record<string, any>) {
  return pickValue(row, [
    "JK",
    "Jenis Kelamin",
    "Gender",
    "Sex",
  ]);
}

function detectBirthDate(row: Record<string, any>) {
  return pickValue(row, [
    "TGLLAHIR",
    "Tanggal Lahir",
    "Tgl Lahir",
    "Birth Date",
    "DOB",
  ]);
}

function detectDepartment(row: Record<string, any>) {
  return pickValue(row, [
    "DEPARTEMEN",
    "Department",
    "Departemen",
    "Bagian",
    "Unit",
    "Divisi",
  ]);
}

function detectPackage(row: Record<string, any>) {
  return pickValue(row, [
    "PAKET",
    "Paket",
    "Package",
    "Paket Pemeriksaan",
  ]);
}

async function readWorkbook(file: File) {
  let XLSX: any;

  try {
    const requireFunc = eval("require");
    XLSX = requireFunc("xlsx");
  } catch (error: any) {
    throw new Error(
      "Package xlsx belum tersedia. Jalankan di project Next.js: npm install xlsx"
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    raw: false,
  });

  const rows: Record<string, any>[] = [];

  for (const sheetName of workbook.SheetNames || []) {
    const sheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
      raw: false,
    });

    for (let index = 0; index < sheetRows.length; index += 1) {
      const row = sheetRows[index] as Record<string, any>;

      rows.push({
        ...row,
        _SheetName: sheetName,
        _RowIndex: index + 2,
      });
    }
  }

  return rows;
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

    if (!(file instanceof File)) return fail("File Excel wajib diupload.");
    if (!databaseName) return fail("Nama database wajib diisi.");
    if (!companyName) return fail("Nama perusahaan / instansi wajib diisi.");

    const fileName = file.name || "upload.xlsx";
    const lowerName = fileName.toLowerCase();
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
      return fail("Format file harus .xlsx atau .xls.");
    }

    const supabase = getSupabaseAdmin();

    const excelRows = await readWorkbook(file);

    if (!excelRows.length) {
      return fail("File Excel kosong atau header tidak terbaca.");
    }

    const company = await findOrCreateCompany(supabase, companyName);

    const source = await findOrCreateSource(supabase, {
      name: databaseName,
      institution_name: companyName,
      program_type: programType,
    });

    const participantRows = excelRows
      .map((row, index) => {
        const name = detectName(row);
        if (!name) return null;

        const mcuId = detectMcuId(row) || `${databaseName}-${index + 1}`;
        const nik = detectNik(row);

        return {
          source_id: source.id,
          company_id: company?.id || null,
          program_type: programType,
          name,
          mcu_id: mcuId,
          external_id: nik || mcuId,
          nik: nik || null,
          gender: detectGender(row) || null,
          birth_date: detectBirthDate(row) || null,
          department: detectDepartment(row) || null,
        };
      })
      .filter(Boolean) as any[];

    if (!participantRows.length) {
      return fail("Tidak ada baris peserta yang punya kolom nama. Pastikan header berisi Nama/NAMA.");
    }

    const insertedParticipants = await supabase
      .from("participants")
      .insert(participantRows)
      .select("id,name,mcu_id,nik,external_id");

    if (insertedParticipants.error) {
      return fail(insertedParticipants.error.message, 500, {
        hint: "Cek kolom participants. Route upload memakai source_id, company_id, program_type, name, mcu_id, external_id, nik, gender, birth_date, department.",
      });
    }

    const participants = insertedParticipants.data || [];

    const importRows = participants.map((participant: any, index: number) => {
      const row = excelRows[index] || {};
      const detectedName = detectName(row) || participant.name;
      const detectedMcuId = detectMcuId(row) || participant.mcu_id;
      const detectedNik = detectNik(row) || participant.nik;

      return {
        source_id: source.id,
        participant_id: participant.id,
        program_type: programType,
        company_name: companyName,
        database_name: databaseName,
        sheet_name: cleanText(row._SheetName),
        row_index: Number(row._RowIndex || index + 2),
        participant_name: detectedName,
        mcu_id: detectedMcuId,
        nik: detectedNik,
        row_data: {
          ...row,
          NAMA: detectedName,
          Nama: detectedName,
          NOMCU: detectedMcuId,
          "NO MCU": detectedMcuId,
          NIK: detectedNik,
          "NIK/NRP/ID": detectedNik,
          "Nama PT": companyName,
          Perusahaan: companyName,
          DATABASE_NAME: databaseName,
          PROGRAM_TYPE: programType,
          PAKET: detectPackage(row),
        },
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
      message: "Excel berhasil diupload dan masuk ke database AI MCU.",
      source,
      company,
      fileName,
      presetMapping,
      totalExcelRows: excelRows.length,
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
