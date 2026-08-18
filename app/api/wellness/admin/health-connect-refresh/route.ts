import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// WELLNESS_ADMIN_FITNESS_REFRESH_ALL_V126M80_HEALTH_CONNECT
// Health Connect lives on the participant Android device. The server cannot
// pull Health Connect directly, so this endpoint verifies the latest device
// push and returns an actionable status for the Admin bulk-refresh report.

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

function active(value: any) {
  return ![false, 0, "0", "false", "inactive", "nonaktif"].includes(
    typeof value === "string" ? value.toLowerCase() : value,
  );
}

function adminUser(request: NextRequest) {
  const user: any = getSessionUser(request);
  return user && ADMIN_ROLES.has(clean(user?.role).toLowerCase()) ? user : null;
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

function jakartaLabel(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return clean(value) || "-";
  return date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export async function POST(request: NextRequest) {
  if (!adminUser(request)) {
    return json({ ok: false, message: "Akses Admin Wellness diperlukan." }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const participantId = Number(body?.participant_id || 0);
  if (!(participantId > 0)) {
    return json({ ok: false, message: "participant_id wajib diisi." }, 400);
  }

  try {
    const supabase = getSupabaseAdmin();
    const [participantResult, controlResult, integrationResult, latestActivityResult] = await Promise.all([
      supabase.from("wellness_participants").select("id,code,name").eq("id", participantId).maybeSingle(),
      supabase.from("wellness_participant_controls").select("*").eq("participant_id", participantId).maybeSingle(),
      supabase
        .from("wellness_integrations")
        .select("id,provider,is_active,last_sync_at,connected_at,updated_at,raw_payload")
        .eq("participant_id", participantId)
        .eq("provider", "health_connect")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("wellness_activity_logs")
        .select("id,log_date,steps,calories,updated_at,created_at,raw_payload")
        .eq("participant_id", participantId)
        .eq("source", "health_connect")
        .order("log_date", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (participantResult.error) throw participantResult.error;
    if (!participantResult.data?.id) {
      return json({ ok: false, status: "NOT_FOUND", message: "Peserta Wellness tidak ditemukan." }, 404);
    }
    if (controlResult.error && !/does not exist|schema cache/i.test(clean(controlResult.error.message))) {
      throw controlResult.error;
    }
    if (integrationResult.error) throw integrationResult.error;
    if (latestActivityResult.error) throw latestActivityResult.error;

    const participant = participantResult.data;
    const control = controlResult.data || null;
    const integration = integrationResult.data || null;
    const latest = latestActivityResult.data || null;
    const fitnessSource = clean(control?.fitness_source || "none").toLowerCase().replace(/-/g, "_");
    const fitnessEnabled = control?.fitness_enabled === true || control?.fitness_enabled === 1 || control?.fitness_enabled === "1";
    const integrationActive = integration ? active(integration.is_active) : false;

    const lastSyncRaw = clean(
      integration?.last_sync_at ||
        integration?.raw_payload?.synced_at ||
        latest?.raw_payload?.health_connect_last_sync_at ||
        latest?.updated_at ||
        latest?.created_at ||
        "",
    );
    const lastSyncMs = lastSyncRaw ? new Date(lastSyncRaw).getTime() : 0;
    const syncAgeHours = lastSyncMs > 0 ? Math.max(0, (Date.now() - lastSyncMs) / 3600000) : null;

    const base = {
      participant: { id: Number(participant.id), code: clean(participant.code), name: clean(participant.name) },
      provider: "health_connect",
      mode: "device_push_check",
      refresh_performed: false,
      last_sync_at: lastSyncRaw || null,
      last_sync_at_jakarta: lastSyncRaw ? jakartaLabel(lastSyncRaw) : "-",
      sync_age_hours: syncAgeHours === null ? null : Math.round(syncAgeHours * 10) / 10,
      latest_data: latest
        ? {
            log_date: clean(latest.log_date).slice(0, 10) || null,
            steps: Number(latest.steps || latest?.raw_payload?.health_connect_steps || 0) || 0,
            calories: Number(latest.calories || latest?.raw_payload?.selected_active_calories || 0) || 0,
          }
        : null,
    };

    if (!integration) {
      return json(
        {
          ...base,
          ok: false,
          status: "NOT_CONNECTED",
          reconnect_required: true,
          message: "Health Connect belum pernah push data. Minta peserta membuka Harmony Health Android, izinkan Health Connect, lalu jalankan Sync.",
        },
        409,
      );
    }

    if (!fitnessEnabled || fitnessSource !== "health_connect" || !integrationActive) {
      return json(
        {
          ...base,
          ok: false,
          status: "SOURCE_MISMATCH",
          message: "Health Connect tersedia tetapi bukan sumber fitness aktif peserta. Periksa pilihan Fitness App di Admin/Portal Peserta.",
        },
        409,
      );
    }

    if (syncAgeHours === null || syncAgeHours > 24) {
      return json(
        {
          ...base,
          ok: false,
          status: "STALE_DEVICE_PUSH",
          message: `Health Connect tidak bisa ditarik paksa dari server. Last push ${lastSyncRaw ? jakartaLabel(lastSyncRaw) : "belum ada"}. Minta peserta membuka Harmony Health Android dan tekan Sync Health Connect.`,
        },
        409,
      );
    }

    return json({
      ...base,
      ok: true,
      status: "HEALTHY",
      message: "Health Connect terverifikasi aktif dan device push masih fresh. Tidak ada pull server karena Health Connect berjalan dari perangkat Android peserta.",
    });
  } catch (error: any) {
    return json(
      {
        ok: false,
        status: "CHECK_FAILED",
        mode: "device_push_check",
        message: error?.message || "Pemeriksaan Health Connect gagal.",
      },
      500,
    );
  }
}
