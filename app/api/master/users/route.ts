import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const supabase = getSupabaseAdmin();

  const { data: users, error } = await supabase
    .from("users")
    .select("id,name,username,role,post_id,program_type,is_active")
    .order("id", { ascending: true });

  if (error) return fail(error.message, 500);

  const { data: posts } = await supabase.from("posts").select("id,name").order("id", { ascending: true });
  const postMap = new Map((posts || []).map((p: any) => [p.id, p.name]));

  const rows = (users || []).map((u: any) => ({
    ...u,
    post_name: postMap.get(u.post_id) || "-"
  }));

  return ok({ users: rows });
}
