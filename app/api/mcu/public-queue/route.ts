import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import { loadMcuQueueEntriesWithParticipants, queueSchemaErrorMessage, type McuQueueTrack } from "@/lib/server/mcuQueue";

export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value ?? "").trim();
}

function statusOf(row: any, track: McuQueueTrack) {
  return String(track === "A" ? row?.a_status : row?.b_status || "WAITING").toUpperCase();
}

function numberOf(row: any, track: McuQueueTrack) {
  return clean(track === "A" ? row?.a_queue_number : row?.b_queue_number);
}

function sequenceOf(row: any, track: McuQueueTrack) {
  return Number(track === "A" ? row?.a_queue_sequence : row?.b_queue_sequence) || Number.MAX_SAFE_INTEGER;
}

function sortTrack(track: McuQueueTrack) {
  return (a: any, b: any) => sequenceOf(a, track) - sequenceOf(b, track) || Number(a?.id || 0) - Number(b?.id || 0);
}

function publicEntry(row: any, track: McuQueueTrack) {
  return {
    id: row?.id,
    participant_name: row?.participant?.name || "-",
    queue_number: numberOf(row, track),
    status: statusOf(row, track),
  };
}

function buildTrack(rows: any[], track: McuQueueTrack) {
  const withNumber = rows.filter((row) => numberOf(row, track));
  const active = withNumber
    .filter((row) => ["CALLED", "IN_PROGRESS"].includes(statusOf(row, track)))
    .sort(sortTrack(track));
  const waiting = withNumber
    .filter((row) => statusOf(row, track) === "WAITING")
    .sort(sortTrack(track));
  const done = withNumber.filter((row) => statusOf(row, track) === "DONE");
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
      skipped: skipped.length,
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

    return ok({
      session: {
        id: queueSession.id,
        company_id: queueSession.company_id,
        package_id: queueSession.package_id,
        company_name: companyRes.data?.name || "MCU Corporate",
        package_name: packageRes.data?.name || "Paket MCU",
        track_a_name: queueSession.track_a_name || "Lab Darah",
        track_b_name: queueSession.track_b_name || "Rontgen",
      },
      queues: {
        A: buildTrack(entries, "A"),
        B: buildTrack(entries, "B"),
      },
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat Public Queue MCU.", 500);
  }
}
