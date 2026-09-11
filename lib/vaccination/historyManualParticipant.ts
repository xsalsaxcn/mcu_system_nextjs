import * as XLSX from "xlsx";
import {
  historyDateOnly,
  historyEmailKey,
  historyIdentityKey,
  historyPhone,
  historyText,
} from "@/lib/vaccination/history";

export type ManualHistoryParticipantType = "EMPLOYEE" | "DEPENDENT";

export type ManualHistoryParticipantRow = {
  sourceRow: number;
  participantType: ManualHistoryParticipantType;
  participantName: string;
  employeeId: string;
  nik: string;
  email: string;
  phone: string;
  birthDate: string | null;
  gender: string;
  parentEmployeeId: string;
  parentNik: string;
  parentEmail: string;
  serviceName: string;
  productBrand: string;
  serviceDate: string | null;
  nextDueDate: string | null;
  location: string;
  doseNumber: number | null;
  lotNumber: string;
  notes: string;
  raw: Record<string, unknown>;
};

export const MANUAL_PARTICIPANT_TEMPLATE_HEADERS = [
  "Tipe Peserta",
  "Nama Lengkap",
  "NIP / Employee ID",
  "NIK",
  "Email Perusahaan",
  "No HP",
  "Tanggal Lahir",
  "Gender",
  "Parent NIP / Employee ID",
  "Parent NIK",
  "Parent Email Perusahaan",
  "Nama Layanan",
  "Merk / Brand",
  "Tanggal Layanan",
  "Next Schedule",
  "Lokasi",
  "Dose",
  "Lot Number",
  "Catatan",
];

function cleanHeader(value: unknown) {
  return historyText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function headerMap(values: unknown[]) {
  const map = new Map<string, number>();
  values.forEach((value, index) => {
    const key = cleanHeader(value);
    if (key) map.set(key, index);
  });
  return map;
}

function cell(row: unknown[], headers: Map<string, number>, names: string[]) {
  for (const name of names) {
    const index = headers.get(cleanHeader(name));
    if (index != null) return row[index];
  }
  return "";
}

function participantType(value: unknown): ManualHistoryParticipantType {
  const text = historyText(value).toLowerCase();
  return /anak|child|dependent|tanggungan/.test(text) ? "DEPENDENT" : "EMPLOYEE";
}

function doseNumber(value: unknown) {
  const n = Number(historyText(value));
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

export function manualHistoryParticipantRow(input: any, sourceRow = 1): ManualHistoryParticipantRow {
  return {
    sourceRow,
    participantType: participantType(input?.participant_type || input?.participantType),
    participantName: historyText(input?.participant_name || input?.participantName || input?.name),
    employeeId: historyText(input?.employee_id || input?.employeeId || input?.nip),
    nik: historyText(input?.nik),
    email: historyEmailKey(input?.email),
    phone: historyPhone(input?.phone),
    birthDate: historyDateOnly(input?.birth_date || input?.birthDate),
    gender: historyText(input?.gender),
    parentEmployeeId: historyText(input?.parent_employee_id || input?.parentEmployeeId || input?.parent_nip),
    parentNik: historyText(input?.parent_nik || input?.parentNik),
    parentEmail: historyEmailKey(input?.parent_email || input?.parentEmail),
    serviceName: historyText(input?.service_name || input?.serviceName),
    productBrand: historyText(input?.product_brand || input?.productBrand),
    serviceDate: historyDateOnly(input?.service_date || input?.serviceDate),
    nextDueDate: historyDateOnly(input?.next_due_date || input?.nextDueDate),
    location: historyText(input?.location),
    doseNumber: doseNumber(input?.dose_number || input?.doseNumber),
    lotNumber: historyText(input?.lot_number || input?.lotNumber),
    notes: historyText(input?.notes),
    raw: input && typeof input === "object" ? { ...input } : {},
  };
}

export function parseManualHistoryParticipantWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Workbook tidak memiliki sheet.");
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false, blankrows: false });
  if (!rows.length) throw new Error("File Excel kosong.");

  const headers = headerMap(rows[0] || []);
  const required = ["Nama Lengkap", "Tipe Peserta"];
  for (const name of required) {
    if (!headers.has(cleanHeader(name))) throw new Error(`Header \"${name}\" tidak ditemukan. Gunakan template yang disediakan.`);
  }

  const parsed: ManualHistoryParticipantRow[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const participantName = historyText(cell(row, headers, ["Nama Lengkap", "Nama Peserta", "Nama"]));
    if (!participantName) continue;
    const raw: Record<string, unknown> = {};
    MANUAL_PARTICIPANT_TEMPLATE_HEADERS.forEach((name) => {
      raw[name] = cell(row, headers, [name]);
    });
    parsed.push({
      sourceRow: index + 1,
      participantType: participantType(cell(row, headers, ["Tipe Peserta", "Participant Type"])),
      participantName,
      employeeId: historyText(cell(row, headers, ["NIP / Employee ID", "NIP", "Employee ID"])),
      nik: historyText(cell(row, headers, ["NIK"])),
      email: historyEmailKey(cell(row, headers, ["Email Perusahaan", "Email"])),
      phone: historyPhone(cell(row, headers, ["No HP", "Phone"])),
      birthDate: historyDateOnly(cell(row, headers, ["Tanggal Lahir", "Birth Date", "DOB"])),
      gender: historyText(cell(row, headers, ["Gender", "Jenis Kelamin"])),
      parentEmployeeId: historyText(cell(row, headers, ["Parent NIP / Employee ID", "Parent NIP", "Parent Employee ID"])),
      parentNik: historyText(cell(row, headers, ["Parent NIK"])),
      parentEmail: historyEmailKey(cell(row, headers, ["Parent Email Perusahaan", "Parent Email"])),
      serviceName: historyText(cell(row, headers, ["Nama Layanan", "Layanan", "Service Name"])),
      productBrand: historyText(cell(row, headers, ["Merk / Brand", "Merk", "Brand"])),
      serviceDate: historyDateOnly(cell(row, headers, ["Tanggal Layanan", "Service Date"])),
      nextDueDate: historyDateOnly(cell(row, headers, ["Next Schedule", "Next Due Date"])),
      location: historyText(cell(row, headers, ["Lokasi", "Location"])),
      doseNumber: doseNumber(cell(row, headers, ["Dose", "Dosis"])),
      lotNumber: historyText(cell(row, headers, ["Lot Number", "Lot"])),
      notes: historyText(cell(row, headers, ["Catatan", "Notes"])),
      raw,
    });
  }

  if (!parsed.length) throw new Error("Tidak ada baris peserta yang dapat dibaca dari template.");
  if (parsed.length > 5000) throw new Error("Maksimal 5.000 baris per import.");
  return { sheetName, rows: parsed };
}

export function validateManualHistoryParticipantRow(row: ManualHistoryParticipantRow) {
  if (!row.participantName) return "Nama Lengkap wajib diisi.";

  if (row.participantType === "EMPLOYEE") {
    if (!historyIdentityKey(row.employeeId)) return "NIP / Employee ID wajib diisi untuk karyawan.";
    if (!historyEmailKey(row.email)) return "Email Perusahaan wajib diisi untuk karyawan.";
  } else {
    if (!historyIdentityKey(row.parentEmployeeId) && !historyIdentityKey(row.parentNik)) {
      return "Anak / tanggungan wajib memiliki Parent NIP / Employee ID atau Parent NIK.";
    }
    if (!historyEmailKey(row.parentEmail)) return "Parent Email Perusahaan wajib diisi untuk anak / tanggungan.";
  }

  if (row.serviceDate && !row.serviceName) return "Nama Layanan wajib diisi jika Tanggal Layanan diisi.";
  return "";
}

export function buildManualHistoryParticipantTemplate() {
  const workbook = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet([MANUAL_PARTICIPANT_TEMPLATE_HEADERS]);
  dataSheet["!cols"] = MANUAL_PARTICIPANT_TEMPLATE_HEADERS.map((header) => ({ wch: Math.max(16, Math.min(28, header.length + 4)) }));
  XLSX.utils.book_append_sheet(workbook, dataSheet, "Peserta History");

  const guide = [
    ["PETUNJUK TEMPLATE TAMBAH PESERTA HISTORY"],
    ["1", "Tipe Peserta", "Isi KARYAWAN atau ANAK."],
    ["2", "Karyawan", "Nama Lengkap, NIP / Employee ID, dan Email Perusahaan wajib diisi."],
    ["3", "Anak / Tanggungan", "Nama anak wajib. Isi Parent NIP/Employee ID atau Parent NIK, serta Parent Email Perusahaan. Parent harus terdaftar pada perusahaan yang sama."],
    ["4", "Layanan", "Kolom layanan boleh kosong jika hanya ingin mendaftarkan identitas peserta. Jika Tanggal Layanan diisi, Nama Layanan wajib diisi."],
    ["5", "Tanggal", "Gunakan format YYYY-MM-DD, contoh 2026-09-11."],
    ["6", "Duplikasi", "NIP / email yang sudah ada tidak membuat peserta ganda; sistem akan menggunakan identitas existing bila konsisten."],
    ["7", "Portal", "Karyawan dengan NIP + Email Perusahaan dapat mengakses QR Portal Peserta dan menerima OTP ke email tersebut."],
  ];
  const guideSheet = XLSX.utils.aoa_to_sheet(guide);
  guideSheet["!cols"] = [{ wch: 6 }, { wch: 24 }, { wch: 95 }];
  XLSX.utils.book_append_sheet(workbook, guideSheet, "Petunjuk");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
