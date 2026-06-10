import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import { getAllowedWellnessParticipants } from "@/app/api/wellness/_utils";

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  try {
    const body = await req.json().catch(() => ({}));
    if (!body.approved) return fail("Persetujuan koneksi Strava wajib dicentang.");

    const supabase = getSupabaseAdmin();
    const participants = await getAllowedWellnessParticipants(supabase, user);
    const participant = participants.find((p: any) => Number(p.user_id) === Number(user.id)) || participants[0];
    if (!participant) return fail("Profil Wellness belum ditemukan.", 404);

    const { error } = await supabase.from("wellness_strava_consents").upsert({
      participant_id: participant.id,
      approved: 1,
      approved_at: new Date().toISOString(),
      ip_address: req.headers.get("x-forwarded-for") || null,
      user_agent: req.headers.get("user-agent") || null,
    }, { onConflict: "participant_id" });
    if (error) throw error;

    return ok({ redirect: "/api/wellness/strava/connect" });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan persetujuan Strava. Pastikan sql/wellness_signup_import_v214.sql sudah dijalankan.", 500);
  }
}
