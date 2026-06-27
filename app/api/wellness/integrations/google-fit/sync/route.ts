// WELLNESS_PARTICIPANT_OTP_STRAVA_GFIT_V376
// Legacy Google Fit sync for existing Google Fit API projects.
// New projects should plan Health Connect / native bridge because Google Fit API is deprecated.

import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { activityDate, clean, decryptToken, encryptToken, getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";

export const runtime = "nodejs";

async function ensureGoogleAccessToken(connection: any, supabase: any) {
  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
  if (connection.access_token_encrypted && expiresAt > Date.now() + 60 * 60 * 1000) {
    return decryptToken(connection.access_token_encrypted);
  }

  const clientId = process.env.GOOGLE_FIT_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_FIT_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = decryptToken(connection.refresh_token_encrypted);
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Koneksi Google Fit perlu dihubungkan ulang.");

  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
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
  if (!refreshRes.ok) throw new Error(refreshed?.error_description || refreshed?.error || "Gagal refresh token Google Fit.");

  await supabase.from("wellness_integrations").update({
    access_token_encrypted: encryptToken(refreshed.access_token),
    expires_at: refreshed.expires_in ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", connection.id);

  return refreshed.access_token;
}

function activityTypeName(value: any) {
  const map: Record<string, string> = {
    "7": "Walking",
    "8": "Running",
    "1": "Biking",
    "9": "Aerobics",
    "10": "Badminton",
    "21": "Treadmill running",
    "58": "Strength training",
    "80": "Workout",
  };
  const key = clean(value);
  return map[key] || `Google Fit Activity ${key || ""}`.trim();
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
      .eq("provider", "google_fit")
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!connection) return fail("Google Fit belum terhubung.", 400);

    const accessToken = await ensureGoogleAccessToken(connection, supabase);
    const body = await req.json().catch(() => ({}));
    const days = Number(body.days || 30);
    const end = new Date();
    const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * Math.min(Math.max(days, 1), 90));
    const sessionsUrl = new URL("https://www.googleapis.com/fitness/v1/users/me/sessions");
    sessionsUrl.searchParams.set("startTime", start.toISOString());
    sessionsUrl.searchParams.set("endTime", end.toISOString());

    const sessionsRes = await fetch(sessionsUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    const sessionsJson = await sessionsRes.json();
    if (!sessionsRes.ok) return fail(sessionsJson?.error?.message || "Gagal mengambil session Google Fit.", 400);

    const sessions = Array.isArray(sessionsJson.session) ? sessionsJson.session : [];
    let synced = 0;
    for (const session of sessions) {
      const externalId = clean(session.id || session.name || session.startTimeMillis);
      if (!externalId) continue;
      const startMs = Number(session.startTimeMillis || 0);
      const endMs = Number(session.endTimeMillis || 0);
      const durationMinutes = startMs && endMs ? Math.max(1, Math.round((endMs - startMs) / 60000)) : null;
      const payload = {
        participant_id: participant.id,
        log_date: activityDate(startMs ? new Date(startMs).toISOString() : session.startTime),
        source: "google_fit",
        external_activity_id: externalId,
        activity_type: activityTypeName(session.activityType),
        activity_name: session.name || activityTypeName(session.activityType),
        duration_minutes: durationMinutes,
        elapsed_minutes: durationMinutes,
        distance_km: null,
        calories: null,
        raw_payload: session,
        synced_at: new Date().toISOString(),
      };
      const { error: upsertError } = await supabase.from("wellness_activity_logs").upsert(payload, {
        onConflict: "participant_id,source,external_activity_id",
      });
      if (!upsertError) synced += 1;
    }

    await supabase.from("wellness_integrations").update({ last_sync_at: new Date().toISOString() }).eq("id", connection.id);
    return ok({ synced, source: "google_fit", note: "Google Fit legacy sync membaca session/durasi/jenis aktivitas. Kalori bisa kosong bila tidak tersedia di session." });
  } catch (err: any) {
    return fail(err?.message || "Gagal sync Google Fit.", 500);
  }
}
