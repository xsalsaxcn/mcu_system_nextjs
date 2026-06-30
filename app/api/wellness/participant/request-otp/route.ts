// WELLNESS_PARTICIPANT_REAL_EMAIL_OTP_V394_MICROSOFT365

import { NextRequest } from "next/server";
import nodemailer from "nodemailer";
import { fail, ok } from "@/lib/server/response";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  clean,
  hashOtp,
  makeOtp,
  normalizePhone,
} from "@/lib/wellness/portalAuth";

export const runtime = "nodejs";

function isDebugOtpEnabled() {
  return process.env.WELLNESS_OTP_DEBUG !== "0";
}

function smtpConfigured() {
  return Boolean(
    clean(process.env.SMTP_HOST) &&
      clean(process.env.SMTP_PORT) &&
      clean(process.env.SMTP_USER) &&
      clean(process.env.SMTP_PASS)
  );
}

function getSmtpTransporter() {
  const host = clean(process.env.SMTP_HOST || "smtp.office365.com");
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = clean(process.env.SMTP_SECURE).toLowerCase() === "true";

  const user = clean(process.env.SMTP_USER);
  const pass = clean(process.env.SMTP_PASS);

  if (!host || !port || !user || !pass) {
    throw new Error("SMTP belum dikonfigurasi lengkap.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    requireTLS: !secure,
  });
}

function maskEmail(email: string) {
  const text = clean(email).toLowerCase();
  const [name, domain] = text.split("@");

  if (!name || !domain) return text;

  const visible = name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(name.length - 2, 3))}@${domain}`;
}

function buildOtpEmailHtml(params: {
  participantName: string;
  otp: string;
  expiresAt: string;
}) {
  const expires = new Date(params.expiresAt).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return `
    <div style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:560px;margin:0 auto;padding:28px 16px;">
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:28px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#2563eb;">
            inHARMONY Wellness
          </div>

          <h1 style="margin:12px 0 8px;font-size:24px;line-height:32px;color:#0f172a;">
            Kode OTP Portal Peserta
          </h1>

          <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#475569;">
            Halo ${params.participantName || "Peserta"}, gunakan kode OTP berikut untuk masuk ke Portal Peserta Wellness.
          </p>

          <div style="margin:22px 0;padding:20px;border-radius:18px;background:#eff6ff;text-align:center;">
            <div style="font-size:34px;letter-spacing:8px;font-weight:800;color:#1d4ed8;">
              ${params.otp}
            </div>
          </div>

          <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#475569;">
            Kode ini berlaku sampai:
          </p>

          <p style="margin:0 0 18px;font-size:14px;font-weight:700;color:#0f172a;">
            ${expires}
          </p>

          <p style="margin:0;font-size:12px;line-height:20px;color:#64748b;">
            Abaikan email ini jika Anda tidak meminta kode OTP. Jangan membagikan OTP kepada siapa pun.
          </p>
        </div>

        <div style="padding:16px;text-align:center;font-size:11px;color:#94a3b8;">
          Email otomatis dari inHARMONY Wellness.
        </div>
      </div>
    </div>
  `;
}

function buildOtpEmailText(params: {
  participantName: string;
  otp: string;
  expiresAt: string;
}) {
  const expires = new Date(params.expiresAt).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return [
    "inHARMONY Wellness - Kode OTP Portal Peserta",
    "",
    `Halo ${params.participantName || "Peserta"},`,
    "",
    `Kode OTP Anda: ${params.otp}`,
    "",
    `Kode berlaku sampai: ${expires}`,
    "",
    "Jangan membagikan OTP kepada siapa pun.",
    "Abaikan email ini jika Anda tidak meminta kode OTP.",
  ].join("\n");
}

async function sendOtpEmail(params: {
  to: string;
  participantName: string;
  otp: string;
  expiresAt: string;
}) {
  const transporter = getSmtpTransporter();

  const from =
    clean(process.env.SMTP_FROM) ||
    `inHARMONY Wellness <${clean(process.env.SMTP_USER)}>`;

  await transporter.sendMail({
    from,
    to: params.to,
    subject: "Kode OTP Portal Peserta inHARMONY Wellness",
    text: buildOtpEmailText(params),
    html: buildOtpEmailHtml(params),
  });
}

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

    if (!participant) {
      return fail("Peserta Wellness tidak ditemukan.", 404);
    }

    if (participant.is_active === 0 || participant.is_active === false) {
      return fail("Peserta Wellness tidak aktif.", 403);
    }

    const storedEmail = clean(participant.email).toLowerCase();
    const storedPhone = normalizePhone(participant.phone);

    if (storedEmail && email && storedEmail !== email) {
      return fail("Email tidak sesuai dengan data peserta.", 400);
    }

    if (storedPhone && phone && storedPhone !== phone) {
      return fail("No HP tidak sesuai dengan data peserta.", 400);
    }

    const targetEmail = email || storedEmail;

    if (!targetEmail) {
      return fail(
        "Email peserta wajib diisi untuk menerima OTP. Silakan isi email terlebih dahulu.",
        400
      );
    }

    const otp = makeOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: otpError } = await supabase
      .from("wellness_signup_otps")
      .insert({
        participant_id: participant.id,
        employee_no: code,
        email: targetEmail,
        phone: phone || storedPhone || null,
        otp_hash: hashOtp(otp),
        expires_at: expiresAt,
        used_at: null,
        attempts: 0,
        created_at: new Date().toISOString(),
      });

    if (otpError) throw otpError;

    // Kalau data peserta belum punya email/phone, simpan dari input peserta.
    const updatePayload: Record<string, any> = {};

    if (!storedEmail && targetEmail) updatePayload.email = targetEmail;
    if (!storedPhone && phone) updatePayload.phone = phone;

    if (Object.keys(updatePayload).length > 0) {
      updatePayload.updated_at = new Date().toISOString();

      await supabase
        .from("wellness_participants")
        .update(updatePayload)
        .eq("id", participant.id);
    }

    const debugEnabled = isDebugOtpEnabled();

    if (!debugEnabled) {
      if (!smtpConfigured()) {
        return fail(
          "SMTP email belum dikonfigurasi. OTP tidak dapat dikirim.",
          500
        );
      }

      await sendOtpEmail({
        to: targetEmail,
        participantName: participant.name,
        otp,
        expiresAt,
      });
    } else if (smtpConfigured()) {
      // Mode development: tetap coba kirim email jika SMTP sudah ada,
      // tapi OTP juga masih boleh muncul untuk testing.
      await sendOtpEmail({
        to: targetEmail,
        participantName: participant.name,
        otp,
        expiresAt,
      }).catch((sendError) => {
        console.warn("OTP_EMAIL_DEV_SEND_FAILED", sendError);
      });
    }

    const debugOtp = debugEnabled ? otp : undefined;

    return ok({
      participant_name: participant.name,
      email: maskEmail(targetEmail),
      expires_at: expiresAt,
      debug_otp: debugOtp,
      message: debugOtp
        ? "OTP aktif. Mode testing: kode OTP ditampilkan di layar."
        : `OTP sudah dikirim ke email ${maskEmail(targetEmail)}.`,
    });
  } catch (error: any) {
    console.error("WELLNESS_REQUEST_OTP_ERROR", error);

    return fail(error?.message || "Gagal membuat OTP Wellness.", 500);
  }
}