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

async function loadSessionParticipantScope(
  supabase: any,
  queueSessionId: number,
) {
  const result = await supabase
    .from("mcu_participant_session_assignments")
    .select("participant_id,source_id")
    .eq("queue_session_id", queueSessionId);

  if (result.error) throw new Error(queueSchemaErrorMessage(result.error));

  const rows = result.data || [];
  const participantIds = Array.from(
    new Set(rows.map((row: any) => Number(row.participant_id || 0)).filter(Boolean)),
  );
  const sourceIds = Array.from(
    new Set(rows.map((row: any) => Number(row.source_id || 0)).filter(Boolean)),
  );

  return { participantIds, sourceIds };
}

async function loadAllParticipants(
  supabase: any,
  args: { queueSessionId: number; companyId: number; packageId: number },
) {
  const scope = await loadSessionParticipantScope(supabase, args.queueSessionId);
  const rows: any[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    let query = supabase
      .from("participants")
      .select("id,name,mcu_id,external_id,nik,employee_nik,department,source_id,package_id,registrasi_ulang_done,registrasi_ulang_at")
      .eq("program_type", "corporate")
      .eq("company_id", args.companyId);

    // Location/date sessions use the imported database/source that was linked to
    // the session. This intentionally does NOT force participant.package_id to
    // equal the queue session package because those concepts are separate.
    if (scope.sourceIds.length) {
      query = query.in("source_id", scope.sourceIds);
    } else if (scope.participantIds.length) {
      query = query.in("id", scope.participantIds);
    } else {
      // Legacy queue sessions that predate explicit session assignments.
      query = query.eq("package_id", args.packageId);
    }

    const result = await query
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (result.error) throw new Error(result.error.message);
    const batch = result.data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

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
  const { rows: participants } = await loadAllParticipants(supabase, args);
  const participantIds = participants.map((row) => Number(row.id || 0)).filter(Boolean);
  const informedRows = await loadInformedRows(supabase, args.queueSessionId, participantIds);
  const informedMap = new Map<number, any>(
    informedRows.map((row) => [Number(row.participant_id || 0), row]),
  );

  return participants.map((row) => {
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
  const participantSourceId = Number((participantRes.data as any)?.source_id || 0);
  const participantPackageId = Number((participantRes.data as any)?.package_id || 0);
  const inSessionScope = scope.sourceIds.length
    ? scope.sourceIds.includes(participantSourceId) || scope.participantIds.includes(args.participantId)
    : scope.participantIds.length
      ? scope.participantIds.includes(args.participantId)
      : participantPackageId === args.packageId;

  if (!inSessionScope) {
    throw new Error("Peserta tidak termasuk roster Session MCU yang dipilih.");
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
