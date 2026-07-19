import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { canManageWellness } from "@/lib/wellness/auth";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

// WELLNESS_FOOD_MASTER_PARTICIPANT_READ_V82
// Participant portal may read the existing calorie master, while write/import
// access remains restricted to Wellness administrators.

function clean(value: any) {
  return String(value ?? "").trim();
}

function portionMultiplier(value: any) {
  const text = clean(value).toLowerCase().replace(/\s+/g, "");
  if (!text || text === "1" || text === "1porsi" || text === "1portion") return 1;
  if (text === "1/2" || text === "0.5" || text === "0,5") return 0.5;
  if (text === "1/3") return 1 / 3;
  if (text === "1/4" || text === "0.25" || text === "0,25") return 0.25;
  const numeric = Number(text.replace(",", "."));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

function normalizeFoodInput(item: any) {
  const foodName = clean(
    item?.food_name ||
      item?.foodName ||
      item?.name ||
      item?.nama_makanan ||
      item?.["Nama Makanan"],
  );
  const caloriesRaw = Number(
    String(
      item?.calories ??
        item?.calorie ??
        item?.kalori ??
        item?.kkal ??
        item?.["Kalori"] ??
        0,
    )
      .replace(/\s+/g, "")
      .replace(/\./g, "")
      .replace(",", "."),
  );
  const multiplier = portionMultiplier(
    item?.portion ||
      item?.porsi ||
      item?.portion_reference ||
      item?.porsi_acuan ||
      item?.["Porsi"],
  );
  const calories =
    Number.isFinite(caloriesRaw) && caloriesRaw > 0
      ? Math.round((caloriesRaw / multiplier) * 100) / 100
      : 0;

  return {
    food_name: foodName,
    calories,
    category:
      clean(item?.category || item?.kategori || item?.["Kategori"]) || null,
    aliases:
      clean(
        item?.aliases ||
          item?.alias ||
          item?.sinonim ||
          item?.["Alias"] ||
          item?.["Sinonim"],
      ) || null,
    is_active: 1,
  };
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);

  try {
    const supabase = getSupabaseAdmin();
    if (!user) {
      const participant = await getParticipantFromPortalSession(supabase, req).catch(
        () => null,
      );
      if (!participant) return fail("Unauthorized", 401);
    }

    const q = clean(req.nextUrl.searchParams.get("q"));
    const limit = Math.min(
      Math.max(Number(req.nextUrl.searchParams.get("limit") || 500), 1),
      2000,
    );

    let query = supabase
      .from("wellness_food_calories")
      .select("*")
      .eq("is_active", 1)
      .order("food_name", { ascending: true })
      .limit(limit);
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
  const requestedItems = Array.isArray(body?.foods) ? body.foods : [body];
  const normalized = requestedItems
    .map(normalizeFoodInput)
    .filter((item: any) => item.food_name && item.calories > 0);

  if (normalized.length === 0) {
    return fail("Nama makanan dan kalori wajib diisi.");
  }

  // The existing table stores calories per one full portion. Imported values
  // that use 1/2, 1/3, or 1/4 portions are normalized before the upsert.
  const deduped = Array.from(
    new Map(
      normalized.map((item: any) => [item.food_name.toLowerCase(), item]),
    ).values(),
  );

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("wellness_food_calories")
      .upsert(deduped, { onConflict: "food_name" })
      .select("*");
    if (error) throw error;

    if (Array.isArray(body?.foods)) {
      return ok({
        foods: data || [],
        imported_count: data?.length || deduped.length,
        skipped_count: Math.max(0, requestedItems.length - deduped.length),
        message: `${data?.length || deduped.length} master nutrisi berhasil diimpor.`,
      });
    }

    return ok({ food: Array.isArray(data) ? data[0] : data });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan referensi makanan.", 500);
  }
}
