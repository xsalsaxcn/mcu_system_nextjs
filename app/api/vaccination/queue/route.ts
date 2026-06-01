import { NextRequest } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

async function attachRegistrationItems(supabase: any, registrations: any[]) {
  const ids = (registrations || []).map((row: any) => Number(row.id)).filter(Boolean);
  if (!ids.length) return registrations || [];

  const itemsResult = await supabase
    .from("vaccination_registration_items")
    .select("*, vaccine:vaccination_vaccines(id,name,brand,price,price_category), lot:vaccination_vaccine_lots(id,lot_number,expiry_date)")
    .in("registration_id", ids)
    .eq("active", true)
    .order("id", { ascending: true });

  if (itemsResult.error) throw new Error(itemsResult.error.message);

  const byReg = new Map<number, any[]>();
  for (const item of itemsResult.data || []) {
    const key = Number(item.registration_id);
    if (!byReg.has(key)) byReg.set(key, []);
    byReg.get(key)!.push(item);
  }

  return (registrations || []).map((registration: any) => ({
    ...registration,
    items: byReg.get(Number(registration.id)) || [],
  }));
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  if (!sessionId) return fail("session_id wajib diisi.");

  const supabase = supabaseAdmin();

  const sessionResult = await supabase.from("vaccination_sessions").select("*").eq("id", sessionId).single();
  if (sessionResult.error) return fail(sessionResult.error.message, 500);

  const regsResult = await supabase
    .from("vaccination_registrations")
    .select("*, vaccine:vaccination_vaccines(id,name,brand)")
    .eq("session_id", sessionId)
    .order("queue_number", { ascending: true, nullsFirst: false });

  if (regsResult.error) return fail(regsResult.error.message, 500);

  try {
    const registrations = await attachRegistrationItems(supabase, regsResult.data || []);
    return ok({ session: sessionResult.data, registrations });
  } catch (error: any) {
    return fail(error?.message || "Gagal mengambil item produk antrian.", 500);
  }
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const action = clean(body.action);
  const sessionId = toInt(body.sessionId || body.session_id, 0);
  const registrationId = toInt(body.registrationId || body.registration_id, 0);
  const supabase = supabaseAdmin();

  if (!sessionId) return fail("Session wajib dipilih.");

  if (action === "call-next") {
    const nextResult = await supabase
      .from("vaccination_registrations")
      .select("*")
      .eq("session_id", sessionId)
      .in("queue_status", ["WAITING", "WAITING_WITH_NOTE", "REGISTERED"])
      .not("queue_number", "is", null)
      .order("queue_number", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextResult.error) return fail(nextResult.error.message, 500);
    if (!nextResult.data) return fail("Tidak ada antrian berikutnya.", 404);

    const reg = nextResult.data;

    await supabase.from("vaccination_registrations").update({ queue_status: "CALLED", updated_at: new Date().toISOString() }).eq("id", reg.id);
    await supabase.from("vaccination_sessions").update({ current_queue_number: reg.queue_number, current_registration_id: reg.id, updated_at: new Date().toISOString() }).eq("id", sessionId);

    return ok({ message: `Memanggil nomor ${reg.queue_number}.`, registration: reg });
  }

  if (!registrationId) return fail("registrationId wajib diisi.");

  const nextStatus =
    action === "recall" ? "CALLED" :
    action === "start" ? "IN_PROGRESS" :
    action === "skip" ? "SKIPPED" :
    action === "cancel" ? "CANCELLED" :
    action === "waiting" ? "WAITING" : "";

  if (!nextStatus) return fail("Action tidak dikenali.");

  const regResult = await supabase
    .from("vaccination_registrations")
    .update({ queue_status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", registrationId)
    .select("*")
    .single();

  if (regResult.error) return fail(regResult.error.message, 500);

  if (nextStatus === "CALLED" || nextStatus === "IN_PROGRESS") {
    await supabase.from("vaccination_sessions").update({ current_queue_number: regResult.data.queue_number, current_registration_id: registrationId, updated_at: new Date().toISOString() }).eq("id", sessionId);
  }

  return ok({ message: `Status antrian diubah ke ${nextStatus}.`, registration: regResult.data });
}
