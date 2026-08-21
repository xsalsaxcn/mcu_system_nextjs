import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { canManageWellness } from "@/lib/wellness/auth";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);
  const q = String(req.nextUrl.searchParams.get("q") || "").trim();

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase.from("wellness_activity_calories").select("*").order("activity_name", { ascending: true }).limit(1000);
    if (q) query = query.ilike("activity_name", `%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    return ok({ activities: data || [] });
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat referensi aktivitas.", 500);
  }
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canManageWellness(user)) return fail("Akses ditolak.", 403);
  const body = await req.json().catch(() => ({}));

  // WELLNESS_BULK_WORKOUT_IMPORT_V126M97_4
  if (Array.isArray(body.activities)) {
    const rows = body.activities
      .map((item: any) => {
        const activityName = String(
          item?.activity_name || item?.activityName || "",
        ).trim();
        const met = Number(item?.met || 0) || null;
        const caloriesPerKm =
          Number(item?.calories_per_km || item?.caloriesPerKm || 0) || null;

        return {
          activity_name: activityName,
          met,
          calories_per_km: caloriesPerKm,
          unit: String(item?.unit || "menit").trim() || "menit",
          category: String(item?.category || "").trim() || null,
        };
      })
      .filter(
        (item: any) =>
          Boolean(item.activity_name) &&
          (Number(item.met || 0) > 0 ||
            Number(item.calories_per_km || 0) > 0),
      );

    if (!rows.length) {
      return fail(
        "Tidak ada Master Workout valid untuk diimpor. " +
          "Nama aktivitas wajib diisi dan minimal MET atau Kalori/km harus > 0.",
      );
    }

    if (rows.length > 5000) {
      return fail("Maksimal 5.000 Master Workout per import.");
    }

    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("wellness_activity_calories")
        .upsert(rows, { onConflict: "activity_name" })
        .select("*");

      if (error) throw error;

      return ok({
        imported: data?.length || rows.length,
        activities: data || [],
      });
    } catch (error: any) {
      return fail(
        error?.message || "Gagal mengimpor Master Workout.",
        500,
      );
    }
  }

  const activityName = String(
    body.activity_name || body.activityName || "",
  ).trim();
  if (!activityName) return fail("Nama aktivitas wajib diisi.");

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("wellness_activity_calories")
      .upsert(
        {
          activity_name: activityName,
          met: Number(body.met || 0) || null,
          calories_per_km: Number(body.calories_per_km || 0) || null,
          unit: String(body.unit || "menit").trim(),
          category: String(body.category || "").trim() || null,
        },
        { onConflict: "activity_name" },
      )
      .select("*")
      .single();

    if (error) throw error;
    return ok({ activity: data });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan referensi aktivitas.", 500);
  }
}
