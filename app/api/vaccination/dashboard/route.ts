import { NextRequest, NextResponse } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

function csvEscape(value: any) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows: any[]) {
  const headers = [
    "ANTRIAN",
    "NAMA",
    "MCU_ID",
    "EMPLOYEE_ID",
    "PERUSAHAAN",
    "DEPARTEMEN",
    "NIK",
    "STATUS",
    "VAKSIN",
    "LOT_NUMBER",
    "TANGGAL_PEMBERIAN",
    "NEXT_DOSE",
    "DOKTER_PETUGAS",
    "PAYMENT_METHOD",
    "PAYMENT_NOTE",
    "STATUS_NOTE",
  ];

  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push([
      row.queue_number || "",
      row.participant_name || "",
      row.mcu_id || "",
      row.employee_id || "",
      row.company_name || "",
      row.department || "",
      row.nik || "",
      row.dashboard_status || row.queue_status || "",
      row.vaccine_names || "",
      row.lot_numbers || "",
      row.administered_at || "",
      row.next_due_date || "",
      row.administered_by || "",
      row.payment_method || "",
      row.payment_note || "",
      row.status_note || "",
    ].map(csvEscape).join(","));
  }

  return lines.join("\r\n");
}

function applyStatus(rows: any[], status: string) {
  if (status === "done") return rows.filter((row) => row.is_done);
  if (status === "not_done") return rows.filter((row) => !row.is_done);
  if (status === "no_queue") return rows.filter((row) => !row.queue_number && !row.is_done);
  if (status === "waiting") return rows.filter((row) => row.queue_number && !row.is_done && ["WAITING", "WAITING_WITH_NOTE"].includes(String(row.queue_status || "").toUpperCase()));
  if (status === "doctor") return rows.filter((row) => ["CALLED", "IN_PROGRESS"].includes(String(row.queue_status || "").toUpperCase()));
  return rows;
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  const sourceId = toInt(req.nextUrl.searchParams.get("source_id"), 0);
  const status = clean(req.nextUrl.searchParams.get("status")) || "all";
  const format = clean(req.nextUrl.searchParams.get("format"));

  const supabase = supabaseAdmin();

  let regQuery = supabase
    .from("vaccination_registrations")
    .select("*, session:vaccination_sessions(id,session_name,company_name,source_id,source_name)")
    .order("id", { ascending: true })
    .limit(10000);

  if (sessionId) regQuery = regQuery.eq("session_id", sessionId);
  if (sourceId) regQuery = regQuery.eq("source_id", sourceId);

  const regsResult = await regQuery;
  if (regsResult.error) return fail(regsResult.error.message, 500);

  const registrations = regsResult.data || [];
  const regIds = registrations.map((row: any) => row.id);

  let records: any[] = [];
  if (regIds.length) {
    const recordsResult = await supabase
      .from("vaccination_records")
      .select("*")
      .in("registration_id", regIds)
      .order("administered_at", { ascending: false });

    if (recordsResult.error) return fail(recordsResult.error.message, 500);
    records = recordsResult.data || [];
  }

  const recordsByReg = new Map<number, any[]>();
  for (const record of records) {
    const key = Number(record.registration_id);
    if (!recordsByReg.has(key)) recordsByReg.set(key, []);
    recordsByReg.get(key)!.push(record);
  }

  const rows = registrations.map((registration: any) => {
    const recs = recordsByReg.get(Number(registration.id)) || [];
    const isDone = recs.length > 0 || registration.queue_status === "ADMINISTERED";

    const vaccineNames = Array.from(new Set(recs.map((record) => clean(record.vaccine_name)).filter(Boolean))).join(" | ");
    const lotNumbers = Array.from(new Set(recs.map((record) => clean(record.lot_number)).filter(Boolean))).join(" | ");
    const doctors = Array.from(new Set(recs.map((record) => clean(record.administered_by)).filter(Boolean))).join(" | ");

    const lastRecord = recs[0] || {};

    return {
      ...registration,
      is_done: isDone,
      dashboard_status: isDone ? "SUDAH" : registration.queue_number ? "BELUM - SUDAH ANTRIAN" : "BELUM - BELUM ANTRIAN",
      vaccine_names: vaccineNames || registration.vaccine?.name || "",
      lot_numbers: lotNumbers,
      administered_at: lastRecord.administered_at || "",
      next_due_date: lastRecord.next_due_date || "",
      administered_by: doctors,
    };
  });

  const filteredRows = applyStatus(rows, status);

  const summary = {
    total: rows.length,
    done: rows.filter((row) => row.is_done).length,
    not_done: rows.filter((row) => !row.is_done).length,
    no_queue: rows.filter((row) => !row.queue_number && !row.is_done).length,
    waiting: rows.filter((row) => row.queue_number && !row.is_done).length,
  };

  if (format === "csv") {
    const csv = toCsv(filteredRows);
    const filename = `vaccination_${status}_${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return ok({ summary, rows: filteredRows, allRows: rows });
}
