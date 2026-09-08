import { NextRequest } from "next/server";
import { VACCINATION_ROLES, canVaccinationAccess } from "@/lib/vaccination/access";
import { fail, ok, requireUser, supabaseAdmin, toInt } from "../../_utils";

export const dynamic = "force-dynamic";

// VACCINATION_DEDICATED_USER_ADMIN_V150_1
// Dedicated vaccination users only. Existing Wellness / MCU / CAPASKA users are
// intentionally excluded from this portal so managing vaccination access cannot
// accidentally overwrite another program role.

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isVaccinationUser(row: any) {
  const role = clean(row?.role).toLowerCase();
  const program = clean(row?.program_type).toLowerCase();
  return role.startsWith("vaccination_") || program === "vaccination";
}

function isActive(row: any) {
  return ![false, 0, "0", "false", "inactive", "nonaktif"].includes(
    typeof row?.is_active === "string" ? row.is_active.toLowerCase() : row?.is_active,
  );
}

async function usernameExists(supabase: any, username: string, ignoreId = 0) {
  let query = supabase
    .from("users")
    .select("id")
    .eq("username", username)
    .limit(1);
  if (ignoreId > 0) query = query.neq("id", ignoreId);
  const { data, error } = await query;
  if (error) throw error;
  return Boolean(data?.length);
}

async function getManagedUser(supabase: any, userId: number) {
  const { data, error } = await supabase
    .from("users")
    .select("id,name,username,role,program_type,is_active")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !isVaccinationUser(data)) return null;
  return data;
}

function requireVaccinationAdmin(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return { user: null, error: fail("Unauthorized", 401) };
  if (!canVaccinationAccess(user, "users")) {
    return { user: null, error: fail("Hanya Admin Vaksinasi yang dapat mengelola user.", 403) };
  }
  return { user, error: null };
}

export async function GET(req: NextRequest) {
  const auth = requireVaccinationAdmin(req);
  if (auth.error) return auth.error;

  const supabase = supabaseAdmin();
  const result = await supabase
    .from("users")
    .select("id,name,username,role,post_id,program_type,is_active")
    .order("name", { ascending: true });
  if (result.error) return fail(result.error.message, 500);

  const users = (result.data || []).filter((row: any) => isVaccinationUser(row) && isActive(row));
  return ok({ users, roles: VACCINATION_ROLES });
}

export async function POST(req: NextRequest) {
  const auth = requireVaccinationAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const action = clean(body.action || (body.userId || body.user_id ? "SET_ROLE" : "CREATE_USER")).toUpperCase();
  const supabase = supabaseAdmin();

  try {
    if (action === "CREATE_USER") {
      const name = clean(body.name);
      const username = clean(body.username).toLowerCase();
      const password = String(body.password || "");
      const role = clean(body.role || "vaccination_medis").toLowerCase();

      if (!name || !username || !password) return fail("Nama, username, dan password wajib diisi.", 400);
      if (username.length < 3) return fail("Username minimal 3 karakter.", 400);
      if (password.length < 6) return fail("Password minimal 6 karakter.", 400);
      if (!VACCINATION_ROLES.includes(role as any)) return fail("Role vaksinasi tidak valid.", 400);
      if (await usernameExists(supabase, username)) return fail("Username sudah digunakan.", 409);

      const { data, error } = await supabase
        .from("users")
        .insert({
          name,
          username,
          password,
          role,
          post_id: null,
          program_type: "vaccination",
          is_active: 1,
        })
        .select("id,name,username,role,program_type,is_active")
        .single();
      if (error) throw error;
      return ok({ message: "User vaksinasi berhasil ditambahkan.", user: data });
    }

    const userId = toInt(body.userId || body.user_id || body.id, 0);
    if (!userId) return fail("User vaksinasi wajib dipilih.", 400);
    const target = await getManagedUser(supabase, userId);
    if (!target) return fail("User vaksinasi tidak ditemukan.", 404);

    if (action === "SET_PASSWORD" || action === "RESET_PASSWORD") {
      const password = String(body.password || "");
      if (password.length < 6) return fail("Password baru minimal 6 karakter.", 400);
      const { data, error } = await supabase
        .from("users")
        .update({ password })
        .eq("id", userId)
        .select("id,name,username,role,program_type,is_active")
        .single();
      if (error) throw error;
      return ok({ message: `Password ${clean(target.name) || clean(target.username)} berhasil diubah.`, user: data });
    }

    if (action === "SET_ROLE") {
      const role = clean(body.role).toLowerCase();
      if (!VACCINATION_ROLES.includes(role as any)) return fail("Role vaksinasi tidak valid.", 400);
      const { data, error } = await supabase
        .from("users")
        .update({ role, program_type: "vaccination", is_active: 1 })
        .eq("id", userId)
        .select("id,name,username,role,program_type,is_active")
        .single();
      if (error) throw error;
      return ok({ message: "Role vaksinasi berhasil disimpan. User perlu login ulang agar session memakai role baru.", user: data });
    }

    return fail("Action user vaksinasi tidak dikenali.", 400);
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan user vaksinasi.", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireVaccinationAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const userId = toInt(body.userId || body.user_id || body.id, 0);
  if (!userId) return fail("User vaksinasi wajib dipilih.", 400);
  if (Number((auth.user as any)?.id || 0) === userId) {
    return fail("Akun Admin Vaksinasi yang sedang login tidak dapat dihapus dari halaman ini.", 400);
  }

  const supabase = supabaseAdmin();
  try {
    const target = await getManagedUser(supabase, userId);
    if (!target) return fail("User vaksinasi tidak ditemukan.", 404);

    const deleted = await supabase.from("users").delete().eq("id", userId);
    if (!deleted.error) {
      return ok({ message: "User vaksinasi berhasil dihapus.", deleted: true });
    }

    // Safe fallback when the user is already referenced by historical records.
    const fallback = await supabase
      .from("users")
      .update({ is_active: 0 })
      .eq("id", userId);
    if (fallback.error) throw deleted.error;

    return ok({
      message: "User vaksinasi dinonaktifkan karena masih terhubung dengan riwayat data.",
      deleted: false,
      deactivated: true,
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal menghapus user vaksinasi.", 500);
  }
}
