import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import {
  canonicalNutritionCalories,
  canonicalNutritionJakartaDate,
  loadCanonicalNutritionHistory,
} from "@/lib/wellness/nutritionHistory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// WELLNESS_CANONICAL_NUTRITION_HISTORY_V105
// Participant history now uses the same canonical loader as Coach and Admin.

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const participant = await getParticipantFromPortalSession(supabase, request);

    if (!participant?.id) {
      return NextResponse.json(
        { ok: false, message: "OTP/session peserta belum aktif." },
        { status: 401 },
      );
    }

    const requestedId = asNumber(
      request.nextUrl.searchParams.get("participant_id"),
    );
    const participantId = asNumber(participant.id);

    if (requestedId > 0 && requestedId !== participantId) {
      return NextResponse.json(
        { ok: false, message: "Peserta tidak memiliki akses ke history ini." },
        { status: 403 },
      );
    }

    const participantResult = await supabase
      .from("wellness_participants")
      .select("*")
      .eq("id", participantId)
      .maybeSingle();
    const fullParticipant = participantResult?.data || participant;

    const history = await loadCanonicalNutritionHistory({
      supabase,
      participant: fullParticipant,
    });
    const today = canonicalNutritionJakartaDate();
    const logs = history.logs || [];
    const todayLogs = logs.filter(
      (item: any) => clean(item?.log_date).slice(0, 10) === today,
    );
    const todayCalories = todayLogs.reduce(
      (sum: number, item: any) => sum + canonicalNutritionCalories(item),
      0,
    );
    const todayItemCount = todayLogs.reduce(
      (sum: number, item: any) =>
        sum + Math.max(asNumber(item?.item_count), 1),
      0,
    );

    return NextResponse.json({
      ok: true,
      participant_id: participantId,
      participant: fullParticipant,
      today,
      logs,
      today_logs: todayLogs,
      latest_logs: logs.slice(0, 8),
      today_count: todayItemCount,
      today_row_count: todayLogs.length,
      today_calories: todayCalories,
      has_today_data: todayLogs.length > 0,
      sources: history.sources,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal memuat nutrisi." },
      { status: 500 },
    );
  }
}
