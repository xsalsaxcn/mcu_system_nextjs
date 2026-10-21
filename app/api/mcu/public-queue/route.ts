import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { loadMcuQueueEntriesWithParticipants, queueSchemaErrorMessage, type McuQueueTrack } from "@/lib/server/mcuQueue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function response(data: any, status = 200) {
  const res = NextResponse.json(data, { status });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function fail(message: string, status = 400, extra: any = {}) {
  return response({ ok: false, message, ...extra }, status);
}

function ok(data: any = {}) {
  return response({ ok: true, ...data });
}

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalizeIdentity(value: any) {
  return clean(value).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function statusOf(row: any, track: McuQueueTrack) {
  const value = track === "A" ? row?.a_status : row?.b_status;
  return String(value || "WAITING").toUpperCase();
}

function numberOf(row: any, track: McuQueueTrack) {
  return clean(track === "A" ? row?.a_queue_number : row?.b_queue_number);
}

function sequenceOf(row: any, track: McuQueueTrack) {
  const value = Number(track === "A" ? row?.a_queue_sequence : row?.b_queue_sequence);
  return Number.isFinite(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

function sortTrack(track: McuQueueTrack) {
  return (a: any, b: any) => sequenceOf(a, track) - sequenceOf(b, track) || Number(a?.id || 0) - Number(b?.id || 0);
}

function publicEntry(row: any, track: McuQueueTrack) {
  return {
    id: row?.id,
    participant_id: row?.participant_id,
    participant_name: row?.participant?.name || "-",
    queue_number: numberOf(row, track),
    status: statusOf(row, track),
  };
}

function buildTrack(rows: any[], track: McuQueueTrack) {
  const withNumber = rows.filter((row) => numberOf(row, track)).sort(sortTrack(track));
  const active = withNumber.filter((row) => ["CALLED", "IN_PROGRESS"].includes(statusOf(row, track)));
  const waiting = withNumber.filter((row) => statusOf(row, track) === "WAITING");
  const done = withNumber.filter((row) => statusOf(row, track) === "DONE");
  const cancelled = withNumber.filter((row) => statusOf(row, track) === "CANCELLED");
  const skipped = withNumber.filter((row) => statusOf(row, track) === "SKIPPED");
  const currentRow = active[0] || null;
  const prepareSequence = currentRow ? sequenceOf(currentRow, track) + 3 : 0;
  const prepareRow = prepareSequence
    ? withNumber.find((row) => sequenceOf(row, track) === prepareSequence && statusOf(row, track) === "WAITING") || null
    : null;

  return {
    current: currentRow ? publicEntry(currentRow, track) : null,
    next: waiting[0] ? publicEntry(waiting[0], track) : null,
    prepare: prepareRow ? publicEntry(prepareRow, track) : null,
    summary: {
      waiting: waiting.length,
      active: active.length,
      done: done.length,
      cancelled: cancelled.length,
      skipped: skipped.length,
      total: withNumber.length,
    },
  };
}

function participantIdentityCandidates(participant: any) {
  return [
    participant?.employee_nik,
    participant?.employee_id,
    participant?.external_id,
    participant?.nik_karyawan,
    participant?.nik,
  ].map(normalizeIdentity).filter(Boolean);
}

function findEntryByNikKaryawan(entries: any[], requested: string) {
  return entries.find((entry) => participantIdentityCandidates(entry?.participant).includes(requested)) || null;
}

function buildParticipantTrack(rows: any[], entry: any, track: McuQueueTrack) {
  const queueNumber = numberOf(entry, track);
  if (!queueNumber) return null;

  const status = statusOf(entry, track);
  const withNumber = rows.filter((row) => numberOf(row, track)).sort(sortTrack(track));
  const active = withNumber.filter((row) => ["CALLED", "IN_PROGRESS"].includes(statusOf(row, track)));
  const waiting = withNumber.filter((row) => statusOf(row, track) === "WAITING");
  const done = withNumber.filter((row) => statusOf(row, track) === "DONE");
  const orderedActive = [...active, ...waiting];
  const ownIndex = orderedActive.findIndex((row) => Number(row?.id || 0) === Number(entry?.id || 0));
  const aheadCount = status === "WAITING" ? Math.max(0, ownIndex) : 0;

  return {
    queue_number: queueNumber,
    status,
    ahead_count: aheadCount,
    three_ahead: status === "WAITING" && aheadCount === 3,
    called: ["CALLED", "IN_PROGRESS"].includes(status),
    done: status === "DONE",
    current_queue_number: active[0] ? numberOf(active[0], track) : null,
    current_participant_name: active[0]?.participant?.name || null,
    next_queue_number: waiting[0] ? numberOf(waiting[0], track) : null,
    summary: {
      waiting: waiting.length,
      active: active.length,
      done: done.length,
      total: withNumber.length,
    },
  };
}

export async function GET(req: NextRequest) {
  const token = clean(req.nextUrl.searchParams.get("token"));
  if (!token) return fail("Token public queue wajib diisi.", 400);

  try {
    const supabase = getSupabaseAdmin();
    const sessionRes = await supabase
      .from("mcu_queue_sessions")
      .select("*")
      .eq("public_token", token)
      .eq("is_active", 1)
      .maybeSingle();

    if (sessionRes.error) throw new Error(queueSchemaErrorMessage(sessionRes.error));
    if (!sessionRes.data) return fail("Public Queue MCU tidak ditemukan / tidak aktif.", 404);

    const queueSession = sessionRes.data;
    const [entries, companyRes, packageRes] = await Promise.all([
      loadMcuQueueEntriesWithParticipants(supabase, Number(queueSession.id)),
      supabase.from("companies").select("id,name").eq("id", queueSession.company_id).maybeSingle(),
      supabase.from("packages").select("id,name").eq("id", queueSession.package_id).maybeSingle(),
    ]);

    if (companyRes.error) throw new Error(companyRes.error.message);
    if (packageRes.error) throw new Error(packageRes.error.message);

    const session = {
      id: queueSession.id,
      company_id: queueSession.company_id,
      package_id: queueSession.package_id,
      company_name: companyRes.data?.name || "MCU Corporate",
      package_name: packageRes.data?.name || "Paket MCU",
      track_a_name: queueSession.track_a_name || "Lab Darah",
      track_b_name: queueSession.track_b_name || "Rontgen",
    };

    const requestedNik = normalizeIdentity(req.nextUrl.searchParams.get("nik_karyawan"));
    if (requestedNik) {
      const entry = findEntryByNikKaryawan(entries, requestedNik);
      if (!entry) {
        return fail("NIK Karyawan tidak ditemukan pada antrian perusahaan/paket ini.", 404);
      }

      const participant = entry?.participant || {};
      const resolvedNik = clean(participant?.employee_nik) || clean(participant?.external_id) || clean(participant?.nik) || requestedNik;
      return ok({
        watch_mode: true,
        session,
        participant: {
          id: Number(entry?.participant_id || participant?.id || 0),
          name: participant?.name || "Peserta",
          nik_karyawan: resolvedNik,
          mcu_id: participant?.mcu_id || "",
        },
        tracks: {
          A: buildParticipantTrack(entries, entry, "A"),
          B: buildParticipantTrack(entries, entry, "B"),
        },
        synced_at: new Date().toISOString(),
      });
    }

    return ok({
      session,
      queues: {
        A: buildTrack(entries, "A"),
        B: buildTrack(entries, "B"),
      },
      synced_at: new Date().toISOString(),
      source_count: entries.length,
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat Public Queue MCU.", 500);
  }
}
