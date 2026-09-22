// WELLNESS_COACH_SNAPSHOT_PERFORMANCE_V1
// Authenticated Coach refresh. Performance-only; no Wellness rules are defined here.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildCoachGroupUnitMap,
  canCoachAccessParticipant,
  dedupeCoachParticipants,
} from "@/lib/wellness/coachGroupAccess";
import { syncCoachSnapshots } from "@/lib/wellness/coachSnapshotServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Supabase admin env is missing.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getCoach(request: NextRequest, supabase: any) {
  const token = request.cookies.get("wellness_coach_session")?.value || "";
  if (!token) return null;

  const { data, error } = await supabase
    .from("wellness_coach_auth_sessions")
    .select("*, coach:wellness_coach_users(*)")
    .eq("session_token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data || !data.coach || data.coach.is_active === false) return null;
  return data.coach;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = adminClient();
    const coach = await getCoach(request, supabase);
    if (!coach) {
      return NextResponse.json(
        { ok: false, message: "Session coach belum aktif." },
        { status: 401 },
      );
    }

    const [assignmentResult, groupUnitResult, participantResult] = await Promise.all([
      supabase
        .from("wellness_coach_group_assignments")
        .select("*")
        .eq("coach_user_id", coach.id)
        .eq("is_active", true)
        .order("id", { ascending: true }),
      supabase.from("wellness_group_units").select("*").limit(5000),
      supabase.from("wellness_participants").select("*").limit(2000),
    ]);

    if (assignmentResult.error || groupUnitResult.error || participantResult.error) {
      const message =
        assignmentResult.error?.message ||
        groupUnitResult.error?.message ||
        participantResult.error?.message ||
        "Gagal membaca scope Coach.";
      return NextResponse.json({ ok: false, message }, { status: 500 });
    }

    const groupUnitMap = buildCoachGroupUnitMap(groupUnitResult.data || []);
    const participants = dedupeCoachParticipants(participantResult.data || []).filter(
      (row: any) =>
        canCoachAccessParticipant(
          row,
          assignmentResult.data || [],
          groupUnitMap,
        ),
    );

    // Five-minute guard prevents repeated logins/refreshes from launching the same
    // expensive canonical work. It does not affect the canonical calculation itself.
    const result = await syncCoachSnapshots({
      supabase,
      participants,
      maxAgeMinutes: 5,
      concurrency: 4,
    });

    return NextResponse.json({
      ok: result.ok,
      snapshot: {
        attempted: result.attempted,
        updated: result.updated,
        skipped_fresh: result.skipped_fresh,
        failed: result.failed,
        table_missing: result.table_missing === true,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal refresh snapshot Coach." },
      { status: 500 },
    );
  }
}
