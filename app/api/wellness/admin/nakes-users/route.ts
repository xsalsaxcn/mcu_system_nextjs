import { NextRequest, NextResponse } from "next/server";
import type { SessionUser } from "@/lib/shared/types";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

const ADMIN_ROLES = new Set(["admin", "super_admin", "wellness_admin"]);
const NAKES_ROLES = ["wellness_nakes", "nakes"];

function clean(value: any) {
  return String(value ?? "").trim();
}

function activeValue(value: any) {
  return [true, 1, "1", "true", "aktif", "active"].includes(
    typeof value === "string" ? value.toLowerCase() : value,
  )
    ? 1
    : 0;
}

function requireAdmin(req: NextRequest):
  | { user: SessionUser; error: null }
  | { user: null; error: NextResponse } {
  const user = getSessionUser(req);
  if (!user) {
    return { user: null, error: fail("Session Admin belum aktif.", 401) };
  }
  if (!ADMIN_ROLES.has(clean(user.role).toLowerCase())) {
    return {
      user: null,
      error: fail("Hanya Administrator yang dapat mengelola User NAKES.", 403),
    };
  }
  return { user, error: null };
}

async function usernameExists(supabase: any, username: string, exceptId?: number) {
  let query = supabase.from("users").select("id").eq("username", username).limit(1);
  if (exceptId) query = query.neq("id", exceptId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("users")
      .select("id,name,username,role,program_type,is_active")
      .in("role", NAKES_ROLES)
      .order("name", { ascending: true });

    if (error) throw error;
    return ok({ users: data || [] });
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat User NAKES.", 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const name = clean(body?.name);
  const username = clean(body?.username).toLowerCase();
  const password = String(body?.password || "");

  if (!name || !username || !password) {
    return fail("Nama, username, dan password wajib diisi.", 400);
  }
  if (username.length < 3) return fail("Username minimal 3 karakter.", 400);
  if (password.length < 6) return fail("Password minimal 6 karakter.", 400);

  try {
    const supabase = getSupabaseAdmin();
    if (await usernameExists(supabase, username)) {
      return fail("Username sudah digunakan.", 409);
    }

    const { data, error } = await supabase
      .from("users")
      .insert({
        name,
        username,
        password,
        role: "wellness_nakes",
        post_id: null,
        program_type: "all",
        is_active: 1,
      })
      .select("id,name,username,role,program_type,is_active")
      .single();

    if (error) throw error;
    return ok({ message: "User NAKES berhasil ditambahkan.", user: data });
  } catch (error: any) {
    return fail(error?.message || "Gagal menambahkan User NAKES.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id || 0);
  const name = clean(body?.name);
  const username = clean(body?.username).toLowerCase();
  const password = String(body?.password || "");

  if (!(id > 0)) return fail("ID User NAKES tidak valid.", 400);
  if (!name || !username) return fail("Nama dan username wajib diisi.", 400);
  if (username.length < 3) return fail("Username minimal 3 karakter.", 400);
  if (password && password.length < 6) {
    return fail("Password baru minimal 6 karakter.", 400);
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: existing, error: existingError } = await supabase
      .from("users")
      .select("id,role")
      .eq("id", id)
      .in("role", NAKES_ROLES)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) return fail("User NAKES tidak ditemukan.", 404);
    if (await usernameExists(supabase, username, id)) {
      return fail("Username sudah digunakan.", 409);
    }

    const payload: any = {
      name,
      username,
      role: "wellness_nakes",
      program_type: "all",
      is_active: activeValue(body?.is_active),
    };
    if (password) payload.password = password;

    const { data, error } = await supabase
      .from("users")
      .update(payload)
      .eq("id", id)
      .select("id,name,username,role,program_type,is_active")
      .single();

    if (error) throw error;
    return ok({ message: "User NAKES berhasil diperbarui.", user: data });
  } catch (error: any) {
    return fail(error?.message || "Gagal memperbarui User NAKES.", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id || 0);
  if (!(id > 0)) return fail("ID User NAKES tidak valid.", 400);

  try {
    const supabase = getSupabaseAdmin();
    const { data: existing, error: existingError } = await supabase
      .from("users")
      .select("id,role")
      .eq("id", id)
      .in("role", NAKES_ROLES)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) return fail("User NAKES tidak ditemukan.", 404);

    const deleted = await supabase.from("users").delete().eq("id", id);
    if (!deleted.error) {
      return ok({ message: "User NAKES berhasil dihapus.", deleted: true });
    }

    const fallback = await supabase
      .from("users")
      .update({ is_active: 0 })
      .eq("id", id);
    if (fallback.error) throw deleted.error;

    return ok({
      message: "User NAKES dinonaktifkan karena masih terhubung dengan riwayat pemeriksaan.",
      deleted: false,
      deactivated: true,
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal menghapus User NAKES.", 500);
  }
}
