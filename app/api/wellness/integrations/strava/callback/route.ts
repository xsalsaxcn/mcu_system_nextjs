// WELLNESS_PARTICIPANT_OTP_STRAVA_GFIT_V376

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { encryptToken, verifySignedState } from "@/lib/wellness/portalAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const redirect = new URL("/wellness/portal", origin);
  const code = url.searchParams.get("code") || "";
  const state = verifySignedState(url.searchParams.get("state") || "");
  const error = url.searchParams.get("error") || "";

  if (error) {
    redirect.searchParams.set("notice", `STRAVA_${error}`);
    return NextResponse.redirect(redirect);
  }

  if (!code || !state?.participant_id) {
    redirect.searchParams.set("notice", "STRAVA_CALLBACK_INVALID");
    return NextResponse.redirect(redirect);
  }

  try {
    const clientId = process.env.STRAVA_CLIENT_ID || process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("STRAVA_CLIENT_ID/STRAVA_CLIENT_SECRET belum diisi.");

    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenJson?.message || "Gagal exchange token Strava.");

    const supabase = getSupabaseAdmin();
    const athlete = tokenJson.athlete || {};
    const { error: upsertError } = await supabase.from("wellness_integrations").upsert({
      participant_id: state.participant_id,
      provider: "strava",
      provider_user_id: String(athlete.id || ""),
      access_token_encrypted: encryptToken(tokenJson.access_token),
      refresh_token_encrypted: encryptToken(tokenJson.refresh_token),
      expires_at: tokenJson.expires_at ? new Date(Number(tokenJson.expires_at) * 1000).toISOString() : null,
      scope: tokenJson.scope || "",
      is_active: true,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      raw_profile: athlete,
    }, { onConflict: "participant_id,provider" });
    if (upsertError) throw upsertError;

    redirect.searchParams.set("notice", "STRAVA_CONNECTED");
    return NextResponse.redirect(redirect);
  } catch (err: any) {
    redirect.searchParams.set("notice", err?.message || "STRAVA_CALLBACK_ERROR");
    return NextResponse.redirect(redirect);
  }
}
