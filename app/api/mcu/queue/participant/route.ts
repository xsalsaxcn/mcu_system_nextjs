import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import { ensureMcuQueueEntry, ensureMcuQueueSession, formatMcuQueueNumber } from "@/lib/server/mcuQueue";

// MCU_REG_QUEUE_LABEL_INFO_V447
// MCU_QUEUE_BINDING_AUTHORITATIVE_V457
async function normalizeEntry(entry: any) {
  if (!entry) return null;
  const aSeq = Number(entry.a_queue_sequence || 0);
  const bSeq = Number(entry.b_queue_sequence || 0);
  return {
    ...entry,
    a_queue_number: entry.a_queue_number || (aSeq > 0 ? formatMcuQueueNumber("A", aSeq) : null),
    b_queue_number: entry.b_queue_number || (bSeq > 0 ? formatMcuQueueNumber("B", bSeq) : null),
  };
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const participantId = Number(req.nextUrl.searchParams.get("participant_id") || 0);
  if (!participantId) return fail("participant_id wajib diisi.", 400);

  const supabase = getSupabaseAdmin();
  const participantRes = await supabase
    .from("participants")
    .select("id,program_type,company_id,package_id,registrasi_ulang_done,registrasi_ulang_at")
    .eq("id", participantId)
    .maybeSingle();

  if (participantRes.error) return fail(participantRes.error.message, 500);
  const participant = participantRes.data;
  if (!participant) return fail("Peserta tidak ditemukan.", 404);
  if (String(participant.program_type || "").toLowerCase() !== "corporate") {
    return ok({ queue_entry: null, queue_session: null });
  }

  // Source of truth #1: an entry that already belongs to this participant.
  // This deliberately does not depend on company/package metadata, so an already-released
  // number is never lost merely because the participant metadata changed later.
  let entryRes = await supabase
    .from("mcu_queue_entries")
    .select("id,queue_session_id,participant_id,a_queue_number,a_queue_sequence,b_queue_number,b_queue_sequence,a_status,b_status,created_at,updated_at")
    .eq("participant_id", participantId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (entryRes.error) return fail(entryRes.error.message, 500);
  let entry: any = await normalizeEntry(entryRes.data || null);

  // Source of truth #2: Registrasi Ulang means release queue. If this participant was
  // already registered before the queue feature existed, repair the missing entry here.
  const registered = Number(participant.registrasi_ulang_done || 0) === 1 || Boolean(participant.registrasi_ulang_at);
  const companyId = Number(participant.company_id || 0);
  const packageId = Number(participant.package_id || 0);

  if (!entry && registered && companyId && packageId) {
    try {
      const queueSession = await ensureMcuQueueSession(supabase, { companyId, packageId });
      entry = await normalizeEntry(await ensureMcuQueueEntry(supabase, {
        queueSessionId: Number(queueSession.id),
        participantId,
      }));
    } catch (error: any) {
      return fail(String(error?.message || "Gagal merilis nomor Antrian MCU."), 500);
    }
  }

  let session: any = null;
  if (entry?.queue_session_id) {
    const sessionRes = await supabase
      .from("mcu_queue_sessions")
      .select("id,company_id,package_id,track_a_name,track_b_name,public_token,is_active")
      .eq("id", Number(entry.queue_session_id))
      .maybeSingle();
    if (sessionRes.error) return fail(sessionRes.error.message, 500);
    session = sessionRes.data || null;
  } else if (companyId && packageId) {
    const sessionRes = await supabase
      .from("mcu_queue_sessions")
      .select("id,company_id,package_id,track_a_name,track_b_name,public_token,is_active")
      .eq("company_id", companyId)
      .eq("package_id", packageId)
      .maybeSingle();
    if (sessionRes.error) return fail(sessionRes.error.message, 500);
    session = sessionRes.data || null;
  }

  const aNumber = entry?.a_queue_number || null;
  const bNumber = entry?.b_queue_number || null;
  return ok({
    queue_session: session,
    queue_entry: entry,
    a_queue_number: aNumber,
    b_queue_number: bNumber,
    a_queue_sequence: entry?.a_queue_sequence || null,
    b_queue_sequence: entry?.b_queue_sequence || null,
    queueA: aNumber,
    queueB: bNumber,
    queue_label: [aNumber, bNumber].filter(Boolean).join(" / ") || null,
    track_a_name: session?.track_a_name || "Lab Darah",
    track_b_name: session?.track_b_name || "Rontgen",
  });
}
