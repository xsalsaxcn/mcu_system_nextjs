import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  CORPORATE_PDF_SECTIONS,
  CORPORATE_SIGNATORY_FIELDS,
  cleanCellValue,
  isLabParameter,
  isPhysicalParameter,
  isRequiredParameter,
  pickRowValue,
  parseSupportExamination,
  supportConfigForCode,
} from "@/lib/shared/corporatePdf";

export const dynamic = "force-dynamic";

function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

function engineUrl() {
  return String(process.env.AI_MCU_ENGINE_URL || "").replace(/\/$/, "");
}

function driveBaseFolder() {
  return String(
    process.env.AI_MCU_GOOGLE_DRIVE_FOLDER_ID ||
    process.env.AI_MCU_GOOGLE_DRIVE_FOLDER_URL ||
    process.env.AI_MCU_GDRIVE_BASE_FOLDER ||
    process.env.GDRIVE_BASE_FOLDER ||
    process.env.GOOGLE_DRIVE_FOLDER_ID ||
    ""
  ).trim();
}

function pick(...values: unknown[]) {
  for (const value of values) {
    const text = cleanCellValue(value);
    if (text) return text;
  }
  return "";
}

// CORPORATE_BIRTH_DATE_DAY_FIRST_V418
// Tanggal dari Excel dibaca secara ketat sebagai DD-MM-YYYY, bukan MM-DD-YYYY.
const MONTH_NAMES_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  jan: 1,
  january: 1,
  januari: 1,
  feb: 2,
  february: 2,
  februari: 2,
  mar: 3,
  march: 3,
  maret: 3,
  apr: 4,
  april: 4,
  may: 5,
  mei: 5,
  jun: 6,
  june: 6,
  juni: 6,
  jul: 7,
  july: 7,
  juli: 7,
  aug: 8,
  august: 8,
  agu: 8,
  agustus: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  okt: 10,
  oktober: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
  des: 12,
  desember: 12,
};

function validDateParts(day: number, month: number, year: number) {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return false;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

function formatDatePartsId(day: number, month: number, year: number) {
  if (!validDateParts(day, month, year)) return "";
  return `${String(day).padStart(2, "0")} ${MONTH_NAMES_ID[month - 1]} ${year}`;
}

function excelSerialToDateParts(serial: number) {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 200000) return null;
  // Sistem tanggal Excel 1900: serial 1 = 1 Januari 1900.
  // Basis 1899-12-30 juga menangani bug leap-year historis Excel.
  const milliseconds = Math.round(serial * 86400000);
  const date = new Date(Date.UTC(1899, 11, 30) + milliseconds);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return validDateParts(day, month, year) ? { day, month, year } : null;
}

function formatDateId(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDatePartsId(value.getUTCDate(), value.getUTCMonth() + 1, value.getUTCFullYear());
  }

  if (typeof value === "number") {
    const parts = excelSerialToDateParts(value);
    return parts ? formatDatePartsId(parts.day, parts.month, parts.year) : "";
  }

  const text = cleanCellValue(value).trim();
  if (!text) return "";

  // Serial Excel yang tersimpan sebagai teks.
  if (/^\d{4,6}(?:\.\d+)?$/.test(text)) {
    const parts = excelSerialToDateParts(Number(text));
    if (parts) return formatDatePartsId(parts.day, parts.month, parts.year);
  }

  // Format utama workbook MCU: DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY.
  // Penting: bagian pertama selalu dianggap HARI, termasuk bila nilainya 01-12.
  let match = text.match(/^(\d{1,2})[\-\/.](\d{1,2})[\-\/.](\d{4})(?:\s.*)?$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const formatted = formatDatePartsId(day, month, year);
    return formatted || text;
  }

  // Format DD-MMM-YYYY, misalnya 24-Jun-2026.
  match = text.match(/^(\d{1,2})[\-\s\/.]([A-Za-z]+)[\-\s\/.](\d{4})(?:\s.*)?$/);
  if (match) {
    const day = Number(match[1]);
    const month = MONTH_NAME_TO_NUMBER[match[2].toLowerCase()] || 0;
    const year = Number(match[3]);
    const formatted = formatDatePartsId(day, month, year);
    return formatted || text;
  }

  // Format ISO dari database: YYYY-MM-DD atau YYYY-MM-DDTHH:mm:ss.
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const formatted = formatDatePartsId(day, month, year);
    return formatted || text;
  }

  // Jangan gunakan new Date(text) untuk string ambigu, karena 01-06-1992
  // dapat ditafsirkan browser/Node sebagai MM-DD-YYYY.
  return text;
}

async function fetchParticipants(supabase: any, sourceId: number, ids: number[]) {
  const { data, error } = await supabase
    .from("participants")
    .select("*")
    .eq("source_id", sourceId)
    .eq("program_type", "corporate")
    .in("id", ids);
  if (error) throw new Error(error.message);
  const order = new Map(ids.map((id, index) => [id, index]));
  return (data || []).sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

async function fetchImportRows(supabase: any, ids: number[]) {
  const { data, error } = await supabase
    .from("ai_mcu_import_rows")
    .select("id,participant_id,row_data,participant_name,mcu_id,nik,company_name,database_name")
    .in("participant_id", ids)
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  const map = new Map<number, any>();
  for (const row of data || []) {
    const id = Number(row.participant_id);
    if (!map.has(id)) map.set(id, row);
  }
  return map;
}

// CORPORATE_REFRACTION_STABLE_IDENTITY_OVERLAY_V422
// Cari refraksi terbaru dengan prioritas participant_id saat ini. Jika histori import
// membuat participant_id baru, fallback ke NIK lalu nama dalam database yang sama.
function normalizeIdentityKey(value: unknown) {
  return cleanCellValue(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function extractRefractionValue(rowData: unknown) {
  const row = rowData && typeof rowData === "object"
    ? rowData as Record<string, unknown>
    : {};

  let refraction = pickRowValue(row, [
    "FS:Ref", "FS:REF", "FS:Refraksi", "Refraksi", "Refraksi Mata",
    "AUTOREF:Ref", "AUTOREF:Refraksi", "Autorefraksi"
  ]);
  if (!refraction) {
    const refractionKey = /^(?:fsref|fsrefraksi|refraksi|refraksimata|autorefref|autorefrefraksi|autorefraksi)\d*$/;
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = String(key).toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (!refractionKey.test(normalizedKey)) continue;
      const candidate = cleanCellValue(value);
      if (candidate) {
        refraction = candidate;
        break;
      }
    }
  }
  return refraction;
}

async function fetchLatestRefractions(supabase: any, participants: any[], importRows: Map<number, any>) {
  const participantIds = participants.map((p: any) => Number(p.id)).filter(Boolean);
  const targets = participants.map((participant: any) => {
    const participantId = Number(participant.id);
    const imported = importRows.get(participantId);
    const row = imported?.row_data && typeof imported.row_data === "object"
      ? imported.row_data as Record<string, unknown>
      : {};
    const nik = pick(row.NIK, row["NIK/NRP/ID"], imported?.nik, participant.nik, participant.employee_id, participant.external_id);
    const name = pick(row.NAMA, row.Nama, imported?.participant_name, participant.name, participant.nama);
    const databaseName = pick(imported?.database_name);
    return {
      participantId,
      nik,
      nikKey: normalizeIdentityKey(nik),
      name,
      nameKey: normalizeIdentityKey(name),
      databaseKey: normalizeIdentityKey(databaseName),
    };
  });

  const niks = Array.from(new Set(targets.map((x) => x.nik).filter(Boolean)));
  const names = Array.from(new Set(targets.map((x) => x.name).filter(Boolean)));
  const pool: any[] = [];

  if (participantIds.length) {
    const { data, error } = await supabase
      .from("ai_mcu_import_rows")
      .select("id,participant_id,row_data,participant_name,nik,database_name")
      .in("participant_id", participantIds)
      .order("id", { ascending: false });
    if (error) throw new Error(error.message);
    pool.push(...(data || []));
  }

  if (niks.length) {
    const { data, error } = await supabase
      .from("ai_mcu_import_rows")
      .select("id,participant_id,row_data,participant_name,nik,database_name")
      .in("nik", niks)
      .order("id", { ascending: false });
    if (error) throw new Error(error.message);
    pool.push(...(data || []));
  }

  // Nama hanya fallback terakhir. Database name tetap divalidasi bila tersedia.
  if (names.length) {
    const { data, error } = await supabase
      .from("ai_mcu_import_rows")
      .select("id,participant_id,row_data,participant_name,nik,database_name")
      .in("participant_name", names)
      .order("id", { ascending: false });
    if (error) throw new Error(error.message);
    pool.push(...(data || []));
  }

  const unique = new Map<number, any>();
  for (const item of pool) {
    const id = Number(item?.id);
    if (id && !unique.has(id)) unique.set(id, item);
  }
  const candidates = Array.from(unique.values()).sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

  const sameDatabase = (target: any, candidate: any) => {
    const candidateDb = normalizeIdentityKey(candidate?.database_name);
    return !target.databaseKey || !candidateDb || target.databaseKey === candidateDb;
  };

  const result = new Map<number, string>();
  for (const target of targets) {
    let match = candidates.find((item) =>
      Number(item?.participant_id) === target.participantId && Boolean(extractRefractionValue(item?.row_data))
    );

    if (!match && target.nikKey) {
      match = candidates.find((item) =>
        sameDatabase(target, item) &&
        normalizeIdentityKey(item?.nik) === target.nikKey &&
        Boolean(extractRefractionValue(item?.row_data))
      );
    }

    if (!match && target.nameKey) {
      match = candidates.find((item) =>
        sameDatabase(target, item) &&
        normalizeIdentityKey(item?.participant_name) === target.nameKey &&
        Boolean(extractRefractionValue(item?.row_data))
      );
    }

    const refraction = match ? extractRefractionValue(match.row_data) : "";
    if (refraction) result.set(target.participantId, refraction);
  }
  return result;
}

async function loadMaps(supabase: any) {
  const [packages, sources, companies] = await Promise.all([
    supabase.from("packages").select("id,name"),
    supabase.from("participant_sources").select("id,name,institution_name,program_type"),
    supabase.from("companies").select("id,name"),
  ]);
  return {
    packageMap: new Map((packages.data || []).map((x: any) => [x.id, x.name])),
    sourceMap: new Map((sources.data || []).map((x: any) => [x.id, x])),
    companyMap: new Map((companies.data || []).map((x: any) => [x.id, x.name])),
  };
}

function identityRow(p: any, imported: any, maps: any) {
  const row = imported?.row_data && typeof imported.row_data === "object" ? imported.row_data : {};
  const source = maps.sourceMap.get(p.source_id) || {};
  const companyName = maps.companyMap.get(p.company_id);
  const packageName = maps.packageMap.get(p.package_id);
  const name = pick(row.NAMA, row.Nama, imported?.participant_name, p.name, p.nama);
  const mcuId = pick(row.NOMCU, row["NO MCU"], imported?.mcu_id, p.mcu_id, p.no_mcu, p.barcode_value, p.external_id, p.id);
  const nik = pick(row.NIK, row["NIK/NRP/ID"], imported?.nik, p.nik, p.external_id, p.employee_id, p.id);
  const medicalRecordNo = pick(row.MEDICAL_RECORD_NO, row.NO_MR, row["No. Medical Record"], p.medical_record_no, p.no_mr);
  // CORPORATE_MCU_DATE_FROM_EXCEL_V409
  // Tanggal MCU wajib diprioritaskan dari kolom Excel/import row.
  // created_at dan waktu generate tidak boleh dipakai sebagai Tanggal MCU.
  const excelMcuDate = pickRowValue(row, [
    "Tanggal MCU",
    "TANGGAL MCU",
    "TANGGAL_MCU",
    "TGL MCU",
    "TGL_MCU",
    "TGLMCU",
    "Tanggal Pemeriksaan",
    "TANGGAL PEMERIKSAAN",
    "Tanggal Periksa",
    "SERVICE DATE",
    "SERVICE_DATE",
  ]);
  const mcuDate = formatDateId(pick(excelMcuDate, p.mcu_date, p.service_date));
  const department = pick(row.DEPARTEMEN, row.DEPT, row.Department, row.Departemen, p.department, p.division, p.unit);
  const bagian = pick(row.BAGIAN, row.Bagian, row["Dept/Bagian"], row.Unit, p.bagian, p.section, p.unit);
  const jabatan = pick(row.JABATAN, row.Jabatan, row.Position, row["Job Title"], p.jabatan, p.position);
  // Sumber database/perusahaan diprioritaskan. Pada beberapa workbook, auto-mapping
  // lama pernah salah mengisi "Nama PT" dengan nama peserta.
  const company = pick(imported?.company_name, companyName, source.institution_name, source.name, p.company_name, row.PERUSAHAAN, row.Perusahaan, row.Company, row["Nama PT"]);

  return {
    "Nama PT": company,
    PERUSAHAAN: company,
    Perusahaan: company,
    "Tanggal MCU": mcuDate,
    TANGGAL_MCU: mcuDate,
    // Corporate memakai tanggal pemeriksaan dari Excel, bukan tanggal PDF dibuat.
    Issueddate: mcuDate,
    IssuedDate: mcuDate,
    NOMCU: mcuId,
    "NO MCU": mcuId,
    "NO.MCU": mcuId,
    "No. Medical Record": medicalRecordNo,
    MEDICAL_RECORD_NO: medicalRecordNo,
    NAMA: name,
    Nama: name,
    JK: pick(row.JK, row.Gender, p.gender, p.sex, p.jenis_kelamin),
    TGLLAHIR: formatDateId(pick(row.TGLLAHIR, row["Tanggal Lahir"], p.birth_date, p.date_of_birth, p.tanggal_lahir)),
    USIA: pick(row.USIA, row.Usia, p.age, p.usia),
    NIK: nik,
    "NIK/NRP/ID": nik,
    DEPARTEMEN: department,
    Department: department,
    DEPT: department,
    Bagian: bagian,
    BAGIAN: bagian,
    Jabatan: jabatan,
    JABATAN: jabatan,
    PAKET: pick(row.PAKET, row.Paket, packageName, p.package_name, p.paket),
    KATEGORI: pick(row.KATEGORI, "corporate"),
    KESIMPULAN: pick(row.KESIMPULAN, row.Kesimpulan, p.conclusion, p.kesimpulan),
    SARAN: pick(row.SARAN, row.Saran, p.recommendation, p.saran),
    FIT_STATUS: pick(row.FIT_STATUS, row.fitStatus, row.KATEGORI, row.Kategori, p.fit_status, p.status_fit),
  };
}

function selectedUploadedRow(row: Record<string, unknown>, selectedParameters: Set<string>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (selectedParameters.size === 0 || selectedParameters.has(key) || isRequiredParameter(key)) out[key] = value;
  }
  return out;
}

function buildParticipantRows(
  p: any,
  imported: any,
  maps: any,
  sections: Set<string>,
  selectedParameters: Set<string>,
  signatories: Record<string, string>
) {
  const raw = imported?.row_data && typeof imported.row_data === "object"
    ? imported.row_data as Record<string, unknown>
    : {};
  const selectedRaw = selectedUploadedRow(raw, selectedParameters);
  const identity = identityRow(p, imported, maps);
  const rows: Record<string, unknown>[] = [];
  const sectionList = Array.from(sections).join(",");

  const summary: Record<string, unknown> = {
    ...identity,
    _SheetName: "KESIMPULAN & SARAN",
    PDF_SECTION_SELECTION: sectionList,
    "Koordinator MCU": signatories.coordinator || "",
  };
  // CORPORATE_STRICT_PROFILE_PHOTO_V410
  // Hanya field profil yang boleh masuk cover. Link Foto Rontgen tidak pernah menjadi fallback.
  if (sections.has("PROFILE_PHOTO")) {
    summary.PhotoUrl = pick(
      raw.PhotoUrl,
      raw.PHOTOURL,
      raw["PHOTO URL"],
      raw.PHOTO_URL,
      raw["Link Foto"],
      raw["Foto URL"],
      raw["URL FOTO"]
    );
  } else {
    summary.PhotoUrl = "";
  }
rows.push(summary);

  if (sections.has("PHYSICAL")) {
    const physical: Record<string, unknown> = { ...identity, _SheetName: "FISIK", PDF_SECTION_SELECTION: sectionList };
    for (const [key, value] of Object.entries(selectedRaw)) if (isPhysicalParameter(key)) physical[key] = value;

    // CORPORATE_LIPE_TO_WAIST_V416
    // Canonical mapping: FS:LiPe / LIPE adalah Lingkar Perut, bukan parameter lain.
    const waistCircumference = pickRowValue(selectedRaw, [
      "Lingkar Perut", "LINGKAR PERUT", "FS:LiPe", "FS:LIPE", "FS:Lipe",
      "FS:LPerut", "FS:LP", "LIPE", "LiPe", "Lipe",
      "Waist Circumference", "Waist"
    ]);
    if (waistCircumference) {
      physical["Lingkar Perut"] = waistCircumference;
      physical["FS:LiPe"] = waistCircumference;
    }

    // CORPORATE_REFRACTION_PHYSICAL_CANONICAL_V420
    // Refraksi dapat datang sebagai FS:Ref, duplicate-header FS:Ref__2,
    // atau dari sheet Autorefraksi (mis. AUTOREF:Ref). Normalisasikan hanya
    // alias refraksi yang eksplisit; jangan pernah menangkap FS:Reflex* neurologis.
    let refraction = pickRowValue(raw, [
      "FS:Ref", "FS:REF", "FS:Refraksi", "Refraksi", "Refraksi Mata",
      "AUTOREF:Ref", "AUTOREF:Refraksi", "Autorefraksi"
    ]);
    if (!refraction) {
      const refractionKey = /^(?:fsref|fsrefraksi|refraksi|refraksimata|autorefref|autorefrefraksi|autorefraksi)\d*$/;
      for (const [key, value] of Object.entries(raw)) {
        const normalizedKey = String(key).toLowerCase().replace(/[^a-z0-9]+/g, "");
        if (!refractionKey.test(normalizedKey)) continue;
        const candidate = cleanCellValue(value);
        if (candidate) {
          refraction = candidate;
          break;
        }
      }
    }
    if (refraction) {
      physical["FS:Ref"] = refraction;
      physical["Refraksi"] = refraction;
    }

    physical["Dokter MCU"] = signatories.physical || "";
    rows.push(physical);
  }

  if (sections.has("LAB")) {
    const lab: Record<string, unknown> = { ...identity, _SheetName: "LAB", PDF_SECTION_SELECTION: sectionList };
    for (const [key, value] of Object.entries(selectedRaw)) if (isLabParameter(key)) lab[key] = value;
    lab["Penanggung Jawab Laboratorium"] = signatories.lab || "";
    rows.push(lab);
  }

  const supportCodes = ["XRAY_THORAX", "EKG", "TREADMILL", "SPIROMETRY", "AUDIOMETRY", "USG"];
  for (const code of supportCodes) {
    const imageCode = `${code}_IMAGE`;
    if (!sections.has(code) && !sections.has(imageCode)) continue;
    const config = supportConfigForCode(code);
    if (!config) continue;
    const support: Record<string, unknown> = { ...identity, _SheetName: config.sheetName, PDF_SECTION_SELECTION: sectionList };
    if (sections.has(code)) {
      const parsedSupport = parseSupportExamination(selectedRaw, code);
      support[config.resultField] = parsedSupport.result;
      support[config.conclusionField] = parsedSupport.conclusion;
    }
    if (sections.has(imageCode)) support[config.imageField] = pick(raw[config.imageField]);
    const signatoryKey = code === "XRAY_THORAX" ? "radiology" : code.toLowerCase().replace("spirometry", "spirometry").replace("audiometry", "audiometry");
    support[config.doctorField] = signatories[signatoryKey] || "";
    if (Object.values(support).some((value) => cleanCellValue(value))) rows.push(support);
  }

  return rows;
}

export async function POST(req: NextRequest) {
  try {
    const user = getSessionUser(req);
    if (!user) return fail("Unauthorized", 401);
    const body = await req.json().catch(() => ({}));
    const sourceId = Number(body.sourceId);
    const participantIds = Array.isArray(body.participantIds)
      ? body.participantIds.map(Number).filter((id: number) => Number.isFinite(id) && id > 0)
      : [];
    if (!sourceId) return fail("Pilih database MCU Corporate.");
    if (!participantIds.length) return fail("Pilih minimal 1 peserta.");

    const allowedSections = new Set(CORPORATE_PDF_SECTIONS.map((item) => item.code));
    const sections = new Set<string>(
      (Array.isArray(body.selectedSections) ? body.selectedSections : [])
        .map(String)
        .filter((code: string) => allowedSections.has(code as any))
    );
    sections.add("COVER");
    sections.add("CONCLUSION");

    const selectedParameters = new Set<string>(Array.isArray(body.selectedParameters) ? body.selectedParameters.map(String) : []);
    const signatories: Record<string, string> = {};
    for (const item of CORPORATE_SIGNATORY_FIELDS) signatories[item.key] = cleanCellValue(body.signatories?.[item.key]);

    const supabase = getSupabaseAdmin();
    const sourceRes = await supabase.from("participant_sources").select("id,name,institution_name,program_type").eq("id", sourceId).maybeSingle();
    if (sourceRes.error) return fail(sourceRes.error.message, 500);
    if (!sourceRes.data) return fail("Database tidak ditemukan.", 404);
    if (String(sourceRes.data.program_type || "").toLowerCase() !== "corporate") return fail("Route ini hanya untuk MCU Corporate.", 403);

    const participants = await fetchParticipants(supabase, sourceId, participantIds);
    if (participants.length !== participantIds.length) return fail("Sebagian peserta bukan berasal dari database Corporate yang dipilih.", 403);

    const importRows = await fetchImportRows(supabase, participantIds);

    // CORPORATE_REFRACTION_STABLE_IDENTITY_OVERLAY_V422
    // Overlay hanya FS:Ref. Jika participant_id berubah antar import, cocokkan ulang via NIK/nama
    // agar histori import terbaru tetap terpakai tanpa mengubah field lain.
    const latestRefractions = await fetchLatestRefractions(supabase, participants, importRows);
    for (const [participantId, refraction] of latestRefractions.entries()) {
      const imported = importRows.get(participantId);
      if (!imported || !refraction) continue;
      const rowData = imported?.row_data && typeof imported.row_data === "object"
        ? { ...(imported.row_data as Record<string, unknown>) }
        : {};
      rowData["FS:Ref"] = refraction;
      importRows.set(participantId, { ...imported, row_data: rowData });
    }

    const maps = await loadMaps(supabase);
    // CORPORATE_REFRACTION_FINAL_PAYLOAD_V423
    // Inject Refraksi langsung ke row FISIK FINAL yang dikirim ke Python engine.
    // Ini sengaja dilakukan setelah buildParticipantRows agar FS:Ref tidak bisa hilang
    // karena histori import, selectedParameters, atau normalisasi row_data sebelumnya.
    const rekapRows = participants.flatMap((participant: any) => {
      const participantId = Number(participant.id);
      const participantRows = buildParticipantRows(
        participant,
        importRows.get(participantId),
        maps,
        sections,
        selectedParameters,
        signatories
      );
      const refraction = latestRefractions.get(participantId) || "";
      if (refraction) {
        for (const row of participantRows) {
          if (String(row?._SheetName || "").toUpperCase() !== "FISIK") continue;
          row["FS:Ref"] = refraction;
          row["Refraksi"] = refraction;
        }
      }
      return participantRows;
    });
    const names = participants.map((participant: any) => pick(participant.name)).filter(Boolean);
    const url = engineUrl();
    if (!url) return fail("AI_MCU_ENGINE_URL belum dikonfigurasi.", 500);

    const mergePdf = Boolean(body.mergePdf) && participants.length > 1;
    const uploadDrive = Boolean(body.uploadDrive);
    const requestedBaseFolder = String(body.baseFolder || "").trim();
    const resolvedBaseFolder = requestedBaseFolder || driveBaseFolder();
    if (uploadDrive && !resolvedBaseFolder) {
      return fail("Masukkan URL folder Google Drive tujuan untuk hasil PDF.", 400);
    }
    const res = await fetch(`${url}/generate-pdf-async`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        mode: participants.length > 1 ? "batch" : "single",
        uploadDrive,
        mergePdf,
        baseFolder: resolvedBaseFolder,
        baseUrl: url,
        names,
        rekapRows,
        abnRows: [],
        condRows: [],
        company: pick(sourceRes.data.institution_name, sourceRes.data.name, "MCU Corporate"),
        year: new Date().getFullYear(),
        template: "corporate",
        program: "corporate",
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) return fail(json.message || "Gagal memulai job PDF Corporate.", 500, { engineStatus: res.status, response: json });

    return NextResponse.json({
      ok: true,
      status: json.status || "queued",
      message: json.message || "Generate PDF MCU Corporate dimulai.",
      jobId: json.jobId,
      progress: Number(json.progress || 0),
      current: Number(json.current || 0),
      total: Number(json.total || participants.length),
      selectedCount: participants.length,
      importedRowsUsed: importRows.size,
      sections: Array.from(sections),
      engineMode: json.engineMode || "python-engine-async",
    });
  } catch (error: any) {
    return fail(error?.message || "Generate PDF MCU Corporate gagal.", 500);
  }
}
