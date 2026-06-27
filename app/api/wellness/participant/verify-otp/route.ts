// WELLNESS_PARTICIPANT_OTP_STRAVA_GFIT_V376

import { NextRequest, NextResponse } from "next/server";
import { fail } from "@/lib/server/response";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { clean, hashOtp, hashSecret, makePortalToken, normalizePhone, setPortalCookie } from "@/lib/wellness/portalAuth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = clean(body.code || body.employee_no || body.no_karyawan);
  const email = clean(body.email).toLowerCase();
  const phone = normalizePhone(body.phone || body.no_hp);
  const otp = clean(body.otp);

  if (!code || !otp) return fail("KODE dan OTP wajib diisi.", 400);

  try {
    const supabase = getSupabaseAdmin();
    const { data: participant, error: participantError } = await supabase
      .from("wellness_participants")
      .select("id,code,name,email,phone,is_active")
      .eq("code", code)
      .maybeSingle();

    if (participantError) throw participantError;
    if (!participant) return fail("Peserta Wellness tidak ditemukan.", 404);

    const storedEmail = clean(participant.email).toLowerCase();
    const storedPhone = normalizePhone(participant.phone);
    if (storedEmail && email && storedEmail !== email) return fail("Email tidak sesuai.", 400);
    if (storedPhone && phone && storedPhone !== phone) return fail("No HP tidak sesuai.", 400);

    const { data: otpRow, error: otpError } = await supabase
      .from("wellness_signup_otps")
      .select("id,otp_hash,expires_at,used_at,attempts")
      .eq("participant_id", participant.id)
      .eq("employee_no", code)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError) throw otpError;
    if (!otpRow) return fail("OTP tidak ditemukan atau sudah digunakan.", 400);
    if (otpRow.expires_at && new Date(otpRow.expires_at).getTime() < Date.now()) return fail("OTP sudah kedaluwarsa.", 400);
    if (Number(otpRow.attempts || 0) >= 5) return fail("OTP terkunci karena terlalu banyak percobaan.", 429);

    const isMatch = hashOtp(otp) === otpRow.otp_hash;
    if (!isMatch) {
      await supabase.from("wellness_signup_otps").update({ attempts: Number(otpRow.attempts || 0) + 1 }).eq("id", otpRow.id);
      return fail("OTP salah.", 400);
    }

    await supabase.from("wellness_signup_otps").update({ used_at: new Date().toISOString() }).eq("id", otpRow.id);

    const token = makePortalToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
    const { error: sessionError } = await supabase.from("wellness_participant_sessions").insert({
      participant_id: participant.id,
      session_token_hash: hashSecret(`portal:${token}`),
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    });
    if (sessionError) throw sessionError;

    const res = NextResponse.json({ ok: true, participant, redirect: "/wellness/portal" });
    setPortalCookie(res, token);
    return res;
  } catch (error: any) {
    return fail(error?.message || "Gagal verifikasi OTP Wellness.", 500);
  }
}
