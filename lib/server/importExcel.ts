import * as XLSX from "xlsx";
import { PROGRAM_CAPASKA } from "@/lib/shared/constants";
import { mapAllCapaskaPackages, seedDefaults } from "@/lib/server/defaults";

function clean(value: any) {
  return String(value ?? "").trim();
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
    const partial = normalized.findIndex((h) => h.includes(candidate) || candidate.includes(h));
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
    "asal provinsi",
    "jenis kelamin",
    "nik"
  ];

  let best = 0;
  let bestScore = -1;

  rows.slice(0, 20).forEach((row, idx) => {
    const values = row.map(norm);
    const score = values.reduce((acc, v) => acc + (known.some((k) => v.includes(k)) ? 1 : 0), 0);
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
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return asString;
}

async function getOrCreateCompany(supabase: any, name: string) {
  const cleanName = clean(name) || "BPIP / CAPASKA";

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

async function getOrCreatePackage(supabase: any, name: string, companyId: number) {
  const cleanName = clean(name) || "CAPASKA 2025/2026";

  const { data: existing, error: selectError } = await supabase
    .from("packages")
    .select("id")
    .ilike("name", cleanName)
    .eq("program_type", PROGRAM_CAPASKA)
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
      program_type: PROGRAM_CAPASKA
    })
    .select("id")
    .single();

  if (error) throw error;

  await mapAllCapaskaPackages(supabase);

  return data.id as number;
}

async function nextMcuCounter(supabase: any, year: string) {
  const prefix = `CAPASKA-${year}`;

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
  }
) {
  await seedDefaults(supabase);

  const companyId = await getOrCreateCompany(supabase, options.company_name || options.institution_name);
  const packageId = await getOrCreatePackage(supabase, options.package_name, companyId);

  const { data: source, error: sourceError } = await supabase
    .from("participant_sources")
    .insert({
      name: options.database_name,
      institution_name: options.institution_name || options.company_name,
      program_type: PROGRAM_CAPASKA,
      description: options.description || "",
      uploaded_filename: "upload.xlsx"
    })
    .select("id")
    .single();

  if (sourceError) throw sourceError;

  const sourceId = source.id as number;
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });

  const stats: any = {
    source_id: sourceId,
    rows_read: 0,
    participants_created: 0,
    participants_skipped: 0,
    skipped_rows: [],
    detected_columns: [],
    skipped_sheets: []
  };

  const insertRows: any[] = [];
  const counterByYear = new Map<string, number>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];

    if (!rows.length) {
      stats.skipped_sheets.push({ sheet: sheetName, reason: "Sheet kosong" });
      continue;
    }

    const headerRowIndex = chooseHeaderRow(rows);
    const headers = rows[headerRowIndex].map((v, i) => clean(v) || `Column_${i}`);
    const bodyRows = rows.slice(headerRowIndex + 1).filter((row) => row.some((v) => clean(v)));

    const nameCol = findColumn(headers, ["Nama Peserta", "Nama Lengkap", "Nama", "Peserta"]);
    const putraCol = findColumn(headers, ["Putra", "Nama Putra"]);
    const putriCol = findColumn(headers, ["Putri", "Nama Putri"]);

    const nikCol = findColumn(headers, ["NIK", "Nomor Induk Kependudukan"]);
    const externalIdCol = findColumn(headers, ["ID Instansi", "No Peserta", "Nomor Peserta", "ID Peserta"]);
    const genderCol = findColumn(headers, ["Jenis Kelamin", "Gender", "JK", "L/P"]);
    const provinceCol = findColumn(headers, ["Provinsi", "Asal Provinsi", "Provinsi Asal", "Asal Daerah"]);
    const provincePutraCol = findColumn(headers, ["Asal Provinsi Putra", "Provinsi Putra"]);
    const provincePutriCol = findColumn(headers, ["Asal Provinsi Putri", "Provinsi Putri"]);
    const serviceDateCol = findColumn(headers, ["Tanggal Layanan", "Tanggal MCU", "Tanggal Pemeriksaan", "Tanggal"]);
    const examTypeCol = findColumn(headers, ["Jenis Pemeriksaan", "Jenis Layanan", "Pemeriksaan"]);
    const doctorCol = findColumn(headers, ["Dokter Bertugas", "Dokter", "Nama Dokter"]);
    const nurseCol = findColumn(headers, ["Perawat Bertugas", "Perawat", "Nama Perawat"]);

    stats.detected_columns.push({
      sheet: sheetName,
      header_row: headerRowIndex + 1,
      headers,
      nameCol,
      putraCol,
      putriCol,
      provinceCol
    });

    if (nameCol < 0 && putraCol < 0 && putriCol < 0) {
      stats.skipped_sheets.push({ sheet: sheetName, reason: "Tidak ada kolom nama peserta / putra / putri" });
      continue;
    }

    for (const row of bodyRows) {
      stats.rows_read += 1;

      const serviceDate = serviceDateCol >= 0 ? parseDateValue(row[serviceDateCol]) : "";
      const year = serviceDate ? String(serviceDate).slice(0, 4) : String(new Date().getFullYear());

      if (!counterByYear.has(year)) {
        counterByYear.set(year, await nextMcuCounter(supabase, year));
      }

      const makeMcuId = () => {
        const n = counterByYear.get(year)!;
        counterByYear.set(year, n + 1);
        return `CAPASKA-${year}-${String(n).padStart(4, "0")}`;
      };

      const base = {
        external_id: externalIdCol >= 0 ? clean(row[externalIdCol]) : "",
        nik: nikCol >= 0 ? clean(row[nikCol]) : "",
        service_date: serviceDate,
        mcu_date: serviceDate,
        exam_type: examTypeCol >= 0 ? clean(row[examTypeCol]) : "",
        doctor_assigned: doctorCol >= 0 ? clean(row[doctorCol]) : "",
        nurse_assigned: nurseCol >= 0 ? clean(row[nurseCol]) : ""
      };

      const candidates: { name: string; gender: string; province: string }[] = [];

      if (putraCol >= 0 && clean(row[putraCol])) {
        candidates.push({
          name: clean(row[putraCol]),
          gender: "Laki-laki",
          province: provincePutraCol >= 0 ? clean(row[provincePutraCol]) : provinceCol >= 0 ? clean(row[provinceCol]) : ""
        });
      }

      if (putriCol >= 0 && clean(row[putriCol])) {
        candidates.push({
          name: clean(row[putriCol]),
          gender: "Perempuan",
          province: provincePutriCol >= 0 ? clean(row[provincePutriCol]) : provinceCol >= 0 ? clean(row[provinceCol]) : ""
        });
      }

      if (!candidates.length && nameCol >= 0 && clean(row[nameCol])) {
        candidates.push({
          name: clean(row[nameCol]),
          gender: genderCol >= 0 ? clean(row[genderCol]) : "",
          province: provinceCol >= 0 ? clean(row[provinceCol]) : ""
        });
      }

      if (!candidates.length) {
        stats.participants_skipped += 1;
        if (stats.skipped_rows.length < 50) stats.skipped_rows.push({ sheet: sheetName, row: row });
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
          program_type: PROGRAM_CAPASKA,
          source_id: sourceId,
          province: candidate.province,
          service_date: base.service_date,
          exam_type: base.exam_type,
          doctor_assigned: base.doctor_assigned,
          nurse_assigned: base.nurse_assigned
        });
      }
    }
  }

  const chunkSize = 500;

  for (let i = 0; i < insertRows.length; i += chunkSize) {
    const chunk = insertRows.slice(i, i + chunkSize);
    const { error } = await supabase.from("participants").insert(chunk);
    if (error) throw error;
    stats.participants_created += chunk.length;
  }

  stats.barcode_generation_mode = "on_demand";
  stats.barcodes_ready = 0;

  return stats;
}
