import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { fail } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getAllowedWellnessParticipants } from "@/app/api/wellness/_utils";

function secretKey() {
  return crypto.createHash("sha256").update(process.env.APP_SECRET || "harmony-health-app").digest();
}

function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return fail("Kode Strava tidak ditemukan.", 400);

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("STRAVA_CLIENT_ID/STRAVA_CLIENT_SECRET belum diset.", 400);

  try {
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code" }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) return fail(tokenJson?.message || "Gagal connect Strava.", 400);

    const supabase = getSupabaseAdmin();
    const participants = await getAllowedWellnessParticipants(supabase, user);
    const participant = participants.find((p: any) => Number(p.user_id) === Number(user.id)) || participants[0];
    if (!participant) return fail("Profil Wellness belum dibuat.", 404);

    const { error } = await supabase.from("wellness_strava_connections").upsert({
      participant_id: participant.id,
      strava_athlete_id: tokenJson.athlete?.id ? String(tokenJson.athlete.id) : null,
      access_token_encrypted: encrypt(tokenJson.access_token || ""),
      refresh_token_encrypted: encrypt(tokenJson.refresh_token || ""),
      expires_at: tokenJson.expires_at ? new Date(Number(tokenJson.expires_at) * 1000).toISOString() : null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "participant_id" });
    if (error) throw error;

    return NextResponse.redirect(`${req.nextUrl.origin}/wellness/profile?strava=connected`);
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan koneksi Strava.", 500);
  }
}
