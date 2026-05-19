import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const program = req.nextUrl.searchParams.get("program") || user.program_type || "capaska";
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("participant_sources")
    .select("*")
    .order("created_at", { ascending: false });

  if (program !== "all") {
    query = query.or(`program_type.eq.${program},program_type.eq.all,program_type.is.null`);
  }

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  return ok({ sources: data || [] });
}
