// WELLNESS_GOOGLE_FIT_NATIVE_BRIDGE_DIAGNOSTIC_V126M58_3
// Admin-only, READ ONLY. Never returns OAuth access/refresh tokens or full integration raw_payload.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function num(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rawObject(value: any): any {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function json(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function safeNativeSnapshot(value: any) {
  const row = rawObject(value);
  if (!Object.keys(row).length) return null;
  return {
    date: clean(row.date) || null,
    measured_at: clean(row.measured_at) || null,
    synced_at: clean(row.synced_at) || null,
    steps: num(row.steps),
    total_calories: num(row.total_calories),
    distance_km: num(row.distance_km),
    active_calories:
      row.active_calories === null || row.active_calories === undefined
        ? null
        : num(row.active_calories),
    active_calories_available: row.active_calories_available === true,
    source: clean(row.source) || null,
    account_email: clean(row.account_email).toLowerCase() || null,
  };
}

function safeActivityRow(row: any) {
  const raw = rawObject(row?.raw_payload);
  const snapshot = safeNativeSnapshot(raw?.exact_snapshot);
  return {
    id: row?.id ?? null,
    log_date: clean(row?.log_date) || null,
    updated_at: clean(row?.updated_at) || null,
    started_at: clean(row?.started_at) || null,
    external_activity_id: clean(row?.external_activity_id) || null,
    activity_name: clean(row?.activity_name) || null,
    steps: num(row?.steps),
    calories: num(row?.calories),
    distance_km: num(row?.distance_km),
    sync_mode: clean(raw?.sync_mode) || null,
    native_live: raw?.native_live === true,
    native_account_email: clean(raw?.native_account_email).toLowerCase() || null,
    native_measured_at: clean(raw?.native_measured_at) || null,
    native_snapshot_persisted: raw?.native_snapshot_persisted === true,
    active_calories_available: raw?.active_calories_available === true,
    google_fit_steps: num(raw?.google_fit_steps),
    google_fit_total_calories: num(raw?.google_fit_total_calories),
    google_fit_active_calories:
      raw?.google_fit_active_calories === null ||
      raw?.google_fit_active_calories === undefined
        ? null
        : num(raw?.google_fit_active_calories),
    marker: clean(raw?.marker) || null,
    exact_snapshot: snapshot,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user: any = getSessionUser(request);
    if (!user) return json({ ok: false, message: "Session Admin belum aktif." }, 401);

    const role = clean(user?.role).toLowerCase();
    if (!ADMIN_ROLES.has(role)) {
      return json({ ok: false, message: "Akun ini tidak memiliki akses Portal Admin." }, 403);
    }

    const participantId = num(request.nextUrl.searchParams.get("participant_id"));
    if (!(participantId > 0)) {
      return json({ ok: false, message: "participant_id wajib diisi." }, 400);
    }

    const supabase = getSupabaseAdmin();

    const [participantResult, integrationResult, activityResult] = await Promise.all([
      supabase
        .from("wellness_participants")
        .select("*")
        .eq("id", participantId)
        .maybeSingle(),
      supabase
        .from("wellness_integrations")
        .select("*")
        .eq("participant_id", participantId)
        .eq("provider", "google_fit")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("wellness_activity_logs")
        .select("*")
        .eq("participant_id", participantId)
        .eq("source", "google_fit")
        .order("log_date", { ascending: false })
        .limit(30),
    ]);

    if (participantResult.error) throw participantResult.error;
    if (!participantResult.data) {
      return json({ ok: false, message: "Peserta tidak ditemukan." }, 404);
    }
    if (integrationResult.error) throw integrationResult.error;
    if (activityResult.error) throw activityResult.error;

    const participant = participantResult.data;
    const integration = integrationResult.data;
    const integrationRaw = rawObject(integration?.raw_payload);

    // Security: explicitly cherry-pick safe metadata. Never send full raw_payload or OAuth tokens.
    const oauthEmail = clean(
      integrationRaw?.profile?.email ||
        integrationRaw?.google_profile?.email ||
        integration?.email ||
        participant?.email,
    ).toLowerCase();

    const nativeEmail = clean(integrationRaw?.native_account_email).toLowerCase();
    const nativeLastSyncAt = clean(integrationRaw?.native_last_sync_at);
    const nativeSnapshot = safeNativeSnapshot(integrationRaw?.native_last_snapshot);
    const integrationMarker = clean(integrationRaw?.marker);
    const nativeSnapshotOnly = integrationRaw?.native_snapshot_only === true;
    const nativeDailyRowAction = clean(integrationRaw?.native_daily_row_action);

    const rows = (activityResult.data || []).map(safeActivityRow);
    const nativeRows = rows.filter((row: any) => {
      return (
        row.native_live === true ||
        row.sync_mode === "native_live_daily" ||
        row.native_snapshot_persisted === true ||
        row.exact_snapshot?.source === "google_fit_android_read_daily_total"
      );
    });

    const hasNativeSignal = Boolean(
      nativeEmail ||
        nativeLastSyncAt ||
        nativeSnapshot ||
        nativeSnapshotOnly ||
        nativeDailyRowAction ||
        nativeRows.length,
    );

    const accountMismatch = Boolean(
      oauthEmail && nativeEmail && oauthEmail !== nativeEmail,
    );

    let verdict = "NATIVE_PUSH_NEVER_SEEN";
    if (!integration?.id) verdict = "NO_GOOGLE_FIT_INTEGRATION";
    else if (accountMismatch) verdict = "NATIVE_ACCOUNT_MISMATCH";
    else if (nativeRows.length > 0) verdict = "NATIVE_PUSH_AND_DB_ROW_PRESENT";
    else if (hasNativeSignal && nativeSnapshot) {
      verdict = "NATIVE_SNAPSHOT_SEEN_BUT_NO_DAILY_ROW";
    } else if (hasNativeSignal) {
      verdict = "NATIVE_SIGNAL_PRESENT_NO_DAILY_ROW";
    }

    const latestNativeRow = nativeRows[0] || null;
    const latestAnyGoogleFitRow = rows[0] || null;

    return json({
      ok: true,
      marker: "WELLNESS_GOOGLE_FIT_NATIVE_BRIDGE_DIAGNOSTIC_V126M58_3",
      read_only: true,
      participant: {
        id: Number(participant.id),
        code: clean(
          participant.code ||
            participant.employee_code ||
            participant.no_karyawan,
        ),
        name: clean(
          participant.name ||
            participant.employee_name ||
            participant.full_name,
        ),
        email: clean(participant.email) || null,
      },
      verdict,
      meaning: {
        NO_GOOGLE_FIT_INTEGRATION:
          "Belum ada integration Google Fit untuk participant ini.",
        NATIVE_PUSH_NEVER_SEEN:
          "Server belum pernah melihat bukti native Google Fit push dari HP pada integration/row yang tersedia.",
        NATIVE_ACCOUNT_MISMATCH:
          "Email Google Fit native dari HP berbeda dari email OAuth portal.",
        NATIVE_SNAPSHOT_SEEN_BUT_NO_DAILY_ROW:
          "HP pernah mengirim native snapshot, tetapi belum ada row harian native Google Fit di wellness_activity_logs.",
        NATIVE_SIGNAL_PRESENT_NO_DAILY_ROW:
          "Ada metadata native, tetapi belum ada row harian native Google Fit.",
        NATIVE_PUSH_AND_DB_ROW_PRESENT:
          "Native push dari HP sudah terlihat dan row Google Fit harian tersedia di database.",
      }[verdict],
      integration: integration
        ? {
            id: integration.id,
            is_active: ![false, 0, "0"].includes(integration.is_active),
            connected_at: integration.connected_at || null,
            last_sync_at: integration.last_sync_at || null,
            updated_at: integration.updated_at || null,
            oauth_email: oauthEmail || null,
            native_account_email: nativeEmail || null,
            account_match:
              oauthEmail && nativeEmail ? oauthEmail === nativeEmail : null,
            native_last_sync_at: nativeLastSyncAt || null,
            native_last_snapshot: nativeSnapshot,
            native_snapshot_only: nativeSnapshotOnly,
            native_daily_row_action: nativeDailyRowAction || null,
            marker: integrationMarker || null,
          }
        : null,
      signals: {
        has_native_signal: hasNativeSignal,
        native_row_count: nativeRows.length,
        google_fit_row_count: rows.length,
        latest_native_row: latestNativeRow,
        latest_google_fit_row: latestAnyGoogleFitRow,
      },
      native_rows: nativeRows.slice(0, 14),
      google_fit_rows: rows.slice(0, 14),
      security_note:
        "READ ONLY. OAuth access_token, refresh_token, dan full raw_payload sengaja tidak pernah dikirim ke browser.",
    });
  } catch (error: any) {
    return json(
      {
        ok: false,
        marker: "WELLNESS_GOOGLE_FIT_NATIVE_BRIDGE_DIAGNOSTIC_V126M58_3",
        read_only: true,
        message: error?.message || "Native Bridge Diagnostic gagal.",
      },
      500,
    );
  }
}
