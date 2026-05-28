import { NextRequest } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

async function attachSessionVaccines(supabase: any, sessions: any[]) {
  if (!sessions.length) return sessions;

  const sessionIds = sessions.map((session) => session.id);

  const svResult = await supabase
    .from("vaccination_session_vaccines")
    .select(`
      *,
      vaccine:vaccination_vaccines(id,name,brand,default_next_dose_days,reminder_days_before),
      lot:vaccination_vaccine_lots(id,lot_number,expiry_date,stock_initial,stock_used)
    `)
    .in("session_id", sessionIds)
    .eq("active", true)
    .order("id", { ascending: true });

  if (svResult.error) {
    return sessions.map((session) => ({ ...session, session_vaccines: [] }));
  }

  const grouped = new Map<number, any[]>();
  for (const item of svResult.data || []) {
    const key = Number(item.session_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  return sessions.map((session) => ({
    ...session,
    session_vaccines: grouped.get(Number(session.id)) || [],
  }));
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const supabase = supabaseAdmin();
  const result = await supabase
    .from("vaccination_sessions")
    .select("*")
    .order("session_date", { ascending: false })
    .order("id", { ascending: false });

  if (result.error) return fail(result.error.message, 500);

  const sessions = await attachSessionVaccines(supabase, result.data || []);
  return ok({ sessions });
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const action = clean(body.action);
  const supabase = supabaseAdmin();

  if (action === "delete-session") {
    const id = toInt(body.id || body.sessionId, 0);
    if (!id) return fail("ID session tidak valid.");

    const result = await supabase
      .from("vaccination_sessions")
      .delete()
      .eq("id", id)
      .select("*")
      .single();

    if (result.error) return fail(result.error.message, 500);

    return ok({ message: "Session vaksinasi berhasil dihapus.", session: result.data });
  }

  const sessionName = clean(body.sessionName);
  if (!sessionName) return fail("Nama session wajib diisi.");

  const sourceId = toInt(body.sourceId, 0);
  const sessionVaccines = Array.isArray(body.sessionVaccines) ? body.sessionVaccines : [];

  const firstSessionVaccine = sessionVaccines.find((item: any) => toInt(item.vaccineId, 0) && toInt(item.lotId, 0));
  const defaultVaccineId = toInt(firstSessionVaccine?.vaccineId ?? body.defaultVaccineId, 0);
  const defaultLotId = toInt(firstSessionVaccine?.lotId ?? body.defaultLotId, 0);

  const payload: Record<string, any> = {
    session_name: sessionName,
    company_name: clean(body.companyName) || null,
    location: clean(body.location) || null,
    session_date: clean(body.sessionDate) || null,
    status: clean(body.status) || "OPEN",
    source_id: sourceId || null,
    source_name: clean(body.sourceName) || null,
    default_vaccine_id: defaultVaccineId || null,
    default_lot_id: defaultLotId || null,
  };

  const result = await supabase.from("vaccination_sessions").insert(payload).select("*").single();
  if (result.error) return fail(result.error.message, 500);

  const session = result.data;

  const rows = sessionVaccines
    .map((item: any) => ({
      session_id: session.id,
      vaccine_id: toInt(item.vaccineId, 0),
      lot_id: toInt(item.lotId, 0),
      dose_number: Math.max(1, toInt(item.doseNumber, 1)),
      active: true,
    }))
    .filter((item: any) => item.vaccine_id && item.lot_id);

  if (rows.length) {
    const svResult = await supabase.from("vaccination_session_vaccines").insert(rows).select("*");
    if (svResult.error) return fail(svResult.error.message, 500, { session });
  }

  return ok({ message: "Session vaksinasi berhasil dibuat.", session });
}
