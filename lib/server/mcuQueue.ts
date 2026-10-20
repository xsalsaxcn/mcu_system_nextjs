import crypto from "crypto";

export type McuQueueTrack = "A" | "B";

export type McuQueueSessionRow = {
  id: number;
  company_id: number;
  package_id: number;
  track_a_name: string;
  track_b_name: string;
  public_token: string;
  is_active: number;
  created_at?: string;
  updated_at?: string;
};

export function cleanQueueName(value: any, fallback: string) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return (text || fallback).slice(0, 80);
}

export function formatMcuQueueNumber(track: McuQueueTrack, sequence: number) {
  return `${track}-${String(Math.max(1, Math.trunc(sequence || 1))).padStart(3, "0")}`;
}

function randomPublicToken() {
  return crypto.randomBytes(18).toString("hex");
}

function isMissingQueueTableError(error: any) {
  const text = String(error?.message || error?.details || "").toLowerCase();
  return (
    text.includes("mcu_queue_sessions") ||
    text.includes("mcu_queue_entries") ||
    text.includes("relation") && text.includes("does not exist") ||
    text.includes("schema cache")
  );
}

export function queueSchemaErrorMessage(error: any) {
  if (isMissingQueueTableError(error)) {
    return "Tabel Antrian MCU belum tersedia. Jalankan sql/mcu_corporate_dual_queue_v434.sql di Supabase SQL Editor terlebih dahulu.";
  }
  return String(error?.message || "Gagal mengakses data Antrian MCU.");
}

export async function ensureMcuQueueSession(
  supabase: any,
  args: {
    companyId: number;
    packageId: number;
    trackAName?: string;
    trackBName?: string;
  },
): Promise<McuQueueSessionRow> {
  const companyId = Number(args.companyId || 0);
  const packageId = Number(args.packageId || 0);
  if (!companyId || !packageId) throw new Error("Company/package Session MCU tidak valid.");

  const existing = await supabase
    .from("mcu_queue_sessions")
    .select("*")
    .eq("company_id", companyId)
    .eq("package_id", packageId)
    .maybeSingle();

  if (existing.error) throw new Error(queueSchemaErrorMessage(existing.error));

  if (existing.data) {
    const desiredA = cleanQueueName(args.trackAName, existing.data.track_a_name || "Lab Darah");
    const desiredB = cleanQueueName(args.trackBName, existing.data.track_b_name || "Rontgen");
    const needsUpdate =
      desiredA !== String(existing.data.track_a_name || "") ||
      desiredB !== String(existing.data.track_b_name || "") ||
      Number(existing.data.is_active || 0) !== 1;

    if (!needsUpdate) return existing.data as McuQueueSessionRow;

    const updated = await supabase
      .from("mcu_queue_sessions")
      .update({
        track_a_name: desiredA,
        track_b_name: desiredB,
        is_active: 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.data.id)
      .select("*")
      .single();

    if (updated.error) throw new Error(queueSchemaErrorMessage(updated.error));
    return updated.data as McuQueueSessionRow;
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const inserted = await supabase
      .from("mcu_queue_sessions")
      .insert({
        company_id: companyId,
        package_id: packageId,
        track_a_name: cleanQueueName(args.trackAName, "Lab Darah"),
        track_b_name: cleanQueueName(args.trackBName, "Rontgen"),
        public_token: randomPublicToken(),
        is_active: 1,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (!inserted.error) return inserted.data as McuQueueSessionRow;

    // Another request may have created the same company/package row first.
    const retryRead = await supabase
      .from("mcu_queue_sessions")
      .select("*")
      .eq("company_id", companyId)
      .eq("package_id", packageId)
      .maybeSingle();
    if (!retryRead.error && retryRead.data) return retryRead.data as McuQueueSessionRow;

    if (attempt === 3) throw new Error(queueSchemaErrorMessage(inserted.error));
  }

  throw new Error("Gagal membuat Session Antrian MCU.");
}

async function nextSequence(supabase: any, queueSessionId: number, track: McuQueueTrack) {
  const field = track === "A" ? "a_queue_sequence" : "b_queue_sequence";
  const result = await supabase
    .from("mcu_queue_entries")
    .select(field)
    .eq("queue_session_id", queueSessionId)
    .not(field, "is", null)
    .order(field, { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (result.error) throw new Error(queueSchemaErrorMessage(result.error));
  return Math.max(0, Number(result.data?.[field] || 0)) + 1;
}

export async function ensureMcuQueueEntry(
  supabase: any,
  args: {
    queueSessionId: number;
    participantId: number;
  },
) {
  const queueSessionId = Number(args.queueSessionId || 0);
  const participantId = Number(args.participantId || 0);
  if (!queueSessionId || !participantId) return null;

  const existing = await supabase
    .from("mcu_queue_entries")
    .select("*")
    .eq("queue_session_id", queueSessionId)
    .eq("participant_id", participantId)
    .maybeSingle();

  if (existing.error) throw new Error(queueSchemaErrorMessage(existing.error));
  if (existing.data) return existing.data;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const [aSequence, bSequence] = await Promise.all([
      nextSequence(supabase, queueSessionId, "A"),
      nextSequence(supabase, queueSessionId, "B"),
    ]);

    const inserted = await supabase
      .from("mcu_queue_entries")
      .insert({
        queue_session_id: queueSessionId,
        participant_id: participantId,
        a_queue_number: formatMcuQueueNumber("A", aSequence),
        a_queue_sequence: aSequence,
        a_status: "WAITING",
        b_queue_number: formatMcuQueueNumber("B", bSequence),
        b_queue_sequence: bSequence,
        b_status: "WAITING",
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (!inserted.error) return inserted.data;

    const retryRead = await supabase
      .from("mcu_queue_entries")
      .select("*")
      .eq("queue_session_id", queueSessionId)
      .eq("participant_id", participantId)
      .maybeSingle();
    if (!retryRead.error && retryRead.data) return retryRead.data;

    if (attempt === 5) throw new Error(queueSchemaErrorMessage(inserted.error));
  }

  return null;
}

export async function loadMcuQueueEntriesWithParticipants(supabase: any, queueSessionId: number) {
  const entriesRes = await supabase
    .from("mcu_queue_entries")
    .select("*")
    .eq("queue_session_id", queueSessionId)
    .order("id", { ascending: true });
  if (entriesRes.error) throw new Error(queueSchemaErrorMessage(entriesRes.error));

  const entries = entriesRes.data || [];
  const participantIds = Array.from(
    new Set<number>(entries.map((row: any) => Number(row.participant_id || 0)).filter(Boolean)),
  );

  let participants: any[] = [];
  if (participantIds.length) {
    const participantRes = await supabase
      .from("participants")
      .select("id,name,mcu_id,external_id,nik,employee_nik,department,company_id,package_id,program_type,registrasi_ulang_done,registrasi_ulang_at")
      .in("id", participantIds);
    if (participantRes.error) throw new Error(participantRes.error.message);
    participants = participantRes.data || [];
  }

  const participantMap = new Map<number, any>(
    participants.map((row: any) => [Number(row.id), row]),
  );

  return entries.map((entry: any) => ({
    ...entry,
    participant: participantMap.get(Number(entry.participant_id)) || null,
  }));
}
