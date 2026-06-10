import { NextRequest, NextResponse } from "next/server";
import { fail } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const clientId = process.env.STRAVA_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  if (!clientId) return fail("STRAVA_CLIENT_ID belum diset. Integrasi Strava bersifat opsional.", 400);

  const redirectUri = `${appUrl}/api/wellness/strava/callback`;
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", "read,activity:read_all");
  url.searchParams.set("state", String(user.id));

  return NextResponse.redirect(url.toString());
}
