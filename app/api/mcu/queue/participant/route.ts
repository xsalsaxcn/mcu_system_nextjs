import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

// MCU_REG_QUEUE_LABEL_INFO_V447
export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const participantId = Number(req.nextUrl.searchParams.get("participant_id") || 0);
  if (!participantId) return fail("participant_id wajib diisi.", 400);

  const supabase = getSupabaseAdmin();

  const participantRes = await supabase
    .from("participants")
    .select("id,program_type,company_id,package_id")
    .eq("id", participantId)
    .maybeSingle();

  if (participantRes.error) return fail(participantRes.error.message, 500);
  const participant = participantRes.data;
  if (!participant) return fail("Peserta tidak ditemukan.", 404);
  if (String(participant.program_type || "").toLowerCase() !== "corporate") {
    return ok({ queue_entry: null, queue_session: null });
  }

  const companyId = Number(participant.company_id || 0);
  const packageId = Number(participant.package_id || 0);
  if (!companyId || !packageId) return ok({ queue_entry: null, queue_session: null });

  const sessionRes = await supabase
    .from("mcu_queue_sessions")
    .select("id,company_id,package_id,track_a_name,track_b_name,public_token,is_active")
    .eq("company_id", companyId)
    .eq("package_id", packageId)
    .maybeSingle();

  if (sessionRes.error) {
    const msg = String(sessionRes.error.message || "");
    if (msg.toLowerCase().includes("mcu_queue_sessions") || msg.toLowerCase().includes("does not exist")) {
      return ok({ queue_entry: null, queue_session: null });
    }
    return fail(msg || "Gagal membaca Session Antrian MCU.", 500);
  }
  if (!sessionRes.data) return ok({ queue_entry: null, queue_session: null });

  const entryRes = await supabase
    .from("mcu_queue_entries")
    .select("id,a_queue_number,b_queue_number,a_status,b_status,created_at,updated_at")
    .eq("queue_session_id", Number(sessionRes.data.id))
    .eq("participant_id", participantId)
    .maybeSingle();

  if (entryRes.error) return fail(entryRes.error.message, 500);

  const entry = entryRes.data || null;
  // MCU_QUEUE_ALIAS_RESPONSE_V456
  return ok({
    queue_session: sessionRes.data,
    queue_entry: entry,
    a_queue_number: entry?.a_queue_number || null,
    b_queue_number: entry?.b_queue_number || null,
    queueA: entry?.a_queue_number || null,
    queueB: entry?.b_queue_number || null,
    queue_label: [entry?.a_queue_number, entry?.b_queue_number].filter(Boolean).join(" / ") || null,
  });
}
