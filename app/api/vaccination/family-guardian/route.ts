import { NextRequest } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { fail, ok, requireUser, supabaseAdmin } from "../_utils";

export const dynamic = "force-dynamic";

const txt = (value: unknown, size = 160) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, size);
const norm = (value: string) => value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "register")) return fail("Tidak memiliki akses registrasi vaksinasi.", 403);
  const body = await req.json().catch(() => ({}));
  const companyKey = txt(body.companyKey, 160);
  const name = txt(body.parentName, 120);
  const binusianId = txt(body.binusianId, 64);
  if (name.length < 3 || binusianId.length < 4 || !/^[a-z0-9._\/-]+$/i.test(binusianId))
    return fail("Nama lengkap dan BINUSIAN ID Parent tidak valid.", 400);
  if (!companyKey) return fail("Perusahaan belum dipilih.", 400);
  try {
    const supabase = supabaseAdmin();
    const company = await supabase.from("vaccination_history_companies")
      .select("id,company_name,company_key").eq("company_key", companyKey).eq("active", true).maybeSingle();
    if (company.error || !company.data) return fail("Master perusahaan tidak ditemukan.", 409);
    const companyId = Number(company.data.id);
    const nameKey = norm(name);
    if (!nameKey) return fail("Nama Parent tidak valid.", 400);
    // Reject probable duplicate of a confirmed History EMPLOYEE. Shared family IDs alone do not match people.
    const existingHistory = await supabase.from("vaccination_persons")
      .select("id,participant_name,employee_id")
      .eq("company_id", companyId).eq("active", true)
      .eq("name_key", nameKey).limit(20);
    if (existingHistory.error) return fail("Tidak dapat memeriksa profil History.", 500);
    if ((existingHistory.data || []).length)
      return fail("Ada profil History dengan nama Parent yang sama. Periksa dan pilih identitas aslinya di Cari Parent Existing; jangan membuat orang duplikat.", 409);
    const found = await supabase.from("vaccination_family_guardians_v6343")
      .select("id,parent_name,binusian_id,contact_email,company_id,active")
      .eq("company_id", companyId).eq("name_key", nameKey)
      .eq("binusian_key", binusianId.toLowerCase()).limit(5);
    if (found.error) return fail("Skema Parent Family V6343 belum aktif. Migrasi staging harus diverifikasi dahulu.", 423);
    const rows = found.data || [];
    if (rows.length > 1 || rows.some((r: any) => r.active === false))
      return fail("Profil Parent perlu pemeriksaan administrator sebelum dipakai ulang.", 409);
    if (rows.length === 1) return ok({ guardian: rows[0], existing: true });
    const inserted = await supabase.from("vaccination_family_guardians_v6343")
      .insert({
        company_id: companyId, parent_name: name, name_key: nameKey,
        binusian_id: binusianId, binusian_key: binusianId.toLowerCase(),
        contact_email: txt(body.contactEmail, 160) || null,
        contact_phone: txt(body.contactPhone, 48) || null,
        department: txt(body.department, 120) || null,
        // Inherited contact is for family communication, not proof of employee identity.
        created_by: txt((user as any)?.email || (user as any)?.name || "registrasi", 160), active: true,
      }).select("id,parent_name,binusian_id,contact_email,company_id,active").single();
    if (inserted.error) {
      if (String(inserted.error.code) === "23505") return fail("Parent dengan identitas yang sama sudah dibuat. Cari ulang sebelum menyimpan.", 409);
      return fail("Profil Parent gagal disimpan. Periksa konfigurasi skema / identitas.", 409);
    }
    return ok({ guardian: inserted.data, existing: false });
  } catch {
    return fail("Gagal memvalidasi profil Parent.", 500);
  }
}
