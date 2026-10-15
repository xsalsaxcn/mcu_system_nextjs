import { NextRequest } from "next/server";
import { clean, fail, formatQueueNumber, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";

// VACCINATION_ROLE_GUARD_V150
// V153.67_DUAL_QUEUE_A_B
export const dynamic = "force-dynamic";

function isHealthdayBazarSession(session: any) {
  return String(session?.existing_queue_profile || "LEGACY").trim().toUpperCase() === "HEALTHDAY_BAZAR";
}

function serviceHasTrack(status: any, track: "A" | "B") {
  const value = String(status || "HEALTHDAY").toUpperCase();
  return track === "A"
    ? value === "HEALTHDAY" || value === "COMBINATION"
    : value === "BAZAR" || value === "COMBINATION";
}

function formatBazarQueueNumber(nextNumber: number) {
  return `B-${String(nextNumber).padStart(3, "0")}`;
}

async function getNextQueueNumber(supabase: any, sessionId: number) {
  const result = await supabase
    .from("vaccination_registrations")
    .select("queue_number")
    .eq("session_id", sessionId)
    .not("queue_number", "is", null);

  if (result.error) throw new Error(result.error.message);

  let maxNumber = 0;
  for (const row of result.data || []) {
    const match = String(row.queue_number || "").match(/(\d+)$/);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > maxNumber) maxNumber = n;
  }

  return formatQueueNumber(maxNumber + 1);
}

async function getNextBazarQueue(supabase: any, sessionId: number) {
  const result = await supabase
    .from("vaccination_registrations")
    .select("bazar_queue_sequence,bazar_queue_number")
    .eq("session_id", sessionId)
    .not("bazar_queue_number", "is", null);

  if (result.error) throw new Error(result.error.message);

  let maxNumber = 0;
  for (const row of result.data || []) {
    const seq = Number(row.bazar_queue_sequence || 0);
    if (Number.isFinite(seq) && seq > maxNumber) maxNumber = seq;
    const match = String(row.bazar_queue_number || "").match(/(\d+)$/);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > maxNumber) maxNumber = n;
  }

  const sequence = maxNumber + 1;
  return { sequence, number: formatBazarQueueNumber(sequence) };
}

async function attachRegistrationItems(supabase: any, registrations: any[]) {
  const ids = (registrations || []).map((row: any) => Number(row.id)).filter(Boolean);
  if (!ids.length) return registrations || [];

  const itemsResult = await supabase
    .from("vaccination_registration_items")
    .select("*, vaccine:vaccination_vaccines(id,name,brand,price,price_category), lot:vaccination_vaccine_lots(id,lot_number,expiry_date)")
    .in("registration_id", ids)
    .eq("active", true)
    .order("id", { ascending: true });

  if (itemsResult.error) throw new Error(itemsResult.error.message);

  const byReg = new Map<number, any[]>();
  for (const item of itemsResult.data || []) {
    const key = Number(item.registration_id);
    if (!byReg.has(key)) byReg.set(key, []);
    byReg.get(key)!.push(item);
  }

  return (registrations || []).map((registration: any) => ({
    ...registration,
    items: byReg.get(Number(registration.id)) || [],
  }));
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "queue")) return fail("Akses modul vaksinasi ditolak untuk role ini.", 403);

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  if (!sessionId) return fail("session_id wajib diisi.");

  const supabase = supabaseAdmin();

  const sessionResult = await supabase.from("vaccination_sessions").select("*").eq("id", sessionId).single();
  if (sessionResult.error) return fail(sessionResult.error.message, 500);

  const regsResult = await supabase
    .from("vaccination_registrations")
    .select("*, vaccine:vaccination_vaccines(id,name,brand)")
    .eq("session_id", sessionId)
    .order("id", { ascending: true });

  if (regsResult.error) return fail(regsResult.error.message, 500);

  try {
    const registrations = await attachRegistrationItems(supabase, regsResult.data || []);
    return ok({
      session: sessionResult.data,
      registrations,
      dualQueue: isHealthdayBazarSession(sessionResult.data),
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal mengambil item produk antrian.", 500);
  }
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "queue")) return fail("Akses modul vaksinasi ditolak untuk role ini.", 403);

  const body = await req.json().catch(() => ({}));
  const action = clean(body.action);
  const sessionId = toInt(body.sessionId || body.session_id, 0);
  const registrationId = toInt(body.registrationId || body.registration_id, 0);
  const requestedTrack = String(body.track || "A").toUpperCase() === "B" ? "B" : "A";
  const supabase = supabaseAdmin();

  if (!sessionId) return fail("Session wajib dipilih.");

  const sessionResult = await supabase
    .from("vaccination_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (sessionResult.error) return fail(sessionResult.error.message, 500);
  const session = sessionResult.data;
  const dualQueue = isHealthdayBazarSession(session);
  const track: "A" | "B" = dualQueue ? requestedTrack : "A";

  if (track === "B" && !dualQueue) return fail("Antrian B hanya tersedia pada session Healthday + Bazar.");

  if (action === "call-next") {
    let nextQuery = supabase
      .from("vaccination_registrations")
      .select("*")
      .eq("session_id", sessionId);

    if (track === "B") {
      nextQuery = nextQuery
        .in("patient_service_status", ["BAZAR", "COMBINATION"])
        .in("bazar_queue_status", ["WAITING", "WAITING_WITH_NOTE", "REGISTERED"])
        .not("bazar_queue_number", "is", null)
        .order("bazar_queue_sequence", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true });
    } else {
      if (dualQueue) nextQuery = nextQuery.in("patient_service_status", ["HEALTHDAY", "COMBINATION"]);
      nextQuery = nextQuery
        .in("queue_status", ["WAITING", "WAITING_WITH_NOTE", "REGISTERED"])
        .not("queue_number", "is", null)
        .order("queue_number", { ascending: true })
        .order("id", { ascending: true });
    }

    const nextResult = await nextQuery.limit(1).maybeSingle();
    if (nextResult.error) return fail(nextResult.error.message, 500);
    if (!nextResult.data) return fail(`Tidak ada antrian ${track} berikutnya.`, 404);

    const reg = nextResult.data;
    const now = new Date().toISOString();

    if (track === "B") {
      const updateResult = await supabase
        .from("vaccination_registrations")
        .update({ bazar_queue_status: "CALLED", bazar_called_at: now, updated_at: now })
        .eq("id", reg.id)
        .select("*")
        .single();
      if (updateResult.error) return fail(updateResult.error.message, 500);
      return ok({ message: `Memanggil nomor ${reg.bazar_queue_number}.`, registration: updateResult.data, track });
    }

    const updateResult = await supabase
      .from("vaccination_registrations")
      .update({ queue_status: "CALLED", updated_at: now })
      .eq("id", reg.id)
      .select("*")
      .single();
    if (updateResult.error) return fail(updateResult.error.message, 500);

    await supabase
      .from("vaccination_sessions")
      .update({ current_queue_number: reg.queue_number, current_registration_id: reg.id, updated_at: now })
      .eq("id", sessionId);

    return ok({ message: `Memanggil nomor ${reg.queue_number}.`, registration: updateResult.data, track });
  }

  if (!registrationId) return fail("registrationId wajib diisi.");

  const existingResult = await supabase
    .from("vaccination_registrations")
    .select("*")
    .eq("id", registrationId)
    .single();
  if (existingResult.error) return fail(existingResult.error.message, 500);
  const existing = existingResult.data;

  if (dualQueue && !serviceHasTrack(existing.patient_service_status, track)) {
    return fail(`Peserta ini tidak memiliki antrian ${track}.`);
  }

  if (track === "B") {
    const nextStatus =
      action === "recall" ? "CALLED" :
      action === "start" ? "IN_PROGRESS" :
      action === "finish" ? "DONE" :
      action === "skip" ? "SKIPPED" :
      action === "cancel" ? "CANCELLED" :
      action === "waiting" ? "WAITING" : "";
    if (!nextStatus) return fail("Action tidak dikenali.");

    let bazarQueueNumber = clean(existing.bazar_queue_number);
    let bazarQueueSequence = Number(existing.bazar_queue_sequence || 0) || null;
    if (["WAITING", "CALLED", "IN_PROGRESS"].includes(nextStatus) && !bazarQueueNumber) {
      try {
        const next = await getNextBazarQueue(supabase, Number(existing.session_id || sessionId));
        bazarQueueNumber = next.number;
        bazarQueueSequence = next.sequence;
      } catch (error: any) {
        return fail(error?.message || "Gagal membuat nomor antrian B.", 500);
      }
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      bazar_queue_status: nextStatus,
      updated_at: now,
    };
    if (bazarQueueNumber) updatePayload.bazar_queue_number = bazarQueueNumber;
    if (bazarQueueSequence) updatePayload.bazar_queue_sequence = bazarQueueSequence;
    if (nextStatus === "CALLED") updatePayload.bazar_called_at = now;
    if (nextStatus === "DONE") updatePayload.bazar_finished_at = now;
    if (nextStatus === "CANCELLED") updatePayload.bazar_cancelled_at = now;

    const regResult = await supabase
      .from("vaccination_registrations")
      .update(updatePayload)
      .eq("id", registrationId)
      .select("*")
      .single();
    if (regResult.error) return fail(regResult.error.message, 500);

    return ok({ message: `Status antrian B diubah ke ${nextStatus}.`, registration: regResult.data, track });
  }

  const nextStatus =
    action === "recall" ? "CALLED" :
    action === "start" ? "IN_PROGRESS" :
    action === "finish" ? "DONE" :
    action === "skip" ? "SKIPPED" :
    action === "cancel" ? "CANCELLED" :
    action === "waiting" ? "WAITING" : "";
  if (!nextStatus) return fail("Action tidak dikenali.");

  const activeQueueStatus = ["WAITING", "CALLED", "IN_PROGRESS"].includes(nextStatus);
  let queueNumber = clean(existing.queue_number);
  if (activeQueueStatus && !queueNumber) {
    try {
      queueNumber = await getNextQueueNumber(supabase, toInt(existing.session_id, sessionId) || sessionId);
    } catch (error: any) {
      return fail(error?.message || "Gagal membuat nomor antrian.", 500);
    }
  }

  const updatePayload: Record<string, any> = {
    queue_status: nextStatus,
    updated_at: new Date().toISOString(),
  };
  if (queueNumber) updatePayload.queue_number = queueNumber;

  const regResult = await supabase
    .from("vaccination_registrations")
    .update(updatePayload)
    .eq("id", registrationId)
    .select("*")
    .single();
  if (regResult.error) return fail(regResult.error.message, 500);

  if (nextStatus === "CALLED" || nextStatus === "IN_PROGRESS") {
    await supabase
      .from("vaccination_sessions")
      .update({ current_queue_number: regResult.data.queue_number, current_registration_id: registrationId, updated_at: new Date().toISOString() })
      .eq("id", sessionId);
  }

  return ok({ message: `Status antrian A diubah ke ${nextStatus}.`, registration: regResult.data, track });
}
