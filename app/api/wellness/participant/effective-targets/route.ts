// WELLNESS_PARTICIPANT_EFFECTIVE_TARGETS_V126M61_1
// Authenticated participant READ-ONLY effective target endpoint.
// Mirrors the same effective-dated helper used by Admin/Coach audit.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import {
  buildEffectiveTargetTimeline,
  effectiveTargetsForDate,
  effectiveTargetRevisionForDate,
} from "@/lib/wellness/effectiveDatedTargets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clean(value: any) {
  return String(value ?? "").trim();
}

function num(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function jakartaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${map.get("year")}-${map.get("month")}-${map.get("day")}`;
}

function json(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const participant = await getParticipantFromPortalSession(supabase, request);

    if (!participant?.id) {
      return json({ ok: false, message: "Session peserta belum aktif." }, 401);
    }

    const participantId = Number(participant.id);
    const requestedId = num(request.nextUrl.searchParams.get("participant_id"));

    if (requestedId > 0 && requestedId !== participantId) {
      return json({ ok: false, message: "Session peserta tidak sesuai." }, 403);
    }

    // Deliberately load all participant notes, exactly like the V126M60 audit.
    // buildEffectiveTargetTimeline decides which rows are target revisions.
    const noteResult = await supabase
      .from("wellness_coach_notes")
      .select("*")
      .eq("participant_id", participantId)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (noteResult.error) throw noteResult.error;

    const effectiveDate = jakartaToday();
    const timeline = buildEffectiveTargetTimeline({
      participant,
      notes: noteResult.data || [],
    });
    const target = effectiveTargetsForDate(timeline, effectiveDate);
    const revision = effectiveTargetRevisionForDate(timeline, effectiveDate);

    return json({
      ok: true,
      marker: "WELLNESS_PARTICIPANT_EFFECTIVE_TARGETS_V126M61_1",
      read_only: true,
      participant_id: participantId,
      code: clean(
        participant.code ||
          participant.employee_code ||
          participant.no_karyawan,
      ),
      effective_date: effectiveDate,
      targets: {
        nutrition_max_calories: num(target?.nutrition),
        workout_min_calories: num(target?.workout),
        daily_step_target: num(target?.steps),
        duration_minutes: num(target?.duration_minutes),
        target_weight_kg: num(target?.weight_kg),
      },
      revision: revision || null,
    });
  } catch (error: any) {
    return json(
      {
        ok: false,
        marker: "WELLNESS_PARTICIPANT_EFFECTIVE_TARGETS_V126M61_1",
        read_only: true,
        message: error?.message || "Gagal membaca target efektif peserta.",
      },
      500,
    );
  }
}
