import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

function parseIds(value: string | null) {
  return String(value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const ids = parseIds(req.nextUrl.searchParams.get("record_ids") || req.nextUrl.searchParams.get("ids"));
  const recordId = toInt(req.nextUrl.searchParams.get("record_id"), 0);

  const supabase = supabaseAdmin();

  if (ids.length) {
    const result = await supabase
      .from("vaccination_records")
      .select("*, registration:vaccination_registrations(*), session:vaccination_sessions(*)")
      .in("id", ids);

    if (result.error) return fail(result.error.message, 500);

    const orderMap = new Map(ids.map((id, idx) => [id, idx]));
    const records = [...(result.data || [])].sort((a, b) => (orderMap.get(Number(a.id)) || 0) - (orderMap.get(Number(b.id)) || 0));

    return ok({ records });
  }

  if (!recordId) return fail("record_id wajib diisi.");

  const result = await supabase
    .from("vaccination_records")
    .select("*, registration:vaccination_registrations(*), session:vaccination_sessions(*)")
    .eq("id", recordId)
    .single();

  if (result.error) return fail(result.error.message, 500);

  return ok({ record: result.data, records: [result.data] });
}
