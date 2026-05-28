import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const recordId = toInt(req.nextUrl.searchParams.get("record_id"), 0);
  if (!recordId) return fail("record_id wajib diisi.");

  const result = await supabaseAdmin()
    .from("vaccination_records")
    .select("*, registration:vaccination_registrations(*), session:vaccination_sessions(*)")
    .eq("id", recordId)
    .single();

  if (result.error) return fail(result.error.message, 500);
  return ok({ record: result.data });
}
