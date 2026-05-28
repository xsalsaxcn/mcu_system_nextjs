import { NextRequest } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  if (!sessionId) return fail("session_id wajib diisi.");

  const supabase = supabaseAdmin();
  const result = await supabase
    .from("vaccination_session_vaccines")
    .select(`
      *,
      vaccine:vaccination_vaccines(id,name,brand,default_next_dose_days,reminder_days_before),
      lot:vaccination_vaccine_lots(id,lot_number,expiry_date,stock_initial,stock_used)
    `)
    .eq("session_id", sessionId)
    .eq("active", true)
    .order("id", { ascending: true });

  if (result.error) return fail(result.error.message, 500);

  return ok({ sessionVaccines: result.data || [] });
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const action = clean(body.action);
  const supabase = supabaseAdmin();

  if (action === "add") {
    const sessionId = toInt(body.sessionId, 0);
    const vaccineId = toInt(body.vaccineId, 0);
    const lotId = toInt(body.lotId, 0);
    const doseNumber = Math.max(1, toInt(body.doseNumber, 1));

    if (!sessionId) return fail("Session wajib dipilih.");
    if (!vaccineId) return fail("Vaksin wajib dipilih.");
    if (!lotId) return fail("Lot number wajib dipilih.");

    const lotResult = await supabase.from("vaccination_vaccine_lots").select("*").eq("id", lotId).single();
    if (lotResult.error) return fail(lotResult.error.message, 500);
    if (Number(lotResult.data.vaccine_id) !== Number(vaccineId)) return fail("Lot number tidak sesuai dengan vaksin.");

    const insertResult = await supabase
      .from("vaccination_session_vaccines")
      .insert({ session_id: sessionId, vaccine_id: vaccineId, lot_id: lotId, dose_number: doseNumber, active: true })
      .select("*")
      .single();

    if (insertResult.error) return fail(insertResult.error.message, 500);

    return ok({ message: "Vaksin session berhasil ditambahkan.", sessionVaccine: insertResult.data });
  }

  if (action === "remove") {
    const id = toInt(body.id, 0);
    if (!id) return fail("ID tidak valid.");

    const result = await supabase
      .from("vaccination_session_vaccines")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (result.error) return fail(result.error.message, 500);

    return ok({ message: "Vaksin session dihapus dari daftar aktif.", sessionVaccine: result.data });
  }

  return fail("Action tidak dikenali.");
}
