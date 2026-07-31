// WELLNESS_PARTICIPANT_CANONICAL_STREAK_V126M23_1
// Read-only participant endpoint using the same streak builder as Coach.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import {
  filterActivityRowsByFitnessSource,
  loadParticipantControlMap,
} from "@/lib/wellness/participantControls";
import { loadCanonicalNutritionHistory } from "@/lib/wellness/nutritionHistory";
import { resolveParticipantPointTargets } from "@/lib/wellness/pointWriter";
import { filterOperationalRowsForProgram } from "@/lib/wellness/programWindow";
import { buildWellnessStreakSummary } from "@/lib/wellness/streak";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

    const participantId = Number(participant.id);
    const [activityResult, controlMap, nutritionHistory, targets] =
      await Promise.all([
        supabase
          .from("wellness_activity_logs")
          .select("*")
          .eq("participant_id", participantId)
          .order("log_date", { ascending: true })
          .limit(2000),
        loadParticipantControlMap(supabase, [participantId]),
        loadCanonicalNutritionHistory({ supabase, participant }),
        resolveParticipantPointTargets(supabase, participant),
      ]);

    const activityRows = filterOperationalRowsForProgram(
      participant,
      filterActivityRowsByFitnessSource(
        activityResult.error ? [] : activityResult.data || [],
        controlMap,
      ),
      "",
      "",
      ["log_date", "started_at", "created_at"],
    );

    const nutritionRows = filterOperationalRowsForProgram(
      participant,
      nutritionHistory.logs || [],
      "",
      "",
      ["log_date", "created_at"],
    );

    const streak = buildWellnessStreakSummary({
      nutritionRows,
      activityRows,
      workoutTargetCalories: targets.workout,
    });

    return NextResponse.json({
      ok: true,
      participant_id: participantId,
      streak,
      targets: {
        nutrition_max_calories: targets.nutrition,
        workout_min_calories: targets.workout,
      },
      sources: {
        nutrition: nutritionHistory.sources,
        activity_ok: !activityResult.error,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || "Gagal menghitung streak peserta.",
      },
      { status: 500 },
    );
  }
}
