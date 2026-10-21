import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import {
  ensureMcuQueueEntry,
  formatMcuQueueNumber,
} from "@/lib/server/mcuQueue";

// MCU_QUEUE_BINDING_AUTHORITATIVE_EXACT_SESSION_V458_R3
function normalizeEntry(entry: any) {
  if (!entry) return null;

  const aSeq = Number(entry.a_queue_sequence || 0);
  const bSeq = Number(entry.b_queue_sequence || 0);

  return {
    ...entry,
    a_queue_number:
      entry.a_queue_number ||
      (aSeq > 0 ? formatMcuQueueNumber("A", aSeq) : null),
    b_queue_number:
      entry.b_queue_number ||
      (bSeq > 0 ? formatMcuQueueNumber("B", bSeq) : null),
    a_queue_sequence: aSeq || null,
    b_queue_sequence: bSeq || null,
  };
}

async function loadExactSession(
  supabase: any,
  args: {
    sessionId: number;
    companyId: number;
    packageId: number;
  },
) {
  const result = await supabase
    .from("mcu_queue_sessions")
    .select(
      "id,company_id,package_id,session_name,location,session_date,track_a_name,track_b_name,public_token,is_active",
    )
    .eq("id", Number(args.sessionId))
    .eq("company_id", Number(args.companyId))
    .eq("package_id", Number(args.packageId))
    .eq("is_active", 1)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      result.error.message || "Gagal membaca Session Antrian MCU.",
    );
  }

  return result.data || null;
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") {
    return fail("Unauthorized", 401);
  }

  const participantId = Number(
    req.nextUrl.searchParams.get("participant_id") || 0,
  );
  const requestedQueueSessionId = Number(
    req.nextUrl.searchParams.get("queue_session_id") || 0,
  );

  if (!participantId) {
    return fail("participant_id wajib diisi.", 400);
  }

  const supabase = getSupabaseAdmin();

  const participantRes = await supabase
    .from("participants")
    .select(
      "id,program_type,company_id,package_id,registrasi_ulang_done,registrasi_ulang_at",
    )
    .eq("id", participantId)
    .maybeSingle();

  if (participantRes.error) {
    return fail(participantRes.error.message, 500);
  }

  const participant = participantRes.data;
  if (!participant) {
    return fail("Peserta tidak ditemukan.", 404);
  }

  if (
    String(participant.program_type || "").toLowerCase() !==
    "corporate"
  ) {
    return ok({
      queue_entry: null,
      queue_session: null,
    });
  }

  const companyId = Number(participant.company_id || 0);
  const packageId = Number(participant.package_id || 0);

  if (!companyId || !packageId) {
    return ok({
      queue_entry: null,
      queue_session: null,
    });
  }

  let queueSession: any = null;
  let resolvedFromBinding = false;

  try {
    if (requestedQueueSessionId) {
      queueSession = await loadExactSession(supabase, {
        sessionId: requestedQueueSessionId,
        companyId,
        packageId,
      });

      if (!queueSession) {
        return ok({
          queue_entry: null,
          queue_session: null,
          session_mismatch: true,
        });
      }
    } else {
      // Safe fallback #1: explicit registration-session binding.
      const bindingRes = await supabase
        .from("mcu_registration_sessions")
        .select("queue_session_id,registered_at,id")
        .eq("participant_id", participantId)
        .eq("company_id", companyId)
        .eq("package_id", packageId)
        .order("registered_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (bindingRes.error) {
        throw new Error(bindingRes.error.message);
      }

      if (bindingRes.data?.queue_session_id) {
        queueSession = await loadExactSession(supabase, {
          sessionId: Number(bindingRes.data.queue_session_id),
          companyId,
          packageId,
        });
        resolvedFromBinding = Boolean(queueSession);
      }

      // Safe fallback #2: only when exactly one active session exists.
      if (!queueSession) {
        const sessionsRes = await supabase
          .from("mcu_queue_sessions")
          .select(
            "id,company_id,package_id,session_name,location,session_date,track_a_name,track_b_name,public_token,is_active",
          )
          .eq("company_id", companyId)
          .eq("package_id", packageId)
          .eq("is_active", 1)
          .order("id", { ascending: false })
          .limit(2);

        if (sessionsRes.error) {
          throw new Error(sessionsRes.error.message);
        }

        const sessions = sessionsRes.data || [];
        if (sessions.length === 1) {
          queueSession = sessions[0];
        } else {
          return ok({
            queue_entry: null,
            queue_session: null,
            ambiguous_session: sessions.length > 1,
          });
        }
      }
    }
  } catch (error: any) {
    return fail(
      String(error?.message || "Gagal membaca Session Antrian MCU."),
      500,
    );
  }

  if (!queueSession) {
    return ok({
      queue_entry: null,
      queue_session: null,
    });
  }

  let entryRes = await supabase
    .from("mcu_queue_entries")
    .select(
      "id,queue_session_id,participant_id,a_queue_number,a_queue_sequence,b_queue_number,b_queue_sequence,a_status,b_status,created_at,updated_at",
    )
    .eq("queue_session_id", Number(queueSession.id))
    .eq("participant_id", participantId)
    .maybeSingle();

  if (entryRes.error) {
    return fail(entryRes.error.message, 500);
  }

  let entry: any = normalizeEntry(entryRes.data || null);

  // Preserve V457's authoritative "released queue number" repair,
  // but ONLY inside the exact selected/bound Session.
  if (!entry) {
    const registered =
      Number(participant.registrasi_ulang_done || 0) === 1 ||
      Boolean(participant.registrasi_ulang_at);

    let hasExactBinding = false;

    const bindingCheck = await supabase
      .from("mcu_registration_sessions")
      .select("id")
      .eq("queue_session_id", Number(queueSession.id))
      .eq("participant_id", participantId)
      .limit(1)
      .maybeSingle();

    if (bindingCheck.error) {
      return fail(bindingCheck.error.message, 500);
    }

    hasExactBinding = Boolean(bindingCheck.data);

    const isLegacySingleSession =
      !requestedQueueSessionId &&
      !resolvedFromBinding &&
      !String(queueSession.location || "").trim() &&
      !String(queueSession.session_date || "").trim();

    if (hasExactBinding || (registered && isLegacySingleSession)) {
      try {
        entry = normalizeEntry(
          await ensureMcuQueueEntry(supabase, {
            queueSessionId: Number(queueSession.id),
            participantId,
          }),
        );
      } catch (error: any) {
        return fail(
          String(error?.message || "Gagal merilis nomor Antrian MCU."),
          500,
        );
      }
    }
  }

  const aNumber = entry?.a_queue_number || null;
  const bNumber = entry?.b_queue_number || null;

  return ok({
    queue_session: queueSession,
    queue_entry: entry,
    a_queue_number: aNumber,
    b_queue_number: bNumber,
    a_queue_sequence: entry?.a_queue_sequence || null,
    b_queue_sequence: entry?.b_queue_sequence || null,
    queueA: aNumber,
    queueB: bNumber,
    queue_label:
      [aNumber, bNumber].filter(Boolean).join(" / ") || null,
    track_a_name: queueSession?.track_a_name || "Lab Darah",
    track_b_name: queueSession?.track_b_name || "Rontgen",
  });
}
