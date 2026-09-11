import {
  historyCompanyKey,
  historyEmailKey,
  historyIdentityKey,
  historyNameKey,
  historyText,
} from "@/lib/vaccination/history";

const PAGE_LIMIT = 200;

function chunks<T>(values: T[], size = PAGE_LIMIT) {
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

function companyHintMatches(companyKey: string, hint: unknown) {
  if (!companyKey || companyKey === "unknown-company") return false;
  const hintKey = historyCompanyKey(hint);
  if (!hintKey || hintKey === "unknown-company") return false;
  if (hintKey === companyKey) return true;
  return (`-${hintKey}-`).includes(`-${companyKey}-`);
}

function same(a: unknown, b: unknown) {
  return Boolean(a && b && String(a) === String(b));
}

function personScore(person: any, parent: any, registration: any) {
  const personName = historyNameKey(person?.name_key || person?.participant_name);
  const personNik = historyIdentityKey(person?.nik_key || person?.nik);
  const personEmployee = historyIdentityKey(person?.employee_key || person?.employee_id);
  const personEmail = historyEmailKey(person?.email_key || person?.email);

  const regName = historyNameKey(registration?.participant_name);
  const regNik = historyIdentityKey(registration?.nik);
  const regEmployee = historyIdentityKey(registration?.employee_id || registration?.mcu_id);
  const regEmail = historyEmailKey(registration?.email);

  let score = 0;
  if (regName && same(personName, regName)) score += 50;
  if (regNik && same(personNik, regNik)) score += 120;
  if (regEmployee && same(personEmployee, regEmployee)) score += 110;
  if (regEmail && same(personEmail, regEmail)) score += 100;

  if (person?.participant_type === "DEPENDENT") {
    const parentNik = historyIdentityKey(parent?.nik_key || parent?.nik);
    const parentEmployee = historyIdentityKey(parent?.employee_key || parent?.employee_id);
    const parentEmail = historyEmailKey(parent?.email_key || parent?.email);
    let parentStrong = 0;
    if (regNik && same(parentNik, regNik)) parentStrong += 1;
    if (regEmployee && same(parentEmployee, regEmployee)) parentStrong += 1;
    if (regEmail && same(parentEmail, regEmail)) parentStrong += 1;
    if (!(regName && same(personName, regName) && parentStrong >= 1)) return 0;
    score += parentStrong * 100;
  }

  return score;
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
    if (!existing || (existing.source === "SYSTEM" && service.source !== "SYSTEM")) map.set(key, service);
  }
  return Array.from(map.values()).sort((a, b) => {
    const ad = String(a.service_date || "");
    const bd = String(b.service_date || "");
    if (ad !== bd) return bd.localeCompare(ad);
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
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
      .select("id,session_id,participant_name,employee_id,mcu_id,nik,email,company_name")
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

  return records
    .map((record: any) => ({
      record,
      registration: registrationById.get(Number(record.registration_id)) || null,
      session: sessionById.get(Number(record.session_id)) || null,
    }))
    .filter((row: any) => row.registration);
}

function systemServicesForPerson(person: any, parent: any, systemRows: any[]) {
  return systemRows
    .filter((row) => personScore(person, parent, row.registration) >= 100)
    .map(({ record, session }: any) => ({
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

export async function loadVaccinationHistoryPortalData(supabase: any, parent: any) {
  const companyResult = await supabase
    .from("vaccination_history_companies")
    .select("id,company_name,company_key")
    .eq("id", parent.company_id)
    .eq("active", true)
    .maybeSingle();
  if (companyResult.error) throw new Error(companyResult.error.message);
  if (!companyResult.data) throw new Error("Perusahaan history tidak ditemukan.");
  const company = companyResult.data;

  const relationResult = await supabase
    .from("vaccination_person_relationships")
    .select("relationship_type,dependent:vaccination_persons!vaccination_person_relationships_dependent_person_id_fkey(id,company_id,participant_type,participant_name,employee_id,employee_key,nik,nik_key,email,email_key,phone,birth_date,gender,active)")
    .eq("company_id", parent.company_id)
    .eq("parent_person_id", parent.id)
    .eq("active", true)
    .order("id", { ascending: true });
  if (relationResult.error) throw new Error(relationResult.error.message);

  const dependents = (relationResult.data || [])
    .map((row: any) => ({
      ...(Array.isArray(row.dependent) ? row.dependent[0] : row.dependent),
      relationship_type: row.relationship_type,
    }))
    .filter((row: any) => row?.id && row?.active !== false);

  const people = [parent, ...dependents];
  const ids = people.map((row: any) => Number(row.id)).filter(Boolean);

  let historyRows: any[] = [];
  if (ids.length) {
    const result = await supabase
      .from("vaccination_service_history")
      .select("id,person_id,service_date,service_category,service_name,product_brand,dose_number,lot_number,location,next_due_date,notes,source_type,source_year,source_filename,source_sheet,source_row")
      .in("person_id", ids)
      .order("service_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false });
    if (result.error) throw new Error(result.error.message);
    historyRows = result.data || [];
  }

  const historyByPerson = new Map<number, any[]>();
  for (const row of historyRows) {
    const id = Number(row.person_id);
    if (!historyByPerson.has(id)) historyByPerson.set(id, []);
    historyByPerson.get(id)!.push({
      ...row,
      source: "HISTORY",
      source_label: row.source_type === "ADMIN_MANUAL" ? "Admin Update" : "History",
    });
  }

  const systemRows = await loadSystemRowsForCompany(supabase, String(company.company_key || ""));

  const profiles = people.map((person: any) => {
    const historical = historyByPerson.get(Number(person.id)) || [];
    const current = systemServicesForPerson(person, person.participant_type === "DEPENDENT" ? parent : null, systemRows);
    const services = mergeServices([...historical, ...current]);
    return {
      person: {
        id: person.id,
        participant_type: person.participant_type,
        participant_name: person.participant_name,
        employee_id: person.participant_type === "EMPLOYEE" ? person.employee_id : null,
        email: person.participant_type === "EMPLOYEE" ? person.email : null,
        birth_date: person.birth_date,
        gender: person.gender,
        relationship_type: person.relationship_type || null,
      },
      services,
      summary: {
        total: services.length,
        history: historical.length,
        system: current.length,
      },
    };
  });

  return {
    company,
    account: {
      id: parent.id,
      participant_name: parent.participant_name,
      employee_id: parent.employee_id,
      email: parent.email,
    },
    profiles,
  };
}
