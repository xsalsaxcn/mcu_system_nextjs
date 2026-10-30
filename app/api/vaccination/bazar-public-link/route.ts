import { NextRequest } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { getVaccinationBazarPublicToken } from "@/lib/vaccination/bazarPublicPortal";
import { fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "session")) return fail("Akses Session Vaksinasi ditolak.", 403);

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  if (!sessionId) return fail("Session wajib dipilih.");

  const supabase = supabaseAdmin();
  const sessionResult = await supabase
    .from("vaccination_sessions")
    .select("id,session_name,company_name,location,session_date,status")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionResult.error) return fail(sessionResult.error.message, 500);
  if (!sessionResult.data) return fail("Session tidak ditemukan.", 404);
  if (String(sessionResult.data.status || "").toUpperCase() === "CANCELLED") {
    return fail("Session sudah dibatalkan.", 409);
  }

  // V527: Link Bazar belongs to the Session flow, not to a fragile assignment count.
  // The public catalog itself resolves assignments + legacy Session-scoped Bazar lots.
  // This keeps the link available while older catalog rows are being reconciled.

  const token = getVaccinationBazarPublicToken(sessionId);
  const path = `/vaccination/public/bazar/${encodeURIComponent(token)}`;
  return ok({ token, path, url: `${req.nextUrl.origin}${path}`, session: sessionResult.data });
}
