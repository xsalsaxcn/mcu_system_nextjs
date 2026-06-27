// WELLNESS_PARTICIPANT_OTP_STRAVA_GFIT_V376

import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { activityDate, clean, decryptToken, encryptToken, getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

export const runtime = "nodejs";

async function ensureStravaAccessToken(connection: any, supabase: any) {
  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
  if (connection.access_token_encrypted && expiresAt > Date.now() + 60 * 60 * 1000) {
    return decryptToken(connection.access_token_encrypted);
  }

  const clientId = process.env.STRAVA_CLIENT_ID || process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const refreshToken = decryptToken(connection.refresh_token_encrypted);
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Koneksi Strava perlu dihubungkan ulang.");

  const refreshRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const refreshed = await refreshRes.json();
  if (!refreshRes.ok) throw new Error(refreshed?.message || "Gagal refresh token Strava.");

  await supabase.from("wellness_integrations").update({
    access_token_encrypted: encryptToken(refreshed.access_token),
    refresh_token_encrypted: encryptToken(refreshed.refresh_token),
    expires_at: refreshed.expires_at ? new Date(Number(refreshed.expires_at) * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", connection.id);

  return refreshed.access_token;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const participant = await getParticipantFromPortalSession(supabase, req);
    if (!participant) return fail("OTP/session peserta belum aktif.", 401);

    const { data: connection, error } = await supabase
      .from("wellness_integrations")
      .select("*")
      .eq("participant_id", participant.id)
      .eq("provider", "strava")
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!connection) return fail("Strava belum terhubung.", 400);

    const accessToken = await ensureStravaAccessToken(connection, supabase);
    const body = await req.json().catch(() => ({}));
    const days = Number(body.days || 30);
    const after = Math.floor((Date.now() - 1000 * 60 * 60 * 24 * Math.min(Math.max(days, 1), 180)) / 1000);
    const activitiesRes = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const activities = await activitiesRes.json();
    if (!activitiesRes.ok) return fail(activities?.message || "Gagal mengambil aktivitas Strava.", 400);

    let synced = 0;
    for (const activity of Array.isArray(activities) ? activities : []) {
      const externalId = clean(activity.id);
      if (!externalId) continue;
      const payload = {
        participant_id: participant.id,
        log_date: activityDate(activity.start_date_local || activity.start_date),
        source: "strava",
        external_activity_id: externalId,
        activity_type: activity.sport_type || activity.type || "Strava Activity",
        activity_name: activity.name || activity.sport_type || activity.type || "Strava Activity",
        duration_minutes: activity.moving_time ? Math.round(Number(activity.moving_time) / 60) : null,
        elapsed_minutes: activity.elapsed_time ? Math.round(Number(activity.elapsed_time) / 60) : null,
        distance_km: activity.distance ? Math.round((Number(activity.distance) / 1000) * 100) / 100 : null,
        calories: activity.calories ? Math.round(Number(activity.calories)) : null,
        raw_payload: activity,
        synced_at: new Date().toISOString(),
      };
      const { error: upsertError } = await supabase.from("wellness_activity_logs").upsert(payload, {
        onConflict: "participant_id,source,external_activity_id",
      });
      if (!upsertError) synced += 1;
    }

    await supabase.from("wellness_integrations").update({ last_sync_at: new Date().toISOString() }).eq("id", connection.id);
    return ok({ synced, source: "strava" });
  } catch (err: any) {
    return fail(err?.message || "Gagal sync Strava.", 500);
  }
}
