import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "mcu_corporate_active_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type McuCorporateSessionSelection = {
  company_id: number;
  package_id: number;
  company_name: string;
  package_name: string;
  selected_at: string;
};

function getSecret() {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("Missing APP_SECRET environment variable.");
  return secret;
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function encodeMcuCorporateSession(selection: McuCorporateSessionSelection) {
  const payload = base64url(JSON.stringify(selection));
  return `${payload}.${signPayload(payload)}`;
}

export function decodeMcuCorporateSession(token?: string | null): McuCorporateSessionSelection | null {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = signPayload(payload);
  if (!safeEqual(sig, expected)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const companyId = Number(decoded?.company_id || 0);
    const packageId = Number(decoded?.package_id || 0);
    if (!companyId || !packageId) return null;

    return {
      company_id: companyId,
      package_id: packageId,
      company_name: String(decoded?.company_name || ""),
      package_name: String(decoded?.package_name || ""),
      selected_at: String(decoded?.selected_at || ""),
    };
  } catch {
    return null;
  }
}

export function getMcuCorporateSession(req: NextRequest) {
  return decodeMcuCorporateSession(req.cookies.get(COOKIE_NAME)?.value);
}

export function setMcuCorporateSessionCookie(
  res: NextResponse,
  selection: McuCorporateSessionSelection,
) {
  res.cookies.set(COOKIE_NAME, encodeMcuCorporateSession(selection), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearMcuCorporateSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
