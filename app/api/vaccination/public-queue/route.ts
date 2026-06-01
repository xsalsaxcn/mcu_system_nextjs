import { NextRequest } from "next/server";
import { clean, fail, ok, supabaseAdmin } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = clean(req.nextUrl.searchParams.get("token"));
  if (!token) return fail("Token tidak valid.");

  const supabase = supabaseAdmin();

  const sessionResult = await supabase.from("vaccination_sessions").select("*").eq("public_queue_token", token).maybeSingle();
  if (sessionResult.error) return fail(sessionResult.error.message, 500);
  if (!sessionResult.data) return fail("Session antrian tidak ditemukan.", 404);

  const session = sessionResult.data;

  const regsResult = await supabase
    .from("vaccination_registrations")
    .select("id,queue_number,queue_status,participant_name")
    .eq("session_id", session.id)
    .not("queue_number", "is", null)
    .order("queue_number", { ascending: true });

  if (regsResult.error) return fail(regsResult.error.message, 500);

  const registrations = regsResult.data || [];
  const waiting = registrations.filter((r: any) => ["WAITING", "WAITING_WITH_NOTE", "REGISTERED"].includes(String(r.queue_status || "").toUpperCase())).length;
  const done = registrations.filter((r: any) => ["ADMINISTERED", "DONE"].includes(String(r.queue_status || "").toUpperCase())).length;

  return ok({
    session: {
      id: session.id,
      session_name: session.session_name,
      company_name: session.company_name,
      location: session.location,
      session_date: session.session_date,
      current_queue_number: session.current_queue_number,
      status: session.status,
    },
    summary: { total: registrations.length, waiting, done },
    registrations,
  });
}
