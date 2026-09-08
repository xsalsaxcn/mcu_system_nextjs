import { NextRequest } from "next/server";
import { VACCINATION_ROLES, canVaccinationAccess } from "@/lib/vaccination/access";
import { fail, ok, requireUser, supabaseAdmin, toInt } from "../../_utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "users")) return fail("Hanya admin vaksinasi yang dapat mengelola role.", 403);

  const supabase = supabaseAdmin();
  const result = await supabase
    .from("users")
    .select("id,name,username,role,post_id,program_type,is_active")
    .order("name", { ascending: true });
  if (result.error) return fail(result.error.message, 500);

  return ok({ users: result.data || [], roles: VACCINATION_ROLES });
}

export async function POST(req: NextRequest) {
  const actor = requireUser(req);
  if (!actor) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(actor, "users")) return fail("Hanya admin vaksinasi yang dapat mengelola role.", 403);

  const body = await req.json().catch(() => ({}));
  const userId = toInt(body.userId || body.user_id, 0);
  const role = String(body.role || "").trim().toLowerCase();
  if (!userId) return fail("User wajib dipilih.");
  if (!VACCINATION_ROLES.includes(role as any)) return fail("Role vaksinasi tidak valid.");

  const supabase = supabaseAdmin();
  const result = await supabase
    .from("users")
    .update({ role, program_type: "vaccination" })
    .eq("id", userId)
    .select("id,name,username,role,program_type,is_active")
    .single();
  if (result.error) return fail(result.error.message, 500);

  return ok({ message: "Role vaksinasi berhasil disimpan. User perlu login ulang agar session memakai role baru.", user: result.data });
}
