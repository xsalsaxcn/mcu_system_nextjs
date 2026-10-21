import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value ?? "").trim();
}

function norm(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/[_\-.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chooseHeaderRow(rows: any[][]) {
  const known = [
    "nama",
    "nama peserta",
    "nama lengkap",
    "employee name",
    "binusian id",
    "employee id",
    "date of birth",
    "tanggal lahir",
    "department",
    "division",
    "bu/division",
    "posisi",
    "position",
    "jabatan",
  ];

  let bestIndex = 0;
  let bestScore = -1;
  rows.slice(0, 20).forEach((row, idx) => {
    const values = row.map(norm);
    const score = values.reduce((total, value) => total + (known.some((candidate) => value.includes(candidate)) ? 1 : 0), 0);
    if (score > bestScore) {
      bestIndex = idx;
      bestScore = score;
    }
  });
  return bestIndex;
}

function exactOrPartialHeader(headers: string[], candidates: string[]) {
  const normalized = headers.map(norm);
  const target = candidates.map(norm);

  for (const candidate of target) {
    const index = normalized.findIndex((header) => header === candidate);
    if (index >= 0) return headers[index];
  }
  for (const candidate of target) {
    const index = normalized.findIndex((header) => header.includes(candidate) || candidate.includes(header));
    if (index >= 0) return headers[index];
  }
  return "";
}

function suggestedMapping(headers: string[]) {
  return {
    name: exactOrPartialHeader(headers, ["Nama", "Nama Lengkap", "Nama Peserta", "Employee Name", "Nama Karyawan"]),
    employee_nik: exactOrPartialHeader(headers, ["Binusian ID", "BinusianID", "NIK Karyawan", "Employee ID", "Employee No", "NIP"]),
    birth_date: exactOrPartialHeader(headers, ["Date of Birth", "Tanggal Lahir", "Birth Date", "DOB"]),
    department: exactOrPartialHeader(headers, ["BU/Division", "Department", "Division", "Departemen", "Divisi"]),
    position: exactOrPartialHeader(headers, ["Posisi", "Position", "Jabatan", "Job Title"]),
    nik: exactOrPartialHeader(headers, ["NIK", "NIK / Identitas", "Nomor Induk Kependudukan"]),
    gender: exactOrPartialHeader(headers, ["Jenis Kelamin", "Gender", "JK", "L/P"]),
    phone: exactOrPartialHeader(headers, ["No HP", "No. HP", "Phone", "Phone Number", "Telepon", "WhatsApp"]),
    location: exactOrPartialHeader(headers, ["Lokasi", "Location", "Site", "Campus", "Kampus", "Cabang"]),
  };
}

function sessionLocation(row: any) {
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

function sessionDate(row: any) {
  return clean(
    row?.session_date ??
      row?.event_date ??
      row?.exam_date ??
      row?.mcu_date ??
      row?.date ??
      "",
  ).slice(0, 10);
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const companyId = Number(req.nextUrl.searchParams.get("company_id") || 0);
  const packageId = Number(req.nextUrl.searchParams.get("package_id") || 0);
  if (!companyId || !packageId) return fail("company_id dan package_id wajib diisi.", 400);

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("mcu_queue_sessions")
    .select("*")
    .eq("company_id", companyId)
    .eq("package_id", packageId)
    .order("id", { ascending: false });

  const sessionResult = await query;
  if (sessionResult.error) return fail(sessionResult.error.message, 500);

  const [companyResult, packageResult] = await Promise.all([
    supabase.from("companies").select("id,name").eq("id", companyId).maybeSingle(),
    supabase.from("packages").select("id,name").eq("id", packageId).maybeSingle(),
  ]);

  if (companyResult.error) return fail(companyResult.error.message, 500);
  if (packageResult.error) return fail(packageResult.error.message, 500);

  const companyName = clean(companyResult.data?.name) || "MCU Corporate";
  const packageName = clean(packageResult.data?.name) || "Paket MCU";

  const sessions = (sessionResult.data || []).map((row: any) => {
    const locationName = sessionLocation(row);
    const date = sessionDate(row);
    const parts = [date, locationName, packageName].filter(Boolean);
    return {
      id: Number(row.id),
      company_id: Number(row.company_id),
      package_id: Number(row.package_id),
      company_name: companyName,
      package_name: packageName,
      location_name: locationName,
      session_date: date,
      label: parts.length ? parts.join(" · ") : `Session #${row.id} · ${packageName}`,
      raw: row,
    };
  });

  return ok({ sessions });
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return fail("File Excel wajib diupload.", 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });

  let selected: any = null;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    if (!rows.length) continue;

    const headerRowIndex = chooseHeaderRow(rows);
    const headers = (rows[headerRowIndex] || []).map((value, index) => clean(value) || `Column_${index + 1}`);
    const bodyRows = rows
      .slice(headerRowIndex + 1)
      .filter((row) => Array.isArray(row) && row.some((value) => clean(value)));

    if (!headers.length || !bodyRows.length) continue;

    const previewRows = bodyRows.slice(0, 5).map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
    );

    selected = {
      sheet_name: sheetName,
      header_row: headerRowIndex + 1,
      headers,
      row_count: bodyRows.length,
      preview: previewRows,
      suggested_mapping: suggestedMapping(headers),
    };
    break;
  }

  if (!selected) return fail("Tidak menemukan sheet Excel berisi data peserta.", 400);
  if (!selected.suggested_mapping?.name) {
    return fail("Kolom nama peserta belum dapat dikenali. Pilih file yang memiliki header nama peserta.", 400, { preview: selected });
  }

  return ok({ preview: selected });
}
