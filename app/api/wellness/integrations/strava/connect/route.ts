// WELLNESS_PARTICIPANT_OTP_STRAVA_GFIT_V376

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession, signedState } from "@/lib/wellness/portalAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const failBack = new URL("/wellness/portal", origin);

  try {
    const supabase = getSupabaseAdmin();
    const participant = await getParticipantFromPortalSession(supabase, req);
    if (!participant) {
      failBack.searchParams.set("notice", "OTP_REQUIRED");
      return NextResponse.redirect(failBack);
    }

    const clientId = process.env.STRAVA_CLIENT_ID || process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
    if (!clientId) {
      failBack.searchParams.set("notice", "STRAVA_CLIENT_ID_NOT_SET");
      return NextResponse.redirect(failBack);
    }

    const authorizeUrl = new URL("https://www.strava.com/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", `${origin}/api/wellness/integrations/strava/callback`);
    authorizeUrl.searchParams.set("approval_prompt", "auto");
    authorizeUrl.searchParams.set("scope", "read,activity:read_all");
    authorizeUrl.searchParams.set("state", signedState({ provider: "strava", participant_id: participant.id, ts: Date.now() }));

    return NextResponse.redirect(authorizeUrl);
  } catch (error: any) {
    failBack.searchParams.set("notice", error?.message || "STRAVA_CONNECT_ERROR");
    return NextResponse.redirect(failBack);
  }
}
