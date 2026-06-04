import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../_utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(data: any, status = 200) { const res = NextResponse.json(data, { status }); res.headers.set("Cache-Control", "no-store"); return res; }
function clean(value: any) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function toId(value: any) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; }
function missingColumn(error: any) { const msg = String(error?.message || "").toLowerCase(); const code = String(error?.code || ""); return code === "42703" || msg.includes("column") || msg.includes("schema cache"); }
function parseQueueNumber(text: any) { const m = clean(text).match(/\b[A-Z]-\d+\b/i); return m ? m[0].toUpperCase() : ""; }
function display(row: any) { return { id: row.id, session_id: row.session_id, queue_number: row.queue_number || row.queue_no || parseQueueNumber(row.queue_label), patient_name: row.patient_name || row.participant_name || row.name || row.full_name || row.nama || row.nama_peserta || "-", doctor_name: row.doctor_name || row.doctor || row.petugas_name || row.staff_name || row.administered_by || row.updated_by || "-", product_name: row.product_name || row.vaccine_name || row.vaccine || row.batch_name || row.batchname || row.layanan || row.service_name || "Vaksin", lot_number: row.lot_number || row.lot || row.batch_number || row.vaccine_lot || "", note: row.note || row.notes || row.payment_note || row.product_note || row.keterangan || "", print_status: row.print_status || "NOT_PRINTED", validation_status: row.validation_status || "PENDING", queue_status: row.queue_status || row.status || "", raw: row }; }

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url); const sessionId = clean(url.searchParams.get("session_id")); const supabase = supabaseAdmin();
    let q = supabase.from("vaccination_registrations").select("*").order("id", { ascending: false }).limit(300);
    if (sessionId) q = q.eq("session_id", sessionId);
    q = q.or("queue_status.eq.PENDING_VALIDATION,validation_status.eq.PENDING");
    let r = await q;
    if (r.error && missingColumn(r.error)) { let f = supabase.from("vaccination_registrations").select("*").order("id", { ascending: false }).limit(300); if (sessionId) f = f.eq("session_id", sessionId); r = await f; }
    if (r.error) return json({ ok: false, message: r.error.message || "Gagal membaca daftar validasi.", rows: [] }, 500);
    const rows = (r.data || []).filter((row: any) => { const s = clean(row.queue_status || row.status).toUpperCase(); const v = clean(row.validation_status).toUpperCase(); return s === "PENDING_VALIDATION" || v === "PENDING"; }).map(display);
    return json({ ok: true, rows });
  } catch (error: any) { return json({ ok: false, message: error?.message || "Gagal membaca validasi.", rows: [] }, 500); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})); const action = clean(body.action).toUpperCase(); const id = toId(body.id ?? body.registration_id ?? body.registrationId); const sessionId = clean(body.session_id ?? body.sessionId); const queueNumber = clean(body.queue_number ?? body.queueNumber); const actor = clean(body.actor || body.petugas || body.user || "Tim Validasi"); const note = clean(body.note || body.cancelled_note || body.reason); const supabase = supabaseAdmin();
    let rowId = id;
    if (!rowId && queueNumber) { let f = supabase.from("vaccination_registrations").select("id").eq("queue_number", queueNumber).order("id", { ascending: false }).limit(1); if (sessionId) f = f.eq("session_id", sessionId); const found = await f.maybeSingle(); rowId = toId(found.data?.id); }
    if (!rowId) return json({ ok: false, message: "ID peserta/registrasi tidak terbaca." }, 400);
    const now = new Date().toISOString(); let payload: any = {};
    if (action === "SEND_TO_VALIDATION" || action === "PENDING_VALIDATION") payload = { queue_status: "PENDING_VALIDATION", validation_status: "PENDING", print_status: "NOT_PRINTED", updated_at: now };
    else if (action === "PRINTED") payload = { print_status: "PRINTED", printed_by: actor, printed_at: now, updated_at: now };
    else if (action === "SELESAI" || action === "DONE" || action === "VALIDATED") payload = { queue_status: "DONE", validation_status: "DONE", validated_by: actor, validated_at: now, updated_at: now };
    else if (action === "BATAL" || action === "CANCELLED" || action === "CANCELED") { if (!note) return json({ ok: false, message: "Note wajib diisi jika status Batal." }, 400); payload = { queue_status: "CANCELLED", validation_status: "CANCELLED", cancelled_by: actor, cancelled_at: now, cancelled_note: note, updated_at: now }; }
    else return json({ ok: false, message: "Action tidak dikenali." }, 400);
    let r = await supabase.from("vaccination_registrations").update(payload).eq("id", rowId).select("*").maybeSingle();
    if (r.error && missingColumn(r.error)) { const fb: any = { updated_at: now }; if (action === "SEND_TO_VALIDATION" || action === "PENDING_VALIDATION") fb.queue_status = "PENDING_VALIDATION"; if (action === "SELESAI" || action === "DONE" || action === "VALIDATED") fb.queue_status = "DONE"; if (action === "BATAL" || action === "CANCELLED" || action === "CANCELED") fb.queue_status = "CANCELLED"; r = await supabase.from("vaccination_registrations").update(fb).eq("id", rowId).select("*").maybeSingle(); }
    if (r.error) return json({ ok: false, message: r.error.message || "Gagal update status validasi." }, 500);
    return json({ ok: true, row: r.data ? display(r.data) : null });
  } catch (error: any) { return json({ ok: false, message: error?.message || "Gagal update validasi." }, 500); }
}
