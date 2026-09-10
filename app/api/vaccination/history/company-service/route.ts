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

const SYSTEM_PAGE_LIMIT = 200;

function companyHintMatches(companyKey: string, hint: unknown) {
  if (!companyKey || companyKey === "unknown-company") return false;
  const hintKey = historyCompanyKey(hint);
  if (!hintKey || hintKey === "unknown-company") return false;
  if (hintKey === companyKey) return true;
  return (`-${hintKey}-`).includes(`-${companyKey}-`);
}

function identity(value: unknown) {
  return historyIdentityKey(value);
}

function email(value: unknown) {
  return historyEmailKey(value);
}

function name(value: unknown) {
  return historyNameKey(value);
}

function same(a: unknown, b: unknown) {
  return Boolean(a && b && String(a) === String(b));
}

function cleanSearch(value: unknown) {
  return historyText(value).replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();
}

function chunks<T>(values: T[], size = SYSTEM_PAGE_LIMIT) {
  const output: T[][] = [];
  for (let i = 0; i < values.length; i += size) output.push(values.slice(i, i + size));
  return output;
}

function dateOnly(value: unknown) {
  const text = historyText(value);
  if (!text) return "";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function serviceKey(service: any) {
  return [
    dateOnly(service?.service_date),
    historyNameKey(service?.service_name),
    historyNameKey(service?.product_brand),
    historyIdentityKey(service?.lot_number),
  ].join("|");
}

function mergeServices(values: any[]) {
  const map = new Map<string, any>();
  for (const service of values) {
    const key = serviceKey(service);
    const existing = map.get(key);
    if (!existing || (existing.source === "SYSTEM" && service.source === "HISTORY_IMPORT")) {
      map.set(key, service);
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const ad = String(a.service_date || "");
    const bd = String(b.service_date || "");
    if (ad !== bd) return bd.localeCompare(ad);
    return Number(b.id || 0) - Number(a.id || 0);
  });
}

function benefitLabel(service: any) {
  const serviceName = historyText(service?.service_name);
  const brand = historyText(service?.product_brand);
  if (serviceName && brand && !serviceName.toLowerCase().includes(brand.toLowerCase())) return `${serviceName} · ${brand}`;
  return serviceName || brand || "Layanan";
}

function personScore(person: any, parent: any, registration: any) {
  const personName = name(person?.name_key || person?.participant_name);
  const personNik = identity(person?.nik_key || person?.nik);
  const personEmployee = identity(person?.employee_key || person?.employee_id);
  const personEmail = email(person?.email_key || person?.email);

  const regName = name(registration?.participant_name);
  const regNik = identity(registration?.nik);
  const regEmployee = identity(registration?.employee_id || registration?.mcu_id);
  const regEmail = email(registration?.email);

  let score = 0;
  if (regName && same(personName, regName)) score += 50;
  if (regNik && same(personNik, regNik)) score += 120;
  if (regEmployee && same(personEmployee, regEmployee)) score += 110;
  if (regEmail && same(personEmail, regEmail)) score += 100;

  if (person?.participant_type === "DEPENDENT") {
    const parentNik = identity(parent?.nik_key || parent?.nik);
    const parentEmployee = identity(parent?.employee_key || parent?.employee_id);
    const parentEmail = email(parent?.email_key || parent?.email);
    let parentStrong = 0;
    if (regNik && same(parentNik, regNik)) parentStrong += 1;
    if (regEmployee && same(parentEmployee, regEmployee)) parentStrong += 1;
    if (regEmail && same(parentEmail, regEmail)) parentStrong += 1;
    if (!(regName && same(personName, regName) && parentStrong >= 1)) return 0;
    score += parentStrong * 100;
  }

  return score;
}

async function loadSystemRowsForCompany(supabase: any, companyKey: string) {
  const sessionsResult = await supabase
    .from("vaccination_sessions")
    .select("id,session_name,company_name,source_name,location,session_date")
    .order("id", { ascending: false })
    .limit(5000);
  if (sessionsResult.error) throw new Error(sessionsResult.error.message);

  const sessions = (sessionsResult.data || []).filter((session: any) =>
    [session.company_name, session.source_name, session.session_name].some((hint) => companyHintMatches(companyKey, hint)),
  );
  if (!sessions.length) return [];

  const sessionById = new Map<number, any>();
  const sessionIds: number[] = [];
  for (const session of sessions) {
    const id = Number(session.id);
    if (!id) continue;
    sessionIds.push(id);
    sessionById.set(id, session);
  }

  const registrations: any[] = [];
  for (const ids of chunks(sessionIds)) {
    const result = await supabase
      .from("vaccination_registrations")
      .select("id,session_id,participant_name,employee_id,nik,email,company_name")
      .in("session_id", ids)
      .limit(10000);
    if (result.error) throw new Error(result.error.message);
    registrations.push(...(result.data || []));
  }
  if (!registrations.length) return [];

  const registrationById = new Map<number, any>();
  const registrationIds: number[] = [];
  for (const registration of registrations) {
    const id = Number(registration.id);
    if (!id) continue;
    registrationIds.push(id);
    registrationById.set(id, registration);
  }

  const records: any[] = [];
  for (const ids of chunks(registrationIds)) {
    const result = await supabase
      .from("vaccination_records")
      .select("id,registration_id,session_id,vaccine_name,lot_number,dose_number,administered_at,administered_by,next_due_date,notes,status")
      .in("registration_id", ids)
      .order("administered_at", { ascending: false })
      .limit(10000);
    if (result.error) throw new Error(result.error.message);
    records.push(...(result.data || []));
  }

  return records.map((record: any) => ({
    record,
    registration: registrationById.get(Number(record.registration_id)) || null,
    session: sessionById.get(Number(record.session_id)) || null,
  })).filter((row: any) => row.registration);
}

function systemServicesForPerson(person: any, parent: any, systemRows: any[]) {
  const matches = systemRows.filter((row) => personScore(person, parent, row.registration) >= 100);
  return matches.map(({ record, session }: any) => ({
    id: `system-${record.id}`,
    service_date: dateOnly(record.administered_at),
    service_category: "VACCINATION",
    service_name: historyText(record.vaccine_name) || "Vaksinasi",
    product_brand: "",
    dose_number: record.dose_number || null,
    lot_number: historyText(record.lot_number),
    location: historyText(session?.location || session?.session_name),
    next_due_date: record.next_due_date || null,
    notes: historyText(record.notes),
    administered_by: historyText(record.administered_by),
    source: "SYSTEM",
    source_label: "Sistem Saat Ini",
  }));
}

async function parentMapForDependents(supabase: any, dependentIds: number[]) {
  const map = new Map<number, any>();
  if (!dependentIds.length) return map;
  for (const ids of chunks(dependentIds)) {
    const result = await supabase
      .from("vaccination_person_relationships")
      .select("dependent_person_id,relationship_type,parent:vaccination_persons!vaccination_person_relationships_parent_person_id_fkey(id,participant_name,employee_id,employee_key,nik,nik_key,email,email_key,phone)")
      .in("dependent_person_id", ids)
      .eq("active", true);
    if (result.error) throw new Error(result.error.message);
    for (const relation of result.data || []) {
      const parent = Array.isArray(relation.parent) ? relation.parent[0] : relation.parent;
      if (parent) map.set(Number(relation.dependent_person_id), parent);
    }
  }
  return map;
}

async function dependentsForParent(supabase: any, parentId: number) {
  const result = await supabase
    .from("vaccination_person_relationships")
    .select("relationship_type,dependent:vaccination_persons!vaccination_person_relationships_dependent_person_id_fkey(id,participant_name,birth_date,gender)")
    .eq("parent_person_id", parentId)
    .eq("active", true)
    .order("id", { ascending: true });
  if (result.error) throw new Error(result.error.message);
  return (result.data || []).map((row: any) => ({
    relationship_type: row.relationship_type,
    ...(Array.isArray(row.dependent) ? row.dependent[0] : row.dependent),
  })).filter((row: any) => row?.id);
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "dashboard")) return fail("Akses History Company Service ditolak untuk role ini.", 403);

  const supabase = supabaseAdmin();
  const companyId = toInt(req.nextUrl.searchParams.get("company_id"), 0);
  const personId = toInt(req.nextUrl.searchParams.get("person_id"), 0);
  const search = cleanSearch(req.nextUrl.searchParams.get("q"));
  const type = historyText(req.nextUrl.searchParams.get("type")).toUpperCase();
  const page = Math.max(1, toInt(req.nextUrl.searchParams.get("page"), 1));
  const pageSize = Math.min(100, Math.max(10, toInt(req.nextUrl.searchParams.get("page_size"), 50)));

  try {
    if (!companyId) {
      const companiesResult = await supabase
        .from("vaccination_history_companies")
        .select("id,company_name,company_key,active,created_at")
        .eq("active", true)
        .order("company_name", { ascending: true })
        .limit(500);
      if (companiesResult.error) throw new Error(companiesResult.error.message);
      const companies = companiesResult.data || [];

      const rows: any[] = [];
      for (const companyGroup of chunks(companies, 12)) {
        const groupRows = await Promise.all(companyGroup.map(async (company: any) => {
          const companyIdValue = Number(company.id);
          const [personsResult, employeesResult, dependentsResult, servicesResult, latestResult] = await Promise.all([
            supabase.from("vaccination_persons").select("id", { count: "exact", head: true }).eq("company_id", companyIdValue).eq("active", true),
            supabase.from("vaccination_persons").select("id", { count: "exact", head: true }).eq("company_id", companyIdValue).eq("participant_type", "EMPLOYEE").eq("active", true),
            supabase.from("vaccination_persons").select("id", { count: "exact", head: true }).eq("company_id", companyIdValue).eq("participant_type", "DEPENDENT").eq("active", true),
            supabase.from("vaccination_service_history").select("id", { count: "exact", head: true }).eq("company_id", companyIdValue),
            supabase.from("vaccination_service_history").select("service_date").eq("company_id", companyIdValue).not("service_date", "is", null).order("service_date", { ascending: false }).limit(1),
          ]);
          for (const result of [personsResult, employeesResult, dependentsResult, servicesResult, latestResult]) {
            if (result.error) throw new Error(result.error.message);
          }
          return {
            ...company,
            persons: personsResult.count || 0,
            employees: employeesResult.count || 0,
            dependents: dependentsResult.count || 0,
            history_services: servicesResult.count || 0,
            latest_service_date: latestResult.data?.[0]?.service_date || "",
          };
        }));
        rows.push(...groupRows);
      }

      return ok({
        companies: rows,
        summary: {
          companies: rows.length,
          persons: rows.reduce((sum: number, row: any) => sum + Number(row.persons || 0), 0),
          dependents: rows.reduce((sum: number, row: any) => sum + Number(row.dependents || 0), 0),
          history_services: rows.reduce((sum: number, row: any) => sum + Number(row.history_services || 0), 0),
        },
      });
    }

    const companyResult = await supabase
      .from("vaccination_history_companies")
      .select("id,company_name,company_key,active")
      .eq("id", companyId)
      .eq("active", true)
      .maybeSingle();
    if (companyResult.error) throw new Error(companyResult.error.message);
    const company = companyResult.data;
    if (!company) return fail("Perusahaan History tidak ditemukan.", 404);

    if (personId) {
      const personResult = await supabase
        .from("vaccination_persons")
        .select("*")
        .eq("id", personId)
        .eq("company_id", companyId)
        .eq("active", true)
        .maybeSingle();
      if (personResult.error) throw new Error(personResult.error.message);
      const person = personResult.data;
      if (!person) return fail("Peserta History tidak ditemukan.", 404);

      const parentMap = await parentMapForDependents(supabase, person.participant_type === "DEPENDENT" ? [Number(person.id)] : []);
      const parent = parentMap.get(Number(person.id)) || null;
      const dependents = person.participant_type === "EMPLOYEE" ? await dependentsForParent(supabase, Number(person.id)) : [];

      const historyResult = await supabase
        .from("vaccination_service_history")
        .select("id,service_date,service_category,service_name,product_brand,dose_number,lot_number,location,next_due_date,notes,source_year,source_filename,source_sheet,source_row")
        .eq("company_id", companyId)
        .eq("person_id", personId)
        .order("service_date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false });
      if (historyResult.error) throw new Error(historyResult.error.message);

      const historical = (historyResult.data || []).map((row: any) => ({
        ...row,
        source: "HISTORY_IMPORT",
        source_label: "History Import",
      }));
      const systemRows = await loadSystemRowsForCompany(supabase, String(company.company_key));
      const current = systemServicesForPerson(person, parent, systemRows);
      const services = mergeServices([...historical, ...current]);

      return ok({
        company,
        person,
        parent,
        dependents,
        historical,
        current,
        services,
        summary: {
          total: services.length,
          history: historical.length,
          system: current.length,
          unique_benefits: Array.from(new Set(services.map(benefitLabel))).length,
        },
      });
    }

    let query = supabase
      .from("vaccination_persons")
      .select("id,company_id,participant_type,participant_name,employee_id,nik,email,phone,birth_date,gender,active", { count: "exact" })
      .eq("company_id", companyId)
      .eq("active", true)
      .order("participant_name", { ascending: true });

    if (["EMPLOYEE", "DEPENDENT"].includes(type)) query = query.eq("participant_type", type);
    if (search) {
      const term = `%${search}%`;
      query = query.or(`participant_name.ilike.${term},employee_id.ilike.${term},nik.ilike.${term},email.ilike.${term}`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const personsResult = await query.range(from, to);
    if (personsResult.error) throw new Error(personsResult.error.message);
    const persons = personsResult.data || [];
    const personIds = persons.map((row: any) => Number(row.id)).filter(Boolean);

    let historyServices: any[] = [];
    if (personIds.length) {
      const result = await supabase
        .from("vaccination_service_history")
        .select("id,person_id,service_date,service_category,service_name,product_brand,dose_number,lot_number,location,next_due_date,notes")
        .in("person_id", personIds)
        .order("service_date", { ascending: false, nullsFirst: false });
      if (result.error) throw new Error(result.error.message);
      historyServices = result.data || [];
    }

    const dependentIds = persons.filter((row: any) => row.participant_type === "DEPENDENT").map((row: any) => Number(row.id));
    const parentMap = await parentMapForDependents(supabase, dependentIds);
    const systemRows = await loadSystemRowsForCompany(supabase, String(company.company_key));

    const historyByPerson = new Map<number, any[]>();
    for (const service of historyServices) {
      const id = Number(service.person_id);
      if (!historyByPerson.has(id)) historyByPerson.set(id, []);
      historyByPerson.get(id)!.push({ ...service, source: "HISTORY_IMPORT", source_label: "History Import" });
    }

    const rows = persons.map((person: any) => {
      const parent = parentMap.get(Number(person.id)) || null;
      const historical = historyByPerson.get(Number(person.id)) || [];
      const current = systemServicesForPerson(person, parent, systemRows);
      const services = mergeServices([...historical, ...current]);
      const benefits = Array.from(new Set(services.map(benefitLabel)));
      return {
        ...person,
        parent: parent ? { id: parent.id, participant_name: parent.participant_name, employee_id: parent.employee_id, nik: parent.nik, email: parent.email } : null,
        service_count: services.length,
        history_count: historical.length,
        system_count: current.length,
        benefit_names: benefits,
        last_service_date: services[0]?.service_date || "",
        last_service_name: services[0] ? benefitLabel(services[0]) : "",
      };
    });

    const [personCount, dependentCount, serviceCount] = await Promise.all([
      supabase.from("vaccination_persons").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("active", true),
      supabase.from("vaccination_persons").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("participant_type", "DEPENDENT").eq("active", true),
      supabase.from("vaccination_service_history").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    ]);
    if (personCount.error) throw new Error(personCount.error.message);
    if (dependentCount.error) throw new Error(dependentCount.error.message);
    if (serviceCount.error) throw new Error(serviceCount.error.message);

    return ok({
      company,
      rows,
      pagination: {
        page,
        page_size: pageSize,
        total: personsResult.count || 0,
        pages: Math.max(1, Math.ceil((personsResult.count || 0) / pageSize)),
      },
      summary: {
        persons: personCount.count || 0,
        dependents: dependentCount.count || 0,
        history_services: serviceCount.count || 0,
        system_records: systemRows.length,
      },
    });
  } catch (error: any) {
    const message = String(error?.message || error || "Gagal memuat History Company Service.");
    if (/vaccination_history_companies|vaccination_persons|vaccination_service_history|vaccination_person_relationships/i.test(message)) {
      return fail("Database History Vaksinasi belum siap. Jalankan sql/vaccination_history_v151.sql di Supabase SQL Editor.", 500, { detail: message });
    }
    return fail(message, 500);
  }
}
