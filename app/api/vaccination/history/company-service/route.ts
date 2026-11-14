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
import { vaccinationDependentsForEmployee } from "@/lib/vaccination/historyFamily";

export const dynamic = "force-dynamic";

const SYSTEM_PAGE_LIMIT = 200;
const V6338_READ_PAGE = 800;

// Read-only pagination: PostgREST caps result windows, so a single .limit(10000)
// can silently omit newer services from corporate history when many rows exist.
async function readAllPages(build: () => any, maxRows: number) {
  const rows: any[] = [];
  while (rows.length < maxRows) {
    const result = await build().range(rows.length, rows.length + V6338_READ_PAGE - 1);
    if (result.error) throw new Error(result.error.message);
    const batch = result.data || [];
    rows.push(...batch);
    if (batch.length < V6338_READ_PAGE) return rows;
  }
  throw new Error(`History query reached guarded ${maxRows}-row limit. Use narrower company scope instead of silently displaying partial history.`);
}


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
    // A registration benefit and a clinical vaccination record are different
    // facts, even when vaccine/date/lot match. Do not collapse them together.
    const key = service.source === "SYSTEM_BENEFIT" ? `benefit:${service.id}` : serviceKey(service);
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

  // Shared BINUSIAN ID is common within a family. Never attach a service to
  // the wrong child/parent solely because employee_id is shared.
  if (!regName || !same(personName, regName)) return 0;
  const explicitPersonId = Number(registration?.history_person_id || 0);
  if (explicitPersonId) return explicitPersonId === Number(person?.id) ? 1000 : 0;
  let score = 50;

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

async function loadSystemRowsForCompany(supabase: any, companyKey: string, companyId: number) {
  const sessionRows = await readAllPages(
    () => supabase.from("vaccination_sessions")
      .select("id,session_name,company_name,source_name,location,session_date")
      .order("id", { ascending: false }),
    5600,
  );
  const sessions = sessionRows.filter((session: any) =>
    [session.company_name, session.source_name, session.session_name].some((hint) => companyHintMatches(companyKey, hint)),
  );
  // Explicit person links are authoritative even when operational session
  // labels differ from the imported History Company label.
  const sessionById = new Map<number, any>(sessionRows.map((row: any) => [Number(row.id), row]));
  const sessionIds: number[] = [];
  for (const session of sessions) {
    const id = Number(session.id);
    if (!id) continue;
    sessionIds.push(id);
  }

  const registrations: any[] = [];
  for (const ids of chunks(sessionIds)) {
    registrations.push(...await readAllPages(
      () => supabase.from("vaccination_registrations")
        .select("id,session_id,participant_name,employee_id,nik,email,company_name,history_person_id,registered_at,patient_service_status,queue_status,bazar_queue_status,validation_status,payment_method,payment_price")
        .in("session_id", ids).order("id", { ascending: true }),
      20800,
    ));
  }
  // Read any registration explicitly linked to a person in this History
  // company. This covers the Agung case where the Registrasi modal has
  // matched via registration relation but Company History misses the session.
  const personIds = (await readAllPages(
    () => supabase.from("vaccination_persons").select("id")
      .eq("company_id", companyId).eq("active", true).order("id", { ascending: true }),
    20800,
  )).map((row: any) => Number(row.id)).filter(Boolean);
  for (const ids of chunks(personIds)) {
    registrations.push(...await readAllPages(
      () => supabase.from("vaccination_registrations")
        .select("id,session_id,participant_name,employee_id,nik,email,company_name,history_person_id,registered_at,patient_service_status,queue_status,bazar_queue_status,validation_status,payment_method,payment_price")
        .in("history_person_id", ids).order("id", { ascending: true }),
      20800,
    ));
  }
  if (!registrations.length) return [];

  const registrationById = new Map<number, any>();
  const registrationIds: number[] = [];
  for (const registration of registrations) {
    const id = Number(registration.id);
    if (!id) continue;
    if (!registrationById.has(id)) registrationIds.push(id);
    registrationById.set(id, registration);
  }

  const rows: any[] = [];
  for (const ids of chunks(registrationIds)) {
    const records = await readAllPages(
      () => supabase.from("vaccination_records")
        .select("id,registration_id,session_id,vaccine_name,lot_number,dose_number,administered_at,administered_by,next_due_date,notes,status")
        .in("registration_id", ids).order("id", { ascending: true }),
      5600,
    );
    for (const record of records) {
      const registration = registrationById.get(Number(record.registration_id));
      if (registration) rows.push({ record, registration, session: sessionById.get(Number(registration.session_id)) || null });
    }
    const items = await readAllPages(
      () => supabase.from("vaccination_registration_items")
        .select("id,registration_id,service_mode,status,active,payment_method,sales_price_snapshot,lot_id,lot:vaccination_vaccine_lots(id,lot_number),vaccine:vaccination_vaccines(id,name,brand)")
        .in("registration_id", ids).eq("active", true).order("id", { ascending: true }),
      5600,
    );
    for (const item of items) {
      const registration = registrationById.get(Number(item.registration_id));
      if (registration) rows.push({ item, registration, session: sessionById.get(Number(registration.session_id)) || null });
    }
  }
  return rows;
}

function systemServicesForPerson(person: any, parent: any, systemRows: any[]) {
  const matches = systemRows.filter((row) => row.record && personScore(person, parent, row.registration) >= 100);
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
    record_status: historyText(record.status),
    source: "SYSTEM",
    source_label: "Record Sistem",
  }));
}

function systemBenefitsForPerson(person: any, parent: any, systemRows: any[]) {
  return systemRows.filter((row) => row.item && personScore(person, parent, row.registration) >= 100)
    .map(({ item, registration, session }: any) => {
      const vaccine = Array.isArray(item.vaccine) ? item.vaccine[0] : item.vaccine;
      const lot = Array.isArray(item.lot) ? item.lot[0] : item.lot;
      const mode = String(item.service_mode || registration.patient_service_status || "HEALTHDAY").toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
      return {
        id: `benefit-${item.id}`,
        service_date: dateOnly(registration.registered_at || session?.session_date),
        service_category: "VACCINATION",
        service_name: historyText(vaccine?.name) || "Vaksinasi",
        product_brand: historyText(vaccine?.brand),
        dose_number: null,
        lot_number: historyText(lot?.lot_number),
        location: historyText(session?.location || session?.session_name),
        next_due_date: null,
        notes: "",
        source: "SYSTEM_BENEFIT",
        source_label: "Benefit Registrasi",
        service_mode: mode,
        item_status: historyText(item.status),
        registration_status: historyText(mode === "BAZAR" ? registration.bazar_queue_status : registration.queue_status),
        validation_status: historyText(registration.validation_status),
        payment_method: historyText(item.payment_method || registration.payment_method),
        payment_amount: Number(item.sales_price_snapshot ?? registration.payment_price ?? 0),
        registration_id: Number(registration.id),
        item_id: Number(item.id),
      };
    });
}

// V633.9 - read-only operational search. A Registration is NOT automatically
// a History Master person. Shared BINUSIAN IDs never authorize merging names.
async function searchUnlinkedOperationalRegistrations(
  supabase: any, company: any, search: string,
) {
  if (search.length < 2) return [];
  const token = cleanSearch(search).slice(0, 100);
  if (token.length < 2) return [];
  const term = `%${token}%`;
  const result = await supabase.from("vaccination_registrations")
    .select("id,session_id,participant_name,employee_id,nik,email,company_name,history_person_id,registered_at")
    .or(`participant_name.ilike.${term},employee_id.ilike.${term},nik.ilike.${term},email.ilike.${term}`)
    .order("id", { ascending: false }).limit(101);
  if (result.error) throw new Error(result.error.message);
  if ((result.data || []).length > 100) {
    throw new Error("Terlalu banyak registrasi cocok. Persempit pencarian dengan nama lengkap atau identitas khusus.");
  }
  const matches = result.data || [];
  if (!matches.length) return [];
  const sessionIds = Array.from(new Set<number>(matches.map((r: any) => Number(r.session_id)).filter(Boolean)));
  const sessionResult = await supabase.from("vaccination_sessions")
    .select("id,session_name,company_name,source_name,session_date")
    .in("id", sessionIds);
  if (sessionResult.error) throw new Error(sessionResult.error.message);
  const sessionMap = new Map<number, any>((sessionResult.data || []).map((s: any) => [Number(s.id), s]));
  const scoped = matches.filter((r: any) => {
    const session = sessionMap.get(Number(r.session_id));
    return [r.company_name, session?.company_name, session?.source_name, session?.session_name]
      .some((v) => companyHintMatches(String(company.company_key), v));
  });
  if (!scoped.length) return [];
  // If the registration already points to an actual History Master person,
  // it belongs in the canonical table, not in this fallback result.
  const linkedIds = Array.from(new Set<number>(scoped.map((r: any) => Number(r.history_person_id)).filter(Boolean)));
  const confirmedIds = new Set<number>();
  if (linkedIds.length) {
    const linkResult = await supabase.from("vaccination_persons").select("id")
      .eq("company_id", Number(company.id)).eq("active", true).in("id", linkedIds);
    if (linkResult.error) throw new Error(linkResult.error.message);
    (linkResult.data || []).forEach((p: any) => confirmedIds.add(Number(p.id)));
  }
  const unlinked = scoped.filter((r: any) => !confirmedIds.has(Number(r.history_person_id || 0)));
  if (!unlinked.length) return [];
  const ids = unlinked.map((r: any) => Number(r.id));
  const [itemsResult, recordsResult] = await Promise.all([
    supabase.from("vaccination_registration_items")
      .select("id,registration_id,service_mode,status,active,vaccine:vaccination_vaccines(id,name,brand)")
      .in("registration_id", ids).eq("active", true),
    supabase.from("vaccination_records")
      .select("id,registration_id,status,vaccine_name,administered_at")
      .in("registration_id", ids),
  ]);
  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (recordsResult.error) throw new Error(recordsResult.error.message);
  const itemsById = new Map<number, any[]>();
  const recordsById = new Map<number, any[]>();
  for (const item of itemsResult.data || []) {
    const id = Number(item.registration_id);
    if (!itemsById.has(id)) itemsById.set(id, []);
    itemsById.get(id)!.push(item);
  }
  for (const record of recordsResult.data || []) {
    const id = Number(record.registration_id);
    if (!recordsById.has(id)) recordsById.set(id, []);
    recordsById.get(id)!.push(record);
  }
  const groups = new Map<string, any>();
  for (const registration of unlinked) {
    const participantName = name(registration.participant_name);
    const employeeId = identity(registration.employee_id);
    const nik = identity(registration.nik);
    const address = email(registration.email);
    if (!participantName || !(employeeId || nik || address)) continue;
    // No dedup on BINUSIAN ID alone: exact name AND at least one stable key.
    const key = `${participantName}|${employeeId}|${nik}|${address}`;
    const regId = Number(registration.id);
    const items = itemsById.get(regId) || [];
    const records = recordsById.get(regId) || [];
    let group = groups.get(key);
    if (!group) {
      group = {
        registration_id: regId, participant_name: registration.participant_name,
        employee_id: registration.employee_id, nik: registration.nik,
        email: registration.email, registration_count: 0,
        benefit_count: 0, record_count: 0, benefit_names: [] as string[],
        last_date: "", source_label: "Registrasi vaksinasi (belum terhubung ke profil History)",
      };
      groups.set(key, group);
    }
    group.registration_count += 1;
    group.benefit_count += items.length;
    group.record_count += records.length;
    for (const item of items) {
      const v = Array.isArray(item.vaccine) ? item.vaccine[0] : item.vaccine;
      const value = historyText(v?.name);
      if (value && !group.benefit_names.includes(value)) group.benefit_names.push(value);
    }
    const itemDate = records.map((r: any) => dateOnly(r.administered_at)).sort().pop() || "";
    const date = itemDate || dateOnly(registration.registered_at) || dateOnly(sessionMap.get(Number(registration.session_id))?.session_date);
    if (date > group.last_date) group.last_date = date;
  }
  return Array.from(groups.values()).slice(0, 100);
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

async function dependentsForParent(supabase: any, parent: any) {
  const family = await vaccinationDependentsForEmployee(supabase, parent);
  return family.dependents;
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
        .select("id,company_name,company_key,public_token,active,created_at")
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
      const dependents = person.participant_type === "EMPLOYEE" ? await dependentsForParent(supabase, person) : [];

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
      const systemRows = await loadSystemRowsForCompany(supabase, String(company.company_key), companyId);
      const current = systemServicesForPerson(person, parent, systemRows);
      const benefits = systemBenefitsForPerson(person, parent, systemRows);
      const services = mergeServices([...historical, ...benefits, ...current]);

      return ok({
        company,
        person,
        parent,
        dependents,
        historical,
        current,
        benefits,
        services,
        summary: {
          total: services.length,
          history: historical.length,
          system: current.length,
          system_benefits: benefits.length,
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
    const systemRows = await loadSystemRowsForCompany(supabase, String(company.company_key), companyId);

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
      const registeredBenefits = systemBenefitsForPerson(person, parent, systemRows);
      const services = mergeServices([...historical, ...registeredBenefits, ...current]);
      const benefits = Array.from(new Set(services.map(benefitLabel)));
      return {
        ...person,
        parent: parent ? { id: parent.id, participant_name: parent.participant_name, employee_id: parent.employee_id, nik: parent.nik, email: parent.email } : null,
        service_count: services.length,
        history_count: historical.length,
        system_count: current.length,
        system_benefit_count: registeredBenefits.length,
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

    const operationalMatches = search && page === 1
      ? await searchUnlinkedOperationalRegistrations(supabase, company, search)
      : [];

    return ok({
      company,
      rows,
      operational_matches: operationalMatches,
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
        system_records: systemRows.filter((row: any) => Boolean(row.record)).length,
        system_benefits: systemRows.filter((row: any) => Boolean(row.item)).length,
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
