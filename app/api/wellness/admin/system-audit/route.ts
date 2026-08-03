// WELLNESS_READ_ONLY_SYSTEM_AUDIT_API_V126M36_1

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { runWellnessSystemAudit } from "@/lib/wellness/systemAudit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "supervisor",
  "doctor",
  "wellness_admin",
]);

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: NextRequest) {
  try {
    const user: any = getSessionUser(request);
    if (!user) {
      return NextResponse.json(
        { ok: false, message: "Session Admin belum aktif." },
        { status: 401 },
      );
    }

    const role = clean(user.role).toLowerCase();
    if (!ADMIN_ROLES.has(role)) {
      return NextResponse.json(
        { ok: false, message: "Akun ini tidak memiliki akses System Audit." },
        { status: 403 },
      );
    }

    const days = numberValue(request.nextUrl.searchParams.get("days")) || 14;
    const participantId =
      numberValue(request.nextUrl.searchParams.get("participant_id")) || 0;
    const maxIssues =
      numberValue(request.nextUrl.searchParams.get("max_issues")) || 500;

    const audit = await runWellnessSystemAudit({
      supabase: getSupabaseAdmin(),
      days,
      participantId: participantId || undefined,
      maxIssues,
    });

    return NextResponse.json(
      { ok: true, audit },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Wellness-Audit-Mode": "read-only",
        },
      },
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || "System Audit Wellness gagal dijalankan.",
      },
      { status: 500 },
    );
  }
}
