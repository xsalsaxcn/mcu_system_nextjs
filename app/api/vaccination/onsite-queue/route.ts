import { createHmac, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clampInterval(value: any) {
  const n = Math.trunc(Number(value || 45));
  if (!Number.isFinite(n)) return 45;
  return Math.min(60, Math.max(30, n));
}

function rollingPayload(event: any) {
  if (!event || clean(event.status).toUpperCase() !== "OPEN") return null;
  const interval = clampInterval(event.qr_interval_seconds);
  const nowSec = Math.floor(Date.now() / 1000);
  const slot = Math.floor(nowSec / interval);
  const sig = createHmac("sha256", clean(event.qr_secret))
    .update(`${clean(event.public_token)}.${slot}`)
    .digest("hex")
    .slice(0, 32);

  return {
    slot,
    sig,
    interval_seconds: interval,
    expires_in: Math.max(1, interval - (nowSec % interval)),
    scan_path: `/vaccination/public/onsite-queue/${encodeURIComponent(clean(event.public_token))}?slot=${slot}&sig=${sig}`,
  };
}

async function loadEventData(supabase: any, sessionId: number) {
  const sessionResult = await supabase
    .from("vaccination_sessions")
    .select("id,session_name,company_name,location,session_date,status")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionResult.error) throw new Error(sessionResult.error.message);
  if (!sessionResult.data) throw new Error("Session vaksinasi tidak ditemukan.");

  const eventResult = await supabase
    .from("vaccination_onsite_queue_events")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (eventResult.error) throw new Error(eventResult.error.message);

  let entries: any[] = [];
  if (eventResult.data?.id) {
    const entriesResult = await supabase
      .from("vaccination_onsite_queue_entries")
      .select("*")
      .eq("event_id", eventResult.data.id)
      .order("queue_sequence", { ascending: true });
    if (entriesResult.error) throw new Error(entriesResult.error.message);
    entries = entriesResult.data || [];
  }

  return {
    session: sessionResult.data,
    event: eventResult.data,
    entries,
    rolling: rollingPayload(eventResult.data),
  };
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "queue")) return fail("Akses modul vaksinasi ditolak untuk role ini.", 403);

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  if (!sessionId) return fail("session_id wajib diisi.");

  try {
    const data = await loadEventData(supabaseAdmin(), sessionId);
    return ok(data);
  } catch (error: any) {
    return fail(error?.message || "Gagal mengambil onsite queue.", 500);
  }
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "queue")) return fail("Akses modul vaksinasi ditolak untuk role ini.", 403);

  const body = await req.json().catch(() => ({}));
  const action = clean(body.action);
  const sessionId = toInt(body.sessionId || body.session_id, 0);
  const eventId = toInt(body.eventId || body.event_id, 0);
  const entryId = toInt(body.entryId || body.entry_id, 0);
  const supabase = supabaseAdmin();

  if (action === "ensure-event") {
    if (!sessionId) return fail("Session wajib dipilih.");

    const sessionResult = await supabase
      .from("vaccination_sessions")
      .select("id")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionResult.error) return fail(sessionResult.error.message, 500);
    if (!sessionResult.data) return fail("Session vaksinasi tidak ditemukan.", 404);

    let existing = await supabase
      .from("vaccination_onsite_queue_events")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (existing.error) return fail(existing.error.message, 500);

    if (!existing.data) {
      const insertResult = await supabase
        .from("vaccination_onsite_queue_events")
        .insert({
          session_id: sessionId,
          public_token: randomBytes(18).toString("hex"),
          qr_secret: randomBytes(32).toString("hex"),
          qr_interval_seconds: clampInterval(body.intervalSeconds),
          queue_prefix: clean(body.queuePrefix) || "Q",
          status: "OPEN",
        })
        .select("*")
        .single();

      if (insertResult.error) {
        existing = await supabase
          .from("vaccination_onsite_queue_events")
          .select("*")
          .eq("session_id", sessionId)
          .maybeSingle();
        if (existing.error || !existing.data) return fail(insertResult.error.message, 500);
      } else {
        existing = { data: insertResult.data, error: null } as any;
      }
    }

    return ok({
      message: "Mode Onsite Rolling QR aktif.",
      event: existing.data,
      rolling: rollingPayload(existing.data),
    });
  }

  if (action === "set-event-status") {
    if (!eventId) return fail("eventId wajib diisi.");
    const status = clean(body.status).toUpperCase();
    if (!["OPEN", "CLOSED"].includes(status)) return fail("Status event tidak valid.");

    const result = await supabase
      .from("vaccination_onsite_queue_events")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", eventId)
      .select("*")
      .single();
    if (result.error) return fail(result.error.message, 500);
    return ok({ message: `Status onsite queue menjadi ${status}.`, event: result.data });
  }

  if (action === "call-next") {
    if (!eventId) return fail("eventId wajib diisi.");
    const result = await supabase.rpc("vaccination_onsite_call_next", { p_event_id: eventId });
    if (result.error) return fail(result.error.message, 500);
    const payload = result.data || {};
    if (payload?.ok === false) {
      if (payload?.code === "ACTIVE_CURRENT") {
        return fail("Masih ada nomor yang sedang dipanggil/diproses. Selesaikan atau skip lebih dulu.", 409, payload);
      }
      if (payload?.code === "EMPTY") return fail("Tidak ada antrean menunggu.", 404, payload);
      return fail(payload?.message || "Gagal memanggil antrean berikutnya.", 400, payload);
    }
    return ok({ message: `Memanggil ${payload?.entry?.queue_number || "nomor berikutnya"}.`, ...payload });
  }

  if (!eventId || !entryId) return fail("eventId dan entryId wajib diisi.");

  const entryResult = await supabase
    .from("vaccination_onsite_queue_entries")
    .select("*")
    .eq("id", entryId)
    .eq("event_id", eventId)
    .single();
  if (entryResult.error) return fail(entryResult.error.message, 500);

  const now = new Date().toISOString();
  const entry = entryResult.data;

  if (action === "reactivate") {
    if (clean(entry.queue_status).toUpperCase() !== "SKIPPED") return fail("Hanya antrean SKIPPED yang dapat diaktifkan kembali.");
    const result = await supabase
      .from("vaccination_onsite_queue_entries")
      .update({ queue_status: "WAITING", reactivated_at: now, updated_at: now })
      .eq("id", entryId)
      .select("*")
      .single();
    if (result.error) return fail(result.error.message, 500);
    return ok({ message: `${entry.queue_number} kembali ke Waiting dan akan diproses sesuai nomor lamanya.`, entry: result.data });
  }

  const nextStatus =
    action === "call" ? "CALLED" :
    action === "start" ? "IN_PROGRESS" :
    action === "skip" ? "SKIPPED" :
    action === "done" ? "DONE" : "";
  if (!nextStatus) return fail("Action tidak dikenali.");

  if (["call", "start"].includes(action)) {
    const activeResult = await supabase
      .from("vaccination_onsite_queue_entries")
      .select("id,queue_number,queue_status")
      .eq("event_id", eventId)
      .in("queue_status", ["CALLED", "IN_PROGRESS"])
      .neq("id", entryId)
      .limit(1)
      .maybeSingle();
    if (activeResult.error) return fail(activeResult.error.message, 500);
    if (activeResult.data) {
      return fail(`Masih ada ${activeResult.data.queue_number} yang sedang dipanggil/diproses.`, 409);
    }
  }

  const updatePayload: Record<string, any> = {
    queue_status: nextStatus,
    updated_at: now,
  };
  if (nextStatus === "CALLED") updatePayload.called_at = now;
  if (nextStatus === "IN_PROGRESS") updatePayload.started_at = now;
  if (nextStatus === "SKIPPED") updatePayload.skipped_at = now;
  if (nextStatus === "DONE") updatePayload.finished_at = now;

  const updateResult = await supabase
    .from("vaccination_onsite_queue_entries")
    .update(updatePayload)
    .eq("id", entryId)
    .select("*")
    .single();
  if (updateResult.error) return fail(updateResult.error.message, 500);

  if (["CALLED", "IN_PROGRESS"].includes(nextStatus)) {
    await supabase
      .from("vaccination_onsite_queue_events")
      .update({ current_entry_id: entryId, current_queue_number: entry.queue_number, updated_at: now })
      .eq("id", eventId);
  } else if (["SKIPPED", "DONE"].includes(nextStatus)) {
    await supabase
      .from("vaccination_onsite_queue_events")
      .update({ current_entry_id: null, current_queue_number: null, updated_at: now })
      .eq("id", eventId)
      .eq("current_entry_id", entryId);
  }

  return ok({ message: `Status ${entry.queue_number} menjadi ${nextStatus}.`, entry: updateResult.data });
}
