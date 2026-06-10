import { NextRequest, NextResponse } from "next/server";
import { fail } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getAllowedWellnessParticipants } from "@/app/api/wellness/_utils";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const clientId = process.env.STRAVA_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  if (!clientId) return fail("STRAVA_CLIENT_ID belum diset. Integrasi Strava bersifat opsional.", 400);

  try {
    const supabase = getSupabaseAdmin();
    const participants = await getAllowedWellnessParticipants(supabase, user);
    const participant = participants.find((p: any) => Number(p.user_id) === Number(user.id)) || participants[0];
    if (!participant) return fail("Profil Wellness belum dibuat.", 404);

    const { data: consent, error: consentError } = await supabase
      .from("wellness_strava_consents")
      .select("approved,revoked_at")
      .eq("participant_id", participant.id)
      .maybeSingle();

    if (consentError && !String(consentError.message || "").toLowerCase().includes("does not exist")) throw consentError;
    if (!consent || consent.approved !== 1 || consent.revoked_at) {
      return NextResponse.redirect(`${req.nextUrl.origin}/wellness/strava-approval`);
    }
  } catch (error: any) {
    return fail(error?.message || "Gagal memeriksa persetujuan Strava.", 500);
  }

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
