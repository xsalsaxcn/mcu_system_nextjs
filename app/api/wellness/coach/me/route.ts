import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) {
    throw new Error("Supabase admin env is missing.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getCoach(request: NextRequest) {
  const token = request.cookies.get("wellness_coach_session")?.value || "";

  if (!token) return null;

  const supabase = adminClient();

  const { data, error } = await supabase
    .from("wellness_coach_auth_sessions")
    .select("*, coach:wellness_coach_users(*)")
    .eq("session_token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data || !data.coach || data.coach.is_active === false) {
    return null;
  }

  return data.coach;
}

export async function GET(request: NextRequest) {
  try {
    const coach = await getCoach(request);

    if (!coach) {
      return NextResponse.json(
        { ok: false, message: "Session coach belum aktif." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      ok: true,
      coach: {
        id: coach.id,
        name: coach.name,
        email: coach.email,
        phone: coach.phone,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal membaca session coach." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = request.cookies.get("wellness_coach_session")?.value || "";
    const supabase = adminClient();

    if (token) {
      await supabase
        .from("wellness_coach_auth_sessions")
        .delete()
        .eq("session_token", token);
    }

    const response = NextResponse.json({
      ok: true,
      message: "Coach logout berhasil.",
    });

    response.cookies.set("wellness_coach_session", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Logout gagal." },
      { status: 500 }
    );
  }
}
