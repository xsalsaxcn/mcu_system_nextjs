import { NextRequest } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { fail, ok, requireUser, supabaseAdmin, toInt } from "../../_utils";
import { historyText } from "@/lib/vaccination/history";

// V6340 History-only candidate picker; all writes are done elsewhere after explicit confirmation.
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "register")) return fail("Akses pengaturan Family ditolak.", 403);
  const companyId = toInt(req.nextUrl.searchParams.get("company_id"), 0);
  const term = historyText(req.nextUrl.searchParams.get("q")).replace(/[,%()*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  if (!companyId || term.length < 2) return fail("Pilih perusahaan dan isi minimal dua huruf nama atau ID.");
  const supabase = supabaseAdmin();
  try {
    const company = await supabase.from("vaccination_history_companies")
      .select("id,company_key").eq("id", companyId).eq("active", true).maybeSingle();
    if (company.error) throw company.error;
    if (!company.data) return fail("Perusahaan History tidak ditemukan.", 404);
    const q = `%${term}%`;
    const result = await supabase.from("vaccination_persons")
      .select("id,participant_type,participant_name,employee_id,nik,email,active")
      .eq("company_id", companyId).eq("active", true)
      .or(`participant_name.ilike.${q},employee_id.ilike.${q},nik.ilike.${q},email.ilike.${q}`)
      .order("participant_name", { ascending: true }).limit(31);
    if (result.error) throw result.error;
    if ((result.data || []).length > 30) return fail("Terlalu banyak kandidat. Persempit nama atau ID.", 409);
    const candidates = result.data || [];
    const dependentIds = candidates.filter((p: any) => p.participant_type === "DEPENDENT").map((p: any) => Number(p.id));
    const parentsByChild = new Map<number, any[]>();
    if (dependentIds.length) {
      const links = await supabase.from("vaccination_person_relationships")
        .select("dependent_person_id,relationship_type,parent:vaccination_persons!vaccination_person_relationships_parent_person_id_fkey(id,participant_name)")
        .eq("company_id", companyId).eq("active", true).in("dependent_person_id", dependentIds);
      if (links.error) throw links.error;
      for (const link of links.data || []) {
        const id = Number(link.dependent_person_id);
        const parent = Array.isArray(link.parent) ? link.parent[0] : link.parent;
        if (!parent?.id) continue;
        if (!parentsByChild.has(id)) parentsByChild.set(id, []);
        parentsByChild.get(id)!.push({ id: Number(parent.id), name: parent.participant_name, type: link.relationship_type });
      }
    }
    // Operational candidates are offered only as explicitly labelled registrations,
    // never silently merged with an existing History person by shared BINUSIAN ID.
    // The server-side Family bind rechecks the exact registration, name, role and
    // Session company before any creation or relationship INSERT.
    const registrationResult = await supabase.from("vaccination_registrations")
      .select("id,participant_name,employee_id,nik,email,family_role,history_person_id,session:vaccination_sessions(id,company_name)")
      .or(`participant_name.ilike.${q},employee_id.ilike.${q},nik.ilike.${q},email.ilike.${q}`)
      .order("id", { ascending: false }).limit(51);
    if (registrationResult.error) throw registrationResult.error;
    if ((registrationResult.data || []).length > 50) return fail("Terlalu banyak Registrasi cocok; gunakan nama lengkap peserta.", 409);
    const normCompany = String(company.data.company_key || "").toLowerCase();
    const registrationCandidates = (registrationResult.data || []).flatMap((reg: any) => {
      const session = Array.isArray(reg.session) ? reg.session[0] : reg.session;
      const normalized = String(session?.company_name || "").toLowerCase()
        .normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (!normalized || normalized !== normCompany) return [];
      const role = String(reg.family_role || "").trim().toUpperCase();
      // Family role of a registration is not authoritative for employment or parenthood.
      // Explicit selection is always revalidated by /family-bind before a write.
      if (!String(reg.participant_name || "").trim()) return [];
      return [{
        id: Number(reg.id), registration_id: Number(reg.id), source: "REGISTRATION",
        participant_type: role === "DEPENDENT" ? "DEPENDENT" : role === "PARENT" ? "EMPLOYEE" : "UNVERIFIED",
        family_role_source: role || "UNVERIFIED",
        participant_name: reg.participant_name, employee_id: reg.employee_id,
        nik: reg.nik, email: reg.email, parents: [],
      }];
    });
    return ok({ candidates: [
      ...candidates.map((person: any) => ({ ...person, source: "HISTORY", parents: parentsByChild.get(Number(person.id)) || [] })),
      ...registrationCandidates,
    ] });
  } catch (error: any) {
    return fail(String(error?.message || "Gagal mencari kandidat Family."), 500);
  }
}
