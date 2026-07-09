import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

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

function clean(value: unknown) {
  return String(value || "").trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const email = clean(body.email).toLowerCase();
    const accessCode = clean(body.access_code || body.accessCode);

    if (!email || !accessCode) {
      return NextResponse.json(
        { ok: false, message: "Email dan access code wajib diisi." },
        { status: 400 }
      );
    }

    const supabase = adminClient();

    const { data: coach, error } = await supabase
      .from("wellness_coach_users")
      .select("*")
      .eq("email", email)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500 }
      );
    }

    if (!coach || String(coach.access_code || "") !== accessCode) {
      return NextResponse.json(
        { ok: false, message: "Email atau access code tidak sesuai." },
        { status: 401 }
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();

    const { error: sessionError } = await supabase
      .from("wellness_coach_auth_sessions")
      .insert({
        coach_user_id: coach.id,
        session_token: token,
        expires_at: expiresAt,
      });

    if (sessionError) {
      return NextResponse.json(
        { ok: false, message: sessionError.message },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      ok: true,
      message: "Login coach berhasil.",
      coach: {
        id: coach.id,
        name: coach.name,
        email: coach.email,
      },
    });

    response.cookies.set("wellness_coach_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Login coach gagal." },
      { status: 500 }
    );
  }
}
