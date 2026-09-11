import {
  historyEmailKey,
  historyIdentityKey,
  historyNameKey,
} from "@/lib/vaccination/history";

const LOOKUP_LIMIT = 8;

function employeeKey(person: any) {
  return historyIdentityKey(person?.employee_key || person?.employee_id);
}

function nikKey(person: any) {
  return historyIdentityKey(person?.nik_key || person?.nik);
}

function emailKey(person: any) {
  return historyEmailKey(person?.email_key || person?.email);
}

function nameKey(person: any) {
  return historyNameKey(person?.name_key || person?.participant_name);
}

function same(a: string, b: string) {
  return Boolean(a && b && a === b);
}

function logicalEmployeeMatch(anchor: any, candidate: any) {
  if (Number(anchor?.id) === Number(candidate?.id)) return true;
  if (Number(anchor?.company_id) !== Number(candidate?.company_id)) return false;
  if (String(candidate?.participant_type || "") !== "EMPLOYEE") return false;
  if (candidate?.active === false) return false;

  const anchorStrong = [employeeKey(anchor), nikKey(anchor), emailKey(anchor)];
  const candidateStrong = [employeeKey(candidate), nikKey(candidate), emailKey(candidate)];

  let strongSame = 0;
  let strongConflict = 0;
  for (let index = 0; index < anchorStrong.length; index += 1) {
    const a = anchorStrong[index];
    const b = candidateStrong[index];
    if (!a || !b) continue;
    if (a === b) strongSame += 1;
    else strongConflict += 1;
  }

  // Two matching strong identifiers are sufficient even if one legacy field changed.
  if (strongSame >= 2) return true;

  const sameName = same(nameKey(anchor), nameKey(candidate));
  if (!sameName) return false;

  // NIP/Employee ID and NIK are treated as stable company/person identifiers.
  // Email may legitimately change over time, so a matching NIP/NIK + matching name can
  // still resolve the historical parent alias safely inside the same company.
  if (same(anchorStrong[0], candidateStrong[0])) return true;
  if (same(anchorStrong[1], candidateStrong[1])) return true;

  // Email + name is accepted only when other populated strong identifiers do not conflict.
  return same(anchorStrong[2], candidateStrong[2]) && strongConflict === 0;
}

export async function vaccinationEmployeeFamilyAliases(supabase: any, employee: any) {
  if (!employee?.id || !employee?.company_id) return [employee].filter(Boolean);

  const byId = new Map<number, any>();
  byId.set(Number(employee.id), employee);

  const lookups: Promise<any>[] = [];
  const eKey = employeeKey(employee);
  const nKey = nikKey(employee);
  const mKey = emailKey(employee);

  if (eKey) {
    lookups.push(
      supabase
        .from("vaccination_persons")
        .select("id,company_id,participant_type,participant_name,name_key,employee_id,employee_key,nik,nik_key,email,email_key,active")
        .eq("company_id", employee.company_id)
        .eq("participant_type", "EMPLOYEE")
        .eq("active", true)
        .eq("employee_key", eKey)
        .limit(LOOKUP_LIMIT),
    );
  }
  if (nKey) {
    lookups.push(
      supabase
        .from("vaccination_persons")
        .select("id,company_id,participant_type,participant_name,name_key,employee_id,employee_key,nik,nik_key,email,email_key,active")
        .eq("company_id", employee.company_id)
        .eq("participant_type", "EMPLOYEE")
        .eq("active", true)
        .eq("nik_key", nKey)
        .limit(LOOKUP_LIMIT),
    );
  }
  if (mKey) {
    lookups.push(
      supabase
        .from("vaccination_persons")
        .select("id,company_id,participant_type,participant_name,name_key,employee_id,employee_key,nik,nik_key,email,email_key,active")
        .eq("company_id", employee.company_id)
        .eq("participant_type", "EMPLOYEE")
        .eq("active", true)
        .eq("email_key", mKey)
        .limit(LOOKUP_LIMIT),
    );
  }

  for (const result of await Promise.all(lookups)) {
    if (result.error) throw new Error(result.error.message);
    for (const candidate of result.data || []) {
      if (logicalEmployeeMatch(employee, candidate)) byId.set(Number(candidate.id), candidate);
    }
  }

  return Array.from(byId.values()).sort((a, b) => Number(a.id) - Number(b.id));
}

export async function vaccinationDependentsForEmployee(supabase: any, employee: any) {
  const aliases = await vaccinationEmployeeFamilyAliases(supabase, employee);
  const parentIds = aliases.map((row: any) => Number(row.id)).filter(Boolean);
  if (!parentIds.length) return { aliases, parentIds, dependents: [] as any[] };

  const result = await supabase
    .from("vaccination_person_relationships")
    .select("id,parent_person_id,dependent_person_id,relationship_type,dependent:vaccination_persons!vaccination_person_relationships_dependent_person_id_fkey(id,company_id,participant_type,participant_name,employee_id,employee_key,nik,nik_key,email,email_key,phone,birth_date,gender,active)")
    .eq("company_id", employee.company_id)
    .in("parent_person_id", parentIds)
    .eq("active", true)
    .order("id", { ascending: true });
  if (result.error) throw new Error(result.error.message);

  const byDependentId = new Map<number, any>();
  for (const relation of result.data || []) {
    const dependent = Array.isArray(relation.dependent) ? relation.dependent[0] : relation.dependent;
    if (!dependent?.id || dependent?.active === false) continue;
    if (Number(dependent.company_id) !== Number(employee.company_id)) continue;
    if (String(dependent.participant_type || "") !== "DEPENDENT") continue;
    const id = Number(dependent.id);
    if (!byDependentId.has(id)) {
      byDependentId.set(id, {
        ...dependent,
        relationship_type: relation.relationship_type || "CHILD",
        relationship_parent_id: Number(relation.parent_person_id) || null,
      });
    }
  }

  const dependents = Array.from(byDependentId.values()).sort((a, b) =>
    String(a.participant_name || "").localeCompare(String(b.participant_name || ""), "id"),
  );

  return { aliases, parentIds, dependents };
}
