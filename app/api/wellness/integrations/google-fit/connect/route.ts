import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

// WELLNESS_GOOGLE_FIT_CONNECT_V388
// Google Fit connect memakai session portal peserta OTP, bukan session admin.

function clean(value: any) {
  return String(value ?? "").trim();
}

function appSecret() {
  return clean(process.env.APP_SECRET);
}

function base64url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function signState(payload: string) {
  return crypto.createHmac("sha256", appSecret()).update(payload).digest("hex");
}

function makeState(participant: any) {
  const payload = JSON.stringify({
    participant_id: participant.id,
    code: participant.code || null,
    provider: "google_fit",
    ts: Date.now(),
  });

  const encoded = base64url(payload);
  const sig = signState(encoded);

  return `${encoded}.${sig}`;
}

function portalUrl(req: NextRequest, notice?: string) {
  const url = new URL("/wellness/portal", req.nextUrl.origin);
  if (notice) url.searchParams.set("notice", notice);
  return url;
}

export async function GET(req: NextRequest) {
  const clientId =
    clean(process.env.GOOGLE_FIT_CLIENT_ID) ||
    clean(process.env.GOOGLE_CLIENT_ID);

  if (!clientId) {
    return NextResponse.redirect(portalUrl(req, "GOOGLE_FIT_CLIENT_ID_MISSING"));
  }

  if (!appSecret()) {
    return NextResponse.redirect(portalUrl(req, "APP_SECRET_MISSING"));
  }

  const supabase = getSupabaseAdmin();
  const participant = await getParticipantFromPortalSession(supabase, req);

  if (!participant?.id) {
    return NextResponse.redirect(portalUrl(req, "PORTAL_SESSION_REQUIRED"));
  }

  const callbackUrl = `${req.nextUrl.origin}/api/wellness/integrations/google-fit/callback`;
  const state = makeState(participant);

  const scopes = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/fitness.activity.read",
    "https://www.googleapis.com/auth/fitness.location.read",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: scopes,
    state,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}