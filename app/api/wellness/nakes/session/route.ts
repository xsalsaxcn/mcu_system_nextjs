import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import {
  clearWellnessNakesCookie,
  getWellnessNakesUser,
  isWellnessNakesUser,
  setWellnessNakesCookie,
} from "@/lib/wellness/nakesSession";

export async function GET(req: NextRequest) {
  const user = getWellnessNakesUser(req);
  if (!user) return fail("Session NAKES belum aktif.", 401);
  return ok({ user });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");

  if (!username || !password) {
    return fail("Username dan password wajib diisi.", 400);
  }

  try {
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

    const sessionUser = {
      id: Number(user.id),
      name: String(user.name || user.username || "NAKES"),
      username: String(user.username || ""),
      role: String(user.role || ""),
      post_id: user.post_id ? Number(user.post_id) : null,
      post_name: null,
      program_type: String(user.program_type || "all") as any,
    };

    if (!isWellnessNakesUser(sessionUser)) {
      return fail("Akun ini tidak memiliki akses Form NAKES.", 403);
    }

    const response = NextResponse.json({
      ok: true,
      user: sessionUser,
      redirect: "/wellness/nakes-input",
    });
    setWellnessNakesCookie(response, sessionUser);
    return response;
  } catch (error: any) {
    return fail(error?.message || "Login NAKES gagal.", 500);
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearWellnessNakesCookie(response);
  return response;
}
