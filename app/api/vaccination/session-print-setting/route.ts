import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../_utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(data: any, status = 200) {
  const res = NextResponse.json(data, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
function clean(value: any) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function slug(value: any) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function mode(value: any) { const raw = clean(value).toUpperCase(); return raw === "VALIDASI" || raw === "TIM_VALIDASI" || raw === "TIM VALIDASI" ? "VALIDASI" : "MEDIS"; }
function isMissing(error: any) { const msg = String(error?.message || "").toLowerCase(); const code = String(error?.code || ""); return code === "42P01" || code === "42703" || msg.includes("does not exist") || msg.includes("column") || msg.includes("schema cache"); }

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = clean(url.searchParams.get("session_id"));
    const sessionName = clean(url.searchParams.get("session_name"));
    const sessionKey = clean(url.searchParams.get("session_key")) || slug(sessionName || sessionId);
    const supabase = supabaseAdmin();
    if (sessionId) {
      const a = await supabase.from("vaccination_sessions").select("id, print_label_handler").eq("id", sessionId).maybeSingle();
      if (!a.error && a.data?.print_label_handler) return json({ ok: true, print_label_handler: mode(a.data.print_label_handler) });
    }
    if (sessionKey) {
      const b = await supabase.from("vaccination_session_print_settings").select("session_key, print_label_handler").eq("session_key", sessionKey).maybeSingle();
      if (!b.error && b.data?.print_label_handler) return json({ ok: true, print_label_handler: mode(b.data.print_label_handler) });
    }
    return json({ ok: true, print_label_handler: "MEDIS" });
  } catch (error: any) {
    return json({ ok: false, print_label_handler: "MEDIS", message: error?.message || "Gagal membaca setting print." }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = clean(body.session_id ?? body.sessionId);
    const sessionName = clean(body.session_name ?? body.sessionName);
    const sessionKey = clean(body.session_key ?? body.sessionKey) || slug(sessionName || sessionId);
    const printLabelHandler = mode(body.print_label_handler ?? body.printLabelHandler ?? body.value);
    const supabase = supabaseAdmin();
    let sessionUpdated = false;
    let settingsUpdated = false;
    let lastMessage = "";
    if (sessionId) {
      const a = await supabase.from("vaccination_sessions").update({ print_label_handler: printLabelHandler }).eq("id", sessionId).select("id, print_label_handler").maybeSingle();
      if (!a.error) sessionUpdated = true; else lastMessage = a.error.message || "";
    }
    if (sessionKey) {
      const payload = { session_key: sessionKey, session_id: sessionId || null, session_name: sessionName || sessionKey, print_label_handler: printLabelHandler, updated_at: new Date().toISOString() };
      const b = await supabase.from("vaccination_session_print_settings").upsert(payload, { onConflict: "session_key" }).select("session_key, print_label_handler").maybeSingle();
      if (!b.error) settingsUpdated = true; else if (!isMissing(b.error)) lastMessage = b.error.message || lastMessage;
    }
    return json({ ok: sessionUpdated || settingsUpdated, print_label_handler: printLabelHandler, session_updated: sessionUpdated, settings_updated: settingsUpdated, message: sessionUpdated || settingsUpdated ? "Setting print tersimpan." : (lastMessage || "Setting tersimpan lokal. Jalankan SQL v128 agar tersimpan di database.") });
  } catch (error: any) {
    return json({ ok: false, message: error?.message || "Gagal menyimpan setting print." }, 500);
  }
}
