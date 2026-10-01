import { createHash, createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { clean, supabaseAdmin } from "../../_utils";
import { notifyOnsiteNextWaitingPrepare } from "@/lib/vaccination/onsiteWhatsApp";
import {
  onsiteQueueFormHasWhatsApp,
  sanitizeOnsiteQueueFormConfig,
  type OnsiteQueueFormField,
} from "@/lib/vaccination/onsiteQueueForm";

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

function validPhone(value: any) {
  const normalized = normalizePhone(value);
  return /^08\d{7,13}$/.test(normalized) ? normalized : "";
}

function publicEvent(event: any, session: any) {
  const queueFormConfig = sanitizeOnsiteQueueFormConfig(
    session?.onsite_queue_form_config,
  );
  return {
    event_token: event.public_token,
    status: event.status,
    session_name: session?.session_name || "Onsite Queue",
    company_name: session?.company_name || "",
    location: session?.location || "",
    session_date: session?.session_date || null,
    queue_form_config: queueFormConfig,
    whatsapp_enabled: onsiteQueueFormHasWhatsApp(queueFormConfig),
  };
}

function submittedValue(
  fields: OnsiteQueueFormField[],
  formData: Record<string, any>,
  kind: OnsiteQueueFormField["kind"],
) {
  const field = fields.find((item) => item.kind === kind);
  if (!field) return "";
  return clean(formData?.[field.id]);
}

function anonymousEmployeeKey(eventToken: string, joinToken: string) {
  return `ANON_${createHash("sha256")
    .update(`${eventToken}.${joinToken}`)
    .digest("hex")
    .slice(0, 24)
    .toUpperCase()}`;
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
      .select("id,session_name,company_name,location,session_date,onsite_queue_form_config")
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
    .select("id,session_name,company_name,location,session_date,onsite_queue_form_config")
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
  const incomingFormData =
    body.formData && typeof body.formData === "object" && !Array.isArray(body.formData)
      ? body.formData
      : {};
  const pushSubscription = parsePushSubscription(body.pushSubscription || body.push_subscription);

  if (!eventToken || !joinToken) return fail("Akses QR onsite tidak valid.");

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

  const sessionResult = await supabase
    .from("vaccination_sessions")
    .select("id,onsite_queue_form_config")
    .eq("id", eventResult.data.session_id)
    .maybeSingle();
  if (sessionResult.error) return fail(sessionResult.error.message, 500);
  if (!sessionResult.data) return fail("Session vaksinasi tidak ditemukan.", 404);

  const formFields = sanitizeOnsiteQueueFormConfig(
    sessionResult.data.onsite_queue_form_config,
  );
  const formData: Record<string, string> = {};

  for (const field of formFields) {
    let value = clean(incomingFormData?.[field.id]);

    // Backward-compatible during rolling deploy: accept the old fixed payload too.
    if (!value && field.kind === "participant_name") {
      value = clean(body.participantName || body.participant_name);
    }
    if (!value && field.kind === "employee_id") {
      value = clean(body.employeeId || body.employee_id);
    }
    if (!value && field.kind === "whatsapp") {
      value = clean(body.phone || body.mobile || body.patient_mobile);
    }

    if (field.required && !value) {
      return fail(`${field.label} wajib diisi.`);
    }

    if (field.kind === "whatsapp" && value) {
      const normalized = validPhone(value);
      if (!normalized) {
        return fail(`${field.label} harus berupa nomor WhatsApp Indonesia yang valid, contoh 081234567890.`);
      }
      value = normalized;
    }

    if (field.kind === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return fail(`${field.label} tidak valid.`);
    }

    formData[field.id] = value;
  }

  const whatsappEnabled = onsiteQueueFormHasWhatsApp(formFields);
  const phone = whatsappEnabled
    ? validPhone(submittedValue(formFields, formData, "whatsapp"))
    : "";
  const employeeId = submittedValue(formFields, formData, "employee_id");
  const participantName =
    submittedValue(formFields, formData, "participant_name") ||
    formFields
      .filter((field) => ["custom_text", "email"].includes(field.kind))
      .map((field) => clean(formData[field.id]))
      .find(Boolean) ||
    employeeId ||
    phone ||
    "Peserta Onsite";

  const dedupeKey = employeeId
    ? employeeKey(employeeId)
    : anonymousEmployeeKey(eventToken, joinToken);

  const result = await supabase.rpc("vaccination_onsite_claim_queue_v2", {
    p_event_id: eventResult.data.id,
    p_participant_name: participantName,
    p_employee_id: employeeId,
    p_employee_id_key: dedupeKey,
    p_phone: phone,
  });
  if (result.error) return fail(result.error.message, 500);

  const payload = result.data || {};
  if (payload?.ok === false) return fail(payload?.message || "Gagal membuat antrean.", 400, payload);

  let entry = payload?.entry;
  const entryId = Number(entry?.id || 0);
  if (!entryId) return fail("Entry antrean tidak valid.", 500);

  const formSnapshot = {
    fields: formFields.map((field) => ({
      id: field.id,
      kind: field.kind,
      label: field.label,
      value: clean(formData[field.id]),
    })),
  };

  const entryUpdate = await supabase
    .from("vaccination_onsite_queue_entries")
    .update({
      phone: whatsappEnabled ? phone : "",
      form_data: formSnapshot,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId)
    .select("*")
    .single();

  if (entryUpdate.error) {
    return fail(
      `${entryUpdate.error.message}. Jalankan SQL V153.57 di Supabase.`,
      500,
    );
  }
  if (entryUpdate.data) entry = entryUpdate.data;

  let pushBound = false;
  let pushWarning = "";

  // Browser push is optional from V153.35 onward. Existing devices that already
  // submit a valid subscription can still use it, but registration never depends on it.
  if (pushSubscription) {
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
      pushWarning = pushUpsert.error.message || "Background push tidak terikat.";
    } else {
      pushBound = true;
    }
  }

  // WhatsApp is controlled by the SESSION FORM. No WhatsApp field = no reminder.
  const whatsappPrepare = whatsappEnabled
    ? await notifyOnsiteNextWaitingPrepare(
        supabase,
        Number(eventResult.data.id)
      )
    : {
        attempted: false,
        sent: false,
        skipped: true,
        reason: "SESSION_WHATSAPP_DISABLED",
      };

  return response({
    ok: true,
    created: Boolean(payload?.created),
    entry,
    push_bound: pushBound,
    push_warning: pushWarning || null,
    whatsapp_enabled: whatsappEnabled,
    whatsapp_prepare: whatsappPrepare,
    whatsapp_phone_available: Boolean(phone),
    message: whatsappEnabled
      ? phone
        ? `Nomor antrean ${entry?.queue_number || ""} berhasil dibuat. Pengingat WhatsApp aktif untuk session ini.`
        : `Nomor antrean ${entry?.queue_number || ""} berhasil dibuat. Field WhatsApp aktif, tetapi nomor tidak diisi.`
      : `Nomor antrean ${entry?.queue_number || ""} berhasil dibuat. Reminder WhatsApp tidak digunakan pada session ini.`,
  });
}
