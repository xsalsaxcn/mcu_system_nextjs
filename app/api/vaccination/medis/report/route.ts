import { NextRequest, NextResponse } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../../_utils";
import { vaccinationRole } from "@/lib/vaccination/access";

export const dynamic = "force-dynamic";

// VACCINATION_MEDIS_MIRROR_REPORT_V150_4
// Read-only mirror of vaccination operational data for vaccination_medis.
// Canonical source: vaccination_records + fallback completed registrations,
// matching the legacy fallback approach already used by Administered / Medis.

function oneRelation(value: any) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function csvEscape(value: any) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function validRecord(record: any) {
  return !["CANCELLED", "CANCELED", "VOID", "BATAL"].includes(
    clean(record?.status).toUpperCase(),
  );
}

function dateInside(value: any, startDate: string, endDate: string) {
  if (!startDate && !endDate) return true;
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return false;
  if (startDate) {
    const start = new Date(`${startDate}T00:00:00+07:00`);
    if (date.getTime() < start.getTime()) return false;
  }
  if (endDate) {
    const end = new Date(`${endDate}T23:59:59+07:00`);
    if (date.getTime() > end.getTime()) return false;
  }
  return true;
}

function toCsv(rows: any[]) {
  const headers = [
    "TANGGAL",
    "NAMA PESERTA",
    "NO ANTRIAN",
    "MCU ID",
    "EMPLOYEE ID",
    "PERUSAHAAN",
    "DEPARTEMEN",
    "NIK",
    "SESSION",
    "LOKASI",
    "VAKSIN",
    "LOT",
    "DOSE",
    "MEDIS",
    "STATUS",
    "NEXT DOSE",
    "CATATAN",
    "SUMBER DATA",
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.administered_at,
        row.participant_name,
        row.queue_number,
        row.mcu_id,
        row.employee_id,
        row.company_name,
        row.department,
        row.nik,
        row.session_name,
        row.location,
        row.vaccine_name,
        row.lot_number,
        row.dose_number,
        row.administered_by,
        row.status,
        row.next_due_date,
        row.notes,
        row.data_source,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return "\ufeff" + lines.join("\r\n");
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (vaccinationRole(user) !== "vaccination_medis") {
    return fail("Laporan ini khusus untuk user Vaccination Medis.", 403);
  }

  const startDate = clean(req.nextUrl.searchParams.get("start_date"));
  const endDate = clean(req.nextUrl.searchParams.get("end_date"));
  const search = clean(req.nextUrl.searchParams.get("q")).toLowerCase();
  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  const medisFilter = clean(req.nextUrl.searchParams.get("medis")).toLowerCase();
  const format = clean(req.nextUrl.searchParams.get("format")).toLowerCase();

  const supabase = supabaseAdmin();

  const [recordsResult, sessionsResult] = await Promise.all([
    supabase
      .from("vaccination_records")
      .select(`
        id,registration_id,session_id,participant_name,vaccine_id,lot_id,vaccine_name,lot_number,dose_number,
        administered_at,administered_by,next_due_date,notes,status,created_at,
        registration:vaccination_registrations(id,queue_number,participant_name,mcu_id,employee_id,department,company_name,nik),
        session:vaccination_sessions(id,session_name,company_name,location,session_date)
      `)
      .order("administered_at", { ascending: false })
      .limit(10000),
    supabase
      .from("vaccination_sessions")
      .select("id,session_name,company_name,location,session_date")
      .order("session_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(5000),
  ]);

  if (recordsResult.error) return fail(recordsResult.error.message, 500);
  if (sessionsResult.error) return fail(sessionsResult.error.message, 500);

  const rows: any[] = [];
  const recordedRegistrationIds = new Set<number>();

  for (const record of recordsResult.data || []) {
    if (!validRecord(record)) continue;
    const registration = oneRelation(record.registration) || {};
    const session = oneRelation(record.session) || {};
    const registrationId = Number(record.registration_id || 0);
    if (registrationId) recordedRegistrationIds.add(registrationId);

    rows.push({
      id: record.id,
      registration_id: record.registration_id,
      session_id: record.session_id,
      participant_name: clean(registration.participant_name || record.participant_name) || "-",
      queue_number: clean(registration.queue_number) || "-",
      mcu_id: clean(registration.mcu_id) || "-",
      employee_id: clean(registration.employee_id) || "-",
      department: clean(registration.department) || "-",
      company_name: clean(registration.company_name || session.company_name) || "-",
      nik: clean(registration.nik) || "-",
      session_name: clean(session.session_name) || "-",
      location: clean(session.location) || "-",
      vaccine_name: clean(record.vaccine_name) || "Vaksin",
      lot_number: clean(record.lot_number) || "-",
      dose_number: Number(record.dose_number || 1),
      administered_at: record.administered_at || record.created_at || null,
      administered_by: clean(record.administered_by) || "-",
      next_due_date: record.next_due_date || null,
      notes: clean(record.notes),
      status: clean(record.status) || "ADMINISTERED",
      data_source: "vaccination_records",
    });
  }

  // Mirror Administer fallback for legacy/completed registrations that do not yet
  // have vaccination_records. This keeps Medis recap aligned with operational data.
  const completedRegsResult = await supabase
    .from("vaccination_registrations")
    .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date)")
    .in("queue_status", ["ADMINISTERED", "PENDING_VALIDATION", "DONE"])
    .order("updated_at", { ascending: false })
    .limit(10000);

  if (!completedRegsResult.error) {
    const fallbackRegs = (completedRegsResult.data || []).filter(
      (registration: any) => !recordedRegistrationIds.has(Number(registration.id)),
    );
    const fallbackIds = fallbackRegs.map((row: any) => Number(row.id)).filter(Boolean);

    const itemsByRegistration = new Map<number, any[]>();
    if (fallbackIds.length) {
      const itemResult = await supabase
        .from("vaccination_registration_items")
        .select(
          "id,registration_id,vaccine_id,lot_id,dose_number,status,administered_record_id,administered_at,active,vaccine:vaccination_vaccines(id,name,brand),lot:vaccination_vaccine_lots(id,lot_number)",
        )
        .in("registration_id", fallbackIds)
        .eq("active", true)
        .order("id", { ascending: true });

      if (!itemResult.error) {
        for (const item of itemResult.data || []) {
          const key = Number(item.registration_id);
          if (!itemsByRegistration.has(key)) itemsByRegistration.set(key, []);
          itemsByRegistration.get(key)!.push(item);
        }
      }
    }

    for (const registration of fallbackRegs) {
      const session = oneRelation(registration.session) || {};
      const administeredBy =
        clean(registration.administered_by || registration.doctor_name || registration.updated_by) || "-";
      const common = {
        registration_id: registration.id,
        session_id: registration.session_id,
        participant_name: clean(registration.participant_name) || "-",
        queue_number: clean(registration.queue_number) || "-",
        mcu_id: clean(registration.mcu_id) || "-",
        employee_id: clean(registration.employee_id) || "-",
        department: clean(registration.department) || "-",
        company_name: clean(registration.company_name || session.company_name) || "-",
        nik: clean(registration.nik) || "-",
        session_name: clean(session.session_name) || "-",
        location: clean(session.location) || "-",
        administered_by: administeredBy,
        next_due_date: null,
        notes: clean(registration.status_note || registration.notes),
        status: "ADMINISTERED",
        data_source: "registration_fallback",
      };

      const items = itemsByRegistration.get(Number(registration.id)) || [];
      if (items.length) {
        items.forEach((item: any, index: number) => {
          const vaccine = oneRelation(item.vaccine) || {};
          const lot = oneRelation(item.lot) || {};
          rows.push({
            ...common,
            id: `fallback-${registration.id}-${item.id || index}`,
            vaccine_name: clean(vaccine.name || registration.vaccine_name) || "Vaksin",
            lot_number: clean(lot.lot_number || registration.lot_number) || "-",
            dose_number: Number(item.dose_number || 1),
            administered_at:
              item.administered_at || registration.updated_at || registration.created_at || null,
          });
        });
      } else {
        rows.push({
          ...common,
          id: `fallback-${registration.id}`,
          vaccine_name: clean(registration.vaccine_name) || "Vaksin",
          lot_number: clean(registration.lot_number) || "-",
          dose_number: Number(registration.dose_number || 1),
          administered_at: registration.updated_at || registration.created_at || null,
        });
      }
    }
  }

  let filteredRows = rows
    .filter((row: any) => !sessionId || Number(row.session_id) === Number(sessionId))
    .filter((row: any) => dateInside(row.administered_at, startDate, endDate));

  if (medisFilter && medisFilter !== "all") {
    filteredRows = filteredRows.filter((row: any) =>
      clean(row.administered_by).toLowerCase().includes(medisFilter),
    );
  }

  if (search) {
    filteredRows = filteredRows.filter((row: any) =>
      [
        row.participant_name,
        row.queue_number,
        row.mcu_id,
        row.employee_id,
        row.company_name,
        row.department,
        row.session_name,
        row.location,
        row.vaccine_name,
        row.lot_number,
        row.administered_by,
      ].some((value) => String(value || "").toLowerCase().includes(search)),
    );
  }

  filteredRows.sort(
    (a: any, b: any) =>
      new Date(b.administered_at || 0).getTime() - new Date(a.administered_at || 0).getTime(),
  );

  const participantMap = new Map<string, any>();
  for (const row of filteredRows) {
    const key = String(row.registration_id || `${row.participant_name}|${row.company_name}`);
    const current = participantMap.get(key) || {
      registration_id: row.registration_id,
      participant_name: row.participant_name,
      queue_number: row.queue_number,
      mcu_id: row.mcu_id,
      employee_id: row.employee_id,
      company_name: row.company_name,
      department: row.department,
      session_name: row.session_name,
      location: row.location,
      last_administered_at: row.administered_at,
      vaccines: [],
      lots: [],
      medis: [],
      total_products: 0,
    };
    current.total_products += 1;
    if (!current.vaccines.includes(row.vaccine_name)) current.vaccines.push(row.vaccine_name);
    if (!current.lots.includes(row.lot_number)) current.lots.push(row.lot_number);
    if (row.administered_by && row.administered_by !== "-" && !current.medis.includes(row.administered_by)) {
      current.medis.push(row.administered_by);
    }
    if (
      new Date(row.administered_at || 0).getTime() >
      new Date(current.last_administered_at || 0).getTime()
    ) {
      current.last_administered_at = row.administered_at;
    }
    participantMap.set(key, current);
  }

  const participants = Array.from(participantMap.values()).sort(
    (a: any, b: any) =>
      new Date(b.last_administered_at || 0).getTime() -
      new Date(a.last_administered_at || 0).getTime(),
  );

  const productMap = new Map<string, number>();
  const sessionMap = new Map<string, number>();
  const companySet = new Set<string>();
  for (const row of filteredRows) {
    productMap.set(row.vaccine_name, (productMap.get(row.vaccine_name) || 0) + 1);
    const sessionKey =
      [row.session_name, row.location]
        .filter((value) => value && value !== "-")
        .join(" · ") || "Session";
    sessionMap.set(sessionKey, (sessionMap.get(sessionKey) || 0) + 1);
    if (row.company_name && row.company_name !== "-") companySet.add(row.company_name);
  }

  const byProduct = Array.from(productMap.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const bySession = Array.from(sessionMap.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const sessionOptions = (sessionsResult.data || []).map((session: any) => ({
    id: session.id,
    label: [session.session_name, session.company_name, session.location, session.session_date]
      .filter(Boolean)
      .join(" · "),
  }));

  const doctorOptions = Array.from(
    new Set(rows.map((row: any) => clean(row.administered_by)).filter((value) => value && value !== "-")),
  ).sort((a, b) => a.localeCompare(b));

  const summary = {
    participants: participants.length,
    administrations: filteredRows.length,
    companies: companySet.size,
    products: productMap.size,
  };

  if (format === "csv") {
    const csv = toCsv(filteredRows);
    const filename = `laporan-vaksinasi-medis-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return ok({
    source: "vaccination_records + completed registration fallback",
    filters: {
      start_date: startDate,
      end_date: endDate,
      q: search,
      session_id: sessionId || null,
      medis: medisFilter || "all",
    },
    summary,
    participants,
    rows: filteredRows,
    byProduct,
    bySession,
    sessionOptions,
    doctorOptions,
  });
}
