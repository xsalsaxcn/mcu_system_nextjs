import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SessionUser } from "@/lib/shared/types";

const COOKIE_NAME = "mcu_session";

function getSecret() {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    throw new Error("Missing APP_SECRET environment variable.");
  }
  return secret;
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function encodeSession(user: SessionUser) {
  const payload = base64url(
    JSON.stringify({
      user,
      exp: Date.now() + 1000 * 60 * 60 * 12
    })
  );

  const sig = signPayload(payload);

  return `${payload}.${sig}`;
}

export function decodeSession(token?: string | null): SessionUser | null {
  if (!token || !token.includes(".")) return null;

  const [payload, sig] = token.split(".");
  const expected = signPayload(payload);

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded.exp || Date.now() > decoded.exp) return null;
    return decoded.user as SessionUser;
  } catch {
    return null;
  }
}

export function getSessionUser(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return decodeSession(token);
}

export function setSessionCookie(res: NextResponse, user: SessionUser) {
  res.cookies.set(COOKIE_NAME, encodeSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}
