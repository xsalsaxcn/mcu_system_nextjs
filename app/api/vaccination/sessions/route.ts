import { NextRequest } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

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
  return ok({ sessions: result.data || [] });
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const sessionName = clean(body.sessionName);
  if (!sessionName) return fail("Nama session wajib diisi.");

  const sourceId = toInt(body.sourceId, 0);
  const defaultVaccineId = toInt(body.defaultVaccineId, 0);
  const defaultLotId = toInt(body.defaultLotId, 0);

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

  const supabase = supabaseAdmin();
  const result = await supabase.from("vaccination_sessions").insert(payload).select("*").single();
  if (result.error) return fail(result.error.message, 500);

  return ok({ message: "Session vaksinasi berhasil dibuat.", session: result.data });
}
