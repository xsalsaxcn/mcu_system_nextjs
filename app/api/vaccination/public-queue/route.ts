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

function normalizeStatus(value: any) {
  const s = clean(value).toUpperCase().replace(/\s+/g, "_");
  if (!s) return "REGISTERED";
  if (["BELUM_DATANG", "BELUM DATANG", "NOT_ARRIVED"].includes(s)) return "REGISTERED";
  if (["MENUNGGU", "WAITING"].includes(s)) return "WAITING";
  if (["WAITING_WITH_NOTE", "WAITING_NOTE"].includes(s)) return "WAITING_WITH_NOTE";
  if (["DOKTER", "CALLED", "DIPANGGIL"].includes(s)) return "CALLED";
  if (["DALAM_TINDAKAN", "IN_PROGRESS"].includes(s)) return "IN_PROGRESS";
  if (["SELESAI", "DONE", "ADMINISTERED", "FINISHED"].includes(s)) return "ADMINISTERED";
  return s;
}

function hasQueueNumber(row: any) {
  return clean(row?.queue_number) !== "";
}

function queueSortValue(row: any) {
  const raw = clean(row?.queue_number);
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  const match = raw.match(/\d+/);
  return match ? Number(match[0]) : 999999999;
}

function sortByQueue(a: any, b: any) {
  const qa = queueSortValue(a);
  const qb = queueSortValue(b);
  if (qa !== qb) return qa - qb;
  return Number(a?.id || 0) - Number(b?.id || 0);
}

function isDone(row: any) {
  const status = normalizeStatus(row?.queue_status || row?.status);
  return row?.is_done === true || ["ADMINISTERED", "DONE", "FINISHED", "SELESAI"].includes(status);
}

function isWaiting(row: any) {
  const status = normalizeStatus(row?.queue_status || row?.status);
  return hasQueueNumber(row) && !isDone(row) && ["WAITING", "WAITING_WITH_NOTE", "REGISTERED"].includes(status);
}

function isCalled(row: any) {
  const status = normalizeStatus(row?.queue_status || row?.status);
  return hasQueueNumber(row) && !isDone(row) && ["CALLED", "IN_PROGRESS"].includes(status);
}

async function fetchRegistrations(supabase: any, sessionIds: any[]) {
  const ids = Array.from(new Set(sessionIds.filter((id) => id !== undefined && id !== null && clean(id) !== "")));
  if (!ids.length) return { rows: [], error: null };

  let query = supabase.from("vaccination_registrations").select("*");

  if (ids.length === 1) query = query.eq("session_id", ids[0]);
  else query = query.in("session_id", ids);

  const result = await query.order("queue_number", { ascending: true }).order("id", { ascending: true });
  if (result.error) return { rows: [], error: result.error };

  const rows = (result.data || []).map((row: any) => ({
    ...row,
    queue_status: normalizeStatus(row.queue_status || row.status),
  }));

  return { rows: rows.sort(sortByQueue), error: null };
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

    if (sessionResult.error) {
      return fail(sessionResult.error.message || "Session public queue gagal dibaca.", 500);
    }

    const session = sessionResult.data;
    if (!session) return fail("Session public queue tidak ditemukan.", 404);

    let usedFallback = false;
    let sourceSessionIds = [session.id];

    let registrationsResult = await fetchRegistrations(supabase, sourceSessionIds);
    if (registrationsResult.error) {
      return fail(registrationsResult.error.message || "Registrasi vaksinasi gagal dibaca.", 500);
    }

    let registrations = registrationsResult.rows;

    if (!registrations.length) {
      const siblingIds = await findSiblingSessionIds(supabase, session);
      if (siblingIds.length > 1) {
        const fallbackResult = await fetchRegistrations(supabase, siblingIds);
        if (fallbackResult.error) {
          return fail(fallbackResult.error.message || "Registrasi fallback gagal dibaca.", 500);
        }

        if (fallbackResult.rows.length) {
          registrations = fallbackResult.rows;
          sourceSessionIds = siblingIds;
          usedFallback = true;
        }
      }
    }

    const waitingRows = registrations.filter(isWaiting).sort(sortByQueue);
    const calledRows = registrations.filter(isCalled).sort(sortByQueue);
    const doneRows = registrations.filter(isDone);
    const queueRows = registrations.filter(hasQueueNumber);

    const current = calledRows[0] || null;
    const next = waitingRows[0] || null;

    return response({
      ok: true,
      session,
      registrations,
      current,
      next,
      summary: {
        total: queueRows.length || registrations.length,
        waiting: waitingRows.length,
        called: calledRows.length,
        done: doneRows.length,
      },
      debug: {
        public_queue_token: token,
        source_session_ids: sourceSessionIds,
        used_fallback: usedFallback,
        registrations_count: registrations.length,
        queue_rows_count: queueRows.length,
      },
    });
  } catch (error: any) {
    return fail(error?.message || "Public queue gagal dimuat.", 500);
  }
}


