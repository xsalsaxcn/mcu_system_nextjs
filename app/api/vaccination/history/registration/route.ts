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

async function findCandidates(supabase: any, companyId: number, registration: any) {
  const map = new Map<number, Candidate>();
  const nikKey = historyIdentityKey(registration.nik);
  const employeeKey = historyIdentityKey(registration.employee_id || registration.mcu_id);
  const emailKey = historyEmailKey(registration.email);
  const nameKey = historyNameKey(registration.participant_name);

  const queries: Promise<any>[] = [];
  if (nikKey) queries.push(supabase.from("vaccination_persons").select("*").eq("company_id", companyId).eq("nik_key", nikKey).limit(10));
  if (employeeKey) queries.push(supabase.from("vaccination_persons").select("*").eq("company_id", companyId).eq("employee_key", employeeKey).limit(10));
  if (emailKey) queries.push(supabase.from("vaccination_persons").select("*").eq("company_id", companyId).eq("email_key", emailKey).limit(10));
  if (nameKey) queries.push(supabase.from("vaccination_persons").select("*").eq("company_id", companyId).eq("name_key", nameKey).limit(20));

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
    const person = candidate.person;
    if (nameKey && same(person.name_key, nameKey)) {
      candidate.score += 50;
      candidate.reasons.push("nama");
    }
    if (nikKey && same(person.nik_key, nikKey)) {
      candidate.score += 120;
      candidate.reasons.push("NIK");
    }
    if (employeeKey && same(person.employee_key, employeeKey)) {
      candidate.score += 110;
      candidate.reasons.push("NIP/Employee ID");
    }
    if (emailKey && same(person.email_key, emailKey)) {
      candidate.score += 100;
      candidate.reasons.push("email");
    }

    if (person.participant_type === "DEPENDENT") {
      const parent = parentByDependent.get(Number(person.id));
      candidate.parent = parent || null;
      if (parent) {
        if (nikKey && same(parent.nik_key, nikKey)) {
          candidate.score += 110;
          candidate.reasons.push("NIK parent");
        }
        if (employeeKey && same(parent.employee_key, employeeKey)) {
          candidate.score += 100;
          candidate.reasons.push("NIP parent");
        }
        if (emailKey && same(parent.email_key, emailKey)) {
          candidate.score += 90;
          candidate.reasons.push("email parent");
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.score - a.score);
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
      .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date)")
      .eq("id", registrationId)
      .single();
    if (regResult.error) return fail(regResult.error.message, 404);
    const registration = regResult.data;
    const session = Array.isArray(registration.session) ? registration.session[0] : registration.session;
    const companyName = historyText(registration.company_name || session?.company_name);

    const currentRegsResult = await supabase
      .from("vaccination_registrations")
      .select("id,session_id,participant_name,employee_id,nik,email,company_name,registered_at,session:vaccination_sessions(id,session_name,company_name,location,session_date)")
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

    const companyResult = await supabase
      .from("vaccination_history_companies")
      .select("id,company_name,company_key,public_token")
      .eq("company_key", historyCompanyKey(companyName))
      .maybeSingle();
    if (companyResult.error) throw new Error(companyResult.error.message);
    const company = companyResult.data;
    if (!company) {
      return ok({ registration, company: null, match: null, person: null, family: { parent: null, dependents: [] }, historical: [], current: currentRecords });
    }

    const candidates = await findCandidates(supabase, Number(company.id), registration);
    const best = candidates[0] || null;
    const matched = best && best.score >= 100 ? best : null;
    if (!matched) {
      return ok({
        registration,
        company,
        match: best ? { status: "REVIEW", score: best.score, reasons: best.reasons } : { status: "NOT_FOUND", score: 0, reasons: [] },
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
      match: { status: "MATCHED", score: matched.score, reasons: matched.reasons },
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
