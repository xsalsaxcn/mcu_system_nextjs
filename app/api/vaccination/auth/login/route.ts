import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { setSessionCookie } from "@/lib/server/session";
import { fail } from "@/lib/server/response";
import { isVaccinationRole } from "@/lib/vaccination/access";

export const dynamic = "force-dynamic";

// VACCINATION_DEDICATED_LOGIN_V150_2
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();

  if (!username || !password) return fail("Username dan password wajib diisi.", 400);

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

  const rawRole = String(user.role || "").trim().toLowerCase();
  if (rawRole !== "admin" && !isVaccinationRole(user)) {
    return fail(
      "Akun ini bukan user Portal Vaksinasi. Hubungi Admin Vaksinasi untuk membuat akun atau mengatur role.",
      403,
    );
  }

  let postName: string | null = null;
  if (user.post_id) {
    const { data: post } = await supabase
      .from("posts")
      .select("name")
      .eq("id", user.post_id)
      .maybeSingle();
    postName = post?.name || null;
  }

  const sessionUser = {
    id: Number(user.id),
    name: String(user.name || user.username || "Vaccination User"),
    username: String(user.username || ""),
    role: String(user.role || ""),
    post_id: user.post_id ? Number(user.post_id) : null,
    post_name: postName,
    program_type: String(user.program_type || "vaccination") as any,
  };

  // VACCINATION_MEDIS_WORKSPACE_V150_3
  const redirect = rawRole === "vaccination_medis" ? "/vaccination/medis" : "/vaccination/portal";
  const response = NextResponse.json({
    ok: true,
    user: sessionUser,
    redirect,
  });
  setSessionCookie(response, sessionUser);
  return response;
}
