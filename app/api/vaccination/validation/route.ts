import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../_utils";

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
  return String(error?.code || "") === "42703" || msg.includes("column") || msg.includes("schema cache");
}

function makeRow(row: any) {
  return {
    id: row.id,
    session_id: row.session_id,
    queue_number: row.queue_number || row.queue_no || "",
    patient_name: row.patient_name || row.participant_name || row.name || row.full_name || row.nama || row.nama_peserta || "-",
    doctor_name: row.doctor_name || row.doctor || row.petugas_name || row.staff_name || row.administered_by || row.updated_by || "-",
    product_name: row.product_name || row.vaccine_name || row.vaccine || row.batch_name || row.batchname || row.layanan || row.service_name || "Vaksin",
    lot_number: row.lot_number || row.lot || row.batch_number || row.vaccine_lot || "",
    note: row.note || row.notes || row.payment_note || row.product_note || row.keterangan || row.status_note || "",
    print_status: row.print_status || "NOT_PRINTED",
    validation_status: row.validation_status || "PENDING",
    queue_status: row.queue_status || row.status || "",
    raw: row,
  };
}

function recordProduct(record: any) {
  const vaccine = clean(record.vaccine_name || record.vaccine?.name || record.product_name || "Vaksin");
  const lot = clean(record.lot_number || record.lot?.lot_number || "");
  return lot ? `${vaccine} - Lot ${lot}` : vaccine;
}

async function attachRecords(supabase: any, rows: any[]) {
  const ids = rows.map((row) => Number(row.id)).filter(Boolean);
  if (!ids.length) return rows;

  const recordsResult = await supabase
    .from("vaccination_records")
    .select("registration_id,vaccine_name,lot_number,notes,administered_by,administered_at")
    .in("registration_id", ids)
    .order("administered_at", { ascending: true });

  if (recordsResult.error) return rows;

  const byRegistration = new Map<number, any[]>();
  for (const record of recordsResult.data || []) {
    const key = Number(record.registration_id);
    if (!byRegistration.has(key)) byRegistration.set(key, []);
    byRegistration.get(key)!.push(record);
  }

  return rows.map((row) => {
    const records = byRegistration.get(Number(row.id)) || [];
    if (!records.length) return row;

    const products = Array.from(new Set(records.map(recordProduct).filter(Boolean))).join(" | ");
    const doctors = Array.from(new Set(records.map((record) => clean(record.administered_by)).filter(Boolean))).join(" | ");
    const notes = Array.from(new Set(records.map((record) => clean(record.notes)).filter(Boolean))).join(" | ");

    return {
      ...row,
      doctor_name: doctors || row.doctor_name,
      product_name: products || row.product_name,
      lot_number: "",
      note: notes || row.note,
      records,
    };
  });
}

export async function GET(req: NextRequest) {
  try {
    const sessionId = clean(new URL(req.url).searchParams.get("session_id"));
    const supabase = supabaseAdmin();

    let query = supabase
      .from("vaccination_registrations")
      .select("*")
      .order("id", { ascending: false })
      .limit(300);

    if (sessionId) query = query.eq("session_id", sessionId);

    let result = await query.or("queue_status.eq.PENDING_VALIDATION,validation_status.eq.PENDING");
    if (result.error && missingColumn(result.error)) {
      let fallback = supabase
        .from("vaccination_registrations")
        .select("*")
        .order("id", { ascending: false })
        .limit(300);
      if (sessionId) fallback = fallback.eq("session_id", sessionId);
      result = await fallback;
    }

    if (result.error) return json({ ok: false, rows: [], message: result.error.message }, 500);

    const baseRows = (result.data || [])
      .filter((row: any) => {
        const qs = clean(row.queue_status || row.status).toUpperCase();
        const vs = clean(row.validation_status).toUpperCase();
        return qs === "PENDING_VALIDATION" || vs === "PENDING";
      })
      .map(makeRow);

    const rows = await attachRecords(supabase, baseRows);
    return json({ ok: true, rows });
  } catch (error: any) {
    return json({ ok: false, rows: [], message: error?.message || "Gagal membaca validasi." }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = clean(body.action).toUpperCase();
    const id = toId(body.id ?? body.registration_id ?? body.registrationId);
    const actor = clean(body.actor || body.petugas || body.user || "Tim Validasi");
    const note = clean(body.note || body.cancelled_note || body.reason);

    if (!id) return json({ ok: false, message: "ID peserta/registrasi wajib ada." }, 400);

    const now = new Date().toISOString();
    const supabase = supabaseAdmin();
    let payload: any = {};

    if (action === "SEND_TO_VALIDATION" || action === "PENDING_VALIDATION") {
      payload = { queue_status: "PENDING_VALIDATION", validation_status: "PENDING", print_status: "NOT_PRINTED", updated_at: now };
    } else if (action === "PRINTED") {
      payload = { print_status: "PRINTED", printed_by: actor, printed_at: now, updated_at: now };
    } else if (["SELESAI", "DONE", "VALIDATED"].includes(action)) {
      const current = await supabase
        .from("vaccination_registrations")
        .select("print_status")
        .eq("id", id)
        .maybeSingle();

      if (current.error && !missingColumn(current.error)) return json({ ok: false, message: current.error.message }, 500);
      if (!current.error && clean(current.data?.print_status).toUpperCase() !== "PRINTED") {
        return json({ ok: false, message: "Print label dulu di Tim Validasi sebelum ubah status menjadi Selesai." }, 400);
      }

      payload = { queue_status: "DONE", validation_status: "DONE", validated_by: actor, validated_at: now, updated_at: now };
    } else if (["BATAL", "CANCELLED", "CANCELED"].includes(action)) {
      if (!note) return json({ ok: false, message: "Note wajib diisi jika status Batal." }, 400);
      payload = { queue_status: "CANCELLED", validation_status: "CANCELLED", cancelled_by: actor, cancelled_at: now, cancelled_note: note, updated_at: now };
    } else {
      return json({ ok: false, message: "Action tidak dikenali." }, 400);
    }

    let result = await supabase.from("vaccination_registrations").update(payload).eq("id", id).select("*").maybeSingle();
    if (result.error && missingColumn(result.error)) {
      const fallback: any = { updated_at: now };
      if (payload.queue_status) fallback.queue_status = payload.queue_status;
      result = await supabase.from("vaccination_registrations").update(fallback).eq("id", id).select("*").maybeSingle();
      if (result.error) return json({ ok: false, needs_setup: true, message: "Kolom validasi belum lengkap. Jalankan SQL v126." }, 500);
    }

    if (result.error) return json({ ok: false, message: result.error.message }, 500);
    return json({ ok: true, row: result.data ? makeRow(result.data) : null });
  } catch (error: any) {
    return json({ ok: false, message: error?.message || "Gagal update validasi." }, 500);
  }
}
