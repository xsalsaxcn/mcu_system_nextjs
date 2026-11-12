import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin } from "../_utils";
import { vaccinationRole } from "@/lib/vaccination/access";
import { historyCompanyKey } from "@/lib/vaccination/history";

// V627_FAMILY_IDENTITY_EDIT_GUARDED: canonical identity or ONE registration only.
// Never updates family bindings, queue, stock, clinical records or payment.
export const dynamic = "force-dynamic";
const clean = (value: unknown) => String(value ?? "").trim();

// V627: load the exact target from the server BEFORE displaying the edit form.
// In particular, never send blank DOB/gender for a pre-existing person accidentally.
export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!["admin", "vaccination_admin", "vaccination_supervisor"].includes(vaccinationRole(user))) {
    return fail("Koreksi identitas hanya untuk Admin Vaksinasi/Supervisor.", 403);
  }
  const kind = clean(req.nextUrl.searchParams.get("kind")).toUpperCase();
  const targetId = Number(req.nextUrl.searchParams.get("id") || 0);
  const companyKey = historyCompanyKey(req.nextUrl.searchParams.get("company_key"));
  if (!["PERSON", "REGISTRATION"].includes(kind) || !Number.isSafeInteger(targetId) || targetId < 1 || companyKey === "unknown-company") {
    return fail("Target atau perusahaan tidak valid.", 400);
  }
  try {
    const supabase = supabaseAdmin();
    if (kind === "PERSON") {
      const company = await supabase.from("vaccination_history_companies")
        .select("id").eq("company_key", companyKey).eq("active", true).maybeSingle();
      if (company.error || !company.data) return fail("Perusahaan History tidak ditemukan.", 404);
      const result = await supabase.from("vaccination_persons")
        .select("id,company_id,participant_name,employee_id,nik,email,phone,birth_date,gender,active")
        .eq("id", targetId).eq("company_id", company.data.id).eq("active", true).maybeSingle();
      if (result.error || !result.data) return fail("Profil orang tidak tersedia pada perusahaan ini.", 404);
      const row = result.data;
      return ok({ identity: { name: clean(row.participant_name), employeeId: clean(row.employee_id),
        nik: clean(row.nik), email: clean(row.email), phone: clean(row.phone),
        birthDate: clean(row.birth_date), gender: clean(row.gender) } });
    }
    const result = await supabase.from("vaccination_registrations")
      .select("id,session_id,participant_name,employee_id,nik,email,phone")
      .eq("id", targetId).maybeSingle();
    if (result.error || !result.data) return fail("Registrasi tidak ditemukan.", 404);
    const session = await supabase.from("vaccination_sessions")
      .select("company_name").eq("id", result.data.session_id).maybeSingle();
    if (session.error || !session.data || historyCompanyKey(session.data.company_name) !== companyKey) {
      return fail("Registrasi bukan milik perusahaan ini.", 403);
    }
    const row = result.data;
    return ok({ identity: { name: clean(row.participant_name), employeeId: clean(row.employee_id),
      nik: clean(row.nik), email: clean(row.email), phone: clean(row.phone) } });
  } catch (error: any) { return fail(String(error?.message || "Gagal membaca identitas."), 500); }
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  const role = vaccinationRole(user);
  if (!["admin", "vaccination_admin", "vaccination_supervisor"].includes(role)) {
    return fail("Koreksi identitas hanya untuk Admin Vaksinasi/Supervisor.", 403);
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return fail("Permintaan tidak valid.");
  const targetKind = clean(body.targetKind).toUpperCase();
  const targetId = Number(body.targetId || 0);
  const companyKey = historyCompanyKey(body.companyKey);
  const expectedName = clean(body.expectedName);
  const reason = clean(body.reason);
  if (!["PERSON", "REGISTRATION"].includes(targetKind) || !Number.isSafeInteger(targetId) || targetId < 1) {
    return fail("ID profil atau registrasi tidak valid.", 400);
  }
  if (companyKey === "unknown-company" || !expectedName || reason.length < 8) {
    return fail("Perusahaan, identitas awal, dan alasan koreksi wajib diisi.", 400);
  }
  const allowed = targetKind === "PERSON"
    ? ["name", "employeeId", "nik", "email", "phone", "birthDate", "gender"]
    : ["name", "employeeId", "nik", "email", "phone"];
  const values: Record<string, string> = {};
  for (const key of allowed) {
    if (body.values && Object.prototype.hasOwnProperty.call(body.values, key)) {
      if (typeof body.values[key] !== "string") return fail(`Nilai ${key} harus teks.`, 400);
      values[key] = clean(body.values[key]);
      if (values[key].length > (key === "email" ? 254 : 150)) return fail(`Nilai ${key} terlalu panjang.`, 400);
    }
  }
  if (!values.name || values.name.length < 2) return fail("Nama harus minimal 2 karakter.", 400);
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return fail("Format email tidak valid.", 400);
  if (values.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(values.birthDate)) return fail("Tanggal lahir harus YYYY-MM-DD.", 400);
  if (values.gender && !["M", "F", "L", "P", "MALE", "FEMALE"].includes(values.gender.toUpperCase())) return fail("Jenis kelamin tidak valid.", 400);

  const actor = clean((user as any).email || (user as any).username || (user as any).name || user.id);
  try {
    const supabase = supabaseAdmin();
    const result = await supabase.rpc("vaccination_family_identity_edit_v627", {
      p_kind: targetKind, p_id: targetId, p_company_key: companyKey,
      p_expected_name: expectedName, p_values: values,
      p_reason: reason, p_actor: actor,
    });
    if (result.error) return fail(`Koreksi ditahan: ${result.error.message}`, 409);
    return ok({ message: "Koreksi identitas tersimpan dengan audit.", edited: result.data });
  } catch (error: any) {
    return fail(String(error?.message || "Koreksi identitas gagal."), 500);
  }
}
