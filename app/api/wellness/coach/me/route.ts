import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// WELLNESS_COACH_USERNAME_ACCOUNTS_V117A

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function adminClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) {
    throw new Error("Supabase admin env is missing.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeUsername(value: unknown) {
  return clean(value).toLowerCase();
}

function validUsername(username: string) {
  return /^[a-z0-9._-]{3,40}$/.test(username);
}

async function getCoach(request: NextRequest, supabase: any) {
  const token =
    request.cookies.get("wellness_coach_session")?.value || "";

  if (!token) return null;

  const { data, error } = await supabase
    .from("wellness_coach_auth_sessions")
    .select("*, coach:wellness_coach_users(*)")
    .eq("session_token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (
    error ||
    !data ||
    !data.coach ||
    data.coach.is_active === false
  ) {
    return null;
  }

  return data.coach;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = adminClient();
    const coach = await getCoach(request, supabase);

    if (!coach) {
      return NextResponse.json(
        {
          ok: false,
          message: "Session Coach belum aktif.",
        },
        { status: 401 },
      );
    }

    return NextResponse.json({
      ok: true,
      coach: {
        id: coach.id,
        name: coach.name,
        email: coach.email,
        username: coach.username,
        phone: coach.phone,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error?.message || "Gagal membaca session Coach.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = adminClient();
    const coach = await getCoach(request, supabase);

    if (!coach) {
      return NextResponse.json(
        {
          ok: false,
          message: "Session Coach belum aktif.",
        },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const username = normalizeUsername(body?.username);

    if (!validUsername(username)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Username minimal 3 karakter dan hanya boleh memakai huruf kecil, angka, titik, garis bawah, atau tanda minus.",
        },
        { status: 400 },
      );
    }

    const { data: duplicate, error: duplicateError } =
      await supabase
        .from("wellness_coach_users")
        .select("id")
        .ilike("username", username)
        .neq("id", coach.id)
        .limit(1)
        .maybeSingle();

    if (duplicateError) throw duplicateError;

    if (duplicate?.id) {
      return NextResponse.json(
        {
          ok: false,
          message: "Username Coach sudah digunakan.",
        },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from("wellness_coach_users")
      .update({
        username,
        updated_at: new Date().toISOString(),
      })
      .eq("id", coach.id)
      .select("id,name,email,username,phone,is_active")
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      message:
        "Username Coach berhasil diperbarui. Session tetap aktif.",
      coach: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error?.message || "Gagal memperbarui username Coach.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token =
      request.cookies.get("wellness_coach_session")?.value || "";

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
      {
        ok: false,
        message: error?.message || "Logout gagal.",
      },
      { status: 500 },
    );
  }
}
