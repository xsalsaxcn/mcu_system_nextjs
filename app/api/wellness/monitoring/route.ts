// WELLNESS_PORTAL_USER_STRAVA_V347
// Safe wellness-only monitoring helper. This does not write to database.

import { NextRequest, NextResponse } from "next/server";
import { classifyWellnessPortalRisk, type WellnessPortalAccount, type WellnessMonitoringLog } from "@/lib/wellness/portalRules";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const account = (body?.account || {}) as WellnessPortalAccount;
    const log = (body?.log || {}) as Partial<WellnessMonitoringLog>;
    const risk = classifyWellnessPortalRisk(account, log);

    return NextResponse.json({
      ok: true,
      risk,
      message: "Wellness monitoring dihitung lokal untuk modul Wellness saja.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || "Gagal menghitung monitoring wellness.",
      },
      { status: 400 },
    );
  }
}
