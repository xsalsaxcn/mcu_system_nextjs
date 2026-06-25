// WELLNESS_PORTAL_USER_STRAVA_V347
// Wellness-only Strava callback. This marks the portal as connected without touching other modules.

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const scope = url.searchParams.get("scope") || "";
  const state = url.searchParams.get("state") || "";
  const error = url.searchParams.get("error");

  const redirect = new URL("/wellness/portal", origin);
  if (error) {
    redirect.searchParams.set("strava", "error");
    redirect.searchParams.set("message", error);
    return NextResponse.redirect(redirect);
  }

  if (!code) {
    redirect.searchParams.set("strava", "error");
    redirect.searchParams.set("message", "NO_CODE");
    return NextResponse.redirect(redirect);
  }

  redirect.searchParams.set("strava", "connected");
  redirect.searchParams.set("scope", scope);
  if (state) redirect.searchParams.set("participantId", state);
  return NextResponse.redirect(redirect);
}
