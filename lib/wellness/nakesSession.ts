import { NextRequest, NextResponse } from "next/server";
import type { SessionUser } from "@/lib/shared/types";
import { decodeSession, encodeSession } from "@/lib/server/session";

const NAKES_COOKIE_NAME = "wellness_nakes_session";
const NAKES_ROLES = new Set(["nakes", "wellness_nakes"]);

export function isWellnessNakesUser(user: SessionUser | null | undefined) {
  return NAKES_ROLES.has(String(user?.role || "").toLowerCase());
}

export function getWellnessNakesUser(req: NextRequest) {
  try {
    const token = req.cookies.get(NAKES_COOKIE_NAME)?.value;
    const user = decodeSession(token);
    return isWellnessNakesUser(user) ? user : null;
  } catch {
    return null;
  }
}

export function setWellnessNakesCookie(
  response: NextResponse,
  user: SessionUser,
) {
  response.cookies.set(NAKES_COOKIE_NAME, encodeSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export function clearWellnessNakesCookie(response: NextResponse) {
  response.cookies.set(NAKES_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
