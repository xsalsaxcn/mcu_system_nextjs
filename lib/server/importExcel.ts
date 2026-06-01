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

function chooseHeaderRow(rows: any[][]) {
  const known = [
    "nama",
    "nama peserta",
    "nama lengkap",
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

  const { data: source, error: sourceError } = await supabase
    .from("participant_sources")
    .insert({
      name: options.database_name,
      institution_name: options.institution_name || options.company_name,
      program_type: programType,
      description: options.description || "",
      uploaded_filename: "upload.xlsx",
    })
    .select("id")
    .single();

  if (sourceError) throw sourceError;

  const sourceId = source.id as number;
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });

  const stats: any = {
    source_id: sourceId,
    program_type: programType,
    rows_read: 0,
    participants_created: 0,
    participants_skipped: 0,
    skipped_rows: [],
    detected_columns: [],
    skipped_sheets: [],
  };

  const insertRows: any[] = [];
  const counterByYear = new Map<string, number>();

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
      "External ID",
      "Employee ID",
      "ID Peserta",
    ]);
    const vaccinationEmailCol = findColumn(headers, [
      "Email",
      "Email Address",
      "Alamat Email",
    ]);
    const vaccinationPhoneCol = findColumn(headers, [
      "PhoneNumber",
      "Phone Number",
      "No HP",
      "Nomor HP",
      "Telepon",
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

    stats.detected_columns.push({
      sheet: sheetName,
      header_row: headerRowIndex + 1,
      headers,
      nameCol,
      putraCol,
      putriCol,
      provinceCol,
      vaccinationBatchCol,
      vaccinationTimeAreaCol,
      vaccinationTimeNameCol,
    });

    if (nameCol < 0 && putraCol < 0 && putriCol < 0) {
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
            : externalIdCol >= 0
              ? clean(row[externalIdCol])
              : "",
        nik: nikCol >= 0 ? clean(row[nikCol]) : "",
        service_date:
          programType === PROGRAM_VACCINATION &&
          parsedVaccinationArea.session_date
            ? parsedVaccinationArea.session_date
            : serviceDate,
        mcu_date:
          programType === PROGRAM_VACCINATION &&
          parsedVaccinationArea.session_date
            ? parsedVaccinationArea.session_date
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

      if (!candidates.length && nameCol >= 0 && clean(row[nameCol])) {
        candidates.push({
          name: clean(row[nameCol]),
          gender:
            programType === PROGRAM_VACCINATION
              ? normalizeVaccinationGender(genderCol >= 0 ? row[genderCol] : "")
              : genderCol >= 0
                ? clean(row[genderCol])
                : "",
          province:
            programType === PROGRAM_VACCINATION
              ? parsedVaccinationArea.location_name
              : provinceCol >= 0
                ? clean(row[provinceCol])
                : "",
        });
      }

      if (!candidates.length) {
        stats.participants_skipped += 1;
        if (stats.skipped_rows.length < 50)
          stats.skipped_rows.push({ sheet: sheetName, row });
        continue;
      }

      for (const candidate of candidates) {
        const mcuId = makeMcuId();

        insertRows.push({
          mcu_id: mcuId,
          barcode_value: mcuId,
          external_id: base.external_id,
          name: candidate.name,
          nik: base.nik,
          gender: candidate.gender,
          birth_date: "",
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
      const { __vaccination_import, ...participant } = row;
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

      stats.participants_created += data?.length || 0;
    } else {
      const { error } = await supabase
        .from("participants")
        .insert(participantRows);
      if (error) throw error;
      stats.participants_created += chunk.length;
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

  stats.barcode_generation_mode = "on_demand";
  stats.barcodes_ready = 0;

  return stats;
}
