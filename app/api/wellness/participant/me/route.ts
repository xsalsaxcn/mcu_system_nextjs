// WELLNESS_PARTICIPANT_OTP_STRAVA_GFIT_V376

import { NextRequest, NextResponse } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { clearPortalCookie, getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const participant = await getParticipantFromPortalSession(supabase, req);
    if (!participant) return fail("OTP/session peserta belum aktif.", 401);

    const { data: integrations } = await supabase
      .from("wellness_integrations")
      .select("provider,provider_user_id,scope,connected_at,last_sync_at,is_active")
      .eq("participant_id", participant.id)
      .eq("is_active", true);

    const { data: activities } = await supabase
      .from("wellness_activity_logs")
      .select("*")
      .eq("participant_id", participant.id)
      .order("log_date", { ascending: false })
      .limit(60);

    return ok({ participant, integrations: integrations || [], activities: activities || [] });
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat portal peserta.", 500);
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearPortalCookie(res);
  return res;
}
