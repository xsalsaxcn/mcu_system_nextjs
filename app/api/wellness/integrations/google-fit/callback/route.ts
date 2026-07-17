import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import { loadParticipantControl } from "@/lib/wellness/participantControls";

// WELLNESS_GOOGLE_FIT_CALLBACK_V388
// WELLNESS_GOOGLE_FIT_SINGLE_SOURCE_CALLBACK_V79F
// Callback Google Fit menyimpan token ke wellness_integrations provider google_fit.

function clean(value: any) {
  return String(value ?? "").trim();
}

function appSecret() {
  return clean(process.env.APP_SECRET);
}

function signState(payload: string) {
  return crypto.createHmac("sha256", appSecret()).update(payload).digest("hex");
}

function portalUrl(req: NextRequest, notice: string) {
  const url = new URL("/wellness/portal", req.nextUrl.origin);
  url.searchParams.set("notice", notice);
  return url;
}

function decodeState(state: string) {
  const [encoded, sig] = clean(state).split(".");
  if (!encoded || !sig) return null;

  const expected = signState(encoded);
  if (sig !== expected) return null;

  const json = Buffer.from(encoded, "base64url").toString("utf8");
  const payload = JSON.parse(json);

  const ageMs = Date.now() - Number(payload.ts || 0);
  if (!Number.isFinite(ageMs) || ageMs > 30 * 60 * 1000) return null;

  return payload;
}

async function exchangeGoogleToken(req: NextRequest, code: string) {
  const clientId =
    clean(process.env.GOOGLE_FIT_CLIENT_ID) ||
    clean(process.env.GOOGLE_CLIENT_ID);

  const clientSecret =
    clean(process.env.GOOGLE_FIT_CLIENT_SECRET) ||
    clean(process.env.GOOGLE_CLIENT_SECRET);

  const callbackUrl = `${req.nextUrl.origin}/api/wellness/integrations/google-fit/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_FIT_ENV_MISSING");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error_description ||
        data?.error ||
        "GOOGLE_FIT_TOKEN_EXCHANGE_FAILED"
    );
  }

  return data;
}

async function fetchGoogleProfile(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) return null;

  return data;
}

export async function GET(req: NextRequest) {
  const code = clean(req.nextUrl.searchParams.get("code"));
  const state = clean(req.nextUrl.searchParams.get("state"));
  const error = clean(req.nextUrl.searchParams.get("error"));

  if (error) {
    return NextResponse.redirect(portalUrl(req, `GOOGLE_FIT_DENIED_${error}`));
  }

  if (!code || !state) {
    return NextResponse.redirect(portalUrl(req, "GOOGLE_FIT_CALLBACK_INVALID"));
  }

  if (!appSecret()) {
    return NextResponse.redirect(portalUrl(req, "APP_SECRET_MISSING"));
  }

  const payload = decodeState(state);

  if (!payload?.participant_id) {
    return NextResponse.redirect(portalUrl(req, "GOOGLE_FIT_STATE_INVALID"));
  }

  const participantId = Number(payload.participant_id);

  if (!Number.isFinite(participantId) || participantId <= 0) {
    return NextResponse.redirect(portalUrl(req, "GOOGLE_FIT_PARTICIPANT_INVALID"));
  }

  const supabase = getSupabaseAdmin();
  const control = await loadParticipantControl(supabase, participantId);
  if (!control.fitness_enabled || control.fitness_source !== "google_fit") {
    return NextResponse.redirect(
      portalUrl(req, "FITNESS_SOURCE_GOOGLE_FIT_NOT_ACTIVE"),
    );
  }

  const sessionParticipant = await getParticipantFromPortalSession(
    supabase,
    req
  ).catch(() => null);

  const { data: existing } = await supabase
    .from("wellness_integrations")
    .select("*")
    .eq("participant_id", participantId)
    .eq("provider", "google_fit")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const tokenData = await exchangeGoogleToken(req, code).catch((err) => {
    console.error("GOOGLE_FIT_TOKEN_ERROR", err);
    return null;
  });

  if (!tokenData?.access_token) {
    return NextResponse.redirect(
      portalUrl(req, "GOOGLE_FIT_TOKEN_EXCHANGE_FAILED")
    );
  }

  const refreshToken = clean(tokenData.refresh_token) || clean(existing?.refresh_token);

  if (!refreshToken) {
    return NextResponse.redirect(
      portalUrl(req, "GOOGLE_FIT_REFRESH_TOKEN_MISSING")
    );
  }

  const profile = await fetchGoogleProfile(tokenData.access_token).catch(() => null);

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
    : null;

  const providerUserId =
    clean(profile?.sub) ||
    clean(profile?.email) ||
    `participant_${participantId}`;

  await supabase
    .from("wellness_integrations")
    .update({ is_active: 0, updated_at: new Date().toISOString() })
    .eq("participant_id", participantId)
    .eq("provider", "health_connect");

  await supabase
    .from("wellness_integrations")
    .delete()
    .eq("participant_id", participantId)
    .eq("provider", "google_fit");

  if (providerUserId) {
    await supabase
      .from("wellness_integrations")
      .delete()
      .eq("provider", "google_fit")
      .eq("provider_user_id", providerUserId);
  }

  const insertPayload: any = {
    participant_id: participantId,
    provider: "google_fit",
    provider_user_id: providerUserId,
    scope: clean(tokenData.scope),
    access_token: tokenData.access_token,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    token_type: clean(tokenData.token_type) || "Bearer",
    is_active: 1,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    raw_payload: {
      profile,
      scope: tokenData.scope || null,
      token_type: tokenData.token_type || null,
      expires_in: tokenData.expires_in || null,
    },
  };

  const { error: insertError } = await supabase
    .from("wellness_integrations")
    .insert(insertPayload);

  if (insertError) {
    console.error("GOOGLE_FIT_INTEGRATION_INSERT_ERROR", insertError);

    return NextResponse.redirect(portalUrl(req, "GOOGLE_FIT_SAVE_FAILED"));
  }

  const url = portalUrl(req, "GOOGLE_FIT_CONNECTED");
  url.searchParams.set("participant_id", String(participantId));

  if (sessionParticipant?.id && Number(sessionParticipant.id) !== participantId) {
    url.searchParams.set("session_warning", "DIFFERENT_PORTAL_SESSION");
  }

  return NextResponse.redirect(url);
}