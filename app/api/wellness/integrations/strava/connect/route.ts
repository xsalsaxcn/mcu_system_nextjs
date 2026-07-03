import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

// WELLNESS_STRAVA_CONNECT_SCOPE_FIX_V418
// Fix:
// - Strava connect tetap pakai session portal peserta OTP.
// - Request scope dibuat eksplisit: read, activity:read, activity:read_all.
// - approval_prompt tetap force agar user benar-benar authorize ulang.
// - Setelah deploy, peserta WAJIB klik Reconnect Strava agar token lama terganti.

const STRAVA_SCOPE = "read,activity:read,activity:read_all";

function appSecret() {
  return String(process.env.APP_SECRET || "").trim();
}

function base64url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function signState(payload: string) {
  const secret = appSecret();
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function makeState(participant: any) {
  const payload = JSON.stringify({
    participant_id: participant.id,
    code: participant.code || null,
    ts: Date.now(),
    scope: STRAVA_SCOPE,
    marker: "WELLNESS_STRAVA_CONNECT_SCOPE_FIX_V418",
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
  const clientId = String(process.env.STRAVA_CLIENT_ID || "").trim();
  const secret = appSecret();

  if (!clientId) {
    return NextResponse.redirect(portalUrl(req, "STRAVA_CLIENT_ID_MISSING"));
  }

  if (!secret) {
    return NextResponse.redirect(portalUrl(req, "APP_SECRET_MISSING"));
  }

  const supabase = getSupabaseAdmin();
  const participant = await getParticipantFromPortalSession(supabase, req);

  if (!participant?.id) {
    return NextResponse.redirect(portalUrl(req, "PORTAL_SESSION_REQUIRED"));
  }

  const callbackUrl = `${req.nextUrl.origin}/api/wellness/integrations/strava/callback`;
  const state = makeState(participant);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    approval_prompt: "force",
    scope: STRAVA_SCOPE,
    state,
  });

  return NextResponse.redirect(
    `https://www.strava.com/oauth/authorize?${params.toString()}`
  );
}