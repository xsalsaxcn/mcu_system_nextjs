import crypto from "crypto";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

export const runtime = "nodejs";

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalizePhone(value: any) {
  let text = clean(value).replace(/[^0-9+]/g, "");
  if (text.startsWith("+62")) text = `0${text.slice(3)}`;
  if (text.startsWith("62")) text = `0${text.slice(2)}`;
  return text;
}

function hashOtp(otp: string) {
  return crypto.createHash("sha256").update(`${process.env.APP_SECRET || "harmony"}:${otp}`).digest("hex");
}

function makeOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const employeeNo = clean(body.employee_no || body.code);
  const email = clean(body.email).toLowerCase();
  const phone = normalizePhone(body.phone);

  if (!employeeNo || !email || !phone) return fail("No karyawan, email, dan no HP wajib diisi.");

  try {
    const supabase = getSupabaseAdmin();
    const { data: participant, error } = await supabase
      .from("wellness_participants")
      .select("id,code,name,email,phone,is_active,user_id")
      .eq("code", employeeNo)
      .maybeSingle();
    if (error) throw error;
    if (!participant) return fail("No karyawan tidak ditemukan di database Wellness.", 404);
    if (participant.is_active === 0 || participant.is_active === false) return fail("Peserta Wellness tidak aktif.", 403);

    const storedEmail = clean(participant.email).toLowerCase();
    const storedPhone = normalizePhone(participant.phone);
    if (storedEmail && storedEmail !== email) return fail("Email tidak sesuai dengan data karyawan yang terdaftar.", 400);
    if (storedPhone && storedPhone !== phone) return fail("No HP tidak sesuai dengan data karyawan yang terdaftar.", 400);

    const otp = makeOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error: otpError } = await supabase.from("wellness_signup_otps").insert({
      participant_id: participant.id,
      employee_no: employeeNo,
      email,
      phone,
      otp_hash: hashOtp(otp),
      expires_at: expiresAt,
      used_at: null,
      attempts: 0,
      created_at: new Date().toISOString(),
    });
    if (otpError) throw otpError;

    // Mode gratis: belum memakai SMS/WhatsApp gateway berbayar.
    // Untuk production, matikan debug OTP dan sambungkan ke email/WhatsApp provider jika sudah tersedia.
    const debugOtp = process.env.WELLNESS_OTP_DEBUG === "0" ? undefined : otp;

    return ok({
      participant_name: participant.name,
      expires_at: expiresAt,
      delivery: debugOtp ? "debug_free_mode" : "external_gateway",
      debug_otp: debugOtp,
      message: debugOtp
        ? "OTP dibuat. Mode gratis/testing: kode OTP ditampilkan di layar."
        : "OTP dibuat. Cek email/WhatsApp sesuai gateway yang dikonfigurasi.",
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal membuat OTP. Pastikan sql/wellness_signup_import_v214.sql sudah dijalankan.", 500);
  }
}
