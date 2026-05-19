import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { fail, ok } from "@/lib/server/response";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);
  return ok({ user });
}
