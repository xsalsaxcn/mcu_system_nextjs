import crypto from "crypto";

export type McuQueueTrack = "A" | "B";

export type McuQueueSessionRow = {
  id: number;
  company_id: number;
  package_id: number;
  session_name?: string | null;
  location?: string | null;
  session_date?: string | null;
  track_a_name: string;
  track_b_name: string;
  public_token: string;
  operator_token?: string | null;
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
  const text = String(error?.message || error?.details || "").toLowerCase();
  if (
    text.includes("session_name") ||
    text.includes("session_date") ||
    text.includes("location")
  ) {
    return "Schema Session MCU multi-lokasi belum tersedia. Jalankan SQL V453_STAGE1_MCU_MULTI_LOCATION_SESSION.sql terlebih dahulu.";
  }
  return String(error?.message || "Gagal mengakses data Antrian MCU.");
}

export async function ensureMcuQueueSession(
  supabase: any,
  args: {
    companyId: number;
    packageId: number;
    queueSessionId?: number;
    sessionName?: string;
    location?: string;
    sessionDate?: string;
    trackAName?: string;
    trackBName?: string;
    createSeparate?: boolean;
  },
): Promise<McuQueueSessionRow> {
  const companyId = Number(args.companyId || 0);
  const packageId = Number(args.packageId || 0);
  const queueSessionId = Number(args.queueSessionId || 0);
  if (!companyId || !packageId) {
    throw new Error("Company/package Session MCU tidak valid.");
  }

  const location = String(args.location || "").trim().replace(/\s+/g, " ").slice(0, 160);
  const sessionDate = String(args.sessionDate || "").trim().slice(0, 10);
  const sessionName = String(args.sessionName || "").trim().replace(/\s+/g, " ").slice(0, 180);

  if (queueSessionId) {
    const exact = await supabase
      .from("mcu_queue_sessions")
      .select("*")
      .eq("id", queueSessionId)
      .eq("company_id", companyId)
      .eq("package_id", packageId)
      .maybeSingle();

    if (exact.error) throw new Error(queueSchemaErrorMessage(exact.error));
    if (!exact.data) throw new Error("Session MCU lokasi/tanggal tidak ditemukan.");

    const payload: Record<string, any> = {
      is_active: 1,
      updated_at: new Date().toISOString(),
    };

    if (args.trackAName !== undefined) {
      payload.track_a_name = cleanQueueName(
        args.trackAName,
        exact.data.track_a_name || "Lab Darah",
      );
    }
    if (args.trackBName !== undefined) {
      payload.track_b_name = cleanQueueName(
        args.trackBName,
        exact.data.track_b_name || "Rontgen",
      );
    }
    if (args.sessionName !== undefined) payload.session_name = sessionName || null;
    if (args.location !== undefined) payload.location = location || null;
    if (args.sessionDate !== undefined) payload.session_date = sessionDate || null;

    const updated = await supabase
      .from("mcu_queue_sessions")
      .update(payload)
      .eq("id", queueSessionId)
      .select("*")
      .single();

    if (updated.error) throw new Error(queueSchemaErrorMessage(updated.error));
    return updated.data as McuQueueSessionRow;
  }

  if (args.createSeparate) {
    if (!location || !sessionDate) {
      throw new Error("Lokasi dan tanggal MCU wajib diisi.");
    }

    const existingExact = await supabase
      .from("mcu_queue_sessions")
      .select("*")
      .eq("company_id", companyId)
      .eq("package_id", packageId)
      .eq("session_date", sessionDate)
      .ilike("location", location)
      .limit(1)
      .maybeSingle();

    if (existingExact.error) {
      throw new Error(queueSchemaErrorMessage(existingExact.error));
    }

    if (existingExact.data) {
      const updated = await supabase
        .from("mcu_queue_sessions")
        .update({
          session_name: sessionName || existingExact.data.session_name || null,
          location,
          session_date: sessionDate,
          track_a_name: cleanQueueName(
            args.trackAName,
            existingExact.data.track_a_name || "Lab Darah",
          ),
          track_b_name: cleanQueueName(
            args.trackBName,
            existingExact.data.track_b_name || "Rontgen",
          ),
          is_active: 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingExact.data.id)
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
          session_name: sessionName || null,
          location,
          session_date: sessionDate,
          track_a_name: cleanQueueName(args.trackAName, "Lab Darah"),
          track_b_name: cleanQueueName(args.trackBName, "Rontgen"),
          public_token: randomPublicToken(),
          is_active: 1,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (!inserted.error) return inserted.data as McuQueueSessionRow;

      const retryRead = await supabase
        .from("mcu_queue_sessions")
        .select("*")
        .eq("company_id", companyId)
        .eq("package_id", packageId)
        .eq("session_date", sessionDate)
        .ilike("location", location)
        .limit(1)
        .maybeSingle();

      if (!retryRead.error && retryRead.data) {
        return retryRead.data as McuQueueSessionRow;
      }

      if (attempt === 3) {
        throw new Error(queueSchemaErrorMessage(inserted.error));
      }
    }
  }

  const existing = await supabase
    .from("mcu_queue_sessions")
    .select("*")
    .eq("company_id", companyId)
    .eq("package_id", packageId)
    .eq("is_active", 1)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.error) throw new Error(queueSchemaErrorMessage(existing.error));

  if (existing.data) {
    const desiredA = cleanQueueName(
      args.trackAName,
      existing.data.track_a_name || "Lab Darah",
    );
    const desiredB = cleanQueueName(
      args.trackBName,
      existing.data.track_b_name || "Rontgen",
    );

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

  if (inserted.error) throw new Error(queueSchemaErrorMessage(inserted.error));
  return inserted.data as McuQueueSessionRow;
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
