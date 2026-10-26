import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import { getMcuCorporateSession } from "@/lib/server/mcuCorporateSession";
import {
  ensureMcuQueueEntry,
  ensureMcuQueueSession,
  loadMcuQueueEntriesWithParticipants,
  queueSchemaErrorMessage,
  type McuQueueTrack,
} from "@/lib/server/mcuQueue";
import {
  loadMcuPendingParticipants,
  markMcuParticipantInformed,
  rotateMcuOperatorToken,
} from "@/lib/server/mcuQueueDayOf";

export const dynamic = "force-dynamic";

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

// MCU_ADMIN_QUEUE_HISTORY_EDIT_V465
function cancelReasonField(track: McuQueueTrack) {
  return track === "A" ? "a_cancel_reason" : "b_cancel_reason";
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

// MCU_QUEUE_MULTI_LOCATION_CONTEXT_V453
async function resolveQueueContext(
  req: NextRequest,
  body?: Record<string, any>,
) {
  const cookieSelected = getMcuCorporateSession(req);
  const requestedQueueSessionId = Number(
    body?.queue_session_id ||
      body?.queueSessionId ||
      req.nextUrl.searchParams.get("queue_session_id") ||
      0,
  );

  const supabase = getSupabaseAdmin();

  let queueSession: any = null;
  let requestedCompanyId = Number(
    body?.company_id ||
      body?.companyId ||
      req.nextUrl.searchParams.get("company_id") ||
      cookieSelected?.company_id ||
      0,
  );
  let requestedPackageId = Number(
    body?.package_id ||
      body?.packageId ||
      req.nextUrl.searchParams.get("package_id") ||
      cookieSelected?.package_id ||
      0,
  );

  if (requestedQueueSessionId) {
    const queueSessionRes = await supabase
      .from("mcu_queue_sessions")
      .select("*")
      .eq("id", requestedQueueSessionId)
      .eq("is_active", 1)
      .maybeSingle();

    if (queueSessionRes.error) {
      throw new Error(queueSchemaErrorMessage(queueSessionRes.error));
    }
    if (!queueSessionRes.data) {
      throw new Error(
        "Session MCU lokasi/tanggal tidak ditemukan atau sudah nonaktif.",
      );
    }

    queueSession = queueSessionRes.data;
    requestedCompanyId = Number(queueSession.company_id || 0);
    requestedPackageId = Number(queueSession.package_id || 0);
  }

  if (!requestedCompanyId || !requestedPackageId) {
    throw new Error("Pilih perusahaan dan Session MCU terlebih dahulu.");
  }

  const [companyRes, packageRes] = await Promise.all([
    supabase
      .from("companies")
      .select("id,name")
      .eq("id", requestedCompanyId)
      .maybeSingle(),
    supabase
      .from("packages")
      .select("id,name,company_id,is_active,program_type")
      .eq("id", requestedPackageId)
      .eq("program_type", "corporate")
      .eq("is_active", 1)
      .maybeSingle(),
  ]);

  if (companyRes.error) throw new Error(companyRes.error.message);
  if (packageRes.error) throw new Error(packageRes.error.message);
  if (!companyRes.data) {
    throw new Error("Perusahaan MCU Corporate tidak ditemukan.");
  }
  if (!packageRes.data) {
    throw new Error("Paket MCU Corporate tidak ditemukan / tidak aktif.");
  }

  let linked =
    Number(packageRes.data.company_id || 0) === requestedCompanyId;

  if (!linked) {
    const participantLinkRes = await supabase
      .from("participants")
      .select("id")
      .eq("program_type", "corporate")
      .eq("company_id", requestedCompanyId)
      .eq("package_id", requestedPackageId)
      .limit(1)
      .maybeSingle();

    if (participantLinkRes.error) {
      throw new Error(participantLinkRes.error.message);
    }
    linked = Boolean(participantLinkRes.data);
  }

  if (!linked) {
    throw new Error(
      "Paket belum terhubung ke perusahaan yang dipilih pada data MCU Corporate.",
    );
  }

  const selected = {
    company_id: requestedCompanyId,
    package_id: requestedPackageId,
    company_name: String(companyRes.data.name || ""),
    package_name: String(packageRes.data.name || ""),
  };

  if (!queueSession) {
    queueSession = await ensureMcuQueueSession(supabase, {
      companyId: selected.company_id,
      packageId: selected.package_id,
    });
  }

  return { selected, supabase, queueSession };
}

async function ensureSessionRegistrationEntries(
  supabase: any,
  queueSessionId: number,
) {
  const sessionId = Number(queueSessionId || 0);
  if (!sessionId) return { bound: 0, created: 0 };

  const [bindingResult, entryResult] = await Promise.all([
    supabase
      .from("mcu_registration_sessions")
      .select("participant_id")
      .eq("queue_session_id", sessionId)
      .order("id", { ascending: true }),
    supabase
      .from("mcu_queue_entries")
      .select("participant_id")
      .eq("queue_session_id", sessionId),
  ]);

  if (bindingResult.error) {
    throw new Error(bindingResult.error.message);
  }
  if (entryResult.error) {
    throw new Error(entryResult.error.message);
  }

  const existingParticipantIds = new Set(
    (entryResult.data || [])
      .map((row: any) => Number(row.participant_id || 0))
      .filter(Boolean),
  );

  let created = 0;
  for (const row of bindingResult.data || []) {
    const participantId = Number(row.participant_id || 0);
    if (!participantId || existingParticipantIds.has(participantId)) {
      continue;
    }

    await ensureMcuQueueEntry(supabase, {
      queueSessionId: sessionId,
      participantId,
    });

    existingParticipantIds.add(participantId);
    created += 1;
  }

  return {
    bound: (bindingResult.data || []).length,
    created,
  };
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  try {
    const { selected, supabase, queueSession } = await resolveQueueContext(req);
    const autoQueue = await ensureSessionRegistrationEntries(
      supabase,
      Number(queueSession.id),
    );

    const [entries, pendingParticipants, companyRes, packageRes] = await Promise.all([
      loadMcuQueueEntriesWithParticipants(supabase, queueSession.id),
      loadMcuPendingParticipants(supabase, {
        queueSessionId: Number(queueSession.id),
        companyId: selected.company_id,
        packageId: selected.package_id,
      }),
      supabase.from("companies").select("id,name").eq("id", selected.company_id).maybeSingle(),
      supabase.from("packages").select("id,name").eq("id", selected.package_id).maybeSingle(),
    ]);

    if (companyRes.error) throw new Error(companyRes.error.message);
    if (packageRes.error) throw new Error(packageRes.error.message);

    return ok({
      queue_session: queueSession,
      company: companyRes.data || { id: selected.company_id, name: selected.company_name },
      package: packageRes.data || { id: selected.package_id, name: selected.package_name },
      entries,
      pending_participants: pendingParticipants,
      public_url: `/mcu/public/queue/${encodeURIComponent(queueSession.public_token)}`,
      operator_url: (queueSession as any)?.operator_token
        ? `/mcu/operator/${encodeURIComponent(String((queueSession as any).operator_token))}`
        : "",
      auto_queue: {
        mode: "SESSION_BOUND_AUTOMATIC",
        bound: Number(autoQueue.bound || 0),
        created: Number(autoQueue.created || 0),
      },
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal mengambil Antrian MCU.", 500);
  }
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "").trim().toLowerCase();
  const track = normalizeTrack(body.track);

  try {
    const { selected, supabase, queueSession } = await resolveQueueContext(req, body);


    // MCU_CORPORATE_SESSION_TEST_RESET_V511
    // Reset ONLY operational state for the exact selected MCU Corporate Session.
    // Roster/import/session assignment are intentionally preserved.
    if (action === "reset-session-test") {
      const sessionId = Number(queueSession.id || 0);
      if (!sessionId) return fail("Session MCU wajib dipilih.", 400);

      const [
        assignmentRows,
        registrationRows,
        queueRows,
        informedRows,
      ] = await Promise.all([
        supabase
          .from("mcu_participant_session_assignments")
          .select("participant_id")
          .eq("queue_session_id", sessionId),
        supabase
          .from("mcu_registration_sessions")
          .select("participant_id")
          .eq("queue_session_id", sessionId),
        supabase
          .from("mcu_queue_entries")
          .select("participant_id")
          .eq("queue_session_id", sessionId),
        supabase
          .from("mcu_queue_informed")
          .select("participant_id")
          .eq("queue_session_id", sessionId),
      ]);

      for (const result of [
        assignmentRows,
        registrationRows,
        queueRows,
        informedRows,
      ]) {
        if (result.error) throw new Error(queueSchemaErrorMessage(result.error));
      }

      const sessionParticipantIds = Array.from(
        new Set(
          [
            ...(assignmentRows.data || []),
            ...(registrationRows.data || []),
            ...(queueRows.data || []),
            ...(informedRows.data || []),
          ]
            .map((row: any) => Number(row?.participant_id || 0))
            .filter(Boolean),
        ),
      );

      // Preserve global registrasi flag for anyone who is still registered
      // in another MCU Session.
      const registeredElsewhere = new Set<number>();
      const chunkSize = 400;
      for (let i = 0; i < sessionParticipantIds.length; i += chunkSize) {
        const ids = sessionParticipantIds.slice(i, i + chunkSize);
        if (!ids.length) continue;

        const otherRegistration = await supabase
          .from("mcu_registration_sessions")
          .select("participant_id,queue_session_id")
          .in("participant_id", ids)
          .neq("queue_session_id", sessionId);

        if (otherRegistration.error) {
          throw new Error(queueSchemaErrorMessage(otherRegistration.error));
        }

        for (const row of otherRegistration.data || []) {
          const participantId = Number(row?.participant_id || 0);
          if (participantId) registeredElsewhere.add(participantId);
        }
      }

      // Delete only transactional rows from this exact Session.
      // The mcu_participant_session_assignments roster is NEVER deleted here.
      const [deletedQueue, deletedRegistration, deletedInformed] =
        await Promise.all([
          supabase
            .from("mcu_queue_entries")
            .delete()
            .eq("queue_session_id", sessionId)
            .select("id"),
          supabase
            .from("mcu_registration_sessions")
            .delete()
            .eq("queue_session_id", sessionId)
            .select("id"),
          supabase
            .from("mcu_queue_informed")
            .delete()
            .eq("queue_session_id", sessionId)
            .select("participant_id"),
        ]);

      for (const result of [
        deletedQueue,
        deletedRegistration,
        deletedInformed,
      ]) {
        if (result.error) throw new Error(queueSchemaErrorMessage(result.error));
      }

      // Reset global Registrasi Ulang flag only for members of THIS Session
      // that are not still registered in another MCU Session.
      const safeGlobalResetIds = sessionParticipantIds.filter(
        (participantId) => !registeredElsewhere.has(participantId),
      );

      let globalFlagsReset = 0;
      for (let i = 0; i < safeGlobalResetIds.length; i += chunkSize) {
        const ids = safeGlobalResetIds.slice(i, i + chunkSize);
        if (!ids.length) continue;

        const resetParticipants = await supabase
          .from("participants")
          .update({
            registrasi_ulang_done: 0,
            registrasi_ulang_at: null,
          })
          .in("id", ids)
          .eq("program_type", "corporate")
          .eq("company_id", selected.company_id)
          .select("id");

        if (resetParticipants.error) {
          throw new Error(resetParticipants.error.message);
        }
        globalFlagsReset += (resetParticipants.data || []).length;
      }

      return ok({
        message:
          `Reset testing Session selesai. Roster ${sessionParticipantIds.length} peserta tetap aman; ` +
          `Registrasi, nomor/status antrean, dan Informed Session ini dikosongkan.`,
        reset: {
          queue_session_id: sessionId,
          roster_preserved: sessionParticipantIds.length,
          assignments_preserved: (assignmentRows.data || []).length,
          registrations_deleted: (deletedRegistration.data || []).length,
          queue_entries_deleted: (deletedQueue.data || []).length,
          informed_deleted: (deletedInformed.data || []).length,
          global_registration_flags_reset: globalFlagsReset,
          protected_by_other_session: registeredElsewhere.size,
        },
      });
    }

    if (action === "informed") {
      const participantId = Number(body.participant_id || body.participantId || 0);
      if (!participantId) return fail("participant_id wajib diisi.", 400);
      const informed = await markMcuParticipantInformed(supabase, {
        queueSessionId: Number(queueSession.id),
        participantId,
        companyId: selected.company_id,
        packageId: selected.package_id,
        informedBy: String((user as any)?.username || (user as any)?.name || (user as any)?.email || "admin"),
      });
      return ok({ message: "Peserta ditandai sudah di-informed.", informed });
    }

    if (action === "generate-operator-link") {
      const token = await rotateMcuOperatorToken(supabase, Number(queueSession.id));
      return ok({
        message: "Link Operator Antrian berhasil dibuat. Link lama otomatis tidak berlaku.",
        operator_url: `/mcu/operator/${encodeURIComponent(token)}`,
      });
    }

    if (action === "call-next") {
      const statusKey = statusField(track);
      const sequenceKey = sequenceField(track);
      const numberKey = numberField(track);

      const nextResult = await supabase
        .from("mcu_queue_entries")
        .select("*")
        .eq("queue_session_id", queueSession.id)
        .eq(statusKey, "WAITING")
        .not(numberKey, "is", null)
        .order(sequenceKey, { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextResult.error) throw new Error(nextResult.error.message);
      if (!nextResult.data) return fail(`Tidak ada antrian ${track} berikutnya.`, 404);

      const now = new Date().toISOString();
      const payload: Record<string, any> = {
        [statusKey]: "CALLED",
        [timestampField(track, "CALLED")]: now,
        updated_at: now,
      };

      const updateResult = await supabase
        .from("mcu_queue_entries")
        .update(payload)
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
    const cancelReason = nextStatus === "CANCELLED"
      ? String(body.cancel_reason || body.cancelReason || "").trim().slice(0, 500)
      : "";
    if (nextStatus === "CANCELLED" && !cancelReason) {
      return fail("Alasan cancel wajib diisi.", 400);
    }

    const existing = await supabase
      .from("mcu_queue_entries")
      .select("*")
      .eq("id", entryId)
      .eq("queue_session_id", queueSession.id)
      .maybeSingle();

    if (existing.error) throw new Error(existing.error.message);
    if (!existing.data) return fail("Data antrian tidak ditemukan pada Session MCU aktif.", 404);

    const now = new Date().toISOString();
    const statusKey = statusField(track);
    const payload: Record<string, any> = {
      [statusKey]: nextStatus,
      updated_at: now,
    };
    const prefix = track === "A" ? "a" : "b";
    if (nextStatus === "CANCELLED") {
      payload[cancelReasonField(track)] = cancelReason;
    } else {
      payload[cancelReasonField(track)] = null;
    }
    if (nextStatus !== "DONE") payload[`${prefix}_finished_at`] = null;
    if (nextStatus !== "CANCELLED") payload[`${prefix}_cancelled_at`] = null;
    if (["WAITING", "SKIPPED"].includes(nextStatus)) {
      payload[`${prefix}_called_at`] = null;
      payload[`${prefix}_started_at`] = null;
    } else if (nextStatus === "CALLED") {
      payload[`${prefix}_started_at`] = null;
    }
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
    return fail(error?.message || "Gagal memperbarui Antrian MCU.", 500);
  }
}
