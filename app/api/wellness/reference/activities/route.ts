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
  const activityName = String(body.activity_name || body.activityName || "").trim();
  if (!activityName) return fail("Nama aktivitas wajib diisi.");

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("wellness_activity_calories").upsert({
      activity_name: activityName,
      met: Number(body.met || 0) || null,
      calories_per_km: Number(body.calories_per_km || 0) || null,
      unit: String(body.unit || "menit").trim(),
      category: String(body.category || "").trim() || null,
    }, { onConflict: "activity_name" }).select("*").single();
    if (error) throw error;
    return ok({ activity: data });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan referensi aktivitas.", 500);
  }
}
