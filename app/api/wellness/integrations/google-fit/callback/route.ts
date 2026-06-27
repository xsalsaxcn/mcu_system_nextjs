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
    redirect.searchParams.set("notice", `GOOGLE_FIT_${error}`);
    return NextResponse.redirect(redirect);
  }
  if (!code || !state?.participant_id) {
    redirect.searchParams.set("notice", "GOOGLE_FIT_CALLBACK_INVALID");
    return NextResponse.redirect(redirect);
  }

  try {
    const clientId = process.env.GOOGLE_FIT_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_FIT_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("GOOGLE_FIT_CLIENT_ID/GOOGLE_FIT_CLIENT_SECRET belum diisi.");

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${origin}/api/wellness/integrations/google-fit/callback`,
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenJson?.error_description || tokenJson?.error || "Gagal exchange token Google Fit.");

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const profile = await profileRes.json().catch(() => ({}));

    const supabase = getSupabaseAdmin();
    const { error: upsertError } = await supabase.from("wellness_integrations").upsert({
      participant_id: state.participant_id,
      provider: "google_fit",
      provider_user_id: String(profile.id || profile.email || ""),
      access_token_encrypted: encryptToken(tokenJson.access_token),
      refresh_token_encrypted: encryptToken(tokenJson.refresh_token),
      expires_at: tokenJson.expires_in ? new Date(Date.now() + Number(tokenJson.expires_in) * 1000).toISOString() : null,
      scope: tokenJson.scope || "https://www.googleapis.com/auth/fitness.activity.read",
      is_active: true,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      raw_profile: profile,
    }, { onConflict: "participant_id,provider" });
    if (upsertError) throw upsertError;

    redirect.searchParams.set("notice", "GOOGLE_FIT_CONNECTED");
    return NextResponse.redirect(redirect);
  } catch (err: any) {
    redirect.searchParams.set("notice", err?.message || "GOOGLE_FIT_CALLBACK_ERROR");
    return NextResponse.redirect(redirect);
  }
}
