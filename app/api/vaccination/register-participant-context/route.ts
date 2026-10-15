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
  const jobs: Promise<any>[] = [];

  if (identity.participantId) {
    jobs.push(
      supabase
        .from("vaccination_registrations")
        .select(baseSelect)
        .eq("participant_id", identity.participantId)
        .order("id", { ascending: false })
        .limit(80),
    );
  }
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

  // Name-only is intentionally a last resort and only used when there is no stronger key.
  if (!jobs.length && identity.name) {
    jobs.push(
      supabase
        .from("vaccination_registrations")
        .select(baseSelect)
        .ilike("participant_name", identity.name)
        .order("id", { ascending: false })
        .limit(30),
    );
  }

  if (!jobs.length) return [];

  const results = await Promise.all(jobs);
  const rows: any[] = [];
  for (const result of results) {
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data || []));
  }
  return dedupeRows(rows);
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
      .eq("id", identity.historyPersonId)
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

  for (const [field, value] of checks) {
    const result = await supabase
      .from("vaccination_persons")
      .select("*")
      .eq(field, value)
      .eq("active", true)
      .limit(2);
    if (result.error) throw new Error(result.error.message);
    if ((result.data || []).length === 1) return result.data[0];
  }
  return null;
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

    const currentRaw = registrations.find(
      (row) => Number(row.session_id) === sessionId,
    );
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
      historyPerson: historyPerson
        ? {
            id: Number(historyPerson.id),
            name: clean(historyPerson.participant_name),
            employeeId: clean(historyPerson.employee_id),
            nik: clean(historyPerson.nik),
            email: clean(historyPerson.email),
            phone: clean(historyPerson.phone),
          }
        : null,
      historical,
    });
  } catch (error: any) {
    const message = String(
      error?.message || error || "Gagal memuat konteks peserta.",
    );
    return fail(message, 500);
  }
}
