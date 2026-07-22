import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import {
  canonicalNutritionCalories,
  canonicalNutritionDate,
  loadCanonicalNutritionHistory,
} from "@/lib/wellness/nutritionHistory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// WELLNESS_ADMIN_CANONICAL_NUTRITION_DETAIL_V105

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "supervisor",
  "doctor",
  "wellness_admin",
]);

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildDailyCalories(logs: any[]) {
  const byDate = new Map<string, number>();

  for (const log of logs || []) {
    const date = canonicalNutritionDate(log?.log_date || log?.created_at);
    if (!date) continue;
    byDate.set(
      date,
      (byDate.get(date) || 0) + canonicalNutritionCalories(log),
    );
  }

  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, calories]) => ({
      date,
      label: date.slice(5).split("-").reverse().join("/"),
      calories: Math.round(calories * 10) / 10,
    }));
}

export async function GET(request: NextRequest) {
  try {
    const user: any = getSessionUser(request);
    if (!user) return fail("Session Admin belum aktif.", 401);

    const role = clean(user.role).toLowerCase();
    if (!ADMIN_ROLES.has(role)) {
      return fail("Akun ini tidak memiliki akses Portal Admin.", 403);
    }

    const participantId = asNumber(
      request.nextUrl.searchParams.get("participant_id"),
    );
    if (!participantId) return fail("participant_id wajib diisi.", 400);

    const supabase = getSupabaseAdmin();
    const participantResult = await supabase
      .from("wellness_participants")
      .select("*")
      .eq("id", participantId)
      .maybeSingle();

    if (participantResult.error || !participantResult.data) {
      return fail("Peserta tidak ditemukan.", 404);
    }

    const history = await loadCanonicalNutritionHistory({
      supabase,
      participant: participantResult.data,
    });
    const logs = history.logs || [];

    return ok({
      participant: {
        id: participantId,
        name: clean(
          participantResult.data.name ||
            participantResult.data.employee_name ||
            participantResult.data.full_name,
        ),
        code: clean(
          participantResult.data.code ||
            participantResult.data.employee_code ||
            participantResult.data.no_karyawan,
        ),
      },
      nutrition: {
        logs,
        total_logs: logs.length,
        total_calories: logs.reduce(
          (sum: number, item: any) =>
            sum + canonicalNutritionCalories(item),
          0,
        ),
        daily_calories: buildDailyCalories(logs),
        sources: history.sources,
      },
    });
  } catch (error: any) {
    return fail(
      error?.message || "Detail nutrisi peserta gagal dimuat.",
      500,
    );
  }
}
