import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import { loadMcuQueueEntriesWithParticipants, type McuQueueTrack } from "@/lib/server/mcuQueue";
import {
  loadMcuOperatorSession,
  loadMcuPendingParticipants,
  markMcuParticipantInformed,
} from "@/lib/server/mcuQueueDayOf";

export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalizeTrack(value: any): McuQueueTrack {
  return String(value || "A").toUpperCase() === "B" ? "B" : "A";
}

function statusField(track: McuQueueTrack) {
  return track === "A" ? "a_status" : "b_status";
}

function sequenceField(track: McuQueueTrack) {
  return track === "A" ? "a_queue_sequence" : "b_queue_sequence";
}

function numberField(track: McuQueueTrack) {
  return track === "A" ? "a_queue_number" : "b_queue_number";
}

function timestampField(track: McuQueueTrack, status: string) {
  const prefix = track === "A" ? "a" : "b";
  if (status === "CALLED") return `${prefix}_called_at`;
  if (status === "IN_PROGRESS") return `${prefix}_started_at`;
  if (status === "DONE") return `${prefix}_finished_at`;
  if (status === "CANCELLED") return `${prefix}_cancelled_at`;
  return "";
}

function actionToStatus(action: string) {
  if (action === "recall") return "CALLED";
  if (action === "start") return "IN_PROGRESS";
  if (action === "finish") return "DONE";
  if (action === "skip") return "SKIPPED";
  if (action === "cancel") return "CANCELLED";
  if (action === "waiting" || action === "reactivate") return "WAITING";
  return "";
}

async function resolveOperatorContext(token: string) {
  const supabase = getSupabaseAdmin();
  const queueSession = await loadMcuOperatorSession(supabase, token);
  if (!queueSession) throw new Error("Link Operator Antrian tidak valid atau sudah diganti.");

  const companyId = Number(queueSession.company_id || 0);
  const packageId = Number(queueSession.package_id || 0);
  const [companyRes, packageRes] = await Promise.all([
    supabase.from("companies").select("id,name").eq("id", companyId).maybeSingle(),
    supabase.from("packages").select("id,name").eq("id", packageId).maybeSingle(),
  ]);
  if (companyRes.error) throw new Error(companyRes.error.message);
  if (packageRes.error) throw new Error(packageRes.error.message);

  return {
    supabase,
    queueSession,
    company: companyRes.data || { id: companyId, name: "MCU Corporate" },
    package: packageRes.data || { id: packageId, name: "Paket MCU" },
  };
}

export async function GET(req: NextRequest) {
  const token = clean(req.nextUrl.searchParams.get("token"));
  if (!token) return fail("Token Operator wajib diisi.", 400);

  try {
    const { supabase, queueSession, company, package: pkg } = await resolveOperatorContext(token);
    const [entries, pendingParticipants] = await Promise.all([
      loadMcuQueueEntriesWithParticipants(supabase, Number(queueSession.id)),
      loadMcuPendingParticipants(supabase, {
        queueSessionId: Number(queueSession.id),
        companyId: Number(queueSession.company_id),
        packageId: Number(queueSession.package_id),
      }),
    ]);

    return ok({
      queue_session: queueSession,
      company,
      package: pkg,
      entries,
      pending_participants: pendingParticipants,
      public_url: `/mcu/public/queue/${encodeURIComponent(String(queueSession.public_token || ""))}`,
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat dashboard Operator Antrian.", 403);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = clean(body.token);
  const action = clean(body.action).toLowerCase();
  const track = normalizeTrack(body.track);
  if (!token) return fail("Token Operator wajib diisi.", 400);

  try {
    const { supabase, queueSession } = await resolveOperatorContext(token);

    if (action === "informed") {
      const participantId = Number(body.participant_id || body.participantId || 0);
      if (!participantId) return fail("participant_id wajib diisi.", 400);
      const informed = await markMcuParticipantInformed(supabase, {
        queueSessionId: Number(queueSession.id),
        participantId,
        companyId: Number(queueSession.company_id),
        packageId: Number(queueSession.package_id),
        informedBy: "Operator Antrian",
      });
      return ok({ message: "Peserta ditandai sudah di-informed.", informed });
    }

    if (action === "call-next") {
      const statusKey = statusField(track);
      const sequenceKey = sequenceField(track);
      const numberKey = numberField(track);
      const nextResult = await supabase
        .from("mcu_queue_entries")
        .select("*")
        .eq("queue_session_id", Number(queueSession.id))
        .eq(statusKey, "WAITING")
        .not(numberKey, "is", null)
        .order(sequenceKey, { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextResult.error) throw new Error(nextResult.error.message);
      if (!nextResult.data) return fail(`Tidak ada antrian ${track} berikutnya.`, 404);

      const now = new Date().toISOString();
      const updateResult = await supabase
        .from("mcu_queue_entries")
        .update({
          [statusKey]: "CALLED",
          [timestampField(track, "CALLED")]: now,
          updated_at: now,
        })
        .eq("id", nextResult.data.id)
        .select("*")
        .single();

      if (updateResult.error) throw new Error(updateResult.error.message);
      return ok({
        message: `Memanggil nomor ${String(updateResult.data?.[numberKey] || "-")}.`,
        entry: updateResult.data,
        track,
      });
    }

    const entryId = Number(body.entry_id || body.entryId || 0);
    if (!entryId) return fail("entry_id wajib diisi.", 400);
    const nextStatus = actionToStatus(action);
    if (!nextStatus) return fail("Action antrian tidak dikenali.", 400);

    const existing = await supabase
      .from("mcu_queue_entries")
      .select("*")
      .eq("id", entryId)
      .eq("queue_session_id", Number(queueSession.id))
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (!existing.data) return fail("Data antrian tidak ditemukan.", 404);

    const now = new Date().toISOString();
    const statusKey = statusField(track);
    const payload: Record<string, any> = {
      [statusKey]: nextStatus,
      updated_at: now,
    };
    const tsKey = timestampField(track, nextStatus);
    if (tsKey) payload[tsKey] = now;

    const updateResult = await supabase
      .from("mcu_queue_entries")
      .update(payload)
      .eq("id", entryId)
      .select("*")
      .single();
    if (updateResult.error) throw new Error(updateResult.error.message);

    return ok({
      message: `Status antrian ${track} diubah ke ${nextStatus}.`,
      entry: updateResult.data,
      track,
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal memperbarui dashboard Operator Antrian.", 403);
  }
}
