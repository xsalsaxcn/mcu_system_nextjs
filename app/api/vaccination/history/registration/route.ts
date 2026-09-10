import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin, toInt } from "../../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import {
  historyCompanyKey,
  historyEmailKey,
  historyIdentityKey,
  historyNameKey,
  historyText,
} from "@/lib/vaccination/history";

export const dynamic = "force-dynamic";

type Candidate = { person: any; score: number; reasons: string[]; parent?: any | null };

function addCandidate(map: Map<number, Candidate>, person: any) {
  if (!person?.id) return;
  const id = Number(person.id);
  if (!map.has(id)) map.set(id, { person, score: 0, reasons: [] });
}

function same(a: unknown, b: unknown) {
  return Boolean(a && b && String(a) === String(b));
}

function personIdentity(person: any) {
  return {
    nikKey: historyIdentityKey(person?.nik_key || person?.nik),
    employeeKey: historyIdentityKey(person?.employee_key || person?.employee_id),
    emailKey: historyEmailKey(person?.email_key || person?.email),
    nameKey: historyNameKey(person?.name_key || person?.participant_name),
  };
}

async function candidateQueries(supabase: any, registration: any, companyId?: number | null) {
  const map = new Map<number, Candidate>();
  const nikKey = historyIdentityKey(registration.nik);
  const employeeKey = historyIdentityKey(registration.employee_id || registration.mcu_id);
  const emailKey = historyEmailKey(registration.email);
  const nameKey = historyNameKey(registration.participant_name);

  const queries: Promise<any>[] = [];
  const scoped = () => {
    let query = supabase.from("vaccination_persons").select("*");
    if (companyId) query = query.eq("company_id", companyId);
    return query;
  };

  // Canonical normalized keys first.
  if (nikKey) queries.push(scoped().eq("nik_key", nikKey).limit(20));
  if (employeeKey) queries.push(scoped().eq("employee_key", employeeKey).limit(20));
  if (emailKey) queries.push(scoped().eq("email_key", emailKey).limit(20));
  if (nameKey) queries.push(scoped().eq("name_key", nameKey).limit(30));

  // V151.1 compatibility fallback: older/imported rows may have the raw value
  // populated correctly while a derived *_key field is absent/stale.
  const rawNik = historyText(registration.nik);
  const rawEmployee = historyText(registration.employee_id || registration.mcu_id);
  const rawEmail = historyText(registration.email);
  const rawName = historyText(registration.participant_name);
  if (rawNik) queries.push(scoped().eq("nik", rawNik).limit(20));
  if (rawEmployee) queries.push(scoped().eq("employee_id", rawEmployee).limit(20));
  if (rawEmail) queries.push(scoped().ilike("email", rawEmail).limit(20));
  if (rawName) queries.push(scoped().ilike("participant_name", rawName).limit(30));

  const results = await Promise.all(queries);
  for (const result of results) {
    if (result.error) throw new Error(result.error.message);
    for (const person of result.data || []) addCandidate(map, person);
  }

  const dependentIds = Array.from(map.values())
    .filter((item) => item.person.participant_type === "DEPENDENT")
    .map((item) => Number(item.person.id));
  const parentByDependent = new Map<number, any>();

  if (dependentIds.length) {
    const relResult = await supabase
      .from("vaccination_person_relationships")
      .select("dependent_person_id,parent:vaccination_persons!vaccination_person_relationships_parent_person_id_fkey(*)")
      .in("dependent_person_id", dependentIds)
      .eq("active", true);
    if (relResult.error) throw new Error(relResult.error.message);
    for (const rel of relResult.data || []) {
      const parent = Array.isArray(rel.parent) ? rel.parent[0] : rel.parent;
      if (parent) parentByDependent.set(Number(rel.dependent_person_id), parent);
    }
  }

  for (const candidate of map.values()) {
    const own = personIdentity(candidate.person);
    if (nameKey && same(own.nameKey, nameKey)) {
      candidate.score += 50;
      candidate.reasons.push("nama");
    }
    if (nikKey && same(own.nikKey, nikKey)) {
      candidate.score += 120;
      candidate.reasons.push("NIK");
    }
    if (employeeKey && same(own.employeeKey, employeeKey)) {
      candidate.score += 110;
      candidate.reasons.push("NIP/Employee ID");
    }
    if (emailKey && same(own.emailKey, emailKey)) {
      candidate.score += 100;
      candidate.reasons.push("email");
    }

    if (candidate.person.participant_type === "DEPENDENT") {
      const parent = parentByDependent.get(Number(candidate.person.id));
      candidate.parent = parent || null;
      if (parent) {
        const parentIdentity = personIdentity(parent);
        if (nikKey && same(parentIdentity.nikKey, nikKey)) {
          candidate.score += 110;
          candidate.reasons.push("NIK parent");
        }
        if (employeeKey && same(parentIdentity.employeeKey, employeeKey)) {
          candidate.score += 100;
          candidate.reasons.push("NIP parent");
        }
        if (emailKey && same(parentIdentity.emailKey, emailKey)) {
          candidate.score += 90;
          candidate.reasons.push("email parent");
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.score - a.score);
}

async function findCandidates(supabase: any, companyId: number, registration: any) {
  return candidateQueries(supabase, registration, companyId);
}

async function findGlobalCandidates(supabase: any, registration: any) {
  return candidateQueries(supabase, registration, null);
}

function isSafeGlobalMatch(candidates: Candidate[]) {
  const best = candidates[0] || null;
  if (!best) return null;
  const second = candidates[1] || null;
  if (second && second.score === best.score) return null;

  const reasons = new Set(best.reasons);
  const ownStrong = ["NIK", "NIP/Employee ID", "email"].filter((reason) => reasons.has(reason)).length;
  const parentStrong = ["NIK parent", "NIP parent", "email parent"].filter((reason) => reasons.has(reason)).length;
  const hasName = reasons.has("nama");

  if (best.person.participant_type === "DEPENDENT") {
    return hasName && parentStrong >= 1 && best.score >= 140 ? best : null;
  }
  return ((ownStrong >= 2 && best.score >= 200) || (hasName && ownStrong >= 1 && best.score >= 150)) ? best : null;
}

function companyHintMatches(companyKey: string, hint: string) {
  if (!companyKey || companyKey === "unknown-company" || !hint) return false;
  const hintKey = historyCompanyKey(hint);
  if (hintKey === companyKey) return true;
  return (`-${hintKey}-`).includes(`-${companyKey}-`);
}

async function resolveHistoryCompany(supabase: any, registration: any, session: any) {
  const hints = [registration.company_name, session?.company_name, session?.source_name, session?.session_name]
    .map(historyText)
    .filter(Boolean);
  const exactKeys = Array.from(new Set(hints.map(historyCompanyKey).filter((key) => key && key !== "unknown-company")));

  for (const key of exactKeys) {
    const result = await supabase
      .from("vaccination_history_companies")
      .select("id,company_name,company_key,public_token")
      .eq("company_key", key)
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (result.data) return { company: result.data, reason: "company-exact" };
  }

  // Common operational sessions can carry a source prefix, e.g.
  // "HEALTHDAY V5 · BINUS" while historical import company is simply "BINUS".
  const allCompanies = await supabase
    .from("vaccination_history_companies")
    .select("id,company_name,company_key,public_token")
    .eq("active", true)
    .limit(500);
  if (allCompanies.error) throw new Error(allCompanies.error.message);

  const aliasMatches = (allCompanies.data || []).filter((company: any) =>
    hints.some((hint) => companyHintMatches(historyText(company.company_key), hint)),
  );
  if (aliasMatches.length === 1) return { company: aliasMatches[0], reason: "company-alias" };
  return { company: null, reason: "company-not-found" };
}

async function familyForPerson(supabase: any, person: any) {
  if (!person?.id) return { parent: null, dependents: [] };
  if (person.participant_type === "DEPENDENT") {
    const rel = await supabase
      .from("vaccination_person_relationships")
      .select("relationship_type,parent:vaccination_persons!vaccination_person_relationships_parent_person_id_fkey(id,participant_name,employee_id,nik,email,phone)")
      .eq("dependent_person_id", person.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (rel.error) throw new Error(rel.error.message);
    const parent = Array.isArray(rel.data?.parent) ? rel.data.parent[0] : rel.data?.parent;
    return { parent: parent || null, dependents: [] };
  }

  const rels = await supabase
    .from("vaccination_person_relationships")
    .select("relationship_type,dependent:vaccination_persons!vaccination_person_relationships_dependent_person_id_fkey(id,participant_name,birth_date,gender)")
    .eq("parent_person_id", person.id)
    .eq("active", true)
    .order("id", { ascending: true });
  if (rels.error) throw new Error(rels.error.message);
  return {
    parent: null,
    dependents: (rels.data || []).map((rel: any) => Array.isArray(rel.dependent) ? rel.dependent[0] : rel.dependent).filter(Boolean),
  };
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "register")) return fail("Akses History Vaksinasi ditolak untuk role ini.", 403);

  const registrationId = toInt(req.nextUrl.searchParams.get("registration_id"), 0);
  if (!registrationId) return fail("registration_id wajib diisi.");

  const supabase = supabaseAdmin();
  try {
    const regResult = await supabase
      .from("vaccination_registrations")
      .select("*, session:vaccination_sessions(id,session_name,company_name,source_name,location,session_date)")
      .eq("id", registrationId)
      .single();
    if (regResult.error) return fail(regResult.error.message, 404);
    const registration = regResult.data;
    const session = Array.isArray(registration.session) ? registration.session[0] : registration.session;
    const companyName = historyText(registration.company_name || session?.company_name);

    const currentRegsResult = await supabase
      .from("vaccination_registrations")
      .select("id,session_id,participant_name,employee_id,nik,email,company_name,registered_at,session:vaccination_sessions(id,session_name,company_name,source_name,location,session_date)")
      .eq("participant_name", registration.participant_name)
      .order("id", { ascending: false })
      .limit(100);
    if (currentRegsResult.error) throw new Error(currentRegsResult.error.message);
    const currentRegIds = (currentRegsResult.data || [])
      .filter((row: any) => { const rowSession = Array.isArray(row.session) ? row.session[0] : row.session; return !companyName || historyCompanyKey(row.company_name || rowSession?.company_name) === historyCompanyKey(companyName); })
      .map((row: any) => Number(row.id))
      .filter(Boolean);

    let currentRecords: any[] = [];
    if (currentRegIds.length) {
      const recordsResult = await supabase
        .from("vaccination_records")
        .select("id,registration_id,session_id,vaccine_name,lot_number,dose_number,administered_at,administered_by,next_due_date,notes,status,session:vaccination_sessions(id,session_name,company_name,location,session_date)")
        .in("registration_id", currentRegIds)
        .order("administered_at", { ascending: false });
      if (recordsResult.error) throw new Error(recordsResult.error.message);
      currentRecords = recordsResult.data || [];
    }

    if (!companyName) {
      return ok({ registration, company: null, match: null, person: null, family: { parent: null, dependents: [] }, historical: [], current: currentRecords });
    }

    const resolvedCompany = await resolveHistoryCompany(supabase, registration, session);
    let company = resolvedCompany.company;
    let candidates: Candidate[] = company ? await findCandidates(supabase, Number(company.id), registration) : [];
    let best = candidates[0] || null;
    let matched = best && best.score >= 100 ? best : null;
    let matchScope = company ? resolvedCompany.reason : "company-not-found";

    // V151.1 safe fallback: if operational company naming differs from the imported
    // history company, allow a cross-company lookup ONLY when strong identity is
    // unambiguous. This is especially important for legacy sessions/source names.
    if (!matched) {
      const globalCandidates = await findGlobalCandidates(supabase, registration);
      const globalMatched = isSafeGlobalMatch(globalCandidates);
      if (globalMatched) {
        matched = globalMatched;
        best = globalMatched;
        matchScope = "strong-identity-fallback";
        const matchedCompany = await supabase
          .from("vaccination_history_companies")
          .select("id,company_name,company_key,public_token")
          .eq("id", Number(globalMatched.person.company_id))
          .maybeSingle();
        if (matchedCompany.error) throw new Error(matchedCompany.error.message);
        company = matchedCompany.data || company;
      } else if (!best && globalCandidates[0]) {
        best = globalCandidates[0];
      }
    }

    if (!matched) {
      return ok({
        registration,
        company,
        match: best ? { status: "REVIEW", score: best.score, reasons: best.reasons, scope: matchScope } : { status: "NOT_FOUND", score: 0, reasons: [], scope: matchScope },
        person: null,
        family: { parent: null, dependents: [] },
        historical: [],
        current: currentRecords,
      });
    }

    const historyResult = await supabase
      .from("vaccination_service_history")
      .select("id,service_date,service_category,service_name,product_brand,dose_number,lot_number,location,next_due_date,notes,source_year,source_filename,source_sheet,source_row")
      .eq("person_id", matched.person.id)
      .order("service_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false });
    if (historyResult.error) throw new Error(historyResult.error.message);

    const family = await familyForPerson(supabase, matched.person);
    return ok({
      registration,
      company,
      match: { status: "MATCHED", score: matched.score, reasons: matched.reasons, scope: matchScope },
      person: matched.person,
      family,
      historical: historyResult.data || [],
      current: currentRecords,
    });
  } catch (error: any) {
    const message = String(error?.message || error || "Gagal memuat riwayat peserta.");
    if (/vaccination_history_companies|vaccination_persons|vaccination_service_history|vaccination_person_relationships/i.test(message)) {
      return fail("Database History Vaksinasi belum siap. Jalankan sql/vaccination_history_v151.sql di Supabase SQL Editor.", 500, { detail: message });
    }
    return fail(message, 500);
  }
}
