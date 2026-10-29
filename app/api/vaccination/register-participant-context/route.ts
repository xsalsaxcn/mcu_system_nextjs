import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import {
  historyEmailKey,
  historyIdentityKey,
  historyNameKey,
} from "@/lib/vaccination/history";

export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalizedName(value: any) {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeFamilyRole(value: any) {
  const role = clean(value).toUpperCase();
  return ["DEPENDENT", "CHILD", "FAMILY"].includes(role)
    ? "DEPENDENT"
    : role === "PARENT" || role === "EMPLOYEE"
      ? "PARENT"
      : "";
}

function rowFamilyRole(row: any) {
  const explicit = normalizeFamilyRole(row?.family_role);
  if (explicit) return explicit;
  return "";
}

function familySafeRegistrationMatch(row: any, identity: any) {
  const wantedName = normalizedName(identity?.name);
  const rowName = normalizedName(row?.participant_name);

  // Shared Employee ID / NIK is common for a parent and dependents.
  // If a name is available, it MUST also match.
  if (wantedName && rowName && wantedName !== rowName) return false;

  const wantedRole = normalizeFamilyRole(identity?.familyRole);
  const candidateRole = rowFamilyRole(row);
  if (wantedRole && candidateRole && wantedRole !== candidateRole) {
    return false;
  }

  const wantedParentId = Number(identity?.parentHistoryPersonId || 0);
  const candidateParentId = Number(row?.parent_history_person_id || 0);

  if (
    wantedRole === "DEPENDENT" &&
    wantedParentId &&
    candidateParentId &&
    wantedParentId !== candidateParentId
  ) {
    return false;
  }

  return true;
}

function finalStatus(value: any) {
  return ["ADMINISTERED", "DONE", "FINISHED", "CANCELLED"].includes(
    clean(value).toUpperCase(),
  );
}

function serviceHasTrack(status: any, track: "A" | "B") {
  const value = clean(status || "HEALTHDAY").toUpperCase();
  return track === "A"
    ? value === "HEALTHDAY" || value === "COMBINATION"
    : value === "BAZAR" || value === "COMBINATION";
}

function dedupeRows(rows: any[]) {
  const map = new Map<number, any>();
  for (const row of rows || []) {
    const id = Number(row?.id || 0);
    if (id && !map.has(id)) map.set(id, row);
  }
  return Array.from(map.values()).sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
}

async function findRegistrations(supabase: any, identity: any) {
  const baseSelect =
    "*, session:vaccination_sessions(id,session_name,company_name,location,session_date,source_id,source_name)";

  // Strongest key: History person ID. This is person-specific even when family
  // members intentionally share one employee/BINUSIAN ID.
  if (identity.historyPersonId) {
    const result = await supabase
      .from("vaccination_registrations")
      .select(baseSelect)
      .eq("history_person_id", Number(identity.historyPersonId))
      .order("id", { ascending: false })
      .limit(80);

    if (result.error) throw new Error(result.error.message);
    const rows = dedupeRows(result.data || []).filter((row: any) =>
      familySafeRegistrationMatch(row, identity),
    );
    if (rows.length) return rows;
  }

  // Operational participant ID is also a strong exact key.
  if (identity.participantId) {
    const result = await supabase
      .from("vaccination_registrations")
      .select(baseSelect)
      .eq("participant_id", Number(identity.participantId))
      .order("id", { ascending: false })
      .limit(80);

    if (result.error) throw new Error(result.error.message);
    const rows = dedupeRows(result.data || []).filter((row: any) =>
      familySafeRegistrationMatch(row, identity),
    );
    if (rows.length) return rows;
  }

  const jobs: Promise<any>[] = [];

  // These keys can be shared by family members, so the result set is always
  // filtered again by name + family role + parent binding when available.
  if (identity.employeeId) {
    jobs.push(
      supabase
        .from("vaccination_registrations")
        .select(baseSelect)
        .eq("employee_id", identity.employeeId)
        .order("id", { ascending: false })
        .limit(80),
    );
  }

  if (identity.nik) {
    jobs.push(
      supabase
        .from("vaccination_registrations")
        .select(baseSelect)
        .eq("nik", identity.nik)
        .order("id", { ascending: false })
        .limit(80),
    );
  }

  if (identity.email) {
    jobs.push(
      supabase
        .from("vaccination_registrations")
        .select(baseSelect)
        .ilike("email", identity.email)
        .order("id", { ascending: false })
        .limit(80),
    );
  }

  if (jobs.length) {
    const results = await Promise.all(jobs);
    const rows: any[] = [];

    for (const result of results) {
      if (result.error) throw new Error(result.error.message);
      rows.push(...(result.data || []));
    }

    const filtered = dedupeRows(rows).filter((row: any) =>
      familySafeRegistrationMatch(row, identity),
    );

    if (filtered.length) return filtered;
  }

  // Name-only is intentionally the last resort. It must be exact after
  // normalization and still obey explicit family-role / parent constraints.
  if (identity.name) {
    const result = await supabase
      .from("vaccination_registrations")
      .select(baseSelect)
      .ilike("participant_name", identity.name)
      .order("id", { ascending: false })
      .limit(30);

    if (result.error) throw new Error(result.error.message);

    return dedupeRows(result.data || []).filter((row: any) =>
      familySafeRegistrationMatch(row, identity),
    );
  }

  return [];
}

async function attachItems(supabase: any, registrations: any[]) {
  const ids = registrations.map((row) => Number(row.id)).filter(Boolean);
  if (!ids.length) return registrations;

  const itemResult = await supabase
    .from("vaccination_registration_items")
    .select(
      "id,registration_id,vaccine_id,lot_id,dose_number,service_mode,status,active,vaccine:vaccination_vaccines(id,name,brand,price,price_category)",
    )
    .in("registration_id", ids)
    .eq("active", true)
    .order("id", { ascending: true });
  if (itemResult.error) throw new Error(itemResult.error.message);

  const byRegistration = new Map<number, any[]>();
  for (const item of itemResult.data || []) {
    const key = Number(item.registration_id || 0);
    if (!byRegistration.has(key)) byRegistration.set(key, []);
    byRegistration.get(key)!.push(item);
  }

  return registrations.map((row) => ({
    ...row,
    items: byRegistration.get(Number(row.id)) || [],
  }));
}

async function findHistoryPerson(supabase: any, identity: any) {
  if (identity.historyPersonId) {
    const direct = await supabase
      .from("vaccination_persons")
      .select("*")
      .eq("id", Number(identity.historyPersonId))
      .maybeSingle();

    if (direct.error) throw new Error(direct.error.message);
    if (direct.data) return direct.data;
  }

  const checks: Array<[string, string]> = [];
  const nikKey = historyIdentityKey(identity.nik);
  const employeeKey = historyIdentityKey(identity.employeeId);
  const emailKey = historyEmailKey(identity.email);
  const nameKey = historyNameKey(identity.name);

  if (nikKey) checks.push(["nik_key", nikKey]);
  if (employeeKey) checks.push(["employee_key", employeeKey]);
  if (emailKey) checks.push(["email_key", emailKey]);
  if (nameKey) checks.push(["name_key", nameKey]);

  const candidates = new Map<number, any>();

  for (const [field, value] of checks) {
    const result = await supabase
      .from("vaccination_persons")
      .select("*")
      .eq(field, value)
      .eq("active", true)
      .limit(30);

    if (result.error) throw new Error(result.error.message);

    for (const row of result.data || []) {
      if (row?.id) candidates.set(Number(row.id), row);
    }
  }

  let rows = Array.from(candidates.values());

  const wantedName = normalizedName(identity?.name);
  if (wantedName) {
    rows = rows.filter(
      (row: any) =>
        normalizedName(row?.participant_name) === wantedName,
    );
  }

  const wantedRole = normalizeFamilyRole(identity?.familyRole);
  if (wantedRole) {
    rows = rows.filter((row: any) => {
      const type = clean(row?.participant_type).toUpperCase();
      return wantedRole === "DEPENDENT"
        ? type === "DEPENDENT"
        : type !== "DEPENDENT";
    });
  }

  const parentId = Number(identity?.parentHistoryPersonId || 0);
  if (wantedRole === "DEPENDENT" && parentId && rows.length) {
    const childIds = rows
      .map((row: any) => Number(row.id || 0))
      .filter(Boolean);

    const relations = await supabase
      .from("vaccination_person_relationships")
      .select("dependent_person_id")
      .eq("parent_person_id", parentId)
      .eq("active", true)
      .in("dependent_person_id", childIds);

    if (relations.error) throw new Error(relations.error.message);

    const allowed = new Set<number>(
      (relations.data || [])
        .map((row: any) => Number(row.dependent_person_id || 0))
        .filter(Boolean),
    );

    rows = rows.filter((row: any) => allowed.has(Number(row.id)));
  }

  // Ambiguous identity is safer as "no exact History person" than binding the
  // wrong family member.
  return rows.length === 1 ? rows[0] : null;
}

function personSummary(row: any) {
  if (!row) return null;
  return {
    id: Number(row.id || 0) || null,
    name: clean(row.participant_name),
    employeeId: clean(row.employee_id),
    nik: clean(row.nik),
    email: clean(row.email),
    phone: clean(row.phone),
    participantType: clean(row.participant_type).toUpperCase(),
  };
}

async function loadFamilyContext(supabase: any, historyPerson: any) {
  const personId = Number(historyPerson?.id || 0);
  if (!personId) return { role: "", parent: null, children: [] as any[] };

  const participantType = clean(historyPerson?.participant_type).toUpperCase();
  if (participantType === "DEPENDENT") {
    const relation = await supabase
      .from("vaccination_person_relationships")
      .select("relationship_type,parent:vaccination_persons!vaccination_person_relationships_parent_person_id_fkey(id,participant_type,participant_name,employee_id,nik,email,phone,active)")
      .eq("dependent_person_id", personId)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (relation.error) throw new Error(relation.error.message);
    const parent = Array.isArray(relation.data?.parent) ? relation.data?.parent?.[0] : relation.data?.parent;
    return {
      role: "DEPENDENT",
      parent: parent?.active === false ? null : personSummary(parent),
      children: [] as any[],
    };
  }

  const relations = await supabase
    .from("vaccination_person_relationships")
    .select("relationship_type,dependent:vaccination_persons!vaccination_person_relationships_dependent_person_id_fkey(id,participant_type,participant_name,employee_id,nik,email,phone,active)")
    .eq("parent_person_id", personId)
    .eq("active", true)
    .limit(100);
  if (relations.error) throw new Error(relations.error.message);

  const children = (relations.data || [])
    .map((row: any) => Array.isArray(row?.dependent) ? row.dependent[0] : row?.dependent)
    .filter((row: any) => row && row.active !== false)
    .map((row: any) => personSummary(row))
    .filter(Boolean);

  return { role: "PARENT", parent: null, children };
}

function contextRegistrationPriority(row: any) {
  const done = new Set(["ADMINISTERED", "DONE", "FINISHED"]);
  const cancelled = new Set(["CANCELLED", "CANCELED", "VOID", "BATAL"]);
  const a = clean(row?.queue_status).toUpperCase();
  const b = clean(row?.bazar_queue_status).toUpperCase();
  let score = 0;
  if (done.has(a)) score += 120;
  else if (clean(row?.queue_number) && !cancelled.has(a)) score += 90;
  if (done.has(b)) score += 120;
  else if (clean(row?.bazar_queue_number) && !cancelled.has(b)) score += 90;
  if (clean(row?.queue_number)) score += 15;
  if (clean(row?.bazar_queue_number)) score += 15;
  if (cancelled.has(a) && cancelled.has(b || a)) score -= 100;
  score += Math.min(20, Number(row?.id || 0) / 1000000);
  return score;
}

function registrationSummary(row: any, hasRecord: boolean) {
  if (!row) return null;
  const session = Array.isArray(row.session) ? row.session[0] : row.session;
  const items = Array.isArray(row.items) ? row.items : [];
  const benefits = items.map((item: any) => {
    const vaccine = Array.isArray(item.vaccine) ? item.vaccine[0] : item.vaccine;
    return {
      vaccineId: Number(item.vaccine_id || vaccine?.id || 0) || null,
      name: clean(vaccine?.name) || "Layanan",
      brand: clean(vaccine?.brand),
      serviceMode: clean(item.service_mode || "HEALTHDAY").toUpperCase(),
    };
  });

  const hasA = serviceHasTrack(row.patient_service_status, "A");
  const hasB = serviceHasTrack(row.patient_service_status, "B");
  const allTracksFinal =
    (!hasA || finalStatus(row.queue_status)) &&
    (!hasB || finalStatus(row.bazar_queue_status));

  return {
    id: Number(row.id),
    sessionId: Number(row.session_id),
    participantId: Number(row.participant_id || 0) || null,
    participantName: clean(row.participant_name),
    employeeId: clean(row.employee_id),
    nik: clean(row.nik),
    email: clean(row.email),
    phone: clean(row.phone),
    familyRole: normalizeFamilyRole(row.family_role) || "",
    historyPersonId: Number(row.history_person_id || 0) || null,
    parentHistoryPersonId:
      Number(row.parent_history_person_id || 0) || null,
    parentName: "",
    companyName: clean(row.company_name),
    department: clean(row.department),
    registeredAt: row.registered_at || row.created_at || null,
    queueNumber: clean(row.queue_number),
    bazarQueueNumber: clean(row.bazar_queue_number),
    queueStatus: clean(row.queue_status),
    bazarQueueStatus: clean(row.bazar_queue_status),
    patientServiceStatus: clean(row.patient_service_status || "HEALTHDAY"),
    session: {
      id: Number(session?.id || row.session_id || 0),
      name: clean(session?.session_name),
      companyName: clean(session?.company_name),
      location: clean(session?.location),
      date: session?.session_date || null,
    },
    benefits,
    vaccineIds: benefits.map((benefit: any) => benefit.vaccineId).filter(Boolean),
    moveAllowed: !hasRecord && !allTracksFinal,
    moveBlockedReason: hasRecord
      ? "Peserta sudah memiliki record tindakan/vaksinasi pada lokasi tersebut."
      : allTracksFinal
        ? "Pendaftaran pada lokasi tersebut sudah selesai / dibatalkan."
        : "",
  };
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "register")) {
    return fail("Akses modul vaksinasi ditolak untuk role ini.", 403);
  }

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  if (!sessionId) return fail("session_id wajib diisi.");

  const identity = {
    participantId: toInt(req.nextUrl.searchParams.get("participant_id"), 0),
    historyPersonId: toInt(req.nextUrl.searchParams.get("history_person_id"), 0),
    name: clean(req.nextUrl.searchParams.get("name")),
    employeeId: clean(req.nextUrl.searchParams.get("employee_id")),
    nik: clean(req.nextUrl.searchParams.get("nik")),
    email: clean(req.nextUrl.searchParams.get("email")),
    familyRole: normalizeFamilyRole(
      req.nextUrl.searchParams.get("family_role"),
    ),
    parentHistoryPersonId: toInt(
      req.nextUrl.searchParams.get("parent_history_person_id"),
      0,
    ),
  };

  const supabase = supabaseAdmin();
  try {
    const sessionResult = await supabase
      .from("vaccination_sessions")
      .select("id,session_name,company_name,location,session_date,source_id,source_name")
      .eq("id", sessionId)
      .single();
    if (sessionResult.error) return fail(sessionResult.error.message, 404);

    const registrations = await attachItems(
      supabase,
      await findRegistrations(supabase, identity),
    );

    const registrationIds = registrations.map((row) => Number(row.id)).filter(Boolean);
    const recordRegistrationIds = new Set<number>();
    if (registrationIds.length) {
      const records = await supabase
        .from("vaccination_records")
        .select("registration_id")
        .in("registration_id", registrationIds)
        .limit(500);
      if (records.error) throw new Error(records.error.message);
      for (const record of records.data || []) {
        if (record.registration_id) recordRegistrationIds.add(Number(record.registration_id));
      }
    }

    const currentRaw = registrations
      .filter((row) => Number(row.session_id) === sessionId)
      .sort((a, b) => contextRegistrationPriority(b) - contextRegistrationPriority(a))[0] || null;
    const otherRows = registrations.filter(
      (row) => Number(row.session_id) !== sessionId,
    );
    const movableRaw = otherRows.find((row) => {
      const summary = registrationSummary(
        row,
        recordRegistrationIds.has(Number(row.id)),
      );
      return summary?.moveAllowed;
    });
    const latestOtherRaw = movableRaw || otherRows[0] || null;

    const historyPerson = await findHistoryPerson(supabase, identity);
    let historical: any[] = [];
    if (historyPerson?.id) {
      const historyResult = await supabase
        .from("vaccination_service_history")
        .select(
          "id,service_date,service_category,service_name,product_brand,dose_number,lot_number,location,next_due_date,notes",
        )
        .eq("person_id", Number(historyPerson.id))
        .order("service_date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .limit(30);
      if (historyResult.error) throw new Error(historyResult.error.message);
      historical = historyResult.data || [];
    }

    const family = await loadFamilyContext(supabase, historyPerson);

    const currentRegistration = currentRaw
      ? registrationSummary(
          currentRaw,
          recordRegistrationIds.has(Number(currentRaw.id)),
        )
      : null;
    const otherRegistration = latestOtherRaw
      ? registrationSummary(
          latestOtherRaw,
          recordRegistrationIds.has(Number(latestOtherRaw.id)),
        )
      : null;

    let parentName = "";
    const parentHistoryPersonId = Number(
      identity.parentHistoryPersonId ||
        currentRegistration?.parentHistoryPersonId ||
        otherRegistration?.parentHistoryPersonId ||
        0,
    );

    if (parentHistoryPersonId) {
      const parentResult = await supabase
        .from("vaccination_persons")
        .select("participant_name")
        .eq("id", parentHistoryPersonId)
        .eq("active", true)
        .maybeSingle();

      if (!parentResult.error) {
        parentName = clean(parentResult.data?.participant_name);
      }
    }

    if (currentRegistration && parentName) {
      currentRegistration.parentName = parentName;
    }
    if (otherRegistration && parentName) {
      otherRegistration.parentName = parentName;
    }

    const caseType = currentRegistration
      ? "CURRENT_SESSION"
      : otherRegistration?.moveAllowed
        ? "OTHER_LOCATION"
        : historical.length
          ? "HISTORY_ONLY"
          : "NEW";

    return ok({
      caseType,
      selectedSession: {
        id: Number(sessionResult.data.id),
        name: clean(sessionResult.data.session_name),
        companyName: clean(sessionResult.data.company_name),
        location: clean(sessionResult.data.location),
        date: sessionResult.data.session_date || null,
      },
      currentRegistration,
      otherRegistration,
      historyPerson: historyPerson ? personSummary(historyPerson) : null,
      family,
      historical,
      identityPolicy: {
        familySafe: true,
        familyRole: identity.familyRole || "",
        parentHistoryPersonId:
          Number(identity.parentHistoryPersonId || 0) || null,
        rule:
          "history_person_id/participant_id first; otherwise family role + exact name + NIK/Employee ID + parent when available",
      },
    });
  } catch (error: any) {
    const message = String(
      error?.message || error || "Gagal memuat konteks peserta.",
    );
    return fail(message, 500);
  }
}
