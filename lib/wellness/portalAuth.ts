// WELLNESS_PARTICIPANT_OTP_STRAVA_GFIT_V376
// Small portal auth helper for participant-facing Wellness pages.
// Uses OTP -> httpOnly cookie -> participant lookup. Wellness-only.

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const COOKIE_NAME = "wellness_portal_token";

export function clean(value: any) {
  return String(value ?? "").trim();
}

export function normalizePhone(value: any) {
  let text = clean(value).replace(/[^0-9+]/g, "");
  if (text.startsWith("+62")) text = `0${text.slice(3)}`;
  if (text.startsWith("62")) text = `0${text.slice(2)}`;
  return text;
}

export function hashSecret(value: string) {
  return crypto.createHash("sha256").update(`${process.env.APP_SECRET || "harmony-health-app"}:${value}`).digest("hex");
}

export function hashOtp(otp: string) {
  return hashSecret(`otp:${otp}`);
}

export function makeOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function makePortalToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function setPortalCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearPortalCookie(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function getPortalToken(req: NextRequest) {
  return req.cookies.get(COOKIE_NAME)?.value || "";
}

export function encryptionKey() {
  return crypto.createHash("sha256").update(process.env.APP_SECRET || "harmony-health-app").digest();
}

export function encryptToken(value: any) {
  const text = clean(value);
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptToken(value: any) {
  const text = clean(value);
  if (!text) return "";
  const [ivText, tagText, encryptedText] = text.split(".");
  if (!ivText || !tagText || !encryptedText) return "";
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]);
  return decrypted.toString("utf8");
}

export async function getParticipantFromPortalSession(supabase: SupabaseClient, req: NextRequest) {
  const token = getPortalToken(req);
  if (!token) return null;

  const tokenHash = hashSecret(`portal:${token}`);
  const { data: session, error: sessionError } = await supabase
    .from("wellness_participant_sessions")
    .select("id,participant_id,expires_at,revoked_at")
    .eq("session_token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!session) return null;
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) return null;

  const { data: participant, error: participantError } = await supabase
    .from("wellness_participants")
    .select("*")
    .eq("id", session.participant_id)
    .maybeSingle();

  if (participantError) throw participantError;
  if (!participant) return null;

  return participant;
}

export function signedState(payload: Record<string, any>) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.APP_SECRET || "harmony-health-app").update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySignedState(state: string) {
  const [body, sig] = clean(state).split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", process.env.APP_SECRET || "harmony-health-app").update(body).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function activityDate(value: any) {
  const text = clean(value);
  if (!text) return new Date().toISOString().slice(0, 10);
  return text.slice(0, 10);
}
