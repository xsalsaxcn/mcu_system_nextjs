import * as XLSX from "xlsx";
import {
  historyDateOnly,
  historyEmailKey,
  historyIdentityKey,
  historyNameKey,
  historyPhone,
  historyServiceCategory,
  historyText,
  historyYear,
} from "@/lib/vaccination/history";

export type VaccinationHistoryRow = {
  sourceRow: number;
  participantType: "EMPLOYEE" | "DEPENDENT";
  participantName: string;
  employeeId: string;
  nik: string;
  email: string;
  phone: string;
  birthDate: string | null;
  gender: string;
  parentName: string;
  parentEmployeeId: string;
  parentNik: string;
  parentEmail: string;
  parentPhone: string;
  serviceDate: string | null;
  serviceName: string;
  productBrand: string;
  location: string;
  nextDueDate: string | null;
  notes: string;
  serviceCategory: string;
  sourceYear: number | null;
  identityOnly: boolean;
  raw: Record<string, any>;
};

export type VaccinationHistoryParseResult = {
  template: string;
  sheetName: string;
  rows: VaccinationHistoryRow[];
  warnings: string[];
  headers: string[];
};

export type VaccinationHistoryColumnMapping = Partial<Record<
  | "participantType"
  | "participantName"
  | "employeeId"
  | "nik"
  | "email"
  | "phone"
  | "birthDate"
  | "gender"
  | "parentName"
  | "parentEmployeeId"
  | "parentNik"
  | "parentEmail"
  | "parentPhone"
  | "serviceDate"
  | "serviceName"
  | "productBrand"
  | "location"
  | "nextDueDate"
  | "notes",
  string
>>;

export type VaccinationHistoryWorkbookInspection = {
  template: string;
  sheetName: string;
  headers: string[];
  suggestedMapping: VaccinationHistoryColumnMapping;
  suggestedDefaultParticipantType: "EMPLOYEE" | "DEPENDENT";
};

function key(value: unknown) {
  return historyText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function mapHeaders(row: any[]) {
  const map = new Map<string, number>();
  row.forEach((value, index) => {
    const k = key(value);
    if (k) map.set(k, index);
  });
  return map;
}

function value(row: any[], headers: Map<string, number>, aliases: string[]) {
  for (const alias of aliases) {
    const index = headers.get(key(alias));
    if (index != null) return row[index];
  }
  return "";
}

const MAPPING_ALIASES: Record<keyof VaccinationHistoryColumnMapping, string[]> = {
  participantType: ["Kategori", "Participant Type", "Jenis Peserta", "Category", "Type"],
  participantName: ["Nama", "NAMA", "Name", "Title", "ChildName", "Participant Name", "Nama Peserta", "Employee Name", "Patient Name"],
  employeeId: ["NIP", "Employee ID", "EmployeeId", "BINUSIAN ID", "BinusianID", "Staff ID", "ID Karyawan"],
  nik: ["NIK", "No NIK", "Nomor NIK", "KTP", "NIK/KTP"],
  email: ["Email", "EMAIL", "Email Peserta", "Email Address", "E-mail"],
  phone: ["No. Telp", "NO. TELP", "No Telp", "Phone", "PhoneNumber", "NoHp", "No HP", "Mobile"],
  birthDate: ["Tanggal Lahir", "Birth of Date", "DOB", "Birth Date", "Tanggallahir", "Date of Birth"],
  gender: ["Gender", "Jenis Kelamin", "Sex", "ChildGender"],
  parentName: ["ParentName", "Nama Orang Tua", "Parent Name", "Nama Parent", "Nama Wali"],
  parentEmployeeId: ["ParentBinusianID", "Parent NIP", "Parent Employee ID", "Parent ID", "NIP Orang Tua"],
  parentNik: ["Parent NIK", "NIK Parent", "NIK Orang Tua", "NIK Wali"],
  parentEmail: ["ParentEmail", "Parent Email", "Email Parent", "Email Orang Tua", "Email Wali"],
  parentPhone: ["ParentHP", "Parent Phone", "No HP Parent", "HP Orang Tua", "Phone Parent"],
  serviceDate: ["Tanggal Suntik", "TANGGAL SUNTIK", "Tanggal Vaksin", "Tanggalvaksin", "Tanggal Layanan", "Service Date", "Date", "TimeAreaName"],
  serviceName: ["Jenis Layanan", "JENIS LAYANAN", "Jenis Vaksin", "Jenis vaksin", "Layanan", "Service", "Service Name", "BatchName", "Benefit"],
  productBrand: ["Merk Layanan", "MERK LAYANAN", "Merk", "Brand", "Product Brand", "Vaccine Brand"],
  location: ["Lokasi Vaksin", "LOKASI VAKSIN", "Lokasi", "Location", "TimeAreaName", "Site", "Venue"],
  nextDueDate: ["Jadwal Selanjutnya", "JADWAL SELANJUTNYA", "Next Schedule", "Next Due Date", "Next Dose", "Next Date"],
  notes: ["Keterangan", "KETERANGAN", "Notes", "Note", "Remark", "Remarks", "Keterangan pembayaran", "Employee Type", "ChildAge"],
};

function mappedValue(
  row: any[],
  headers: Map<string, number>,
  mapping: VaccinationHistoryColumnMapping | undefined,
  field: keyof VaccinationHistoryColumnMapping,
  aliases?: string[],
) {
  const mappedHeader = historyText(mapping?.[field]);
  if (mappedHeader) {
    const mappedIndex = headers.get(key(mappedHeader));
    if (mappedIndex != null) return row[mappedIndex];
  }
  return value(row, headers, aliases || MAPPING_ALIASES[field] || []);
}

function hasManualMapping(mapping?: VaccinationHistoryColumnMapping) {
  return Boolean(mapping && Object.values(mapping).some((item) => historyText(item)));
}

export function suggestVaccinationHistoryMapping(headers: string[]) {
  const byKey = new Map<string, string>();
  for (const header of headers) {
    const normalized = key(header);
    if (normalized && !byKey.has(normalized)) byKey.set(normalized, header);
  }
  const mapping: VaccinationHistoryColumnMapping = {};
  for (const [field, aliases] of Object.entries(MAPPING_ALIASES) as Array<[keyof VaccinationHistoryColumnMapping, string[]]>) {
    for (const alias of aliases) {
      const header = byKey.get(key(alias));
      if (header) {
        mapping[field] = header;
        break;
      }
    }
  }
  return mapping;
}

function detect(headers: string[]) {
  const set = new Set(headers.map(key));
  const has = (...names: string[]) => names.every((name) => set.has(key(name)));
  if (has("ParentBinusianID", "ParentName", "ChildName", "BatchName")) return "BINUS_CHILD_2024";
  if (has("BINUSIAN ID", "NAMA", "KATEGORI", "TANGGAL SUNTIK", "JENIS LAYANAN")) return "BINUS_REKAP_2025";
  if (has("Title", "NIP", "Tanggalvaksin", "Jenis vaksin", "Email")) return "BINUS_DENGUE_2023";
  if (has("Name", "Jenis vaksin", "TimeAreaName", "NIP", "Email")) return "BINUS_2022";
  if (has("Name", "Gender", "Email", "PhoneNumber", "Invoice")) return "BINUS_ADULT_2024_IDENTITY";
  return "GENERIC";
}

function worksheetDataRange(sheet: XLSX.WorkSheet) {
  let maxRow = 0;
  let maxCol = 0;
  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;
    const cell = sheet[address];
    if (!cell || cell.v == null || String(cell.v).trim() === "") continue;
    const decoded = XLSX.utils.decode_cell(address);
    if (decoded.r > maxRow) maxRow = decoded.r;
    if (decoded.c > maxCol) maxCol = decoded.c;
  }
  return { s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } };
}

function sheetRows(sheet: XLSX.WorkSheet) {
  const range = worksheetDataRange(sheet);
  return XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
    range,
  });
}

function locationWithoutDate(value: unknown) {
  const text = historyText(value);
  if (!text) return "";
  return text
    .replace(/\s+-\s+(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+\d{1,2}\s+[a-z]+\s+\d{4}.*$/i, "")
    .replace(/\s+-\s+\d{1,2}\s+[a-z]+\s+\d{4}.*$/i, "")
    .trim();
}

function sourceYearFromDate(date: string | null, fallback?: number | null) {
  if (date) return Number(date.slice(0, 4));
  return historyYear(fallback);
}

function rowGeneric(row: any[], h: Map<string, number>, rowNo: number, fallbackYear?: number | null): VaccinationHistoryRow | null {
  const participantName = historyText(value(row, h, ["Nama", "Name", "Participant Name", "Nama Peserta"]));
  if (!participantName) return null;
  const serviceName = historyText(value(row, h, ["Jenis Layanan", "Jenis Vaksin", "Layanan", "Service", "Service Name"]));
  const productBrand = historyText(value(row, h, ["Merk Layanan", "Merk", "Brand", "Product Brand"]));
  const serviceDate = historyDateOnly(value(row, h, ["Tanggal Suntik", "Tanggal Vaksin", "Tanggalvaksin", "Tanggal Layanan", "Service Date", "Date"]));
  const category = historyText(value(row, h, ["Kategori", "Participant Type", "Jenis Peserta"])).toLowerCase();
  const dependent = /anak|child|dependent/.test(category);
  return {
    sourceRow: rowNo,
    participantType: dependent ? "DEPENDENT" : "EMPLOYEE",
    participantName,
    employeeId: historyText(value(row, h, ["NIP", "Employee ID", "EmployeeId", "BINUSIAN ID"])),
    nik: historyText(value(row, h, ["NIK"])),
    email: historyEmailKey(value(row, h, ["Email", "Email Peserta"])),
    phone: historyPhone(value(row, h, ["No. Telp", "No Telp", "Phone", "PhoneNumber", "NoHp"])),
    birthDate: historyDateOnly(value(row, h, ["Tanggal Lahir", "Birth of Date", "DOB", "Birth Date"])),
    gender: historyText(value(row, h, ["Gender", "Jenis Kelamin"])),
    parentName: historyText(value(row, h, ["ParentName", "Nama Orang Tua", "Parent Name"])),
    parentEmployeeId: historyText(value(row, h, ["ParentBinusianID", "Parent NIP", "Parent Employee ID"])),
    parentNik: historyText(value(row, h, ["Parent NIK"])),
    parentEmail: historyEmailKey(value(row, h, ["ParentEmail", "Parent Email"])),
    parentPhone: historyPhone(value(row, h, ["ParentHP", "Parent Phone"])),
    serviceDate,
    serviceName,
    productBrand,
    location: historyText(value(row, h, ["Lokasi Vaksin", "Lokasi", "Location", "TimeAreaName"])),
    nextDueDate: historyDateOnly(value(row, h, ["Jadwal Selanjutnya", "Next Schedule", "Next Due Date"])),
    notes: historyText(value(row, h, ["Keterangan", "Notes", "Note"])),
    serviceCategory: historyServiceCategory(serviceName, productBrand),
    sourceYear: sourceYearFromDate(serviceDate, fallbackYear),
    identityOnly: !serviceName,
    raw: {},
  };
}

function rowMapped(
  template: string,
  row: any[],
  h: Map<string, number>,
  rowNo: number,
  fallbackYear: number | null | undefined,
  mapping: VaccinationHistoryColumnMapping,
  defaultParticipantType: "EMPLOYEE" | "DEPENDENT",
): VaccinationHistoryRow | null {
  const participantName = historyText(mappedValue(row, h, mapping, "participantName"));
  if (!participantName) return null;

  const typeText = historyText(mappedValue(row, h, mapping, "participantType")).toLowerCase();
  let dependent = defaultParticipantType === "DEPENDENT";
  if (/anak|child|dependent|tanggungan/.test(typeText)) dependent = true;
  if (/employee|karyawan|adult|dewasa/.test(typeText)) dependent = false;

  let employeeId = historyText(mappedValue(row, h, mapping, "employeeId"));
  let nik = historyText(mappedValue(row, h, mapping, "nik"));
  let email = historyEmailKey(mappedValue(row, h, mapping, "email"));
  let phone = historyPhone(mappedValue(row, h, mapping, "phone"));
  let parentName = historyText(mappedValue(row, h, mapping, "parentName"));
  let parentEmployeeId = historyText(mappedValue(row, h, mapping, "parentEmployeeId"));
  let parentNik = historyText(mappedValue(row, h, mapping, "parentNik"));
  let parentEmail = historyEmailKey(mappedValue(row, h, mapping, "parentEmail"));
  let parentPhone = historyPhone(mappedValue(row, h, mapping, "parentPhone"));

  // Rekap lama sering memakai ID/email parent pada baris anak tanpa header Parent khusus.
  if (dependent && template === "BINUS_REKAP_2025") {
    if (!parentEmployeeId) parentEmployeeId = employeeId;
    if (!parentNik) parentNik = nik;
    if (!parentEmail) parentEmail = email;
    if (!parentPhone) parentPhone = phone;
    if (!historyText(mapping.employeeId)) employeeId = "";
    if (!historyText(mapping.nik)) nik = "";
    if (!historyText(mapping.email)) email = "";
    if (!historyText(mapping.phone)) phone = "";
  }

  const rawServiceDate = mappedValue(row, h, mapping, "serviceDate");
  const serviceDate = historyDateOnly(rawServiceDate);
  let serviceName = historyText(mappedValue(row, h, mapping, "serviceName"));
  if (!serviceName && template === "BINUS_CHILD_2024") serviceName = "Vaksin Influenza";
  const productBrand = historyText(mappedValue(row, h, mapping, "productBrand"));
  const rawLocation = mappedValue(row, h, mapping, "location");
  const locationHeader = historyText(mapping.location);
  const location = /timeareaname/i.test(locationHeader) || ["BINUS_2022", "BINUS_CHILD_2024"].includes(template)
    ? locationWithoutDate(rawLocation)
    : historyText(rawLocation);

  return {
    sourceRow: rowNo,
    participantType: dependent ? "DEPENDENT" : "EMPLOYEE",
    participantName,
    employeeId,
    nik,
    email,
    phone,
    birthDate: historyDateOnly(mappedValue(row, h, mapping, "birthDate")),
    gender: historyText(mappedValue(row, h, mapping, "gender")),
    parentName,
    parentEmployeeId,
    parentNik,
    parentEmail,
    parentPhone,
    serviceDate,
    serviceName,
    productBrand,
    location,
    nextDueDate: historyDateOnly(mappedValue(row, h, mapping, "nextDueDate")),
    notes: historyText(mappedValue(row, h, mapping, "notes")),
    serviceCategory: historyServiceCategory(serviceName, productBrand),
    sourceYear: sourceYearFromDate(serviceDate, fallbackYear),
    identityOnly: !serviceName,
    raw: {},
  };
}

function normalizeRow(template: string, row: any[], h: Map<string, number>, rowNo: number, fallbackYear?: number | null): VaccinationHistoryRow | null {
  if (template === "BINUS_2022") {
    const name = historyText(value(row, h, ["Name"]));
    if (!name || /masukan nama/i.test(name)) return null;
    const area = value(row, h, ["TimeAreaName"]);
    const serviceDate = historyDateOnly(area);
    const serviceName = historyText(value(row, h, ["Jenis vaksin"]));
    return {
      sourceRow: rowNo, participantType: "EMPLOYEE", participantName: name,
      employeeId: historyText(value(row, h, ["NIP"])), nik: "", email: historyEmailKey(value(row, h, ["Email"])),
      phone: "", birthDate: historyDateOnly(value(row, h, ["Birth of Date"])), gender: historyText(value(row, h, ["Gender"])),
      parentName: "", parentEmployeeId: "", parentNik: "", parentEmail: "", parentPhone: "",
      serviceDate, serviceName, productBrand: "", location: locationWithoutDate(area), nextDueDate: null,
      notes: historyText(value(row, h, ["Employee Type"])), serviceCategory: historyServiceCategory(serviceName),
      sourceYear: sourceYearFromDate(serviceDate, fallbackYear || 2022), identityOnly: !serviceName, raw: {},
    };
  }

  if (template === "BINUS_DENGUE_2023") {
    const name = historyText(value(row, h, ["Title"]));
    if (!name) return null;
    const serviceName = historyText(value(row, h, ["Jenis vaksin"]));
    const serviceDate = historyDateOnly(value(row, h, ["Tanggalvaksin"]));
    return {
      sourceRow: rowNo, participantType: "EMPLOYEE", participantName: name,
      employeeId: historyText(value(row, h, ["NIP"])), nik: "", email: historyEmailKey(value(row, h, ["Email"])),
      phone: historyPhone(value(row, h, ["NoHp"])), birthDate: historyDateOnly(value(row, h, ["Tanggallahir"])), gender: "",
      parentName: "", parentEmployeeId: "", parentNik: "", parentEmail: "", parentPhone: "",
      serviceDate, serviceName, productBrand: "", location: historyText(value(row, h, ["TimeAreaName"])), nextDueDate: null,
      notes: historyText(value(row, h, ["Keterangan pembayaran"])), serviceCategory: historyServiceCategory(serviceName),
      sourceYear: sourceYearFromDate(serviceDate, fallbackYear || 2023), identityOnly: !serviceName, raw: {},
    };
  }

  if (template === "BINUS_CHILD_2024") {
    const childName = historyText(value(row, h, ["ChildName"]));
    if (!childName) return null;
    const area = value(row, h, ["TimeAreaName"]);
    const serviceDate = historyDateOnly(area);
    const serviceName = historyText(value(row, h, ["BatchName"])) || "Vaksin Influenza";
    return {
      sourceRow: rowNo, participantType: "DEPENDENT", participantName: childName,
      employeeId: "", nik: "", email: "", phone: "", birthDate: null, gender: historyText(value(row, h, ["ChildGender"])),
      parentName: historyText(value(row, h, ["ParentName"])), parentEmployeeId: historyText(value(row, h, ["ParentBinusianID"])),
      parentNik: "", parentEmail: historyEmailKey(value(row, h, ["ParentEmail"])), parentPhone: historyPhone(value(row, h, ["ParentHP"])),
      serviceDate, serviceName, productBrand: "", location: locationWithoutDate(area), nextDueDate: null,
      notes: historyText(value(row, h, ["ChildAge"])), serviceCategory: historyServiceCategory(serviceName),
      sourceYear: sourceYearFromDate(serviceDate, fallbackYear || 2024), identityOnly: false, raw: {},
    };
  }

  if (template === "BINUS_ADULT_2024_IDENTITY") {
    const name = historyText(value(row, h, ["Name"]));
    if (!name) return null;
    return {
      sourceRow: rowNo, participantType: "EMPLOYEE", participantName: name,
      employeeId: "", nik: "", email: historyEmailKey(value(row, h, ["Email"])), phone: historyPhone(value(row, h, ["PhoneNumber"])),
      birthDate: null, gender: historyText(value(row, h, ["Gender"])), parentName: "", parentEmployeeId: "", parentNik: "", parentEmail: "", parentPhone: "",
      serviceDate: null, serviceName: "", productBrand: "", location: "", nextDueDate: null,
      notes: [historyText(value(row, h, ["TypeEmployee"])), historyText(value(row, h, ["MaritalStatus"]))].filter(Boolean).join(" · "),
      serviceCategory: "OTHER_SERVICE", sourceYear: historyYear(fallbackYear || 2024), identityOnly: true, raw: {},
    };
  }

  if (template === "BINUS_REKAP_2025") {
    const name = historyText(value(row, h, ["NAMA"]));
    if (!name) return null;
    const category = historyText(value(row, h, ["KATEGORI"])).toLowerCase();
    const dependent = /anak|child|dependent/.test(category);
    const id = historyText(value(row, h, ["BINUSIAN ID"]));
    const email = historyEmailKey(value(row, h, ["EMAIL"]));
    const phone = historyPhone(value(row, h, ["NO. TELP"]));
    const serviceDate = historyDateOnly(value(row, h, ["TANGGAL SUNTIK"]));
    const serviceName = historyText(value(row, h, ["JENIS LAYANAN"]));
    const brand = historyText(value(row, h, ["MERK LAYANAN"]));
    return {
      sourceRow: rowNo, participantType: dependent ? "DEPENDENT" : "EMPLOYEE", participantName: name,
      employeeId: dependent ? "" : id, nik: "", email: dependent ? "" : email, phone: dependent ? "" : phone,
      birthDate: dependent ? null : historyDateOnly(value(row, h, ["TANGGAL LAHIR"])), gender: "",
      parentName: "", parentEmployeeId: dependent ? id : "", parentNik: "", parentEmail: dependent ? email : "", parentPhone: dependent ? phone : "",
      serviceDate, serviceName, productBrand: brand, location: historyText(value(row, h, ["LOKASI VAKSIN"])),
      nextDueDate: historyDateOnly(value(row, h, ["JADWAL SELANJUTNYA"])), notes: historyText(value(row, h, ["KETERANGAN"])),
      serviceCategory: historyServiceCategory(serviceName, brand), sourceYear: sourceYearFromDate(serviceDate, fallbackYear || 2025),
      identityOnly: !serviceName, raw: {},
    };
  }

  return rowGeneric(row, h, rowNo, fallbackYear);
}

function readWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => {
    const sheet = workbook.Sheets[name];
    return sheet && Object.keys(sheet).some((cell) => !cell.startsWith("!"));
  });
  if (!sheetName) throw new Error("Workbook tidak memiliki sheet berisi data.");
  const sheet = workbook.Sheets[sheetName];
  const rows = sheetRows(sheet);
  if (!rows.length) throw new Error("Sheet kosong.");
  const headerRow = rows[0].map((item: any) => historyText(item));
  return { sheetName, rows, headerRow, template: detect(headerRow) };
}

export function inspectVaccinationHistoryWorkbook(buffer: Buffer): VaccinationHistoryWorkbookInspection {
  const { sheetName, headerRow, template } = readWorkbook(buffer);
  const headers = headerRow.filter(Boolean);
  return {
    template,
    sheetName,
    headers,
    suggestedMapping: suggestVaccinationHistoryMapping(headers),
    suggestedDefaultParticipantType: template === "BINUS_CHILD_2024" ? "DEPENDENT" : "EMPLOYEE",
  };
}

export function parseVaccinationHistoryWorkbook(
  buffer: Buffer,
  fallbackYear?: number | null,
  mapping?: VaccinationHistoryColumnMapping,
  defaultParticipantType: "EMPLOYEE" | "DEPENDENT" = "EMPLOYEE",
): VaccinationHistoryParseResult {
  const { sheetName, rows, headerRow, template } = readWorkbook(buffer);
  const headerMap = mapHeaders(rows[0]);
  const warnings: string[] = [];
  if (template === "GENERIC") warnings.push("Template tidak dikenali. Gunakan Menu Mapping Header bila nama kolom berbeda, lalu cek Preview sebelum Import.");
  if (template === "BINUS_ADULT_2024_IDENTITY") warnings.push("File 2024 Dewasa tidak memiliki tanggal/jenis layanan yang memadai. File ini dipakai sebagai identity enrichment, bukan service history.");
  if (hasManualMapping(mapping)) warnings.push("Manual Header Mapping aktif. Preview menggunakan mapping yang dipilih user.");

  const parsed: VaccinationHistoryRow[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const rawRow = rows[index];
    if (!rawRow || !rawRow.some((item: any) => historyText(item))) continue;
    const normalized = hasManualMapping(mapping)
      ? rowMapped(template, rawRow, headerMap, index + 1, fallbackYear, mapping || {}, defaultParticipantType)
      : normalizeRow(template, rawRow, headerMap, index + 1, fallbackYear);
    if (!normalized || !historyNameKey(normalized.participantName)) continue;
    const raw: Record<string, any> = {};
    headerRow.forEach((header, cellIndex) => {
      if (header) raw[header] = rawRow[cellIndex] ?? null;
    });
    normalized.raw = raw;
    parsed.push(normalized);
  }

  return { template, sheetName, rows: parsed, warnings, headers: headerRow.filter(Boolean) };
}

export function summarizeVaccinationHistoryRows(rows: VaccinationHistoryRow[]) {
  return {
    totalRows: rows.length,
    personRows: rows.length,
    serviceRows: rows.filter((row) => !row.identityOnly && row.serviceName).length,
    identityOnlyRows: rows.filter((row) => row.identityOnly || !row.serviceName).length,
    employeeRows: rows.filter((row) => row.participantType === "EMPLOYEE").length,
    dependentRows: rows.filter((row) => row.participantType === "DEPENDENT").length,
    missingEmailRows: rows.filter((row) => row.participantType === "EMPLOYEE" ? !row.email : !row.parentEmail).length,
    missingStrongIdRows: rows.filter((row) => row.participantType === "EMPLOYEE"
      ? !(historyIdentityKey(row.nik) || historyIdentityKey(row.employeeId) || row.email)
      : !(historyIdentityKey(row.parentNik) || historyIdentityKey(row.parentEmployeeId) || row.parentEmail)).length,
  };
}
