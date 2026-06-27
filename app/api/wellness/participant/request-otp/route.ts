// WELLNESS_PARTICIPANT_OTP_STRAVA_GFIT_V376

import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { clean, hashOtp, makeOtp, normalizePhone } from "@/lib/wellness/portalAuth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = clean(body.code || body.employee_no || body.no_karyawan);
  const email = clean(body.email).toLowerCase();
  const phone = normalizePhone(body.phone || body.no_hp);

  if (!code) return fail("No Karyawan/KODE wajib diisi.", 400);

  try {
    const supabase = getSupabaseAdmin();
    const { data: participant, error } = await supabase
      .from("wellness_participants")
      .select("id,code,name,email,phone,is_active")
      .eq("code", code)
      .maybeSingle();

    if (error) throw error;
    if (!participant) return fail("Peserta Wellness tidak ditemukan.", 404);
    if (participant.is_active === 0 || participant.is_active === false) return fail("Peserta Wellness tidak aktif.", 403);

    const storedEmail = clean(participant.email).toLowerCase();
    const storedPhone = normalizePhone(participant.phone);
    if (storedEmail && email && storedEmail !== email) return fail("Email tidak sesuai dengan data peserta.", 400);
    if (storedPhone && phone && storedPhone !== phone) return fail("No HP tidak sesuai dengan data peserta.", 400);

    const otp = makeOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: otpError } = await supabase.from("wellness_signup_otps").insert({
      participant_id: participant.id,
      employee_no: code,
      email: email || storedEmail || null,
      phone: phone || storedPhone || null,
      otp_hash: hashOtp(otp),
      expires_at: expiresAt,
      used_at: null,
      attempts: 0,
      created_at: new Date().toISOString(),
    });
    if (otpError) throw otpError;

    const debugOtp = process.env.WELLNESS_OTP_DEBUG === "0" ? undefined : otp;
    return ok({
      participant_name: participant.name,
      expires_at: expiresAt,
      debug_otp: debugOtp,
      message: debugOtp
        ? "OTP aktif. Mode testing: kode OTP ditampilkan di layar."
        : "OTP aktif. Kode dikirim melalui gateway yang dikonfigurasi.",
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal membuat OTP Wellness.", 500);
  }
}
