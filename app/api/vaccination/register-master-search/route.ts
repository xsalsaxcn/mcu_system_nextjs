import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin } from "../_utils";

// VACCINATION_REGISTER_MASTER_SEARCH_API_V153_0
export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalized(value: any) {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function companyKey(value: any) {
  return normalized(value).replace(/\s+/g, "-");
}

function searchText(value: any) {
  return clean(value)
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function email(value: any) {
  return clean(value).toLowerCase();
}

function first(...values: any[]) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return "";
}

function personKey(row: any) {
  const nik = normalized(row?.nik);
  const employeeId = normalized(row?.employeeId);
  const personEmail = email(row?.email);

  if (nik) return `nik:${nik}`;
  if (employeeId) return `emp:${employeeId}`;
  if (personEmail) return `email:${personEmail}`;

  // Name-only matching is deliberately NOT used across sources.
  return `${row?.sourceType || "source"}:${row?.sourceId || row?.historyPersonId || "x"}:${normalized(row?.name)}`;
}

function mergePerson(existing: any, incoming: any) {
  // Prefer an operational participant because it gives vaccination_registrations.participant_id.
  const primary =
    existing?.sourceType === "DATABASE"
      ? existing
      : incoming?.sourceType === "DATABASE"
        ? incoming
        : existing;
  const secondary = primary === existing ? incoming : existing;

  return {
    ...secondary,
    ...primary,
    participantId: primary.participantId || secondary.participantId || null,
    historyPersonId: primary.historyPersonId || secondary.historyPersonId || null,
    name: first(primary.name, secondary.name),
    employeeId: first(primary.employeeId, secondary.employeeId),
    nik: first(primary.nik, secondary.nik),
    email: first(primary.email, secondary.email),
    phone: first(primary.phone, secondary.phone),
    department: first(primary.department, secondary.department),
    companyName: first(primary.companyName, secondary.companyName),
    participantType: first(primary.participantType, secondary.participantType),
    sourceLabel: [clean(primary.sourceLabel), clean(secondary.sourceLabel)]
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index)
      .join(" · "),
  };
}

async function loadCompanyGroups(supabase: any) {
  const [sourceResult, historyResult] = await Promise.all([
    supabase
      .from("participant_sources")
      .select("id,name,institution_name,program_type,created_at")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("vaccination_history_companies")
      .select("id,company_name,company_key,active,created_at")
      .eq("active", true)
      .order("company_name", { ascending: true })
      .limit(2000),
  ]);

  if (sourceResult.error) throw new Error(sourceResult.error.message);
  if (historyResult.error) throw new Error(historyResult.error.message);

  const groups = new Map<string, any>();

  for (const source of sourceResult.data || []) {
    const program = clean(source?.program_type).toLowerCase();
    if (program && !["vaccination", "corporate", "all"].includes(program)) continue;

    const name = first(source?.institution_name, source?.name);
    if (!name) continue;
    const key = companyKey(name);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name,
        sourceIds: new Set<number>(),
        historyCompanyIds: new Set<number>(),
        databaseLabels: new Set<string>(),
      });
    }

    const group = groups.get(key);
    group.sourceIds.add(Number(source.id));
    if (clean(source?.name)) group.databaseLabels.add(clean(source.name));
  }

  for (const company of historyResult.data || []) {
    const name = clean(company?.company_name);
    if (!name) continue;
    const key = companyKey(name);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name,
        sourceIds: new Set<number>(),
        historyCompanyIds: new Set<number>(),
        databaseLabels: new Set<string>(),
      });
    }

    groups.get(key).historyCompanyIds.add(Number(company.id));
  }

  return Array.from(groups.values())
    .map((group: any) => ({
      ...group,
      sourceIds: Array.from(group.sourceIds),
      historyCompanyIds: Array.from(group.historyCompanyIds),
      databaseLabels: Array.from(group.databaseLabels),
    }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name, "id"));
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  try {
    const supabase = supabaseAdmin();
    const groups = await loadCompanyGroups(supabase);

    const requestedCompanyKey = clean(req.nextUrl.searchParams.get("company_key"));
    const q = searchText(req.nextUrl.searchParams.get("q"));

    if (!requestedCompanyKey) {
      return ok({
        companies: groups.map((group: any) => ({
          key: group.key,
          name: group.name,
          databaseCount: group.sourceIds.length,
          hasHistoryCompany: group.historyCompanyIds.length > 0,
        })),
      });
    }

    const group = groups.find((item: any) => item.key === requestedCompanyKey);
    if (!group) return fail("Perusahaan / instansi tidak ditemukan.", 404);

    if (q.length < 2) {
      return ok({
        company: { key: group.key, name: group.name },
        results: [],
      });
    }

    const like = `%${q}%`;
    const operationalPromise = group.sourceIds.length
      ? supabase
          .from("participants")
          .select("*")
          .in("source_id", group.sourceIds)
          .or(
            [
              `name.ilike.${like}`,
              `mcu_id.ilike.${like}`,
              `external_id.ilike.${like}`,
              `nik.ilike.${like}`,
              `barcode_value.ilike.${like}`,
            ].join(","),
          )
          .order("name", { ascending: true })
          .limit(80)
      : Promise.resolve({ data: [], error: null });

    const historyPromise = group.historyCompanyIds.length
      ? supabase
          .from("vaccination_persons")
          .select("id,company_id,participant_type,participant_name,employee_id,nik,email,phone,birth_date,gender,active,created_at")
          .in("company_id", group.historyCompanyIds)
          .eq("active", true)
          .or(
            [
              `participant_name.ilike.${like}`,
              `employee_id.ilike.${like}`,
              `nik.ilike.${like}`,
              `email.ilike.${like}`,
            ].join(","),
          )
          .order("participant_name", { ascending: true })
          .limit(80)
      : Promise.resolve({ data: [], error: null });

    const [operationalResult, historyResult] = await Promise.all([
      operationalPromise,
      historyPromise,
    ]);

    if (operationalResult.error) throw new Error(operationalResult.error.message);
    if (historyResult.error) throw new Error(historyResult.error.message);

    const sourceResult = group.sourceIds.length
      ? await supabase
          .from("participant_sources")
          .select("id,name,institution_name")
          .in("id", group.sourceIds)
      : { data: [], error: null };

    if (sourceResult.error) throw new Error(sourceResult.error.message);
    const sourceMap = new Map(
      (sourceResult.data || []).map((source: any) => [Number(source.id), source]),
    );

    const mappedOperational = (operationalResult.data || []).map((row: any) => {
      const source = sourceMap.get(Number(row.source_id)) || {};
      return {
        sourceType: "DATABASE",
        sourceId: Number(row.source_id || 0) || null,
        participantId: Number(row.id || 0) || null,
        historyPersonId: null,
        name: first(row.name, row.participant_name),
        employeeId: first(
          row.employee_id,
          row.employee_nik,
          row.external_id,
          row.mcu_id,
          row.barcode_value,
        ),
        nik: first(row.nik, row.ktp, row.nik_ktp),
        email: first(row.email, row.email_company, row.company_email),
        phone: first(row.phone, row.no_hp, row.mobile, row.phone_number),
        department: first(row.department, row.departement, row.division, row.unit),
        companyName: group.name,
        participantType: first(row.participant_type, row.employee_type, "EMPLOYEE"),
        sourceLabel: first(source?.name, source?.institution_name, "Database Utama"),
      };
    });

    const mappedHistory = (historyResult.data || []).map((row: any) => ({
      sourceType: "HISTORY_COMPANY",
      sourceId: null,
      participantId: null,
      historyPersonId: Number(row.id || 0) || null,
      name: clean(row.participant_name),
      employeeId: clean(row.employee_id),
      nik: clean(row.nik),
      email: clean(row.email),
      phone: clean(row.phone),
      department: "",
      companyName: group.name,
      participantType: clean(row.participant_type) || "EMPLOYEE",
      sourceLabel: "History Company",
    }));

    const merged = new Map<string, any>();
    for (const row of [...mappedOperational, ...mappedHistory]) {
      if (!clean(row.name)) continue;
      const key = personKey(row);
      const current = merged.get(key);
      merged.set(key, current ? mergePerson(current, row) : row);
    }

    const results = Array.from(merged.values())
      .sort((a: any, b: any) => clean(a.name).localeCompare(clean(b.name), "id"))
      .slice(0, 50);

    return ok({
      company: {
        key: group.key,
        name: group.name,
        databaseCount: group.sourceIds.length,
        historyCompanyCount: group.historyCompanyIds.length,
      },
      results,
    });
  } catch (error: any) {
    console.error("VACCINATION_REGISTER_MASTER_SEARCH_ERROR", error);
    return fail(
      String(error?.message || error || "Gagal mencari peserta dari master Vaccination."),
      500,
    );
  }
}
