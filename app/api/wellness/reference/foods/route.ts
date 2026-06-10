import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { canManageWellness } from "@/lib/wellness/auth";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);
  const q = String(req.nextUrl.searchParams.get("q") || "").trim();
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") || 500), 1), 2000);

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase.from("wellness_food_calories").select("*").eq("is_active", 1).order("food_name", { ascending: true }).limit(limit);
    if (q) query = query.ilike("food_name", `%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    return ok({ foods: data || [] });
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat referensi makanan.", 500);
  }
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canManageWellness(user)) return fail("Akses ditolak.", 403);
  const body = await req.json().catch(() => ({}));
  const foodName = String(body.food_name || body.foodName || "").trim();
  const calories = Number(body.calories || 0);
  if (!foodName || !calories) return fail("Nama makanan dan kalori wajib diisi.");

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("wellness_food_calories").upsert({
      food_name: foodName,
      calories,
      category: String(body.category || "").trim() || null,
      aliases: String(body.aliases || "").trim() || null,
      is_active: 1,
    }, { onConflict: "food_name" }).select("*").single();
    if (error) throw error;
    return ok({ food: data });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan referensi makanan.", 500);
  }
}
