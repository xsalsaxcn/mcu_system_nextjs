import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

// WELLNESS_STRAVA_CALLBACK_ACCEPTED_SCOPE_FIX_V419
// Fix:
// - Callback menyimpan scope yang benar-benar diterima dari Strava.
// - Scope bisa berbeda dari yang diminta karena user bisa uncheck izin.
// - Jika scope tidak punya activity:read / activity:read_all, status tetap tersimpan,
//   tapi sync akan memberi pesan reconnect dengan permission activity.
// - Token/refresh token terbaru disimpan sesuai rekomendasi Strava.

function clean(value: any) {
  return String(value ?? "").trim();
}

function appSecret() {
  return clean(process.env.APP_SECRET);
}

function signState(payload: string) {
  return crypto.createHmac("sha256", appSecret()).update(payload).digest("hex");
}

function normalizeScope(value: any) {
  return clean(value).replace(/\s+/g, ",");
}

function hasActivityReadScope(scope: any) {
  const normalized = `,${normalizeScope(scope)},`.toLowerCase();
  return (
    normalized.includes(",activity:read,") ||
    normalized.includes(",activity:read_all,")
  );
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

function portalUrl(req: NextRequest, notice: string) {
  const url = new URL("/wellness/portal", req.nextUrl.origin);
  url.searchParams.set("notice", notice);
  return url;
}

async function exchangeToken(req: NextRequest, code: string) {
  const clientId = clean(process.env.STRAVA_CLIENT_ID);
  const clientSecret = clean(process.env.STRAVA_CLIENT_SECRET);
  const callbackUrl = `${req.nextUrl.origin}/api/wellness/integrations/strava/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("STRAVA_ENV_MISSING");
  }

  const response = await fetch("https://www.strava.com/oauth/token", {
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
      data?.message || data?.error || "STRAVA_TOKEN_EXCHANGE_FAILED"
    );
  }

  return data;
}

export async function GET(req: NextRequest) {
  const code = clean(req.nextUrl.searchParams.get("code"));
  const state = clean(req.nextUrl.searchParams.get("state"));
  const error = clean(req.nextUrl.searchParams.get("error"));

  // Ini scope yang benar-benar disetujui user dari callback URL Strava.
  const acceptedScopeFromCallback = normalizeScope(
    req.nextUrl.searchParams.get("scope")
  );

  if (error) {
    return NextResponse.redirect(portalUrl(req, `STRAVA_DENIED_${error}`));
  }

  if (!code || !state) {
    return NextResponse.redirect(portalUrl(req, "STRAVA_CALLBACK_INVALID"));
  }

  if (!appSecret()) {
    return NextResponse.redirect(portalUrl(req, "APP_SECRET_MISSING"));
  }

  const payload = decodeState(state);

  if (!payload?.participant_id) {
    return NextResponse.redirect(portalUrl(req, "STRAVA_STATE_INVALID"));
  }

  const supabase = getSupabaseAdmin();

  // Session portal tetap dicek sebagai pengaman, tapi participant utama diambil dari signed state.
  const sessionParticipant = await getParticipantFromPortalSession(
    supabase,
    req
  ).catch(() => null);

  const participantId = Number(payload.participant_id);

  if (!Number.isFinite(participantId) || participantId <= 0) {
    return NextResponse.redirect(portalUrl(req, "STRAVA_PARTICIPANT_INVALID"));
  }

  const tokenData = await exchangeToken(req, code).catch((err) => {
    console.error("STRAVA_TOKEN_ERROR", err);
    return null;
  });

  if (!tokenData?.access_token || !tokenData?.refresh_token) {
    return NextResponse.redirect(portalUrl(req, "STRAVA_TOKEN_EXCHANGE_FAILED"));
  }

  const athleteId = clean(tokenData?.athlete?.id);

  // Strava bisa mengembalikan scope di callback URL atau token response.
  // Jangan pakai payload.scope sebagai source of truth, karena itu hanya scope yang diminta.
  const acceptedScope = normalizeScope(
    acceptedScopeFromCallback ||
      tokenData?.scope ||
      payload?.scope ||
      "read"
  );

  const expiresAt = tokenData.expires_at
    ? new Date(Number(tokenData.expires_at) * 1000).toISOString()
    : null;

  await supabase
    .from("wellness_integrations")
    .delete()
    .eq("provider", "strava")
    .eq("participant_id", participantId);

  if (athleteId) {
    await supabase
      .from("wellness_integrations")
      .delete()
      .eq("provider", "strava")
      .eq("provider_user_id", athleteId);
  }

  const nowIso = new Date().toISOString();

  const insertPayload: any = {
    participant_id: participantId,
    provider: "strava",
    provider_user_id: athleteId || null,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: expiresAt,
    scope: acceptedScope,
    is_active: 1,
    connected_at: nowIso,
    updated_at: nowIso,
    raw_payload: {
      marker: "WELLNESS_STRAVA_CALLBACK_ACCEPTED_SCOPE_FIX_V419",
      accepted_scope: acceptedScope,
      requested_scope: payload?.scope || "",
      has_activity_read_scope: hasActivityReadScope(acceptedScope),
      athlete: tokenData?.athlete || null,
      token_type: tokenData?.token_type || null,
      expires_at: tokenData?.expires_at || null,
      connected_at: nowIso,
    },
  };

  const { error: insertError } = await supabase
    .from("wellness_integrations")
    .insert(insertPayload);

  if (insertError) {
    console.error("STRAVA_INTEGRATION_INSERT_ERROR", insertError);
    return NextResponse.redirect(portalUrl(req, "STRAVA_SAVE_FAILED"));
  }

  const notice = hasActivityReadScope(acceptedScope)
    ? "STRAVA_CONNECTED"
    : "STRAVA_CONNECTED_SCOPE_INCOMPLETE";

  const url = portalUrl(req, notice);
  url.searchParams.set("participant_id", String(participantId));

  if (sessionParticipant?.id && Number(sessionParticipant.id) !== participantId) {
    url.searchParams.set("session_warning", "DIFFERENT_PORTAL_SESSION");
  }

  return NextResponse.redirect(url);
}