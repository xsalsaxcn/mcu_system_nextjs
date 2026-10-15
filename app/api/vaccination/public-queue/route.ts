import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../_utils";

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

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalizeEmployeeId(value: any) {
  return clean(value).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function normalizeStatus(value: any) {
  const s = clean(value).toUpperCase().replace(/\s+/g, "_");
  if (!s) return "REGISTERED";
  if (["BELUM_DATANG", "BELUM DATANG", "NOT_ARRIVED"].includes(s)) return "REGISTERED";
  if (["MENUNGGU", "WAITING"].includes(s)) return "WAITING";
  if (["WAITING_WITH_NOTE", "WAITING_NOTE"].includes(s)) return "WAITING_WITH_NOTE";
  if (["DOKTER", "CALLED", "DIPANGGIL"].includes(s)) return "CALLED";
  if (["DALAM_TINDAKAN", "IN_PROGRESS"].includes(s)) return "IN_PROGRESS";
  if (["SELESAI", "DONE", "ADMINISTERED", "FINISHED"].includes(s)) return "DONE";
  return s;
}

function isHealthdayBazarSession(session: any) {
  return String(session?.existing_queue_profile || "LEGACY").toUpperCase() === "HEALTHDAY_BAZAR";
}

function serviceHasTrack(row: any, track: "A" | "B") {
  const status = String(row?.patient_service_status || "HEALTHDAY").toUpperCase();
  return track === "A"
    ? status === "HEALTHDAY" || status === "COMBINATION"
    : status === "BAZAR" || status === "COMBINATION";
}

function trackNumber(row: any, track: "A" | "B") {
  return clean(track === "A" ? row?.queue_number : row?.bazar_queue_number);
}

function trackStatus(row: any, track: "A" | "B") {
  return normalizeStatus(track === "A" ? row?.queue_status || row?.status : row?.bazar_queue_status);
}

function queueSortValue(value: any) {
  const raw = clean(value);
  const match = raw.match(/\d+/);
  return match ? Number(match[0]) : 999999999;
}

function sortByTrack(track: "A" | "B") {
  return (a: any, b: any) => {
    const qa = queueSortValue(trackNumber(a, track));
    const qb = queueSortValue(trackNumber(b, track));
    if (qa !== qb) return qa - qb;
    return Number(a?.id || 0) - Number(b?.id || 0);
  };
}

function buildTrackSummary(registrations: any[], track: "A" | "B") {
  const rows = registrations.filter((row) => serviceHasTrack(row, track));
  const withNumber = rows.filter((row) => trackNumber(row, track));
  const waiting = withNumber.filter((row) => ["WAITING", "WAITING_WITH_NOTE", "REGISTERED"].includes(trackStatus(row, track))).sort(sortByTrack(track));
  const called = withNumber.filter((row) => ["CALLED", "IN_PROGRESS"].includes(trackStatus(row, track))).sort(sortByTrack(track));
  const done = withNumber.filter((row) => ["DONE", "ADMINISTERED", "FINISHED"].includes(trackStatus(row, track)));
  return {
    rows,
    current: called[0] || null,
    next: waiting[0] || null,
    summary: {
      total: withNumber.length || rows.length,
      waiting: waiting.length,
      called: called.length,
      done: done.length,
    },
  };
}

function buildWatchTrack(registrations: any[], registration: any, track: "A" | "B") {
  if (!serviceHasTrack(registration, track)) return null;
  const queueNumber = trackNumber(registration, track);
  if (!queueNumber) return null;

  const status = trackStatus(registration, track);
  const rows = registrations
    .filter((row) => serviceHasTrack(row, track) && trackNumber(row, track))
    .filter((row) =>
      ["CALLED", "IN_PROGRESS", "WAITING", "WAITING_WITH_NOTE", "REGISTERED"].includes(
        trackStatus(row, track),
      ),
    );

  const called = rows
    .filter((row) => ["CALLED", "IN_PROGRESS"].includes(trackStatus(row, track)))
    .sort(sortByTrack(track));
  const waiting = rows
    .filter((row) => ["WAITING", "WAITING_WITH_NOTE", "REGISTERED"].includes(trackStatus(row, track)))
    .sort(sortByTrack(track));
  const ordered = [...called, ...waiting];
  const index = ordered.findIndex((row) => String(row?.id) === String(registration?.id));
  const aheadCount = index >= 0 ? index : 0;

  return {
    track,
    queueNumber,
    status,
    aheadCount,
    oneAhead: aheadCount === 1,
    currentQueueNumber: called[0] ? trackNumber(called[0], track) : null,
    nextQueueNumber: waiting[0] ? trackNumber(waiting[0], track) : null,
  };
}

function publicSession(session: any) {
  return {
    id: session?.id,
    session_name: session?.session_name || "",
    company_name: session?.company_name || "",
    location: session?.location || session?.location_name || "",
    existing_queue_profile: session?.existing_queue_profile || "LEGACY",
  };
}

async function fetchRegistrations(supabase: any, sessionIds: any[]) {
  const ids = Array.from(new Set(sessionIds.filter((id) => id !== undefined && id !== null && clean(id) !== "")));
  if (!ids.length) return { rows: [], error: null };

  let query = supabase.from("vaccination_registrations").select("*");
  if (ids.length === 1) query = query.eq("session_id", ids[0]);
  else query = query.in("session_id", ids);

  const result = await query.order("id", { ascending: true });
  if (result.error) return { rows: [], error: result.error };
  return { rows: result.data || [], error: null };
}

async function findSiblingSessionIds(supabase: any, session: any) {
  const ids = [session.id];
  const name = clean(session.session_name);
  const company = clean(session.company_name);
  if (!name) return ids;

  try {
    let query = supabase
      .from("vaccination_sessions")
      .select("id, session_name, company_name")
      .eq("session_name", name);
    if (company) query = query.eq("company_name", company);

    const result = await query.limit(50);
    if (result.error) return ids;
    for (const item of result.data || []) {
      if (item?.id !== undefined && item?.id !== null) ids.push(item.id);
    }
  } catch (_error) {
    return ids;
  }

  return Array.from(new Set(ids));
}

export async function GET(req: NextRequest) {
  try {
    const token = clean(req.nextUrl.searchParams.get("token"));
    if (!token) return fail("Token public queue wajib diisi.", 400);

    const supabase = supabaseAdmin();
    const sessionResult = await supabase
      .from("vaccination_sessions")
      .select("*")
      .eq("public_queue_token", token)
      .maybeSingle();

    if (sessionResult.error) return fail(sessionResult.error.message || "Session public queue gagal dibaca.", 500);
    const session = sessionResult.data;
    if (!session) return fail("Session public queue tidak ditemukan.", 404);

    let usedFallback = false;
    let sourceSessionIds = [session.id];
    let registrationsResult = await fetchRegistrations(supabase, sourceSessionIds);
    if (registrationsResult.error) return fail(registrationsResult.error.message || "Registrasi vaksinasi gagal dibaca.", 500);
    let registrations = registrationsResult.rows;

    if (!registrations.length) {
      const siblingIds = await findSiblingSessionIds(supabase, session);
      if (siblingIds.length > 1) {
        const fallbackResult = await fetchRegistrations(supabase, siblingIds);
        if (fallbackResult.error) return fail(fallbackResult.error.message || "Registrasi fallback gagal dibaca.", 500);
        if (fallbackResult.rows.length) {
          registrations = fallbackResult.rows;
          sourceSessionIds = siblingIds;
          usedFallback = true;
        }
      }
    }

    const queueA = buildTrackSummary(registrations, "A");
    const dualQueue = isHealthdayBazarSession(session);
    const queueB = dualQueue ? buildTrackSummary(registrations, "B") : null;

    const requestedEmployeeId = normalizeEmployeeId(req.nextUrl.searchParams.get("employee_id"));
    if (requestedEmployeeId) {
      const registration = registrations.find((row: any) => {
        const employeeId = normalizeEmployeeId(row?.employee_id);
        const binusianId = normalizeEmployeeId(row?.binusian_id);
        return requestedEmployeeId === employeeId || requestedEmployeeId === binusianId;
      });

      if (!registration) {
        return fail("BINUSIAN ID tidak ditemukan pada session ini.", 404);
      }

      const trackA = buildWatchTrack(registrations, registration, "A");
      const trackB = dualQueue ? buildWatchTrack(registrations, registration, "B") : null;
      if (!trackA && !trackB) {
        return fail("Peserta ditemukan, tetapi nomor antrean belum tersedia.", 409, {
          participant_name: registration?.participant_name || "",
        });
      }

      return response({
        ok: true,
        watchMode: true,
        dualQueue,
        session: publicSession(session),
        participant: {
          id: registration?.id,
          participantName: registration?.participant_name || "",
          employeeId: registration?.employee_id || registration?.binusian_id || "",
          serviceStatus: registration?.patient_service_status || "HEALTHDAY",
        },
        tracks: {
          A: trackA,
          B: trackB,
        },
      });
    }

    if (!dualQueue) {
      return response({
        ok: true,
        session,
        registrations: queueA.rows.map((row: any) => ({ ...row, queue_status: normalizeStatus(row.queue_status || row.status) })),
        current: queueA.current,
        next: queueA.next,
        summary: queueA.summary,
        dualQueue: false,
        debug: {
          public_queue_token: token,
          source_session_ids: sourceSessionIds,
          used_fallback: usedFallback,
          registrations_count: registrations.length,
          queue_rows_count: queueA.summary.total,
        },
      });
    }

    return response({
      ok: true,
      session,
      registrations,
      dualQueue: true,
      queues: {
        A: { current: queueA.current, next: queueA.next, summary: queueA.summary },
        B: { current: queueB?.current || null, next: queueB?.next || null, summary: queueB?.summary || { total: 0, waiting: 0, called: 0, done: 0 } },
      },
      // Backward-compatible A fields for any old consumer.
      current: queueA.current,
      next: queueA.next,
      summary: queueA.summary,
      debug: {
        public_queue_token: token,
        source_session_ids: sourceSessionIds,
        used_fallback: usedFallback,
        registrations_count: registrations.length,
        queue_a_count: queueA.summary.total,
        queue_b_count: queueB?.summary?.total || 0,
      },
    });
  } catch (error: any) {
    return fail(error?.message || "Public queue gagal dimuat.", 500);
  }
}
