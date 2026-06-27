// WELLNESS_PARTICIPANT_OTP_STRAVA_GFIT_V376
// Google Fit legacy OAuth starter. Google Fit APIs are deprecated in 2026;
// this remains for existing projects that already have Fit access.

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

    const clientId = process.env.GOOGLE_FIT_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      failBack.searchParams.set("notice", "GOOGLE_FIT_CLIENT_ID_NOT_SET");
      return NextResponse.redirect(failBack);
    }

    const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", `${origin}/api/wellness/integrations/google-fit/callback`);
    authorizeUrl.searchParams.set("access_type", "offline");
    authorizeUrl.searchParams.set("prompt", "consent");
    authorizeUrl.searchParams.set("scope", "https://www.googleapis.com/auth/fitness.activity.read");
    authorizeUrl.searchParams.set("state", signedState({ provider: "google_fit", participant_id: participant.id, ts: Date.now() }));

    return NextResponse.redirect(authorizeUrl);
  } catch (error: any) {
    failBack.searchParams.set("notice", error?.message || "GOOGLE_FIT_CONNECT_ERROR");
    return NextResponse.redirect(failBack);
  }
}
