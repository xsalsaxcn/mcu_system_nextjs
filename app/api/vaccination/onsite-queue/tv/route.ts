import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { clean, supabaseAdmin, toInt } from "../../_utils";
import { getOnsiteWhatsAppPrepareConfig } from "@/lib/vaccination/onsiteWhatsApp";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function response(payload: any, status = 200) {
  const res = NextResponse.json(payload, { status });
  res.headers.set("Cache-Control", "public, no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function fail(message: string, status = 400) {
  return response({ ok: false, message }, status);
}

function rollingPayload(event: any) {
  if (!event || clean(event.status).toUpperCase() !== "OPEN") return null;

  const interval = 60;
  const nowSec = Math.floor(Date.now() / 1000);
  const slot = Math.floor(nowSec / interval);
  const sig = createHmac("sha256", clean(event.qr_secret))
    .update(`${clean(event.public_token)}.${slot}`)
    .digest("hex")
    .slice(0, 32);

  return {
    slot,
    sig,
    interval_seconds: interval,
    expires_in: Math.max(1, interval - (nowSec % interval)),
    scan_path: `/vaccination/public/onsite-queue/${encodeURIComponent(
      clean(event.public_token)
    )}?slot=${slot}&sig=${sig}`,
  };
}

export async function GET(req: NextRequest) {
  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  if (!sessionId) return fail("session_id wajib diisi.");

  const supabase = supabaseAdmin();

  try {
    const sessionResult = await supabase
      .from("vaccination_sessions")
      .select("id,session_name,company_name,location,session_date,status")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionResult.error) return fail(sessionResult.error.message, 500);
    if (!sessionResult.data) return fail("Session vaksinasi tidak ditemukan.", 404);

    const eventResult = await supabase
      .from("vaccination_onsite_queue_events")
      .select(
        "id,session_id,public_token,qr_secret,qr_interval_seconds,queue_prefix,status,current_queue_number,current_entry_id"
      )
      .eq("session_id", sessionId)
      .maybeSingle();

    if (eventResult.error) return fail(eventResult.error.message, 500);

    let entries: any[] = [];
    if (eventResult.data?.id) {
      const entriesResult = await supabase
        .from("vaccination_onsite_queue_entries")
        .select(
          "id,participant_name,queue_number,queue_sequence,queue_status,joined_at,called_at,started_at,skipped_at,reactivated_at,finished_at"
        )
        .eq("event_id", eventResult.data.id)
        .order("queue_sequence", { ascending: true });

      if (entriesResult.error) return fail(entriesResult.error.message, 500);
      entries = entriesResult.data || [];
    }

    const whatsappConfig = getOnsiteWhatsAppPrepareConfig();
    const event = eventResult.data
      ? {
          id: eventResult.data.id,
          session_id: eventResult.data.session_id,
          queue_prefix: eventResult.data.queue_prefix,
          status: eventResult.data.status,
          current_queue_number: eventResult.data.current_queue_number,
          current_entry_id: eventResult.data.current_entry_id,
        }
      : null;

    return response({
      ok: true,
      public_tv: true,
      read_only: true,
      session: sessionResult.data,
      event,
      entries,
      rolling: rollingPayload(eventResult.data),
      whatsapp_prepare: {
        configured: whatsappConfig.configured,
        trigger_ahead: whatsappConfig.trigger_ahead,
      },
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal mengambil tampilan TV onsite.", 500);
  }
}
