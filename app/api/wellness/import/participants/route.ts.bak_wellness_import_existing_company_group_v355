import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import { canManageWellness } from "@/lib/wellness/auth";

export const runtime = "nodejs";

function clean(value: any) {
  return String(value ?? "").trim();
}

function norm(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/[._\-\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value: any) {
  const text = clean(value).replace(",", ".").replace(/[^0-9.\-]/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseDateValue(value: any) {
  if (!value) return null;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const mm = String(parsed.m).padStart(2, "0");
      const dd = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${mm}-${dd}`;
    }
  }
  const raw = clean(value);
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function normalizeGender(value: any) {
  const text = norm(value);
  if (["l", "laki", "laki laki", "pria", "putra", "male", "m"].includes(text)) return "Laki-laki";
  if (["p", "perempuan", "wanita", "putri", "female", "f"].includes(text)) return "Perempuan";
  return clean(value);
}

function normalizePhone(value: any) {
  let text = clean(value).replace(/[^0-9+]/g, "");
  if (text.startsWith("+62")) text = `0${text.slice(3)}`;
  if (text.startsWith("62")) text = `0${text.slice(2)}`;
  return text;
}

function findColumn(headers: any[], candidates: string[]) {
  const normalized = headers.map(norm);
  const normalizedCandidates = candidates.map(norm);

  for (const c of normalizedCandidates) {
    const idx = normalized.findIndex((h) => h === c);
    if (idx >= 0) return idx;
  }
  for (const c of normalizedCandidates) {
    const idx = normalized.findIndex((h) => h.includes(c) || c.includes(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

function pick(row: any[], headers: any[], candidates: string[]) {
  const idx = findColumn(headers, candidates);
  return idx >= 0 ? row[idx] : "";
}

function chooseHeaderRow(rows: any[][]) {
  const known = ["nama", "nama peserta", "no karyawan", "nik", "employee", "email", "hp", "phone", "tinggi", "berat"];
  let best = 0;
  let score = -1;
  rows.slice(0, 20).forEach((row, idx) => {
    const values = row.map(norm);
    const rowScore = values.reduce((acc, value) => acc + (known.some((key) => value.includes(key)) ? 1 : 0), 0);
    if (rowScore > score) {
      best = idx;
      score = rowScore;
    }
  });
  return best;
}

async function getOrCreateGroup(supabase: any, name: string) {
  const groupName = clean(name) || "Wellness Default";
  const { data: existing, error: selectError } = await supabase
    .from("wellness_groups")
    .select("id")
    .eq("name", groupName)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("wellness_groups")
    .insert({ name: groupName })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canManageWellness(user)) return fail("Akses ditolak.", 403);

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const defaultGroupName = clean(form.get("group_name")) || "Wellness Default";
  if (!file) return fail("File Excel wajib diupload.");

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = clean(form.get("sheet_name")) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return fail(`Sheet ${sheetName} tidak ditemukan.`);

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    if (!rows.length) return fail("Sheet kosong.");

    const headerRowIndex = chooseHeaderRow(rows);
    const headers = rows[headerRowIndex] || [];
    const dataRows = rows.slice(headerRowIndex + 1);
    const supabase = getSupabaseAdmin();
    const defaultGroupId = await getOrCreateGroup(supabase, defaultGroupName);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [offset, row] of dataRows.entries()) {
      const rowNumber = headerRowIndex + offset + 2;
      const employeeNo = clean(pick(row, headers, ["No Karyawan", "Nomor Karyawan", "Employee No", "Employee ID", "NIK", "Kode", "ID Peserta", "Nomor Induk"]));
      const name = clean(pick(row, headers, ["Nama", "Nama Peserta", "Nama Lengkap", "Name"]));
      if (!employeeNo || !name) {
        skipped += 1;
        continue;
      }

      const groupName = clean(pick(row, headers, ["Kelompok", "Group", "Divisi", "Department", "Departemen"])) || defaultGroupName;
      const groupId = groupName === defaultGroupName ? defaultGroupId : await getOrCreateGroup(supabase, groupName);

      const payload: any = {
        code: employeeNo,
        name,
        group_id: groupId,
        gender: normalizeGender(pick(row, headers, ["Jenis Kelamin", "Gender", "Sex"])),
        phone: normalizePhone(pick(row, headers, ["No HP", "Nomor HP", "HP", "Phone", "Whatsapp", "WA", "Telepon"])),
        email: clean(pick(row, headers, ["Email", "Alamat Email", "E-mail"])).toLowerCase(),
        birth_date: parseDateValue(pick(row, headers, ["Tanggal Lahir", "Birth Date", "DOB"])),
        height_cm: toNumber(pick(row, headers, ["Tinggi Badan", "TB", "Height", "Height Cm"])),
        initial_weight_kg: toNumber(pick(row, headers, ["Berat Badan Awal", "BB Awal", "Initial Weight", "Berat Awal"])),
        target_weight_kg: toNumber(pick(row, headers, ["Target Berat", "Target BB", "Target Weight"])),
        program_start_date: parseDateValue(pick(row, headers, ["Tanggal Mulai", "Program Start", "Start Date"])),
        is_active: 1,
        updated_at: new Date().toISOString(),
      };

      Object.keys(payload).forEach((key) => {
        if (payload[key] === "" || payload[key] === undefined) payload[key] = null;
      });

      const { data: existing, error: selectError } = await supabase
        .from("wellness_participants")
        .select("id")
        .eq("code", employeeNo)
        .maybeSingle();
      if (selectError) throw selectError;

      if (existing?.id) {
        const { error } = await supabase.from("wellness_participants").update(payload).eq("id", existing.id);
        if (error) {
          errors.push(`Baris ${rowNumber}: ${error.message}`);
          continue;
        }
        updated += 1;
      } else {
        const { error } = await supabase.from("wellness_participants").insert({ ...payload, created_at: new Date().toISOString() });
        if (error) {
          errors.push(`Baris ${rowNumber}: ${error.message}`);
          continue;
        }
        inserted += 1;
      }
    }

    return ok({ inserted, updated, skipped, errors, sheetName, headerRow: headerRowIndex + 1 });
  } catch (error: any) {
    return fail(error?.message || "Import peserta Wellness gagal. Pastikan sql/wellness_schema_v212.sql sudah dijalankan.", 500);
  }
}
