import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { clean, supabaseAdmin } from "../../_utils";
import { getOnsitePushConfig } from "@/lib/vaccination/onsiteWebPush";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function response(payload: any, status = 200) {
  const res = NextResponse.json(payload, { status });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function fail(message: string, status = 400, extra: any = {}) {
  return response({ ok: false, message, ...extra }, status);
}

function validPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function parsePushSubscription(value: any) {
  const endpoint = clean(value?.endpoint);
  const p256dh = clean(value?.keys?.p256dh);
  const auth = clean(value?.keys?.auth);

  if (!validPushEndpoint(endpoint) || !p256dh || !auth) return null;
  if (endpoint.length > 2048 || p256dh.length > 512 || auth.length > 512) return null;

  return { endpoint, p256dh, auth };
}

function safeEqual(a: string, b: string) {
  try {
    const aa = Buffer.from(a);
    const bb = Buffer.from(b);
    return aa.length === bb.length && timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

function clampInterval(value: any) {
  const n = Math.trunc(Number(value || 60));
  return Number.isFinite(n) ? Math.min(60, Math.max(60, n)) : 60;
}

function rollingSignature(event: any, slot: number) {
  return createHmac("sha256", clean(event.qr_secret))
    .update(`${clean(event.public_token)}.${slot}`)
    .digest("hex")
    .slice(0, 32);
}

function validateRolling(event: any, slot: number, sig: string) {
  if (!Number.isFinite(slot) || slot < 1 || !sig) return false;
  const interval = clampInterval(event.qr_interval_seconds);
  const nowSec = Math.floor(Date.now() / 1000);
  const currentSlot = Math.floor(nowSec / interval);
  const inBoundaryGrace = slot === currentSlot - 1 && nowSec % interval <= 10;
  if (slot !== currentSlot && !inBoundaryGrace) return false;
  return safeEqual(rollingSignature(event, slot), sig);
}

function makeJoinToken(event: any) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", clean(event.qr_secret))
    .update(`join.${clean(event.public_token)}.${issuedAt}`)
    .digest("hex")
    .slice(0, 40);
  return `${issuedAt}.${sig}`;
}

function validateJoinToken(event: any, token: string) {
  const [issuedRaw, sig] = clean(token).split(".");
  const issuedAt = Number(issuedRaw);
  if (!Number.isFinite(issuedAt) || !sig) return false;
  const now = Math.floor(Date.now() / 1000);
  if (issuedAt > now + 30 || now - issuedAt > 600) return false;
  const expected = createHmac("sha256", clean(event.qr_secret))
    .update(`join.${clean(event.public_token)}.${issuedAt}`)
    .digest("hex")
    .slice(0, 40);
  return safeEqual(expected, sig);
}

function employeeKey(value: any) {
  return clean(value).toUpperCase().replace(/\s+/g, "");
}

function normalizePhone(value: any) {
  let digits = clean(value).replace(/\D/g, "");
  if (digits.startsWith("0062")) digits = digits.slice(4);
  else if (digits.startsWith("62")) digits = digits.slice(2);
  digits = digits.replace(/^0+/, "");
  return digits ? `0${digits}` : "";
}

function publicEvent(event: any, session: any) {
  return {
    event_token: event.public_token,
    status: event.status,
    session_name: session?.session_name || "Onsite Queue",
    company_name: session?.company_name || "",
    location: session?.location || "",
    session_date: session?.session_date || null,
  };
}

export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin();
  const ticketToken = clean(req.nextUrl.searchParams.get("ticket_token"));

  if (ticketToken) {
    const entryResult = await supabase
      .from("vaccination_onsite_queue_entries")
      .select("id,event_id,participant_name,queue_number,queue_sequence,queue_status,joined_at,called_at,started_at,skipped_at,reactivated_at,finished_at")
      .eq("public_token", ticketToken)
      .maybeSingle();
    if (entryResult.error) return fail(entryResult.error.message, 500);
    if (!entryResult.data) return fail("Tiket antrean tidak ditemukan.", 404);

    const eventResult = await supabase
      .from("vaccination_onsite_queue_events")
      .select("id,session_id,status,current_queue_number,current_entry_id")
      .eq("id", entryResult.data.event_id)
      .single();
    if (eventResult.error) return fail(eventResult.error.message, 500);

    const sessionResult = await supabase
      .from("vaccination_sessions")
      .select("id,session_name,company_name,location,session_date")
      .eq("id", eventResult.data.session_id)
      .maybeSingle();

    const aheadResult = await supabase
      .from("vaccination_onsite_queue_entries")
      .select("id", { count: "exact", head: true })
      .eq("event_id", entryResult.data.event_id)
      .lt("queue_sequence", entryResult.data.queue_sequence)
      .in("queue_status", ["WAITING", "CALLED", "IN_PROGRESS"]);

    return response({
      ok: true,
      entry: entryResult.data,
      event: {
        ...eventResult.data,
        session_name: sessionResult.data?.session_name || "Onsite Queue",
        company_name: sessionResult.data?.company_name || "",
        location: sessionResult.data?.location || "",
        session_date: sessionResult.data?.session_date || null,
      },
      ahead_count: aheadResult.count || 0,
    });
  }

  const eventToken = clean(req.nextUrl.searchParams.get("event_token"));
  const slot = Number(req.nextUrl.searchParams.get("slot"));
  const sig = clean(req.nextUrl.searchParams.get("sig"));
  if (!eventToken) return fail("Token event wajib diisi.");

  const eventResult = await supabase
    .from("vaccination_onsite_queue_events")
    .select("*")
    .eq("public_token", eventToken)
    .maybeSingle();
  if (eventResult.error) return fail(eventResult.error.message, 500);
  if (!eventResult.data) return fail("Onsite queue tidak ditemukan.", 404);
  if (clean(eventResult.data.status).toUpperCase() !== "OPEN") return fail("Onsite queue sedang ditutup.", 403);
  if (!validateRolling(eventResult.data, slot, sig)) {
    return fail("QR sudah kedaluwarsa. Scan ulang QR terbaru di lokasi event.", 410, { code: "QR_EXPIRED" });
  }

  const sessionResult = await supabase
    .from("vaccination_sessions")
    .select("id,session_name,company_name,location,session_date")
    .eq("id", eventResult.data.session_id)
    .maybeSingle();

  return response({
    ok: true,
    event: publicEvent(eventResult.data, sessionResult.data),
    join_token: makeJoinToken(eventResult.data),
    join_token_expires_seconds: 600,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const eventToken = clean(body.eventToken || body.event_token);
  const joinToken = clean(body.joinToken || body.join_token);
  const participantName = clean(body.participantName || body.participant_name);
  const employeeId = clean(body.employeeId || body.employee_id);
  const phone = normalizePhone(body.phone || body.mobile || body.patient_mobile);
  const pushSubscription = parsePushSubscription(body.pushSubscription || body.push_subscription);

  if (!eventToken || !joinToken) return fail("Akses QR onsite tidak valid.");
  if (!participantName) return fail("Nama lengkap wajib diisi.");
  if (!employeeId) return fail("NIK Karyawan wajib diisi.");
  if (!/^08\d{7,13}$/.test(phone)) return fail("No HP wajib diisi dengan format Indonesia yang valid, contoh 081234567890.");
  if (!getOnsitePushConfig()) return fail("Background Web Push belum dikonfigurasi di server.", 503);
  if (!pushSubscription) return fail("Approval notifikasi background belum lengkap. Scan ulang QR dan aktifkan notifikasi terlebih dahulu.", 400);

  const supabase = supabaseAdmin();
  const eventResult = await supabase
    .from("vaccination_onsite_queue_events")
    .select("*")
    .eq("public_token", eventToken)
    .maybeSingle();
  if (eventResult.error) return fail(eventResult.error.message, 500);
  if (!eventResult.data) return fail("Onsite queue tidak ditemukan.", 404);
  if (clean(eventResult.data.status).toUpperCase() !== "OPEN") return fail("Onsite queue sedang ditutup.", 403);
  if (!validateJoinToken(eventResult.data, joinToken)) return fail("Sesi pengisian sudah kedaluwarsa. Scan ulang QR onsite.", 410);

  const result = await supabase.rpc("vaccination_onsite_claim_queue_v2", {
    p_event_id: eventResult.data.id,
    p_participant_name: participantName,
    p_employee_id: employeeId,
    p_employee_id_key: employeeKey(employeeId),
    p_phone: phone,
  });
  if (result.error) return fail(result.error.message, 500);

  const payload = result.data || {};
  if (payload?.ok === false) return fail(payload?.message || "Gagal membuat antrean.", 400, payload);

  const entry = payload?.entry;
  const entryId = Number(entry?.id || 0);
  if (!entryId) return fail("Entry antrean tidak valid.", 500);

  const now = new Date().toISOString();
  const pushUpsert = await supabase
    .from("vaccination_onsite_push_subscriptions")
    .upsert(
      {
        entry_id: entryId,
        endpoint: pushSubscription.endpoint,
        p256dh: pushSubscription.p256dh,
        auth: pushSubscription.auth,
        user_agent: clean(req.headers.get("user-agent")).slice(0, 1000),
        enabled: true,
        last_error: null,
        last_error_at: null,
        updated_at: now,
      },
      { onConflict: "endpoint" }
    )
    .select("id,entry_id,enabled")
    .single();

  if (pushUpsert.error) {
    const migrationHint = /vaccination_onsite_push_subscriptions/i.test(pushUpsert.error.message)
      ? " Jalankan SQL V153.30 di Supabase."
      : "";
    return fail(`Nomor antrean sudah dibuat, tetapi background push belum terikat: ${pushUpsert.error.message}${migrationHint}`, 500, {
      entry,
      code: "PUSH_BIND_FAILED",
    });
  }

  return response({
    ok: true,
    created: Boolean(payload?.created),
    entry,
    push_bound: true,
    message: payload?.created
      ? `Nomor antrean ${entry?.queue_number || ""} berhasil dibuat dan notifikasi background aktif.`
      : `NIK Karyawan ini sudah memiliki nomor antrean ${entry?.queue_number || ""}; notifikasi background device ini sudah diaktifkan.`,
  });
}
