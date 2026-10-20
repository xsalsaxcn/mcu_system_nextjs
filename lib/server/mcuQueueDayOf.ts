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

function isArrived(row: any) {
  return row?.registrasi_ulang_done === true || Number(row?.registrasi_ulang_done || 0) === 1;
}

async function loadAllParticipants(
  supabase: any,
  companyId: number,
  packageId: number,
) {
  const rows: any[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const result = await supabase
      .from("participants")
      .select("id,name,mcu_id,external_id,nik,employee_nik,department,registrasi_ulang_done,registrasi_ulang_at")
      .eq("program_type", "corporate")
      .eq("company_id", companyId)
      .eq("package_id", packageId)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (result.error) throw new Error(result.error.message);
    const batch = result.data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
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
  const participants = await loadAllParticipants(supabase, args.companyId, args.packageId);
  const pending = participants.filter((row) => !isArrived(row));
  const participantIds = pending.map((row) => Number(row.id || 0)).filter(Boolean);
  const informedRows = await loadInformedRows(supabase, args.queueSessionId, participantIds);
  const informedMap = new Map<number, any>(
    informedRows.map((row) => [Number(row.participant_id || 0), row]),
  );

  return pending.map((row) => {
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
    .select("id,registrasi_ulang_done")
    .eq("id", args.participantId)
    .eq("program_type", "corporate")
    .eq("company_id", args.companyId)
    .eq("package_id", args.packageId)
    .maybeSingle();

  if (participantRes.error) throw new Error(participantRes.error.message);
  if (!participantRes.data) throw new Error("Peserta tidak ditemukan pada perusahaan/paket ini.");
  if (isArrived(participantRes.data)) {
    throw new Error("Peserta sudah hadir/Registrasi Ulang sehingga tidak lagi berada di list informasi.");
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
