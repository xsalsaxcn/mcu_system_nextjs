import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { setSessionCookie } from "@/lib/server/session";
import { fail } from "@/lib/server/response";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();

  if (!username || !password) return fail("Username dan password wajib diisi.");

  const supabase = getSupabaseAdmin();

  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("username", username)
    .eq("password", password)
    .eq("is_active", 1)
    .limit(1)
    .maybeSingle();

  if (error) return fail(error.message, 500);
  if (!user) return fail("Username atau password salah.", 401);

  let postName: string | null = null;

  if (user.post_id) {
    const { data: post } = await supabase.from("posts").select("name").eq("id", user.post_id).maybeSingle();
    postName = post?.name || null;
  }

  const sessionUser = {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    post_id: user.post_id,
    post_name: postName,
    program_type: user.program_type || "corporate",
    // WELLNESS_COMPANY_LOGIN_CONTEXT_V78A
    // Kolom yang tidak tersedia pada tabel users akan bernilai undefined
    // dan tidak mengubah alur login role lain.
    wellness_company_id:
      user.wellness_company_id ||
      user.company_id ||
      user.main_entity_id ||
      user.client_id ||
      null,
    company_id:
      user.company_id ||
      user.wellness_company_id ||
      user.main_entity_id ||
      user.client_id ||
      null,
    main_entity_id:
      user.main_entity_id ||
      user.wellness_company_id ||
      user.company_id ||
      null,
    company_name:
      user.company_name ||
      user.company ||
      user.main_entity_name ||
      user.client_name ||
      null,
  };

  const res = NextResponse.json({ ok: true, user: sessionUser });
  setSessionCookie(res, sessionUser);
  return res;
}
