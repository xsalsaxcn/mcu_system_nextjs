import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import type { SessionUser } from "@/lib/shared/types";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

// WELLNESS_COACH_USERNAME_ACCOUNTS_V117A

const ADMIN_ROLES = new Set(["admin", "super_admin", "wellness_admin"]);

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalizeEmail(value: any) {
  return clean(value).toLowerCase();
}

function normalizeUsername(value: any) {
  return clean(value).toLowerCase();
}

function activeValue(value: any) {
  return [true, 1, "1", "true", "aktif", "active"].includes(
    typeof value === "string" ? value.toLowerCase() : value,
  );
}

function validUsername(username: string) {
  return /^[a-z0-9._-]{3,40}$/.test(username);
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requireAdmin(req: NextRequest):
  | { user: SessionUser; error: null }
  | { user: null; error: NextResponse } {
  const user = getSessionUser(req);

  if (!user) {
    return {
      user: null,
      error: fail("Session Admin belum aktif.", 401),
    };
  }

  if (!ADMIN_ROLES.has(clean(user.role).toLowerCase())) {
    return {
      user: null,
      error: fail("Hanya Administrator yang dapat mengelola User Coach.", 403),
    };
  }

  return { user, error: null };
}

async function coachValueExists(
  supabase: any,
  column: "email" | "username",
  value: string,
  exceptId?: number,
) {
  let query = supabase
    .from("wellness_coach_users")
    .select("id")
    .ilike(column, value)
    .limit(1);

  if (exceptId) query = query.neq("id", exceptId);

  const { data, error } = await query.maybeSingle();

  if (error) throw error;

  return Boolean(data?.id);
}

function publicCoach(row: any) {
  return {
    id: row?.id,
    name: row?.name,
    email: row?.email,
    username: row?.username,
    phone: row?.phone,
    is_active: row?.is_active,
    created_at: row?.created_at,
    updated_at: row?.updated_at,
  };
}

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("wellness_coach_users")
      .select("id,name,email,username,phone,is_active,created_at,updated_at")
      .order("name", { ascending: true });

    if (error) throw error;

    return ok({
      coaches: (data || []).map(publicCoach),
    });
  } catch (error: any) {
    return fail(
      error?.message ||
        "Gagal memuat User Coach. Jalankan SQL wellness_coach_username_v117a.sql.",
      500,
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const name = clean(body?.name);
  const email = normalizeEmail(body?.email);
  const username = normalizeUsername(body?.username);

  if (!name || !email || !username) {
    return fail("Nama, email, dan username Coach wajib diisi.", 400);
  }

  if (!validEmail(email)) {
    return fail("Format email Coach belum valid.", 400);
  }

  if (!validUsername(username)) {
    return fail(
      "Username minimal 3 karakter dan hanya boleh memakai huruf kecil, angka, titik, garis bawah, atau tanda minus.",
      400,
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    if (await coachValueExists(supabase, "email", email)) {
      return fail("Email Coach sudah digunakan.", 409);
    }

    if (await coachValueExists(supabase, "username", username)) {
      return fail("Username Coach sudah digunakan.", 409);
    }

    // Dipertahankan hanya untuk fallback akun Coach lama.
    // Tidak ditampilkan oleh API atau halaman Admin.
    const legacyAccessCode = crypto
      .randomBytes(8)
      .toString("hex")
      .slice(0, 12)
      .toUpperCase();

    const { data, error } = await supabase
      .from("wellness_coach_users")
      .insert({
        name,
        email,
        username,
        phone: null,
        access_code: legacyAccessCode,
        is_active: activeValue(body?.is_active ?? true),
        updated_at: new Date().toISOString(),
      })
      .select("id,name,email,username,phone,is_active,created_at,updated_at")
      .single();

    if (error) throw error;

    return ok({
      message: "User Coach berhasil ditambahkan.",
      coach: publicCoach(data),
    });
  } catch (error: any) {
    return fail(
      error?.message ||
        "Gagal menambahkan User Coach. Pastikan SQL username Coach sudah dijalankan.",
      500,
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id || 0);
  const name = clean(body?.name);
  const email = normalizeEmail(body?.email);
  const username = normalizeUsername(body?.username);

  if (!(id > 0)) {
    return fail("ID User Coach tidak valid.", 400);
  }

  if (!name || !email || !username) {
    return fail("Nama, email, dan username Coach wajib diisi.", 400);
  }

  if (!validEmail(email)) {
    return fail("Format email Coach belum valid.", 400);
  }

  if (!validUsername(username)) {
    return fail(
      "Username minimal 3 karakter dan hanya boleh memakai huruf kecil, angka, titik, garis bawah, atau tanda minus.",
      400,
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: existing, error: existingError } = await supabase
      .from("wellness_coach_users")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) return fail("User Coach tidak ditemukan.", 404);

    if (await coachValueExists(supabase, "email", email, id)) {
      return fail("Email Coach sudah digunakan.", 409);
    }

    if (await coachValueExists(supabase, "username", username, id)) {
      return fail("Username Coach sudah digunakan.", 409);
    }

    const { data, error } = await supabase
      .from("wellness_coach_users")
      .update({
        name,
        email,
        username,
        is_active: activeValue(body?.is_active),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id,name,email,username,phone,is_active,created_at,updated_at")
      .single();

    if (error) throw error;

    return ok({
      message: "User Coach berhasil diperbarui.",
      coach: publicCoach(data),
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal memperbarui User Coach.", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id || 0);

  if (!(id > 0)) {
    return fail("ID User Coach tidak valid.", 400);
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: existing, error: existingError } = await supabase
      .from("wellness_coach_users")
      .select("id,name")
      .eq("id", id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) return fail("User Coach tidak ditemukan.", 404);

    const { error } = await supabase
      .from("wellness_coach_users")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;

    return ok({
      message: `User Coach ${existing.name || ""} berhasil dinonaktifkan.`,
      deactivated: true,
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal menonaktifkan User Coach.", 500);
  }
}
