// WELLNESS_COACH_SNAPSHOT_PERFORMANCE_V1
// Performance-only cache for Coach Portal canonical participant payloads.
// IMPORTANT: this file does NOT define any streak/point/fitness rule.
// Snapshot values are produced exclusively by loadParticipantCanonicalStreak().

import { loadParticipantCanonicalStreak } from "@/lib/wellness/participantStreakServer";

export const COACH_SNAPSHOT_TABLE = "wellness_coach_participant_snapshots";
export const COACH_SNAPSHOT_ENGINE_KEY =
  "participantCanonicalStreak:v126m119_51_lkg_restore_20260926";

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function jakartaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((x) => x.type === "year")?.value || "";
  const m = parts.find((x) => x.type === "month")?.value || "";
  const d = parts.find((x) => x.type === "day")?.value || "";
  return y && m && d ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10);
}

function isMissingSnapshotTable(error: any) {
  const code = clean(error?.code).toUpperCase();
  const message = clean(error?.message).toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes(COACH_SNAPSHOT_TABLE.toLowerCase()) &&
      (message.includes("does not exist") || message.includes("not found"))
  );
}

function validCanonicalPayload(payload: any, participantId: number) {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      numberValue(payload?.participant_id) === participantId &&
      payload?.streak &&
      typeof payload.streak === "object",
  );
}

export type CoachSnapshotEntry = {
  participant_id: number;
  canonical_payload: any;
  generated_at: string;
  snapshot_date: string;
};

export async function loadCoachSnapshotMap(params: {
  supabase: any;
  participantIds: number[];
  requireToday?: boolean;
}) {
  const ids = [...new Set((params.participantIds || []).map(numberValue).filter(Boolean))];
  const map = new Map<number, CoachSnapshotEntry>();

  if (ids.length === 0) {
    return { map, available: true, error: null as any };
  }

  let query = params.supabase
    .from(COACH_SNAPSHOT_TABLE)
    .select("participant_id,canonical_payload,generated_at,snapshot_date,engine_key")
    .in("participant_id", ids);

  if (params.requireToday !== false) {
    query = query.eq("snapshot_date", jakartaDate());
  }

  const result = await query;
  if (result?.error) {
    // First deployment is deliberately backward-compatible: if SQL has not
    // been applied yet, Coach Dashboard simply follows the old live path.
    return {
      map,
      available: !isMissingSnapshotTable(result.error),
      error: result.error,
    };
  }

  for (const row of result?.data || []) {
    const participantId = numberValue(row?.participant_id);
    if (
      !participantId ||
      clean(row?.engine_key) !== COACH_SNAPSHOT_ENGINE_KEY ||
      !validCanonicalPayload(row?.canonical_payload, participantId)
    ) {
      continue;
    }
    map.set(participantId, {
      participant_id: participantId,
      canonical_payload: row.canonical_payload,
      generated_at: clean(row?.generated_at),
      snapshot_date: clean(row?.snapshot_date),
    });
  }

  return { map, available: true, error: null as any };
}

export async function upsertCoachSnapshots(params: {
  supabase: any;
  entries: Array<{
    participantId: number;
    canonicalPayload: any;
  }>;
}) {
  const now = new Date().toISOString();
  const snapshotDate = jakartaDate();
  const rows = (params.entries || [])
    .map((entry) => {
      const participantId = numberValue(entry?.participantId);
      if (!participantId || !validCanonicalPayload(entry?.canonicalPayload, participantId)) {
        return null;
      }
      return {
        participant_id: participantId,
        canonical_payload: entry.canonicalPayload,
        generated_at: now,
        snapshot_date: snapshotDate,
        engine_key: COACH_SNAPSHOT_ENGINE_KEY,
        updated_at: now,
      };
    })
    .filter(Boolean);

  if (rows.length === 0) return { ok: true, written: 0, error: null as any };

  const result = await params.supabase
    .from(COACH_SNAPSHOT_TABLE)
    .upsert(rows, { onConflict: "participant_id" });

  if (result?.error) {
    return {
      ok: false,
      written: 0,
      error: result.error,
      table_missing: isMissingSnapshotTable(result.error),
    };
  }

  return { ok: true, written: rows.length, error: null as any };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length || 1)) },
    async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        output[index] = await worker(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return output;
}

export async function syncCoachSnapshots(params: {
  supabase: any;
  participants: any[];
  force?: boolean;
  maxAgeMinutes?: number;
  concurrency?: number;
}) {
  const participants = (params.participants || []).filter(
    (row) => numberValue(row?.id) > 0,
  );
  if (participants.length === 0) {
    return {
      ok: true,
      attempted: 0,
      updated: 0,
      skipped_fresh: 0,
      failed: 0,
      failures: [] as any[],
    };
  }

  const ids = participants.map((row) => numberValue(row?.id));
  const existing = await loadCoachSnapshotMap({
    supabase: params.supabase,
    participantIds: ids,
    requireToday: true,
  });

  // Missing table = no-op. This keeps deployment safe until the dedicated
  // Wellness SQL migration has explicitly been applied.
  if (!existing.available && isMissingSnapshotTable(existing.error)) {
    return {
      ok: false,
      table_missing: true,
      attempted: 0,
      updated: 0,
      skipped_fresh: 0,
      failed: 0,
      failures: [],
    };
  }

  const maxAgeMs = Math.max(1, numberValue(params.maxAgeMinutes) || 5) * 60_000;
  const now = Date.now();
  const queue = participants.filter((row) => {
    if (params.force === true) return true;
    const participantId = numberValue(row?.id);
    const snapshot = existing.map.get(participantId);
    if (!snapshot) return true;
    const generatedAt = Date.parse(snapshot.generated_at);
    return !Number.isFinite(generatedAt) || now - generatedAt >= maxAgeMs;
  });

  const failures: any[] = [];
  const calculated = await mapWithConcurrency(
    queue,
    Math.max(1, numberValue(params.concurrency) || 4),
    async (participant) => {
      const participantId = numberValue(participant?.id);
      try {
        // This is the single canonical engine. No local streak rule exists here.
        const canonicalPayload = await loadParticipantCanonicalStreak({
          supabase: params.supabase,
          participant,
        });
        return { participantId, canonicalPayload };
      } catch (error: any) {
        failures.push({
          participant_id: participantId,
          message: clean(error?.message || "canonical snapshot calculation failed"),
        });
        return null;
      }
    },
  );

  const entries = calculated.filter(Boolean) as Array<{
    participantId: number;
    canonicalPayload: any;
  }>;
  const writeResult = await upsertCoachSnapshots({
    supabase: params.supabase,
    entries,
  });

  if (!writeResult.ok && writeResult.error) {
    failures.push({
      participant_id: null,
      message: clean(writeResult.error?.message || "snapshot upsert failed"),
    });
  }

  return {
    ok: writeResult.ok,
    table_missing: (writeResult as any).table_missing === true,
    attempted: queue.length,
    updated: writeResult.written,
    skipped_fresh: participants.length - queue.length,
    failed: failures.length,
    failures,
  };
}
