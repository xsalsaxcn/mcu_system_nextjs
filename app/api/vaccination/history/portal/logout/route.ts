import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../_utils";
import {
  clearVaccinationHistoryPortalCookie,
  getVaccinationHistoryPortalToken,
  portalHashSecret,
} from "@/lib/vaccination/historyPortalAuth";

export async function POST(req: NextRequest) {
  const token = getVaccinationHistoryPortalToken(req);
  if (token) {
    const supabase = supabaseAdmin();
    await supabase
      .from("vaccination_history_portal_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("session_token_hash", portalHashSecret(`portal:${token}`))
      .is("revoked_at", null);
  }
  const res = NextResponse.json({ ok: true });
  clearVaccinationHistoryPortalCookie(res);
  return res;
}
