// WELLNESS_JAKVAS_REPORT_V1_COACH
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import {
  buildCoachGroupUnitMap,
  canCoachAccessParticipant,
} from "@/lib/wellness/coachGroupAccess";
import { loadParticipantJakvasReport } from "@/lib/wellness/jakvasServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value ?? "").trim();
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
  if (error || !data?.coach || data.coach.is_active === false) return null;
  return data.coach;
}

export async function GET(request: NextRequest) {
  try {
    const participantId = Number(request.nextUrl.searchParams.get("participant_id") || 0);
    if (!(participantId > 0)) return fail("participant_id wajib diisi.", 400);

    const supabase = getSupabaseAdmin();
    const coach = await getCoach(request, supabase);
    if (!coach) return fail("Session coach belum aktif.", 401);

    const [{ data: assignments, error: assignmentError }, { data: groupUnits, error: groupUnitError }, participantResult] = await Promise.all([
      supabase
        .from("wellness_coach_group_assignments")
        .select("*")
        .eq("coach_user_id", coach.id)
        .eq("is_active", true),
      supabase.from("wellness_group_units").select("*").limit(5000),
      supabase.from("wellness_participants").select("*").eq("id", participantId).maybeSingle(),
    ]);

    if (assignmentError) throw assignmentError;
    if (groupUnitError) throw groupUnitError;
    if (participantResult.error || !participantResult.data) return fail("Peserta tidak ditemukan.", 404);

    const groupUnitMap = buildCoachGroupUnitMap(groupUnits || []);
    if (!canCoachAccessParticipant(participantResult.data, assignments || [], groupUnitMap)) {
      return fail("Peserta tidak termasuk assigned group coach.", 403);
    }

    const report = await loadParticipantJakvasReport({
      supabase,
      participant: participantResult.data,
    });

    return ok({ jakvas: report, coach_id: clean(coach.id) });
  } catch (error: any) {
    return fail(error?.message || "Laporan JAKVAS Coach gagal dimuat.", 500);
  }
}
