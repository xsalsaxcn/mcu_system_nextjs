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

// WELLNESS_NUTRITION_RELEVANCE_SEARCH_V126M105
// Autocomplete must search across the full active master without downloading
// the full table to the participant browser. The normal paginated master API
// remains unchanged unless mode=suggest is explicitly requested.
function normalizeFoodSearchTextV126M105(value: any) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function foodSuggestionServerScoreV126M105(item: any, rawQuery: string) {
  const query = normalizeFoodSearchTextV126M105(rawQuery);
  const name = normalizeFoodSearchTextV126M105(item?.food_name);
  const aliases = normalizeFoodSearchTextV126M105(item?.aliases);

  if (!query || !name) return 0;

  const nameTokens = name.split(" ").filter(Boolean);
  const extraWordPenalty = Math.min(Math.max(nameTokens.length - 1, 0) * 3, 45);

  // Single food / exact master row always wins. Then simple variants whose
  // names start with the requested food. Combination foods come afterwards.
  if (name === query) return 1000;
  if (name.startsWith(`${query} `)) return 900 - extraWordPenalty;
  if (name.startsWith(query)) return 860 - extraWordPenalty;
  if (nameTokens.includes(query)) return 760 - extraWordPenalty;
  if (name.includes(query)) return 700 - extraWordPenalty;

  const aliasTokens = aliases.split(" ").filter(Boolean);
  if (aliases === query) return 620;
  if (aliases.startsWith(`${query} `) || aliases.startsWith(query)) return 590;
  if (aliasTokens.includes(query)) return 560;
  if (aliases.includes(query)) return 530;

  return 0;
}

async function loadFoodSuggestionsV126M105(supabase: any, rawQuery: string) {
  const safeQuery = clean(rawQuery)
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!safeQuery) return [];

  const normalizedQuery = normalizeFoodSearchTextV126M105(safeQuery);

  async function runPrefix(pattern: string, limit: number) {
    const result = await supabase
      .from("wellness_food_calories")
      .select("*")
      .eq("is_active", 1)
      .ilike("food_name", pattern)
      .order("food_name", { ascending: true })
      .limit(limit);

    if (result.error) throw result.error;
    return Array.isArray(result.data) ? result.data : [];
  }

  async function runBroad(pattern: string, limit: number) {
    const result = await supabase
      .from("wellness_food_calories")
      .select("*")
      .eq("is_active", 1)
      .or(`food_name.ilike.${pattern},aliases.ilike.${pattern}`)
      .order("food_name", { ascending: true })
      .limit(limit);

    if (result.error) throw result.error;
    return Array.isArray(result.data) ? result.data : [];
  }

  // One character remains supported using only a lightweight prefix lookup.
  // From two characters onward only one additional bounded broad lookup is
  // added. This is intentionally lighter than downloading/paging the master.
  const requests: Promise<any[]>[] = [
    runPrefix(`${safeQuery}%`, 80),
  ];

  if (normalizedQuery.length >= 2) {
    requests.push(runBroad(`%${safeQuery}%`, 160));
  }

  const groups = await Promise.all(requests);
  const seen = new Set<string>();
  const merged: any[] = [];

  for (const row of groups.flat()) {
    const id = Number(row?.id || 0);
    const key = id > 0
      ? `id:${id}`
      : `name:${normalizeFoodSearchTextV126M105(row?.food_name)}`;

    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }

  return merged
    .map((item: any) => ({
      item,
      score: foodSuggestionServerScoreV126M105(item, safeQuery),
      normalizedName: normalizeFoodSearchTextV126M105(item?.food_name),
    }))
    .filter((entry: any) => entry.score > 0)
    .sort((left: any, right: any) => {
      if (right.score !== left.score) return right.score - left.score;

      const leftWords = left.normalizedName.split(" ").filter(Boolean).length;
      const rightWords = right.normalizedName.split(" ").filter(Boolean).length;
      if (leftWords !== rightWords) return leftWords - rightWords;

      if (left.normalizedName.length !== right.normalizedName.length) {
        return left.normalizedName.length - right.normalizedName.length;
      }

      return clean(left.item?.food_name).localeCompare(
        clean(right.item?.food_name),
        "id",
      );
    })
    .slice(0, 100)
    .map((entry: any) => entry.item);
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

// WELLNESS_MASTER_SERVER_PAGINATION_V126J
export async function GET(req: NextRequest) {
  const user = getSessionUser(req);

  try {
    const supabase = getSupabaseAdmin();

    if (!user) {
      const participant = await getParticipantFromPortalSession(
        supabase,
        req,
      ).catch(() => null);

      if (!participant) return fail("Unauthorized", 401);
    }

    const q = clean(req.nextUrl.searchParams.get("q"));
    const mode = clean(req.nextUrl.searchParams.get("mode")).toLowerCase();

    // WELLNESS_NUTRITION_RELEVANCE_SEARCH_V126M105
    // Participant autocomplete gets relevance-ranked candidates from the full
    // master. Admin/master pagination below is intentionally left untouched.
    if (mode === "suggest" && q) {
      const foods = await loadFoodSuggestionsV126M105(supabase, q);

      return ok({
        foods,
        suggestion_mode: true,
        pagination: {
          page: 1,
          page_size: foods.length,
          total: foods.length,
          total_pages: 1,
          from: foods.length > 0 ? 1 : 0,
          to: foods.length,
        },
      });
    }

    const page = Math.max(
      Number(req.nextUrl.searchParams.get("page") || 1),
      1,
    );

    const pageSize = Math.min(
      Math.max(
        Number(req.nextUrl.searchParams.get("page_size") || 100),
        10,
      ),
      200,
    );

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("wellness_food_calories")
      .select("*", { count: "exact" })
      .eq("is_active", 1)
      .order("food_name", { ascending: true })
      .range(from, to);

    if (q) {
      const safeQ = q.replace(/[,%()]/g, " ").trim();

      if (safeQ) {
        query = query.or(
          `food_name.ilike.%${safeQ}%,category.ilike.%${safeQ}%,aliases.ilike.%${safeQ}%`,
        );
      }
    }

    const { data, error, count } = await query;

    if (error) throw error;

    const total = Number(count || 0);

    return ok({
      foods: data || [],
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.max(Math.ceil(total / pageSize), 1),
        from: total > 0 ? from + 1 : 0,
        to: total > 0 ? Math.min(to + 1, total) : 0,
      },
    });
  } catch (error: any) {
    return fail(
      error?.message || "Gagal memuat referensi makanan.",
      500,
    );
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
