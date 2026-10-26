import crypto from "crypto";
import { queueSchemaErrorMessage } from "@/lib/server/mcuQueue";

export type McuPendingParticipant = {
  id: number;
  name?: string;
  mcu_id?: string;
  external_id?: string;
  nik?: string;
  employee_nik?: string;
  department?: string;
  registrasi_ulang_done?: any;
  registrasi_ulang_at?: string | null;
  informed_at?: string | null;
  informed_by?: string | null;
};

// MCU_CORPORATE_EXACT_DAYH_SESSION_SCOPE_V507
async function loadSessionParticipantScope(
  supabase: any,
  queueSessionId: number,
) {
  const [assignmentResult, registrationResult, queueResult] = await Promise.all([
    supabase
      .from("mcu_participant_session_assignments")
      .select("participant_id,source_id")
      .eq("queue_session_id", queueSessionId),
    supabase
      .from("mcu_registration_sessions")
      .select("participant_id")
      .eq("queue_session_id", queueSessionId),
    supabase
      .from("mcu_queue_entries")
      .select("participant_id")
      .eq("queue_session_id", queueSessionId),
  ]);

  if (assignmentResult.error) {
    throw new Error(queueSchemaErrorMessage(assignmentResult.error));
  }
  if (registrationResult.error) {
    throw new Error(queueSchemaErrorMessage(registrationResult.error));
  }
  if (queueResult.error) {
    throw new Error(queueSchemaErrorMessage(queueResult.error));
  }

  const assignmentRows = assignmentResult.data || [];
  const registrationRows = registrationResult.data || [];
  const queueRows = queueResult.data || [];

  // Exact Session membership only. Never expand one Session through company,
  // package, or source_id because those values can be shared by locations/dates.
  const participantIds = Array.from(
    new Set(
      [...assignmentRows, ...registrationRows, ...queueRows]
        .map((row: any) => Number(row.participant_id || 0))
        .filter(Boolean),
    ),
  );

  // MCU_CORPORATE_DAYH_PRE_REGISTRATION_ROSTER_V514_1
  // List Hari H is a pre-registration roster. Informed status NEVER removes
  // a participant. A participant leaves only after exact-Session registration
  // or an exact-Session queue entry exists.
  const registrationParticipantIds: number[] = Array.from(
    new Set<number>(
      registrationRows
        .map((row: any) => Number(row.participant_id || 0))
        .filter((value: number) => Number.isFinite(value) && value > 0),
    ),
  );

  const queueParticipantIds: number[] = Array.from(
    new Set<number>(
      queueRows
        .map((row: any) => Number(row.participant_id || 0))
        .filter((value: number) => Number.isFinite(value) && value > 0),
    ),
  );

  return {
    participantIds,
    registrationParticipantIds,
    queueParticipantIds,
    assignmentCount: assignmentRows.length,
    registrationCount: registrationRows.length,
    queueCount: queueRows.length,
  };
}

async function loadAllParticipants(
  supabase: any,
  args: { queueSessionId: number; companyId: number; packageId: number },
) {
  const scope = await loadSessionParticipantScope(supabase, args.queueSessionId);

  // A newly-created Session stays empty until participants are explicitly
  // assigned/imported/registered to THIS exact queue_session_id.
  if (!scope.participantIds.length) {
    return { rows: [], scope };
  }

  const rows: any[] = [];
  const chunkSize = 500;

  for (let i = 0; i < scope.participantIds.length; i += chunkSize) {
    const ids = scope.participantIds.slice(i, i + chunkSize);
    const result = await supabase
      .from("participants")
      .select("id,name,mcu_id,external_id,nik,employee_nik,department,source_id,package_id,registrasi_ulang_done,registrasi_ulang_at")
      .eq("program_type", "corporate")
      .eq("company_id", args.companyId)
      .in("id", ids)
      .order("name", { ascending: true })
      .order("id", { ascending: true });

    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data || []));
  }

  rows.sort((a: any, b: any) => {
    const byName = String(a?.name || "").localeCompare(String(b?.name || ""), "id", {
      sensitivity: "base",
    });
    return byName || Number(a?.id || 0) - Number(b?.id || 0);
  });

  return { rows, scope };
}

async function loadInformedRows(
  supabase: any,
  queueSessionId: number,
  participantIds: number[],
) {
  if (!participantIds.length) return [];
  const rows: any[] = [];
  const chunkSize = 500;

  for (let i = 0; i < participantIds.length; i += chunkSize) {
    const ids = participantIds.slice(i, i + chunkSize);
    const result = await supabase
      .from("mcu_queue_informed")
      .select("participant_id,informed_at,informed_by,updated_at")
      .eq("queue_session_id", queueSessionId)
      .in("participant_id", ids);

    if (result.error) throw new Error(queueSchemaErrorMessage(result.error));
    rows.push(...(result.data || []));
  }

  return rows;
}

export async function loadMcuPendingParticipants(
  supabase: any,
  args: { queueSessionId: number; companyId: number; packageId: number },
): Promise<McuPendingParticipant[]> {
  const { rows: participants, scope } = await loadAllParticipants(supabase, args);

  const registeredIds = (scope.registrationParticipantIds || [])
    .map((value: any) => Number(value))
    .filter((value: number) => Number.isFinite(value) && value > 0);

  const queuedIds = (scope.queueParticipantIds || [])
    .map((value: any) => Number(value))
    .filter((value: number) => Number.isFinite(value) && value > 0);

  const alreadyRegisteredOrQueued = new Set<number>([
    ...registeredIds,
    ...queuedIds,
  ]);

  const pendingParticipants = participants.filter(
    (row: any) =>
      !alreadyRegisteredOrQueued.has(Number(row?.id || 0)),
  );

  const participantIds = pendingParticipants
    .map((row: any) => Number(row.id || 0))
    .filter((value: number) => Number.isFinite(value) && value > 0);

  const informedRows = await loadInformedRows(
    supabase,
    args.queueSessionId,
    participantIds,
  );
  const informedMap = new Map<number, any>(
    informedRows.map((row) => [Number(row.participant_id || 0), row]),
  );

  return pendingParticipants.map((row) => {
    const informed = informedMap.get(Number(row.id || 0));
    return {
      ...row,
      informed_at: informed?.informed_at || null,
      informed_by: informed?.informed_by || null,
    };
  });
}

export async function markMcuParticipantInformed(
  supabase: any,
  args: {
    queueSessionId: number;
    participantId: number;
    companyId: number;
    packageId: number;
    informedBy?: string;
  },
) {
  const participantRes = await supabase
    .from("participants")
    .select("id,source_id,package_id")
    .eq("id", args.participantId)
    .eq("program_type", "corporate")
    .eq("company_id", args.companyId)
    .maybeSingle();

  if (participantRes.error) throw new Error(participantRes.error.message);
  if (!participantRes.data) throw new Error("Peserta tidak ditemukan pada perusahaan MCU Corporate ini.");

  const scope = await loadSessionParticipantScope(supabase, args.queueSessionId);
  const inSessionScope = scope.participantIds.includes(args.participantId);

  if (!inSessionScope) {
    throw new Error("Peserta tidak termasuk roster Session MCU yang dipilih.");
  }

  const registeredIdsV514 = (scope.registrationParticipantIds || [])
    .map((value: any) => Number(value))
    .filter((value: number) => Number.isFinite(value) && value > 0);

  const queuedIdsV514 = (scope.queueParticipantIds || [])
    .map((value: any) => Number(value))
    .filter((value: number) => Number.isFinite(value) && value > 0);

  if (
    registeredIdsV514.includes(args.participantId) ||
    queuedIdsV514.includes(args.participantId)
  ) {
    throw new Error(
      "Peserta sudah Registrasi Ulang / mengambil nomor antrean pada Session ini.",
    );
  }

  const now = new Date().toISOString();
  const upsert = await supabase
    .from("mcu_queue_informed")
    .upsert(
      {
        queue_session_id: args.queueSessionId,
        participant_id: args.participantId,
        informed_at: now,
        informed_by: String(args.informedBy || "operator").slice(0, 160),
        updated_at: now,
      },
      { onConflict: "queue_session_id,participant_id" },
    )
    .select("participant_id,informed_at,informed_by,updated_at")
    .single();

  if (upsert.error) throw new Error(queueSchemaErrorMessage(upsert.error));
  return upsert.data;
}

export async function rotateMcuOperatorToken(supabase: any, queueSessionId: number) {
  const token = crypto.randomBytes(24).toString("hex");
  const result = await supabase
    .from("mcu_queue_sessions")
    .update({ operator_token: token, updated_at: new Date().toISOString() })
    .eq("id", queueSessionId)
    .select("id,operator_token")
    .single();

  if (result.error) throw new Error(queueSchemaErrorMessage(result.error));
  return String(result.data?.operator_token || token);
}

export async function loadMcuOperatorSession(supabase: any, token: string) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) return null;
  const result = await supabase
    .from("mcu_queue_sessions")
    .select("*")
    .eq("operator_token", cleanToken)
    .eq("is_active", 1)
    .maybeSingle();

  if (result.error) throw new Error(queueSchemaErrorMessage(result.error));
  return result.data || null;
}
