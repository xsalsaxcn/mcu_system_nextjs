// WELLNESS_COACH_SNAPSHOT_PERFORMANCE_V1
// Cron warm-up for Wellness Coach snapshots only.
// No streak/point/Google Fit rules live here: canonical engine remains the source of truth.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncCoachSnapshots } from "@/lib/wellness/coachSnapshotServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Supabase admin env is missing.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function authorized(request: NextRequest) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const header = String(request.headers.get("authorization") || "").trim();
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, message: "Cron authorization tidak valid." },
      { status: 401 },
    );
  }

  try {
    const supabase = adminClient();
    const participantResult = await supabase
      .from("wellness_participants")
      .select("*")
      .limit(2000);

    if (participantResult.error) {
      return NextResponse.json(
        { ok: false, message: participantResult.error.message },
        { status: 500 },
      );
    }

    // Intended schedule: every 30 minutes. A 20-minute freshness threshold lets
    // cron repair missed runs without rewriting already-fresh snapshots.
    const result = await syncCoachSnapshots({
      supabase,
      participants: participantResult.data || [],
      maxAgeMinutes: 20,
      concurrency: 4,
    });

    return NextResponse.json({
      ok: result.ok,
      snapshot: {
        attempted: result.attempted,
        updated: result.updated,
        skipped_fresh: result.skipped_fresh,
        failed: result.failed,
        table_missing: result.table_missing === true,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal menjalankan Wellness snapshot cron." },
      { status: 500 },
    );
  }
}
