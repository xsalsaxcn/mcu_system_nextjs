import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../_utils";

// V148_VALIDATION_DETAIL_API

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(data: any, status = 200) {
  const res = NextResponse.json(data, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toId(value: any) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function missingColumn(error: any) {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "");
  return code === "42703" || msg.includes("column") || msg.includes("schema cache");
}

function parseQueueNumber(text: any) {
  const match = clean(text).match(/\b[A-Z]-\d+\b/i);
  return match ? match[0].toUpperCase() : "";
}

function productDetail(record: any) {
  return {
    record_id: toId(record?.id),
    vaccine_name: clean(record?.vaccine_name) || "Vaksin",
    lot_number: clean(record?.lot_number) || "-",
    dose_number: Number(record?.dose_number || 1),
    administered_at: record?.administered_at || null,
    administered_by: clean(record?.administered_by) || "-",
    note: clean(record?.notes) || "",
    status: clean(record?.status) || "ADMINISTERED",
  };
}

function display(row: any, recordRows: any[] = []) {
  const products = (recordRows || []).map(productDetail);
  const firstRecord = recordRows?.[0] || null;
  const recordIds = products.map((item) => item.record_id).filter(Boolean);
  const productName = products.length === 1
    ? products[0].vaccine_name
    : products.length > 1
      ? `${products.length} vaksin / layanan`
      : (row.product_name || row.vaccine_name || row.vaccine || row.batch_name || row.batchname || row.layanan || row.service_name || "Vaksin");

  return {
    id: row.id,
    session_id: row.session_id,
    queue_number: row.queue_number || row.queue_no || parseQueueNumber(row.queue_label),
    patient_name: row.patient_name || row.participant_name || row.name || row.full_name || row.nama || row.nama_peserta || "-",
    doctor_name: clean(firstRecord?.administered_by) || row.doctor_name || row.doctor || row.petugas_name || row.staff_name || row.administered_by || row.updated_by || "-",
    product_name: productName,
    lot_number: products.length === 1 ? products[0].lot_number : "",
    note: row.note || row.notes || row.status_note || firstRecord?.notes || row.payment_note || row.product_note || row.keterangan || "",
    print_status: row.print_status || "NOT_PRINTED",
    validation_status: row.validation_status || "PENDING",
    queue_status: row.queue_status || row.status || "",
    products,
    record_ids: recordIds,
    raw: row,
  };
}

async function loadRecordsForRegistrations(supabase: any, registrationIds: number[]) {
  if (!registrationIds.length) return new Map<number, any[]>();

  const result = await supabase
    .from("vaccination_records")
    .select("id,registration_id,vaccine_name,lot_number,dose_number,administered_at,administered_by,notes,status")
    .in("registration_id", registrationIds)
    .order("administered_at", { ascending: true })
    .order("id", { ascending: true });

  if (result.error) throw new Error(result.error.message);

  const byRegistration = new Map<number, any[]>();
  for (const record of result.data || []) {
    const key = Number(record.registration_id);
    if (!byRegistration.has(key)) byRegistration.set(key, []);
    byRegistration.get(key)!.push(record);
  }
  return byRegistration;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = clean(url.searchParams.get("session_id"));
    const supabase = supabaseAdmin();

    let query = supabase
      .from("vaccination_registrations")
      .select("*")
      .order("id", { ascending: false })
      .limit(300);

    if (sessionId) query = query.eq("session_id", sessionId);
    query = query.or("queue_status.eq.PENDING_VALIDATION,validation_status.eq.PENDING");

    let result = await query;
    if (result.error && missingColumn(result.error)) {
      let fallback = supabase
        .from("vaccination_registrations")
        .select("*")
        .order("id", { ascending: false })
        .limit(300);
      if (sessionId) fallback = fallback.eq("session_id", sessionId);
      result = await fallback;
    }

    if (result.error) {
      return json({ ok: false, message: result.error.message || "Gagal membaca daftar validasi.", rows: [] }, 500);
    }

    const pendingRegistrations = (result.data || []).filter((row: any) => {
      const queueStatus = clean(row.queue_status || row.status).toUpperCase();
      const validationStatus = clean(row.validation_status).toUpperCase();
      return queueStatus === "PENDING_VALIDATION" || validationStatus === "PENDING";
    });

    const registrationIds = pendingRegistrations.map((row: any) => Number(row.id)).filter(Boolean);
    let recordsByRegistration = new Map<number, any[]>();
    try {
      recordsByRegistration = await loadRecordsForRegistrations(supabase, registrationIds);
    } catch (error: any) {
      return json({ ok: false, message: error?.message || "Gagal membaca detail layanan vaksin.", rows: [] }, 500);
    }

    const rows = pendingRegistrations.map((row: any) =>
      display(row, recordsByRegistration.get(Number(row.id)) || [])
    );

    return json({ ok: true, rows });
  } catch (error: any) {
    return json({ ok: false, message: error?.message || "Gagal membaca validasi.", rows: [] }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = clean(body.action).toUpperCase();
    const id = toId(body.id ?? body.registration_id ?? body.registrationId);
    const sessionId = clean(body.session_id ?? body.sessionId);
    const queueNumber = clean(body.queue_number ?? body.queueNumber);
    const actor = clean(body.actor || body.petugas || body.user || "Tim Validasi");
    const note = clean(body.note || body.cancelled_note || body.reason);
    const supabase = supabaseAdmin();

    let rowId = id;
    if (!rowId && queueNumber) {
      let find = supabase
        .from("vaccination_registrations")
        .select("id")
        .eq("queue_number", queueNumber)
        .order("id", { ascending: false })
        .limit(1);
      if (sessionId) find = find.eq("session_id", sessionId);
      const found = await find.maybeSingle();
      rowId = toId(found.data?.id);
    }

    if (!rowId) return json({ ok: false, message: "ID peserta/registrasi tidak terbaca." }, 400);

    const now = new Date().toISOString();
    let payload: any = {};

    if (action === "SEND_TO_VALIDATION" || action === "PENDING_VALIDATION") {
      payload = { queue_status: "PENDING_VALIDATION", validation_status: "PENDING", print_status: "NOT_PRINTED", updated_at: now };
    } else if (action === "PRINTED") {
      payload = { print_status: "PRINTED", printed_by: actor, printed_at: now, updated_at: now };
    } else if (action === "SELESAI" || action === "DONE" || action === "VALIDATED") {
      payload = { queue_status: "DONE", validation_status: "DONE", validated_by: actor, validated_at: now, updated_at: now };
    } else if (action === "BATAL" || action === "CANCELLED" || action === "CANCELED") {
      if (!note) return json({ ok: false, message: "Note wajib diisi jika status Batal." }, 400);
      payload = { queue_status: "CANCELLED", validation_status: "CANCELLED", cancelled_by: actor, cancelled_at: now, cancelled_note: note, updated_at: now };
    } else {
      return json({ ok: false, message: "Action tidak dikenali." }, 400);
    }

    let result = await supabase
      .from("vaccination_registrations")
      .update(payload)
      .eq("id", rowId)
      .select("*")
      .maybeSingle();

    if (result.error && missingColumn(result.error)) {
      const fallback: any = { updated_at: now };
      if (action === "SEND_TO_VALIDATION" || action === "PENDING_VALIDATION") fallback.queue_status = "PENDING_VALIDATION";
      if (action === "SELESAI" || action === "DONE" || action === "VALIDATED") fallback.queue_status = "DONE";
      if (action === "BATAL" || action === "CANCELLED" || action === "CANCELED") fallback.queue_status = "CANCELLED";
      result = await supabase
        .from("vaccination_registrations")
        .update(fallback)
        .eq("id", rowId)
        .select("*")
        .maybeSingle();
    }

    if (result.error) {
      return json({ ok: false, message: result.error.message || "Gagal update status validasi." }, 500);
    }

    return json({ ok: true, row: result.data ? display(result.data) : null });
  } catch (error: any) {
    return json({ ok: false, message: error?.message || "Gagal update validasi." }, 500);
  }
}
