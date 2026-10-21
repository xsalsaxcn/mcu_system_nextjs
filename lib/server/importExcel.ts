import * as XLSX from "xlsx";
import {
  PROGRAM_CAPASKA,
  PROGRAM_CORPORATE,
  PROGRAM_VACCINATION,
} from "@/lib/shared/constants";
import { mapProgramPackages, seedDefaults } from "@/lib/server/defaults";

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalizeProgramType(value: any) {
  const program = clean(value).toLowerCase();
  if (program === PROGRAM_CORPORATE) return PROGRAM_CORPORATE;
  if (program === PROGRAM_VACCINATION) return PROGRAM_VACCINATION;
  return PROGRAM_CAPASKA;
}

function defaultInstitutionName(programType: string) {
  if (programType === PROGRAM_CORPORATE) return "Corporate";
  if (programType === PROGRAM_VACCINATION) return "Vaksinasi Perusahaan";
  return "BPIP / CAPASKA";
}

function defaultPackageName(programType: string) {
  if (programType === PROGRAM_CORPORATE) return "MCU Corporate Basic";
  if (programType === PROGRAM_VACCINATION) return "Vaksinasi Perusahaan";
  return "CAPASKA 2025/2026";
}

function defaultMcuPrefix(programType: string) {
  if (programType === PROGRAM_CORPORATE) return "MCU";
  if (programType === PROGRAM_VACCINATION) return "VAKSIN";
  return "CAPASKA";
}

function norm(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[_\-.]/g, " ")
    .trim();
}

function findColumn(headers: string[], candidates: string[]) {
  const normalized = headers.map(norm);
  const normalizedCandidates = candidates.map(norm);

  for (const candidate of normalizedCandidates) {
    const exact = normalized.findIndex((h) => h === candidate);
    if (exact >= 0) return exact;
  }

  for (const candidate of normalizedCandidates) {
    const partial = normalized.findIndex(
      (h) => h.includes(candidate) || candidate.includes(h),
    );
    if (partial >= 0) return partial;
  }

  return -1;
}

// MCU_CORPORATE_IMPORT_MAPPING_SESSION_V466
function findMappedColumn(headers: string[], mappedHeader: any) {
  const target = clean(mappedHeader);
  if (!target) return -1;
  const targetNorm = norm(target);
  return headers.findIndex((header) => norm(header) === targetNorm);
}

function corporateSessionLocationV466(row: any) {
  return clean(
    row?.location_name ??
      row?.session_location ??
      row?.location ??
      row?.site_name ??
      row?.site ??
      row?.campus_name ??
      row?.campus ??
      "",
  );
}

function corporateSessionDateV466(row: any) {
  return clean(
    row?.session_date ??
      row?.event_date ??
      row?.exam_date ??
      row?.mcu_date ??
      row?.date ??
      "",
  ).slice(0, 10);
}

function schemaColumnMissingV466(error: any) {
  const text = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return text.includes("column") || text.includes("schema cache") || text.includes("does not exist");
}

function chooseHeaderRow(rows: any[][]) {
  const known = [
    "nama",
    "nama peserta",
    "nama lengkap",
    "child name",
    "time area name",
    "time name",
    "peserta",
    "putra",
    "putri",
    "provinsi",
    "jenis kelamin",
    "nik",
  ];
  let best = 0;
  let bestScore = -1;

  rows.slice(0, 20).forEach((row, idx) => {
    const values = row.map(norm);
    const score = values.reduce(
      (acc, v) => acc + (known.some((k) => v.includes(k)) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      best = idx;
      bestScore = score;
    }
  });

  return best;
}

function parseDateValue(value: any) {
  if (!value) return "";

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const mm = String(parsed.m).padStart(2, "0");
      const dd = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${mm}-${dd}`;
    }
  }

  const asString = clean(value);
  if (!asString) return "";

  const d = new Date(asString);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return asString;
}

const monthMap: Record<string, string> = {
  jan: "01",
  january: "01",
  januari: "01",
  feb: "02",
  february: "02",
  februari: "02",
  mar: "03",
  march: "03",
  maret: "03",
  apr: "04",
  april: "04",
  may: "05",
  mei: "05",
  jun: "06",
  june: "06",
  juni: "06",
  jul: "07",
  july: "07",
  juli: "07",
  aug: "08",
  august: "08",
  agustus: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  oktober: "10",
  okt: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
  desember: "12",
  des: "12",
};

function parseLooseDateText(value: string) {
  const text = clean(value).replace(
    /^(mon|tue|wed|thu|fri|sat|sun|sen|sel|rab|kam|jum|sab|min)\w*,?\s+/i,
    "",
  );
  if (!text) return "";

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10);

  const match = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (match) {
    const dd = String(match[1]).padStart(2, "0");
    const mm = monthMap[match[2].toLowerCase()] || "";
    const yyyy = match[3];
    if (mm) return `${yyyy}-${mm}-${dd}`;
  }

  return "";
}

function parseVaccinationTimeArea(value: any) {
  const raw = clean(value);
  if (!raw) return { location_name: "", session_date: "", time_area_name: "" };

  const parts = raw
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);
  const dateCandidate = parts.length > 1 ? parts[parts.length - 1] : "";
  const parsedDate = parseLooseDateText(dateCandidate);

  if (parsedDate) {
    return {
      location_name: parts.slice(0, -1).join(" - ") || raw,
      session_date: parsedDate,
      time_area_name: raw,
    };
  }

  return { location_name: raw, session_date: "", time_area_name: raw };
}

function normalizeVaccinationGender(value: any) {
  const text = norm(value);
  if (["male", "m", "l", "laki laki", "laki", "pria"].includes(text))
    return "Laki-laki";
  if (["female", "f", "p", "perempuan", "wanita"].includes(text))
    return "Perempuan";
  return clean(value);
}

function makeImportLocationKey(
  sourceId: number,
  locationName: string,
  sessionDate: string,
  timeSlot: string,
) {
  return [
    sourceId,
    norm(locationName) || "lokasi belum ditentukan",
    sessionDate || "tanpa tanggal",
    norm(timeSlot) || "belum ditentukan",
  ].join("|");
}

function importParticipantDedupeKeyV168(row: {
  name: string;
  gender: string;
  province: string;
  nik?: string;
  external_id?: string;
}
) {
  const nik = norm(row.nik || "");
  if (nik) return `nik|${nik}`;

  const externalId = norm(row.external_id || "");
  if (externalId) return `external|${externalId}`;

  return [
    "name",
    norm(row.name),
    norm(row.gender),
    norm(row.province),
  ].join("|");
}

// IMPORT_APPEND_ONLY_EXISTING_DEDUPE_V214
// Import tambahan dibuat insert-only: peserta yang sudah ada di database akan diskip.
// Ini menjaga nomor MCU dan data existing tidak berubah sama sekali.
function genderAliasesAppendOnlyV214(value: any) {
  const text = norm(value);
  if (["laki laki", "laki", "pria", "putra", "male", "m"].includes(text)) {
    return ["Laki-laki", "Putra", "Pria"];
  }
  if (["perempuan", "wanita", "putri", "female", "f"].includes(text)) {
    return ["Perempuan", "Putri", "Wanita"];
  }
  return [clean(value)];
}

function participantKeyVariantsAppendOnlyV214(row: {
  name: string;
  gender: string;
  province: string;
  nik?: string;
  external_id?: string;
}) {
  const variants = new Set<string>();
  for (const gender of genderAliasesAppendOnlyV214(row.gender)) {
    const key = importParticipantDedupeKeyV168({
      ...row,
      gender,
    });
    if (key) variants.add(key);
  }
  return Array.from(variants);
}

async function loadExistingParticipantKeysAppendOnlyV214(supabase: any, programType: string) {
  const keys = new Set<string>();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("participants")
      .select("name,gender,province,nik,external_id,program_type")
      .eq("program_type", programType)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    for (const row of data || []) {
      for (const key of participantKeyVariantsAppendOnlyV214({
        name: row.name || "",
        gender: row.gender || "",
        province: row.province || "",
        nik: row.nik || "",
        external_id: row.external_id || "",
      })) {
        keys.add(key);
      }
    }

    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return keys;
}



async function getOrCreateCompany(
  supabase: any,
  name: string,
  programType = PROGRAM_CAPASKA,
) {
  const cleanName = clean(name) || defaultInstitutionName(programType);

  const { data: existing, error: selectError } = await supabase
    .from("companies")
    .select("id")
    .ilike("name", cleanName)
    .limit(1)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing.id as number;

  const { data, error } = await supabase
    .from("companies")
    .insert({ name: cleanName, address: "", pic_name: "" })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as number;
}

async function getOrCreatePackage(
  supabase: any,
  name: string,
  companyId: number,
  programType: string,
) {
  const cleanName = clean(name) || defaultPackageName(programType);

  const { data: existing, error: selectError } = await supabase
    .from("packages")
    .select("id")
    .ilike("name", cleanName)
    .eq("program_type", programType)
    .limit(1)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing.id as number;

  const { data, error } = await supabase
    .from("packages")
    .insert({
      name: cleanName,
      description: "Auto created from import",
      company_id: companyId,
      is_active: 1,
      program_type: programType,
    })
    .select("id")
    .single();

  if (error) throw error;

  await mapProgramPackages(supabase, programType);

  return data.id as number;
}

async function nextMcuCounter(supabase: any, year: string, prefixBase: string) {
  const prefix = `${prefixBase}-${year}`;

  const { data, error } = await supabase
    .from("participants")
    .select("mcu_id")
    .like("mcu_id", `${prefix}-%`)
    .order("mcu_id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.mcu_id) return 1;

  const last = Number(String(data.mcu_id).split("-").pop() || "0");
  return Number.isFinite(last) ? last + 1 : 1;
}


async function getOrCreateParticipantSourceForImportV228(
  supabase: any,
  options: {
    source_id?: number;
    database_name: string;
    institution_name: string;
    company_name: string;
    description?: string;
    program_type: string;
  },
) {
  const cleanName = clean(options.database_name);

  // IMPORT_EXISTING_DATABASE_SELECT_V237 helper
  const requestedSourceId = Number((options as any).source_id || 0);
  if (Number.isFinite(requestedSourceId) && requestedSourceId > 0) {
    const { data: selected, error: selectedError } = await supabase
      .from("participant_sources")
      .select("id,name,program_type")
      .eq("id", requestedSourceId)
      .limit(1)
      .maybeSingle();

    if (selectedError) throw selectedError;
    if (selected?.id) {
      await supabase
        .from("participant_sources")
        .update({
          name: cleanName || selected.name,
          institution_name: options.institution_name || options.company_name,
          description: options.description || "",
          uploaded_filename: "upload.xlsx",
        })
        .eq("id", selected.id);

      return Number(selected.id);
    }
  }

  const { data: existing, error: existingError } = await supabase
    .from("participant_sources")
    .select("id")
    .eq("program_type", options.program_type)
    .ilike("name", cleanName)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    await supabase
      .from("participant_sources")
      .update({
        institution_name: options.institution_name || options.company_name,
        description: options.description || "",
        uploaded_filename: "upload.xlsx",
      })
      .eq("id", existing.id);

    return Number(existing.id);
  }

  const { data: source, error: sourceError } = await supabase
    .from("participant_sources")
    .insert({
      name: cleanName,
      institution_name: options.institution_name || options.company_name,
      program_type: options.program_type,
      description: options.description || "",
      uploaded_filename: "upload.xlsx",
    })
    .select("id")
    .single();

  if (sourceError) throw sourceError;
  return Number(source.id);
}

async function findCapaskaExistingParticipantForMergeV228(
  supabase: any,
  args: {
    source_id: number;
    candidate: { name: string; gender: string; province: string };
    nik?: string;
    external_id?: string;
  },
) {
  const nik = clean(args.nik);
  const externalId = clean(args.external_id);

  if (nik) {
    const { data, error } = await supabase
      .from("participants")
      .select("id,mcu_id,barcode_value")
      .eq("program_type", PROGRAM_CAPASKA)
      .eq("nik", nik)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data;
  }

  if (externalId) {
    const { data, error } = await supabase
      .from("participants")
      .select("id,mcu_id,barcode_value")
      .eq("program_type", PROGRAM_CAPASKA)
      .eq("external_id", externalId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data;
  }

  const { data, error } = await supabase
    .from("participants")
    .select("id,mcu_id,barcode_value")
    .eq("program_type", PROGRAM_CAPASKA)
    .eq("source_id", args.source_id)
    .ilike("name", clean(args.candidate.name))
    .ilike("gender", clean(args.candidate.gender))
    .ilike("province", clean(args.candidate.province))
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function updateCapaskaExistingParticipantForMergeV228(
  supabase: any,
  id: number,
  data: any,
) {
  const updateRow = {
    external_id: data.external_id || null,
    nik: data.nik || null,
    name: data.name,
    gender: data.gender,
    province: data.province || null,
    company_id: data.company_id,
    package_id: data.package_id,
    source_id: data.source_id,
    service_date: data.service_date || null,
    mcu_date: data.mcu_date || null,
    exam_type: data.exam_type || null,
    doctor_assigned: data.doctor_assigned || null,
    nurse_assigned: data.nurse_assigned || null,
  };

  const { error } = await supabase
    .from("participants")
    .update(updateRow)
    .eq("id", id);

  if (error) throw error;
}



// LABEL_PRINT_STATUS_NEW_IMPORT_V216
// Peserta baru hasil import tambahan harus BELUM PRINT.
// Existing participant tetap diskip oleh append-only dan status print existing tidak disentuh.
async function markInsertedParticipantsLabelUnprintedV216(supabase: any, participantIds: number[]) {
  const ids = Array.from(new Set((participantIds || []).map(Number).filter(Boolean)));
  if (!ids.length) return;

  // Field status label berbeda-beda antar versi. Semua attempt dibuat best-effort.
  // Kalau kolom tidak ada, error schema cache/column diabaikan agar build/runtime tetap aman.
  const patches: Record<string, any>[] = [
    { label_printed: false },
    { is_label_printed: false },
    { printed_label: false },
    { label_print_status: "Belum print" },
    { print_label_status: "Belum print" },
    { label_status: "Belum print" },
    { print_status: "Belum print" },
    { label_printed_at: null },
    { printed_at: null },
    { label_print_at: null },
    { label_printed_by: null },
    { printed_by: null },
    { label_print_count: 0 },
    { print_count: 0 },
    { barcode_created_at: null },
    { barcode_image_path: null },
  ];

  for (const patch of patches) {
    try {
      await supabase.from("participants").update(patch).in("id", ids);
    } catch {
      // ignore best-effort column mismatch
    }
  }
}

export async function importParticipantsFromExcel(
  supabase: any,
  fileBuffer: Buffer,
  options: {
    database_name: string;
    institution_name: string;
    company_name: string;
    package_name: string;
    description?: string;
    program_type?: string;
    source_id?: number;
    corporate_mapping?: Record<string, string>;
    corporate_session?: {
      queue_session_id?: number;
      location_mode?: string;
      location_column?: string;
      location_value?: string;
      sheet_name?: string;
      header_row?: number;
    };
  },
) {
  await seedDefaults(supabase);

  const programType = normalizeProgramType(options.program_type);
  const prefixBase = defaultMcuPrefix(programType);

  const companyId = await getOrCreateCompany(
    supabase,
    options.company_name || options.institution_name,
    programType,
  );
  const packageId = await getOrCreatePackage(
    supabase,
    options.package_name,
    companyId,
    programType,
  );
  await mapProgramPackages(supabase, programType);

  const sourceId = await getOrCreateParticipantSourceForImportV228(supabase, {
    source_id: (options as any).source_id,
    database_name: options.database_name,
    institution_name: options.institution_name,
    company_name: options.company_name,
    description: options.description,
    program_type: programType,
  });
  // Resolve selected Corporate Session/Lokasi once and verify that it belongs
  // to the same company + package chosen on Import.
  let corporateSessionRowV466: any = null;
  const requestedCorporateSessionIdV466 = Number(options.corporate_session?.queue_session_id || 0);
  if (programType === PROGRAM_CORPORATE && requestedCorporateSessionIdV466 > 0) {
    const sessionResultV466 = await supabase
      .from("mcu_queue_sessions")
      .select("*")
      .eq("id", requestedCorporateSessionIdV466)
      .maybeSingle();
    if (sessionResultV466.error) throw sessionResultV466.error;
    if (!sessionResultV466.data) throw new Error("Session MCU / Lokasi yang dipilih tidak ditemukan.");
    if (Number(sessionResultV466.data.company_id || 0) !== Number(companyId) || Number(sessionResultV466.data.package_id || 0) !== Number(packageId)) {
      throw new Error("Session MCU / Lokasi tidak sesuai dengan perusahaan + paket import.");
    }
    corporateSessionRowV466 = sessionResultV466.data;
  }

  const workbook = XLSX.read(fileBuffer, { type: "buffer" });

  const stats: any = {
    source_id: sourceId,
    selected_source_id_v237: options.source_id || null,
    program_type: programType,
    rows_read: 0,
    participants_created: 0,
    participants_updated: 0,
    participants_skipped: 0,
    skipped_rows: [],
    detected_columns: [],
    skipped_sheets: [],
    duplicate_candidates_skipped: 0,
    existing_participants_skipped: 0,
    corporate_mapping_v466: programType === PROGRAM_CORPORATE ? options.corporate_mapping || {} : null,
    corporate_queue_session_id_v466: corporateSessionRowV466?.id || null,
    corporate_session_location_v466: corporateSessionRowV466 ? corporateSessionLocationV466(corporateSessionRowV466) : "",
    corporate_session_date_v466: corporateSessionRowV466 ? corporateSessionDateV466(corporateSessionRowV466) : "",
    corporate_session_assignments_v466: 0,
  };

  const existingParticipantKeysAppendOnlyV214 = await loadExistingParticipantKeysAppendOnlyV214(supabase, programType);
  const insertRows: any[] = [];
  const counterByYear = new Map<string, number>();
  const seenImportParticipantKeysV168 = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
    }) as any[][];

    if (!rows.length) {
      stats.skipped_sheets.push({ sheet: sheetName, reason: "Sheet kosong" });
      continue;
    }

    const headerRowIndex = chooseHeaderRow(rows);
    const headers = rows[headerRowIndex].map(
      (v, i) => clean(v) || `Column_${i}`,
    );
    const bodyRows = rows
      .slice(headerRowIndex + 1)
      .filter((row) => row.some((v) => clean(v)));

    const nameCol = findColumn(headers, [
      "Nama Peserta",
      "Nama Lengkap",
      "Nama",
      "Peserta",
      "Employee Name",
      "Nama Karyawan",
    ]);
    const putraCol = findColumn(headers, ["Putra", "Nama Putra"]);
    const putriCol = findColumn(headers, ["Putri", "Nama Putri"]);

    const nikCol = findColumn(headers, ["NIK", "Nomor Induk Kependudukan"]);
    const externalIdCol = findColumn(headers, [
      "ID Instansi",
      "No Peserta",
      "Nomor Peserta",
      "ID Peserta",
      "NIP",
      "Employee ID",
    ]);
    const genderCol = findColumn(headers, [
      "Jenis Kelamin",
      "Gender",
      "JK",
      "L/P",
    ]);
    const vaccinationNameCol = findColumn(headers, [
      "Child Name",
      "Nama Anak",
      "Nama Child",
    ]);
    const vaccinationGenderCol = findColumn(headers, [
      "Child Gender",
      "Gender Anak",
      "Jenis Kelamin Anak",
    ]);
    const provinceCol = findColumn(headers, [
      "Provinsi",
      "Asal Provinsi",
      "Provinsi Asal",
      "Asal Daerah",
    ]);
    const provincePutraCol = findColumn(headers, [
      "Asal Provinsi Putra",
      "Provinsi Putra",
    ]);
    const provincePutriCol = findColumn(headers, [
      "Asal Provinsi Putri",
      "Provinsi Putri",
    ]);
    const serviceDateCol = findColumn(headers, [
      "Tanggal Layanan",
      "Tanggal MCU",
      "Tanggal Pemeriksaan",
      "Tanggal",
    ]);
    const examTypeCol = findColumn(headers, [
      "Jenis Pemeriksaan",
      "Jenis Layanan",
      "Pemeriksaan",
    ]);
    const doctorCol = findColumn(headers, [
      "Dokter Bertugas",
      "Dokter",
      "Nama Dokter",
    ]);
    const nurseCol = findColumn(headers, [
      "Perawat Bertugas",
      "Perawat",
      "Nama Perawat",
    ]);

    const vaccinationBatchCol = findColumn(headers, [
      "BatchName",
      "Batch Name",
      "Nama Vaksin",
      "Vaksin",
      "Produk Vaksin",
    ]);
    const vaccinationTimeAreaCol = findColumn(headers, [
      "TimeAreaName",
      "Time Area Name",
      "Lokasi Tanggal",
      "Lokasi dan Tanggal",
      "Area Waktu",
    ]);
    const vaccinationTimeNameCol = findColumn(headers, [
      "TimeName",
      "Time Name",
      "Jam",
      "Slot",
      "Slot Waktu",
      "Time Slot",
    ]);
    const vaccinationBinusianIdCol = findColumn(headers, [
      "BinusianID",
      "Binusian ID",
      "Parent Binusian ID",
      "Parent ID",
      "External ID",
      "Employee ID",
      "ID Peserta",
    ]);
    const vaccinationEmailCol = findColumn(headers, [
      "Email",
      "Email Address",
      "Alamat Email",
      "Parent Email",
    ]);
    const vaccinationPhoneCol = findColumn(headers, [
      "PhoneNumber",
      "Phone Number",
      "No HP",
      "Nomor HP",
      "Telepon",
      "Parent HP",
      "Parent Phone",
    ]);
    const vaccinationMaritalCol = findColumn(headers, [
      "MaritalStatus",
      "Marital Status",
      "Status Pernikahan",
    ]);
    const vaccinationNationalityCol = findColumn(headers, [
      "NationalityText",
      "Nationality",
      "Kewarganegaraan",
    ]);
    const vaccinationEmployeeTypeCol = findColumn(headers, [
      "TypeEmployee",
      "Type Employee",
      "Employee Type",
      "Tipe Peserta",
      "Tipe Karyawan",
    ]);

    // MCU_CORPORATE_IMPORT_MAPPING_SESSION_V466
    const corporateMappingV466 = programType === PROGRAM_CORPORATE ? (options.corporate_mapping || {}) : {};
    const mappedNameColV466 = findMappedColumn(headers, corporateMappingV466.name);
    const mappedEmployeeNikColV466 = findMappedColumn(headers, corporateMappingV466.employee_nik);
    const mappedBirthDateColV466 = findMappedColumn(headers, corporateMappingV466.birth_date);
    const mappedDepartmentColV466 = findMappedColumn(headers, corporateMappingV466.department);
    const mappedPositionColV466 = findMappedColumn(headers, corporateMappingV466.position);
    const mappedNikColV466 = findMappedColumn(headers, corporateMappingV466.nik);
    const mappedGenderColV466 = findMappedColumn(headers, corporateMappingV466.gender);
    const mappedPhoneColV466 = findMappedColumn(headers, corporateMappingV466.phone);
    const mappedLocationColV466 = findMappedColumn(headers, options.corporate_session?.location_column);

    const effectiveNameColV466 = programType === PROGRAM_CORPORATE && mappedNameColV466 >= 0 ? mappedNameColV466 : nameCol;
    const effectiveExternalIdColV466 = programType === PROGRAM_CORPORATE && mappedEmployeeNikColV466 >= 0 ? mappedEmployeeNikColV466 : externalIdCol;
    const effectiveNikColV466 = programType === PROGRAM_CORPORATE && mappedNikColV466 >= 0 ? mappedNikColV466 : nikCol;
    const effectiveGenderColV466 = programType === PROGRAM_CORPORATE && mappedGenderColV466 >= 0 ? mappedGenderColV466 : genderCol;

    stats.detected_columns.push({
      sheet: sheetName,
      header_row: headerRowIndex + 1,
      headers,
      nameCol,
      vaccinationNameCol,
      vaccinationGenderCol,
      putraCol,
      putriCol,
      provinceCol,
      vaccinationBatchCol,
      vaccinationTimeAreaCol,
      vaccinationTimeNameCol,
      corporate_mapping_v466: programType === PROGRAM_CORPORATE ? {
        name: effectiveNameColV466,
        employee_nik: effectiveExternalIdColV466,
        birth_date: mappedBirthDateColV466,
        department: mappedDepartmentColV466,
        position: mappedPositionColV466,
        nik: effectiveNikColV466,
        gender: effectiveGenderColV466,
        phone: mappedPhoneColV466,
        location: mappedLocationColV466,
      } : null,
    });

    if (
      effectiveNameColV466 < 0 &&
      putraCol < 0 &&
      putriCol < 0 &&
      !(programType === PROGRAM_VACCINATION && vaccinationNameCol >= 0)
    ) {
      stats.skipped_sheets.push({
        sheet: sheetName,
        reason: "Tidak ada kolom nama peserta / putra / putri",
      });
      continue;
    }

    for (const row of bodyRows) {
      stats.rows_read += 1;

      const serviceDate =
        serviceDateCol >= 0 ? parseDateValue(row[serviceDateCol]) : "";
      const year = serviceDate
        ? String(serviceDate).slice(0, 4)
        : String(new Date().getFullYear());

      if (!counterByYear.has(year)) {
        counterByYear.set(
          year,
          await nextMcuCounter(supabase, year, prefixBase),
        );
      }

      const makeMcuId = () => {
        const n = counterByYear.get(year)!;
        counterByYear.set(year, n + 1);
        return `${prefixBase}-${year}-${String(n).padStart(4, "0")}`;
      };

      const vaccinationTimeArea =
        vaccinationTimeAreaCol >= 0 ? clean(row[vaccinationTimeAreaCol]) : "";
      const parsedVaccinationArea =
        parseVaccinationTimeArea(vaccinationTimeArea);
      const vaccinationTimeSlot =
        vaccinationTimeNameCol >= 0 ? clean(row[vaccinationTimeNameCol]) : "";
      const vaccinationBatchName =
        vaccinationBatchCol >= 0 ? clean(row[vaccinationBatchCol]) : "";

      const base = {
        external_id:
          programType === PROGRAM_VACCINATION && vaccinationBinusianIdCol >= 0
            ? clean(row[vaccinationBinusianIdCol])
            : effectiveExternalIdColV466 >= 0
              ? clean(row[effectiveExternalIdColV466])
              : "",
        nik: effectiveNikColV466 >= 0 ? clean(row[effectiveNikColV466]) : "",
        birth_date: mappedBirthDateColV466 >= 0 ? parseDateValue(row[mappedBirthDateColV466]) : "",
        department: mappedDepartmentColV466 >= 0 ? clean(row[mappedDepartmentColV466]) : "",
        position: mappedPositionColV466 >= 0 ? clean(row[mappedPositionColV466]) : "",
        phone: mappedPhoneColV466 >= 0 ? clean(row[mappedPhoneColV466]) : "",
        mapped_location:
          programType === PROGRAM_CORPORATE
            ? String(options.corporate_session?.location_mode || "session") === "column" && mappedLocationColV466 >= 0
              ? clean(row[mappedLocationColV466])
              : String(options.corporate_session?.location_mode || "session") === "fixed"
                ? clean(options.corporate_session?.location_value)
                : corporateSessionLocationV466(corporateSessionRowV466)
            : "",
        raw_json_v466: programType === PROGRAM_CORPORATE
          ? Object.fromEntries(headers.map((header, idx) => [header, row[idx] ?? ""]))
          : null,
        service_date:
          programType === PROGRAM_VACCINATION && parsedVaccinationArea.session_date
            ? parsedVaccinationArea.session_date
            : programType === PROGRAM_CORPORATE && corporateSessionDateV466(corporateSessionRowV466)
              ? corporateSessionDateV466(corporateSessionRowV466)
              : serviceDate,
        mcu_date:
          programType === PROGRAM_VACCINATION && parsedVaccinationArea.session_date
            ? parsedVaccinationArea.session_date
            : programType === PROGRAM_CORPORATE && corporateSessionDateV466(corporateSessionRowV466)
              ? corporateSessionDateV466(corporateSessionRowV466)
              : serviceDate,
        exam_type:
          programType === PROGRAM_VACCINATION && vaccinationBatchName
            ? vaccinationBatchName
            : examTypeCol >= 0
              ? clean(row[examTypeCol])
              : "",
        doctor_assigned: doctorCol >= 0 ? clean(row[doctorCol]) : "",
        nurse_assigned: nurseCol >= 0 ? clean(row[nurseCol]) : "",
        vaccination_meta:
          programType === PROGRAM_VACCINATION
            ? {
                batch_name: vaccinationBatchName,
                time_area_name: vaccinationTimeArea,
                time_name: vaccinationTimeSlot,
                location_name: parsedVaccinationArea.location_name,
                session_date: parsedVaccinationArea.session_date,
                time_slot: vaccinationTimeSlot || "Belum ditentukan",
                email:
                  vaccinationEmailCol >= 0
                    ? clean(row[vaccinationEmailCol])
                    : "",
                phone:
                  vaccinationPhoneCol >= 0
                    ? clean(row[vaccinationPhoneCol])
                    : "",
                marital_status:
                  vaccinationMaritalCol >= 0
                    ? clean(row[vaccinationMaritalCol])
                    : "",
                nationality_text:
                  vaccinationNationalityCol >= 0
                    ? clean(row[vaccinationNationalityCol])
                    : "",
                employee_type:
                  vaccinationEmployeeTypeCol >= 0
                    ? clean(row[vaccinationEmployeeTypeCol])
                    : "",
                raw_json: Object.fromEntries(
                  headers.map((header, idx) => [header, row[idx] ?? ""]),
                ),
              }
            : null,
      };

      const candidates: { name: string; gender: string; province: string }[] =
        [];

      const vaccinationPrimaryName =
        programType === PROGRAM_VACCINATION &&
        vaccinationNameCol >= 0 &&
        clean(row[vaccinationNameCol])
          ? clean(row[vaccinationNameCol])
          : "";

      const primaryName =
        vaccinationPrimaryName ||
        (effectiveNameColV466 >= 0 && clean(row[effectiveNameColV466]) ? clean(row[effectiveNameColV466]) : "");

      // v168:
      // Prefer a real name column when it exists.
      // Older logic pushed both Putra and Putri for CAPASKA before checking Nama,
      // so consolidated files with Putra + Putri helper columns could import 2x rows.
      if (primaryName) {
        candidates.push({
          name: primaryName,
          gender:
            programType === PROGRAM_VACCINATION
              ? normalizeVaccinationGender(
                  vaccinationGenderCol >= 0
                    ? row[vaccinationGenderCol]
                    : genderCol >= 0
                      ? row[genderCol]
                      : "",
                )
              : effectiveGenderColV466 >= 0
                ? clean(row[effectiveGenderColV466])
                : "",
          province:
            programType === PROGRAM_VACCINATION
              ? parsedVaccinationArea.location_name
              : provinceCol >= 0
                ? clean(row[provinceCol])
                : "",
        });
      } else {
        if (
          programType === PROGRAM_CAPASKA &&
          putraCol >= 0 &&
          clean(row[putraCol])
        ) {
          candidates.push({
            name: clean(row[putraCol]),
            gender: "Laki-laki",
            province:
              provincePutraCol >= 0
                ? clean(row[provincePutraCol])
                : provinceCol >= 0
                  ? clean(row[provinceCol])
                  : "",
          });
        }

        if (
          programType === PROGRAM_CAPASKA &&
          putriCol >= 0 &&
          clean(row[putriCol])
        ) {
          candidates.push({
            name: clean(row[putriCol]),
            gender: "Perempuan",
            province:
              provincePutriCol >= 0
                ? clean(row[provincePutriCol])
                : provinceCol >= 0
                  ? clean(row[provinceCol])
                  : "",
          });
        }
      }

      if (!candidates.length) {
        stats.participants_skipped += 1;
        if (stats.skipped_rows.length < 50)
          stats.skipped_rows.push({ sheet: sheetName, row });
        continue;
      }

      for (const candidate of candidates) {
        const dedupeKeyV168 = importParticipantDedupeKeyV168({
          ...candidate,
          nik: base.nik,
          external_id: base.external_id,
        });

        const existingKeysV214 = participantKeyVariantsAppendOnlyV214({
          ...candidate,
          nik: base.nik,
          external_id: base.external_id,
        });

        if (existingKeysV214.some((key) => existingParticipantKeysAppendOnlyV214.has(key))) {
          // MCU_CORPORATE_EXISTING_MERGE_SESSION_V491
          // Re-importing an existing Corporate database must still refresh its mapping
          // and bind the participant to the explicitly selected Session. Session itself
          // never determines or mutates package_id; package remains the explicit Import choice.
          if (programType === PROGRAM_CORPORATE) {
            let existingQueryV491 = supabase
              .from("participants")
              .select("id")
              .eq("company_id", companyId);
            if (base.external_id) {
              existingQueryV491 = existingQueryV491.eq("external_id", base.external_id);
            } else {
              existingQueryV491 = existingQueryV491.ilike("name", candidate.name);
            }
            const existingResultV491 = await existingQueryV491.limit(2);
            if (existingResultV491.error) throw existingResultV491.error;
            const matchesV491 = existingResultV491.data || [];
            if (matchesV491.length === 1) {
              const participantIdV491 = Number(matchesV491[0].id || 0);
              const coreUpdateV491 = await supabase.from("participants").update({
                source_id: sourceId,
                company_id: companyId,
                package_id: packageId,
                external_id: base.external_id || null,
                nik: base.nik || null,
                birth_date: base.birth_date || null,
              }).eq("id", participantIdV491);
              if (coreUpdateV491.error) throw coreUpdateV491.error;

              const optionalFieldsV491: Array<[string, any]> = [
                ["employee_nik", base.external_id || null],
                ["department", base.department || null],
                ["position", base.position || null],
                ["phone", base.phone || null],
              ];
              for (const [fieldV491, valueV491] of optionalFieldsV491) {
                if (valueV491 === null || valueV491 === "") continue;
                const optionalUpdateV491 = await supabase.from("participants").update({ [fieldV491]: valueV491 }).eq("id", participantIdV491);
                if (optionalUpdateV491.error && !schemaColumnMissingV466(optionalUpdateV491.error)) throw optionalUpdateV491.error;
              }

              if (corporateSessionRowV466?.id) {
                const assignmentV491 = await supabase
                  .from("mcu_participant_session_assignments")
                  .upsert({
                    participant_id: participantIdV491,
                    queue_session_id: Number(corporateSessionRowV466.id),
                    source_id: sourceId,
                    location_name: base.mapped_location || corporateSessionLocationV466(corporateSessionRowV466) || null,
                    session_date: corporateSessionDateV466(corporateSessionRowV466) || null,
                    department: base.department || null,
                    position: base.position || null,
                    raw_json: base.raw_json_v466 || {},
                    updated_at: new Date().toISOString(),
                  }, { onConflict: "participant_id,queue_session_id" });
                if (assignmentV491.error) throw assignmentV491.error;
                stats.corporate_session_assignments_v466 += 1;
              }
              stats.participants_updated += 1;
              continue;
            }
          }
          stats.existing_participants_skipped += 1;
          stats.participants_skipped += 1;
          if (stats.skipped_rows.length < 50) {
            stats.skipped_rows.push({
              sheet: sheetName,
              reason: "existing_participant_append_only_v214",
              name: candidate.name,
              gender: candidate.gender,
              province: candidate.province,
            });
          }
          continue;
        }

        if (seenImportParticipantKeysV168.has(dedupeKeyV168)) {
          stats.duplicate_candidates_skipped += 1;
          stats.participants_skipped += 1;
          if (stats.skipped_rows.length < 50) {
            stats.skipped_rows.push({
              sheet: sheetName,
              reason: "duplicate_in_import_v168",
              name: candidate.name,
              gender: candidate.gender,
              province: candidate.province,
            });
          }
          continue;
        }

        seenImportParticipantKeysV168.add(dedupeKeyV168);

        if (programType === PROGRAM_CAPASKA) {
          const existingParticipant = await findCapaskaExistingParticipantForMergeV228(supabase, {
            source_id: sourceId,
            candidate,
            nik: base.nik,
            external_id: base.external_id,
          });

          if (existingParticipant?.id) {
            await updateCapaskaExistingParticipantForMergeV228(supabase, existingParticipant.id, {
              external_id: base.external_id,
              nik: base.nik,
              name: candidate.name,
              gender: candidate.gender,
              province: candidate.province,
              company_id: companyId,
              package_id: packageId,
              source_id: sourceId,
              service_date: base.service_date,
              mcu_date: base.mcu_date,
              exam_type: base.exam_type,
              doctor_assigned: base.doctor_assigned,
              nurse_assigned: base.nurse_assigned,
            });
            stats.participants_updated += 1;
            continue;
          }
        }

        const mcuId = makeMcuId();

        insertRows.push({
          mcu_id: mcuId,
          barcode_value: mcuId,
          // LABEL_PRINT_DEFAULT_FIELDS_V216: data baru import belum pernah diprint label.
          barcode_image_path: null,
          barcode_created_at: null,
          external_id: base.external_id,
          name: candidate.name,
          nik: base.nik,
          gender: candidate.gender,
          birth_date: base.birth_date || "",
          company_id: companyId,
          package_id: packageId,
          mcu_date: base.mcu_date,
          program_type: programType,
          source_id: sourceId,
          province: candidate.province,
          service_date: base.service_date,
          exam_type: base.exam_type,
          doctor_assigned: base.doctor_assigned,
          nurse_assigned: base.nurse_assigned,
          __corporate_import: programType === PROGRAM_CORPORATE
            ? {
                employee_nik: base.external_id || "",
                department: base.department || "",
                position: base.position || "",
                phone: base.phone || "",
                location_name: base.mapped_location || corporateSessionLocationV466(corporateSessionRowV466),
                session_date: corporateSessionDateV466(corporateSessionRowV466),
                queue_session_id: Number(corporateSessionRowV466?.id || 0),
                raw_json: base.raw_json_v466 || {},
              }
            : null,
          __vaccination_import: base.vaccination_meta
            ? {
                ...base.vaccination_meta,
                source_id: sourceId,
                mcu_id: mcuId,
                external_id: base.external_id,
                participant_name: candidate.name,
                nik: base.nik,
                gender: candidate.gender,
                import_location_key: makeImportLocationKey(
                  sourceId,
                  base.vaccination_meta.location_name,
                  base.vaccination_meta.session_date,
                  base.vaccination_meta.time_slot,
                ),
              }
            : null,
        });
      }
    }
  }

  const chunkSize = 500;

  const vaccinationImportRows: any[] = [];

  for (let i = 0; i < insertRows.length; i += chunkSize) {
    const chunk = insertRows.slice(i, i + chunkSize);
    const participantRows = chunk.map((row) => {
      const { __vaccination_import, __corporate_import, ...participant } = row;
      return participant;
    });

    if (programType === PROGRAM_VACCINATION) {
      const { data, error } = await supabase
        .from("participants")
        .insert(participantRows)
        .select("id,mcu_id,external_id,name,nik,gender,source_id");

      if (error) throw error;

      (data || []).forEach((inserted: any, idx: number) => {
        const meta = chunk[idx]?.__vaccination_import;
        if (!meta) return;
        vaccinationImportRows.push({
          source_id: sourceId,
          participant_id: inserted.id,
          mcu_id: inserted.mcu_id || meta.mcu_id,
          external_id: inserted.external_id || meta.external_id,
          participant_name: inserted.name || meta.participant_name,
          nik: inserted.nik || meta.nik || null,
          gender: inserted.gender || meta.gender || null,
          batch_name: meta.batch_name || null,
          time_area_name: meta.time_area_name || null,
          time_name: meta.time_name || null,
          location_name: meta.location_name || null,
          session_date: meta.session_date || null,
          time_slot: meta.time_slot || null,
          import_location_key: meta.import_location_key || null,
          email: meta.email || null,
          phone: meta.phone || null,
          marital_status: meta.marital_status || null,
          nationality_text: meta.nationality_text || null,
          employee_type: meta.employee_type || null,
          raw_json: meta.raw_json || null,
        });
      });

      // LABEL_PRINT_MARK_VACCINATION_V216
      await markInsertedParticipantsLabelUnprintedV216(supabase, (data || []).map((p: any) => Number(p.id)));
      stats.participants_created += data?.length || 0;
    } else {
      const { data, error } = await supabase
        .from("participants")
        .insert(participantRows)
        .select("id");
      if (error) throw error;

      const insertedRows = data || [];

      if (programType === PROGRAM_CORPORATE && insertedRows.length) {
        for (let idx = 0; idx < insertedRows.length; idx += 1) {
          const participantId = Number(insertedRows[idx]?.id || 0);
          const meta = chunk[idx]?.__corporate_import || {};
          if (!participantId) continue;

          // Optional participant profile columns were introduced in later MCU versions.
          // Update each field independently so older schemas keep importing safely.
          const optionalParticipantFields: Array<[string, any]> = [
            ["employee_nik", meta.employee_nik || null],
            ["department", meta.department || null],
            ["position", meta.position || null],
            ["phone", meta.phone || null],
          ];
          for (const [field, value] of optionalParticipantFields) {
            if (value === null || value === "") continue;
            const updateResult = await supabase.from("participants").update({ [field]: value }).eq("id", participantId);
            if (updateResult.error && !schemaColumnMissingV466(updateResult.error)) throw updateResult.error;
          }

          if (Number(meta.queue_session_id || 0) > 0) {
            const assignmentResult = await supabase
              .from("mcu_participant_session_assignments")
              .upsert({
                participant_id: participantId,
                queue_session_id: Number(meta.queue_session_id),
                source_id: sourceId,
                location_name: meta.location_name || null,
                session_date: meta.session_date || null,
                department: meta.department || null,
                position: meta.position || null,
                raw_json: meta.raw_json || {},
                updated_at: new Date().toISOString(),
              }, { onConflict: "participant_id,queue_session_id" });
            if (assignmentResult.error) throw assignmentResult.error;
            stats.corporate_session_assignments_v466 += 1;
          }
        }
      }

      // LABEL_PRINT_MARK_NON_VACCINATION_V216
      await markInsertedParticipantsLabelUnprintedV216(supabase, insertedRows.map((p: any) => Number(p.id)));
      stats.participants_created += insertedRows.length || chunk.length;
    }
  }

  if (programType === PROGRAM_VACCINATION && vaccinationImportRows.length) {
    for (let i = 0; i < vaccinationImportRows.length; i += chunkSize) {
      const chunk = vaccinationImportRows.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("vaccination_import_rows")
        .insert(chunk);
      if (error) throw error;
    }

    const groupedLocations = new Map<string, any>();
    for (const row of vaccinationImportRows) {
      const key =
        row.import_location_key ||
        `${row.location_name}|${row.session_date}|${row.time_slot}`;
      if (!groupedLocations.has(key)) {
        groupedLocations.set(key, {
          key,
          location_name: row.location_name || "Lokasi belum ditentukan",
          session_date: row.session_date || "",
          time_slot: row.time_slot || "Belum ditentukan",
          batch_name: row.batch_name || "",
          participant_count: 0,
        });
      }
      groupedLocations.get(key).participant_count += 1;
    }

    stats.vaccination_locations = Array.from(groupedLocations.values());
    stats.vaccination_location_count = groupedLocations.size;
  }

  stats.import_mode = programType === PROGRAM_CAPASKA ? "merge_existing_by_nik_external_or_name_gender_province" : "insert_new";
  stats.barcode_generation_mode = "on_demand";
  stats.barcodes_ready = 0;

  return stats;
}
