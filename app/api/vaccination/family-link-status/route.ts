import { NextRequest } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import {
  historyCompanyKey,
  historyEmailKey,
  historyIdentityKey,
  historyNameKey,
  historyText,
} from "@/lib/vaccination/history";
import { fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

// V583: READ ONLY family panel verification for existing walk-in identities.
// No writes, no registration/queue/validation/inventory interactions.
export const dynamic = "force-dynamic";

const clean = (value: unknown) => historyText(value);
const numberId = (value: unknown) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
};

function first(...values: unknown[]) {
  for (const value of values) {
    const candidate = clean(value);
    if (candidate) return candidate;
  }
  return "";
}

function operationalIdentity(row: any) {
  return {
    name: first(row.name, row.participant_name),
    employeeId: first(row.employee_id, row.employee_nik, row.external_id, row.mcu_id, row.barcode_value),
    nik: first(row.nik, row.ktp, row.nik_ktp),
    email: first(row.email, row.email_company, row.company_email),
  };
}

function personIdentity(row: any) {
  return {
    name: row.participant_name,
    employeeId: row.employee_id,
    nik: row.nik,
    email: row.email,
  };
}

function samePerson(a: any, b: any) {
  if (!historyNameKey(a?.name) || historyNameKey(a?.name) !== historyNameKey(b?.name)) return false;
  const aNik = historyIdentityKey(a?.nik);
  const bNik = historyIdentityKey(b?.nik);
  if (aNik && bNik && aNik !== bNik) return false;
  const aa = [historyIdentityKey(a?.employeeId), aNik, historyEmailKey(a?.email)];
  const bb = [historyIdentityKey(b?.employeeId), bNik, historyEmailKey(b?.email)];
  return aa.some((value, index) => Boolean(value && value === bb[index]));
}

function personSummary(row: any) {
  if (!row || row.active === false) return null;
  return {
    id: numberId(row.id) || null,
    name: clean(row.participant_name),
    employeeId: clean(row.employee_id),
    nik: clean(row.nik),
    email: clean(row.email),
    phone: clean(row.phone),
    participantType: clean(row.participant_type).toUpperCase(),
  };
}

function unpack(row: any) {
  return Array.isArray(row) ? row[0] : row;
}

function checked(response: any): any {
  if (response.error) throw new Error(response.error.message || "Gagal membaca Family.");
  return response.data;
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "register")) return fail("Akses registrasi vaksinasi ditolak.", 403);

  const companyKey = historyCompanyKey(req.nextUrl.searchParams.get("company_key"));
  const historyId = toInt(req.nextUrl.searchParams.get("history_person_id"), 0);
  const participantId = toInt(req.nextUrl.searchParams.get("participant_id"), 0);
  const assertedName = historyNameKey(req.nextUrl.searchParams.get("name"));
  if (!companyKey || companyKey === "unknown-company" || !assertedName || (!historyId && !participantId)) {
    return fail("Pilih profil existing dan perusahaan sebelum memeriksa Family.");
  }

  const supabase = supabaseAdmin();
  try {
    const company = checked(await supabase.from("vaccination_history_companies")
      .select("id,company_key")
      .eq("company_key", companyKey)
      .eq("active", true)
      .maybeSingle());
    if (!company) return fail("Perusahaan History tidak ditemukan.", 404);

    let operational: any = null;
    if (participantId) {
      const record = checked(await supabase.from("participants")
        .select("*")
        .eq("id", participantId)
        .maybeSingle());
      if (!record) return fail("Profil Database tidak ditemukan.", 404);
      const source = checked(await supabase.from("participant_sources")
        .select("id,name,institution_name")
        .eq("id", record.source_id)
        .maybeSingle());
      if (!source || historyCompanyKey(first(source.institution_name, source.name)) !== companyKey) {
        return fail("Perusahaan profil Database tidak cocok.", 409);
      }
      operational = operationalIdentity(record);
      if (historyNameKey(operational.name) !== assertedName) {
        return fail("Nama profil Database berubah. Cari ulang peserta.", 409);
      }
    }

    let person: any = null;
    if (historyId) {
      person = checked(await supabase.from("vaccination_persons")
        .select("*")
        .eq("id", historyId)
        .eq("company_id", company.id)
        .eq("active", true)
        .maybeSingle());
      if (!person) return fail("Profil History tidak ditemukan di perusahaan ini.", 404);
      if (historyNameKey(person.participant_name) !== assertedName) {
        return fail("Nama profil History berubah. Cari ulang peserta.", 409);
      }
      if (operational && !samePerson(personIdentity(person), operational)) {
        return fail("ID History dan Database bukan identitas yang sama.", 409);
      }
    } else if (operational) {
      // Select by company AND exact normalized name before matching strong keys.
      // Never infer a family link from shared BINUSIAN ID alone.
      const rows = checked(await supabase.from("vaccination_persons")
        .select("*")
        .eq("company_id", company.id)
        .eq("active", true)
        .eq("name_key", assertedName)
        .limit(101));
      if ((rows || []).length > 100) return fail("Terlalu banyak profil bernama sama; perlu pemeriksaan manual.", 409);
      const exact = (rows || []).filter((row: any) => samePerson(personIdentity(row), operational));
      if (exact.length > 1) return fail("Ditemukan lebih dari satu profil History yang cocok; tidak memilih otomatis.", 409);
      person = exact[0] || null;
    }

    if (!person) {
      return ok({ status: "NO_HISTORY_PROFILE", historyPersonId: null,
        family: { role: "", parent: null, children: [], siblings: [] } });
    }

    const personId = numberId(person.id);
    const [parentLinks, childLinks] = await Promise.all([
      supabase.from("vaccination_person_relationships")
        .select("id,relationship_type,parent:vaccination_persons!vaccination_person_relationships_parent_person_id_fkey(id,company_id,active,participant_type,participant_name,employee_id,nik,email,phone)")
        .eq("company_id", company.id)
        .eq("dependent_person_id", personId)
        .eq("active", true)
        .limit(101),
      supabase.from("vaccination_person_relationships")
        .select("id,relationship_type,dependent:vaccination_persons!vaccination_person_relationships_dependent_person_id_fkey(id,company_id,active,participant_type,participant_name,employee_id,nik,email,phone)")
        .eq("company_id", company.id)
        .eq("parent_person_id", personId)
        .eq("active", true)
        .limit(101),
    ]);
    const parents = checked(parentLinks);
    const childrenLinks = checked(childLinks);
    if (parents.length > 1 || childrenLinks.length > 100 || (parents.length && childrenLinks.length)) {
      return fail("Relasi Parent/Child tidak konsisten; perlu audit, tidak mengubah data.", 409);
    }

    const parentRow = parents.length ? unpack(parents[0].parent) : null;
    if (parentRow && Number(parentRow.company_id) !== Number(company.id)) {
      return fail("Relasi Parent beda perusahaan; perlu audit.", 409);
    }
    const parent = personSummary(parentRow);
    const children = childrenLinks.map((link: any) => unpack(link.dependent))
      .filter((row: any) => row && Number(row.company_id) === Number(company.id))
      .map(personSummary).filter(Boolean);

    let siblings: any[] = [];
    if (parent?.id) {
      const siblingLinks = checked(await supabase.from("vaccination_person_relationships")
        .select("dependent:vaccination_persons!vaccination_person_relationships_dependent_person_id_fkey(id,company_id,active,participant_type,participant_name,employee_id,nik,email,phone)")
        .eq("company_id", company.id)
        .eq("parent_person_id", parent.id)
        .eq("active", true)
        .limit(101));
      if (siblingLinks.length > 100) return fail("Terlalu banyak relasi Family; perlu audit.", 409);
      siblings = siblingLinks.map((link: any) => unpack(link.dependent))
        .filter((row: any) => row && row.active !== false && Number(row.company_id) === Number(company.id) && numberId(row.id) !== personId)
        .map((row: any) => ({ ...personSummary(row), relationship: "SIBLING" }));
    }

    const role = parents.length || clean(person.participant_type).toUpperCase() === "DEPENDENT" ? "DEPENDENT" : "PARENT";
    return ok({
      status: parents.length || children.length ? "LINKED" : "NOT_LINKED",
      historyPersonId: personId,
      family: { role, parent, children, siblings },
    });
  } catch (error: any) {
    return fail(String(error?.message || "Gagal memeriksa relasi Family."), 500);
  }
}
