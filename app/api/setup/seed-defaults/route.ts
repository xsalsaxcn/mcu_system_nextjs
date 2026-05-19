import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { seedDefaults } from "@/lib/server/defaults";
import { fail, ok } from "@/lib/server/response";

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const supabase = getSupabaseAdmin();
  const result = await seedDefaults(supabase);

  return ok({ result });
}
