// WELLNESS_PARTICIPANT_CANONICAL_STREAK_V126M23_1
// WELLNESS_PARTICIPANT_STREAK_INITIAL_DELIVERY_V126M26_1
// Read-only refresh endpoint. Initial portal hydration comes from /participant/me.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import { loadParticipantCanonicalStreak } from "@/lib/wellness/participantStreakServer";

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
    const requestedParticipantId = Number(
      request.nextUrl.searchParams.get("participant_id") || 0,
    );

    if (
      requestedParticipantId > 0 &&
      requestedParticipantId !== participantId
    ) {
      return NextResponse.json(
        { ok: false, message: "Session peserta tidak sesuai." },
        { status: 403 },
      );
    }

    const payload = await loadParticipantCanonicalStreak({
      supabase,
      participant,
    });

    return NextResponse.json(
      {
        ok: true,
        participant_id: payload.participant_id,
        streak: payload.streak,
        targets: payload.targets,
        sources: payload.sources,
        status: payload.status,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
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
