import { NextRequest, NextResponse } from "next/server";
import { clean, supabaseAdmin } from "../../_utils";
import { getOnsitePushConfig, sendOnsiteQueueCalledPush } from "@/lib/vaccination/onsiteWebPush";

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

function validEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET() {
  const config = getOnsitePushConfig();
  return response({
    ok: true,
    configured: Boolean(config),
    publicKey: config?.publicKey || "",
    diagnostics_version: "V153.33",
  });
}

export async function POST(req: NextRequest) {
  const config = getOnsitePushConfig();
  if (!config) {
    return fail(
      "Web Push belum dikonfigurasi di server. Set VAPID env di Vercel lalu redeploy.",
      503,
      { code: "PUSH_NOT_CONFIGURED" },
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = clean(body.action).toLowerCase();
  const ticketToken = clean(body.ticketToken || body.ticket_token);

  if (action === "test") {
    if (!ticketToken) return fail("ticketToken wajib diisi.");

    const supabase = supabaseAdmin();
    const entryResult = await supabase
      .from("vaccination_onsite_queue_entries")
      .select("id,event_id,queue_number,queue_status,public_token")
      .eq("public_token", ticketToken)
      .maybeSingle();

    if (entryResult.error) return fail(entryResult.error.message, 500);
    if (!entryResult.data) return fail("Tiket antrean tidak ditemukan.", 404);

    const summary = await sendOnsiteQueueCalledPush(supabase, entryResult.data, "test");
    if (!summary.configured) return fail("Web Push belum dikonfigurasi di server.", 503, { push: summary });
    if (!summary.subscriptions) return fail("Belum ada push subscription aktif untuk tiket ini.", 409, { push: summary });
    if (!summary.sent) return fail("Test background push gagal terkirim.", 502, { push: summary });

    return response({
      ok: true,
      message: `Test background push terkirim ke ${summary.sent} device.`,
      push: summary,
    });
  }

  const subscription = body.subscription || {};
  const endpoint = clean(subscription.endpoint);
  const p256dh = clean(subscription?.keys?.p256dh);
  const auth = clean(subscription?.keys?.auth);

  if (!ticketToken) return fail("ticketToken wajib diisi.");
  if (!validEndpoint(endpoint) || !p256dh || !auth) return fail("Push subscription tidak valid.");
  if (endpoint.length > 2048 || p256dh.length > 512 || auth.length > 512) return fail("Push subscription terlalu panjang.");

  const supabase = supabaseAdmin();
  const entryResult = await supabase
    .from("vaccination_onsite_queue_entries")
    .select("id,event_id,queue_number,queue_status")
    .eq("public_token", ticketToken)
    .maybeSingle();
  if (entryResult.error) return fail(entryResult.error.message, 500);
  if (!entryResult.data) return fail("Tiket antrean tidak ditemukan.", 404);

  const row = {
    entry_id: entryResult.data.id,
    endpoint,
    p256dh,
    auth,
    user_agent: clean(req.headers.get("user-agent")).slice(0, 1000),
    enabled: true,
    last_error: null,
    last_error_at: null,
    updated_at: new Date().toISOString(),
  };

  const upsert = await supabase
    .from("vaccination_onsite_push_subscriptions")
    .upsert(row, { onConflict: "endpoint" })
    .select("id,entry_id,enabled")
    .single();
  if (upsert.error) {
    const migrationHint = /vaccination_onsite_push_subscriptions/i.test(upsert.error.message)
      ? " Jalankan SQL V153.30 di Supabase."
      : "";
    return fail(`${upsert.error.message}${migrationHint}`, 500);
  }

  return response({
    ok: true,
    message: "Notifikasi background aktif untuk tiket antrean ini.",
    subscription: upsert.data,
  });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ticketToken = clean(body.ticketToken || body.ticket_token);
  const endpoint = clean(body.endpoint);
  if (!ticketToken || !endpoint) return fail("ticketToken dan endpoint wajib diisi.");

  const supabase = supabaseAdmin();
  const entryResult = await supabase
    .from("vaccination_onsite_queue_entries")
    .select("id")
    .eq("public_token", ticketToken)
    .maybeSingle();
  if (entryResult.error) return fail(entryResult.error.message, 500);
  if (!entryResult.data) return fail("Tiket antrean tidak ditemukan.", 404);

  const result = await supabase
    .from("vaccination_onsite_push_subscriptions")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("entry_id", entryResult.data.id)
    .eq("endpoint", endpoint);
  if (result.error) return fail(result.error.message, 500);

  return response({ ok: true, message: "Notifikasi background dinonaktifkan." });
}
