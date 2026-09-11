import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const COOKIE_NAME = "vaccination_history_portal_token";
const SESSION_TTL_SECONDS = 60 * 60;

export function portalClean(value: unknown) {
  return String(value ?? "").trim();
}

export function portalHashSecret(value: string) {
  return crypto
    .createHash("sha256")
    .update(`${process.env.APP_SECRET || "harmony-health-app"}:vaccination-history:${value}`)
    .digest("hex");
}

export function portalHashOtp(otp: string) {
  return portalHashSecret(`otp:${otp}`);
}

export function portalMakeOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

export function portalMakeToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function setVaccinationHistoryPortalCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearVaccinationHistoryPortalCookie(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function getVaccinationHistoryPortalToken(req: NextRequest) {
  return req.cookies.get(COOKIE_NAME)?.value || "";
}

export async function getVaccinationHistoryPortalPerson(supabase: SupabaseClient, req: NextRequest) {
  const token = getVaccinationHistoryPortalToken(req);
  if (!token) return null;

  const tokenHash = portalHashSecret(`portal:${token}`);
  const { data: session, error: sessionError } = await supabase
    .from("vaccination_history_portal_sessions")
    .select("id,person_id,expires_at,revoked_at")
    .eq("session_token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!session) return null;
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) return null;

  const { data: person, error: personError } = await supabase
    .from("vaccination_persons")
    .select("id,company_id,participant_type,participant_name,employee_id,employee_key,nik,nik_key,email,email_key,phone,birth_date,gender,active")
    .eq("id", session.person_id)
    .eq("participant_type", "EMPLOYEE")
    .eq("active", true)
    .maybeSingle();

  if (personError) throw personError;
  return person || null;
}

export function vaccinationHistorySessionExpiresAt() {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
}
