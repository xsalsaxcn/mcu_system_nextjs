import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { canManageWellness } from "@/lib/wellness/auth";
import { WELLNESS_DEFAULT_ACTIVITIES, WELLNESS_DEFAULT_FOODS } from "@/lib/wellness/defaultCalorieData";

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canManageWellness(user)) return fail("Akses ditolak.", 403);

  try {
    const supabase = getSupabaseAdmin();

    for (const rows of chunk(WELLNESS_DEFAULT_FOODS, 100)) {
      const { error } = await supabase.from("wellness_food_calories").upsert(rows.map((item) => ({
        food_name: item.foodName,
        calories: item.calories,
        category: item.category || null,
        aliases: item.aliases || null,
        is_active: 1,
      })), { onConflict: "food_name" });
      if (error) throw error;
    }

    for (const rows of chunk(WELLNESS_DEFAULT_ACTIVITIES, 100)) {
      const { error } = await supabase.from("wellness_activity_calories").upsert(rows.map((item) => ({
        activity_name: item.activityName,
        met: item.met,
        calories_per_km: item.caloriesPerKm,
        unit: item.unit || "menit",
        category: item.category || null,
      })), { onConflict: "activity_name" });
      if (error) throw error;
    }

    const { data: existingGroup } = await supabase.from("wellness_groups").select("id").eq("name", "Wellness Default").maybeSingle();
    if (!existingGroup) {
      await supabase.from("wellness_groups").insert({ name: "Wellness Default", leader_name: "Coach Wellness" });
    }

    return ok({ foods: WELLNESS_DEFAULT_FOODS.length, activities: WELLNESS_DEFAULT_ACTIVITIES.length });
  } catch (error: any) {
    return fail(error?.message || "Gagal setup Wellness. Pastikan sql/wellness_schema_v212.sql sudah dijalankan di Supabase.", 500);
  }
}
