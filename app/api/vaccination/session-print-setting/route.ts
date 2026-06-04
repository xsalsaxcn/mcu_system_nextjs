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
function normalize(value: any) {
  const raw = clean(value).toUpperCase();
  return raw === "VALIDASI" || raw === "TIM_VALIDASI" || raw === "TIM VALIDASI" ? "VALIDASI" : "MEDIS";
}
function missingColumn(error: any) {
  const msg = String(error?.message || "").toLowerCase();
  return String(error?.code || "") === "42703" || msg.includes("column") || msg.includes("schema cache");
}

export async function GET(req: NextRequest) {
  try {
    const sessionId = clean(new URL(req.url).searchParams.get("session_id"));
    if (!sessionId) return json({ ok: true, print_label_handler: "MEDIS" });
    const supabase = supabaseAdmin();
    const result = await supabase.from("vaccination_sessions").select("id, print_label_handler").eq("id", sessionId).maybeSingle();
    if (result.error) {
      if (missingColumn(result.error)) return json({ ok: true, print_label_handler: "MEDIS", needs_setup: true, message: "Jalankan SQL v126." });
      return json({ ok: false, print_label_handler: "MEDIS", message: result.error.message }, 500);
    }
    return json({ ok: true, print_label_handler: normalize(result.data?.print_label_handler) });
  } catch (error: any) {
    return json({ ok: false, print_label_handler: "MEDIS", message: error?.message || "Gagal membaca setting print." }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = clean(body.session_id ?? body.sessionId);
    const handler = normalize(body.print_label_handler ?? body.printLabelHandler ?? body.value);
    if (!sessionId) return json({ ok: false, message: "session_id wajib ada." }, 400);
    const supabase = supabaseAdmin();
    const result = await supabase.from("vaccination_sessions").update({ print_label_handler: handler }).eq("id", sessionId).select("id, print_label_handler").maybeSingle();
    if (result.error) {
      if (missingColumn(result.error)) return json({ ok: false, needs_setup: true, message: "Kolom print_label_handler belum ada. Jalankan SQL v126." }, 500);
      return json({ ok: false, message: result.error.message }, 500);
    }
    return json({ ok: true, session: result.data, print_label_handler: handler });
  } catch (error: any) {
    return json({ ok: false, message: error?.message || "Gagal menyimpan setting print." }, 500);
  }
}
