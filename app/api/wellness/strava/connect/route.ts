// WELLNESS_PORTAL_USER_STRAVA_V347
// Wellness-only Strava OAuth starter. No token is stored here.

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const clientId = process.env.STRAVA_CLIENT_ID || process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
  const origin = url.origin;
  const participantId = url.searchParams.get("participantId") || "wellness-user";

  if (!clientId) {
    const fallback = new URL("/wellness/portal", origin);
    fallback.searchParams.set("strava", "demo");
    fallback.searchParams.set("notice", "STRAVA_CLIENT_ID_NOT_SET");
    return NextResponse.redirect(fallback);
  }

  const authorizeUrl = new URL("https://www.strava.com/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", `${origin}/api/wellness/strava/callback`);
  authorizeUrl.searchParams.set("approval_prompt", "auto");
  authorizeUrl.searchParams.set("scope", "read,activity:read_all");
  authorizeUrl.searchParams.set("state", participantId);

  return NextResponse.redirect(authorizeUrl);
}
