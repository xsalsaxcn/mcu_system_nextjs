import { NextRequest, NextResponse } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../../_utils";
import { vaccinationRole } from "@/lib/vaccination/access";

export const dynamic = "force-dynamic";

// VACCINATION_MEDIS_PRIVATE_REPORT_V150_3

function normalizeOwner(value: any) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function oneRelation(value: any) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function csvEscape(value: any) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
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
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push([
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
    ].map(csvEscape).join(","));
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
  const format = clean(req.nextUrl.searchParams.get("format")).toLowerCase();

  const aliases = [
    clean((user as any).name),
    clean((user as any).username),
    clean((user as any).email),
    String((user as any).id || ""),
  ].filter(Boolean);
  const ownerSet = new Set(aliases.map(normalizeOwner));

  const supabase = supabaseAdmin();
  let query = supabase
    .from("vaccination_records")
    .select(`
      id,registration_id,session_id,participant_name,vaccine_id,lot_id,vaccine_name,lot_number,dose_number,
      administered_at,administered_by,next_due_date,notes,status,created_at,
      registration:vaccination_registrations(id,queue_number,participant_name,mcu_id,employee_id,department,company_name,nik),
      session:vaccination_sessions(id,session_name,company_name,location,session_date)
    `)
    .order("administered_at", { ascending: false })
    .limit(10000);

  if (sessionId) query = query.eq("session_id", sessionId);
  if (startDate) query = query.gte("administered_at", new Date(`${startDate}T00:00:00+07:00`).toISOString());
  if (endDate) query = query.lte("administered_at", new Date(`${endDate}T23:59:59+07:00`).toISOString());

  const result = await query;
  if (result.error) return fail(result.error.message, 500);

  let rows = (result.data || [])
    .filter((record: any) => ownerSet.has(normalizeOwner(record.administered_by)))
    .filter((record: any) => !["CANCELLED", "CANCELED", "VOID", "BATAL"].includes(clean(record.status).toUpperCase()))
    .map((record: any) => {
      const registration = oneRelation(record.registration) || {};
      const session = oneRelation(record.session) || {};
      return {
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
        administered_by: clean(record.administered_by) || clean((user as any).name) || "Medis",
        next_due_date: record.next_due_date || null,
        notes: clean(record.notes),
        status: clean(record.status) || "ADMINISTERED",
      };
    });

  if (search) {
    rows = rows.filter((row: any) => [
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
    ].some((value) => String(value || "").toLowerCase().includes(search)));
  }

  const participantMap = new Map<string, any>();
  for (const row of rows) {
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
      total_products: 0,
    };
    current.total_products += 1;
    if (!current.vaccines.includes(row.vaccine_name)) current.vaccines.push(row.vaccine_name);
    if (!current.lots.includes(row.lot_number)) current.lots.push(row.lot_number);
    if (new Date(row.administered_at || 0).getTime() > new Date(current.last_administered_at || 0).getTime()) {
      current.last_administered_at = row.administered_at;
    }
    participantMap.set(key, current);
  }

  const participants = Array.from(participantMap.values()).sort(
    (a: any, b: any) => new Date(b.last_administered_at || 0).getTime() - new Date(a.last_administered_at || 0).getTime(),
  );

  const productMap = new Map<string, number>();
  const sessionMap = new Map<string, number>();
  const companySet = new Set<string>();
  for (const row of rows) {
    productMap.set(row.vaccine_name, (productMap.get(row.vaccine_name) || 0) + 1);
    const sessionKey = [row.session_name, row.location].filter((value) => value && value !== "-").join(" · ") || "Session";
    sessionMap.set(sessionKey, (sessionMap.get(sessionKey) || 0) + 1);
    if (row.company_name && row.company_name !== "-") companySet.add(row.company_name);
  }

  const byProduct = Array.from(productMap.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const bySession = Array.from(sessionMap.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const summary = {
    participants: participants.length,
    administrations: rows.length,
    companies: companySet.size,
    products: productMap.size,
  };

  if (format === "csv") {
    const csv = toCsv(rows);
    const username = clean((user as any).username).replace(/[^a-zA-Z0-9_-]+/g, "-") || "medis";
    const filename = `rekap-vaksinasi-${username}-${new Date().toISOString().slice(0, 10)}.csv`;
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
    owner: { name: clean((user as any).name), username: clean((user as any).username) },
    filters: { start_date: startDate, end_date: endDate, q: search, session_id: sessionId || null },
    summary,
    participants,
    rows,
    byProduct,
    bySession,
  });
}
