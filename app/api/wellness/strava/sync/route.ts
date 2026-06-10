import { NextRequest } from "next/server";
import crypto from "crypto";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getAllowedWellnessParticipants } from "@/app/api/wellness/_utils";

function secretKey() {
  return crypto.createHash("sha256").update(process.env.APP_SECRET || "harmony-health-app").digest();
}

function decrypt(value: string) {
  const [ivText, tagText, encryptedText] = String(value || "").split(".");
  if (!ivText || !tagText || !encryptedText) return "";
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]);
  return decrypted.toString("utf8");
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  try {
    const supabase = getSupabaseAdmin();
    const participants = await getAllowedWellnessParticipants(supabase, user);
    const participant = participants.find((p: any) => Number(p.user_id) === Number(user.id)) || participants[0];
    if (!participant) return fail("Profil Wellness belum dibuat.", 404);

    const { data: connection, error } = await supabase.from("wellness_strava_connections").select("*").eq("participant_id", participant.id).maybeSingle();
    if (error) throw error;
    if (!connection?.access_token_encrypted) return fail("Strava belum terhubung.", 400);

    const accessToken = decrypt(connection.access_token_encrypted);
    const after = Math.floor((Date.now() - 1000 * 60 * 60 * 24 * 14) / 1000);
    const activityRes = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=50`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const activities = await activityRes.json();
    if (!activityRes.ok) return fail(activities?.message || "Gagal sync Strava. Coba reconnect Strava.", 400);

    let inserted = 0;
    for (const activity of Array.isArray(activities) ? activities : []) {
      const calories = activity.calories ? Number(activity.calories) : null;
      const { error: upsertError } = await supabase.from("wellness_activity_logs").upsert({
        participant_id: participant.id,
        log_date: String(activity.start_date_local || activity.start_date || "").slice(0, 10),
        source: "strava",
        activity_type: activity.name || activity.type || "Strava Activity",
        duration_minutes: activity.moving_time ? Math.round(Number(activity.moving_time) / 60) : null,
        distance_km: activity.distance ? Math.round((Number(activity.distance) / 1000) * 100) / 100 : null,
        calories,
        strava_activity_id: String(activity.id || ""),
        raw_payload: activity,
      }, { onConflict: "strava_activity_id" });
      if (!upsertError) inserted += 1;
    }

    return ok({ synced: inserted });
  } catch (error: any) {
    return fail(error?.message || "Gagal sync Strava.", 500);
  }
}
