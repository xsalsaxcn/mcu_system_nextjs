import { NextRequest } from "next/server";
import nodemailer from "nodemailer";
import { fail, ok, supabaseAdmin } from "../../../_utils";
import { historyEmailKey, historyIdentityKey, historyText } from "@/lib/vaccination/history";
import { portalHashOtp, portalMakeOtp } from "@/lib/vaccination/historyPortalAuth";
import { resolveVaccinationHistoryCompanyPortal, vaccinationHistoryCompanyToken } from "@/lib/vaccination/historyCompanyPortal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function smtpConfigured() {
  return Boolean(
    historyText(process.env.SMTP_HOST) &&
      historyText(process.env.SMTP_PORT) &&
      historyText(process.env.SMTP_USER) &&
      historyText(process.env.SMTP_PASS),
  );
}

function transporter() {
  const host = historyText(process.env.SMTP_HOST || "smtp.office365.com");
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = historyText(process.env.SMTP_SECURE).toLowerCase() === "true";
  const user = historyText(process.env.SMTP_USER);
  const pass = historyText(process.env.SMTP_PASS);
  if (!host || !port || !user || !pass) throw new Error("SMTP email belum dikonfigurasi lengkap.");
  return nodemailer.createTransport({ host, port, secure, auth: { user, pass }, requireTLS: !secure });
}

function maskEmail(value: string) {
  const email = historyEmailKey(value);
  const [name, domain] = email.split("@");
  if (!name || !domain) return "email terdaftar";
  return `${name.slice(0, 2)}${"*".repeat(Math.max(name.length - 2, 3))}@${domain}`;
}

function emailHtml(name: string, otp: string, expiresAt: string) {
  const expires = new Date(expiresAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
  return `
    <div style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a">
      <div style="max-width:560px;margin:0 auto;padding:28px 16px">
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:24px;padding:28px">
          <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#059669">inHARMONY Vaccination</div>
          <h1 style="margin:12px 0 8px;font-size:24px;line-height:32px">Kode OTP Riwayat Layanan</h1>
          <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#475569">Halo ${name || "Peserta"}, gunakan kode berikut untuk membuka riwayat layanan vaksinasi Anda.</p>
          <div style="margin:22px 0;padding:20px;border-radius:18px;background:#ecfdf5;text-align:center">
            <div style="font-size:34px;letter-spacing:8px;font-weight:800;color:#047857">${otp}</div>
          </div>
          <p style="margin:0 0 18px;font-size:14px;font-weight:700">Berlaku sampai ${expires}</p>
          <p style="margin:0;font-size:12px;line-height:20px;color:#64748b">Jangan membagikan OTP kepada siapa pun. Abaikan email ini jika Anda tidak meminta akses.</p>
        </div>
        <div style="padding:16px;text-align:center;font-size:11px;color:#94a3b8">Email otomatis dari inHARMONY Vaccination.</div>
      </div>
    </div>`;
}

async function sendOtpEmail(to: string, name: string, otp: string, expiresAt: string) {
  const from = historyText(process.env.SMTP_FROM) || `inHARMONY Vaccination <${historyText(process.env.SMTP_USER)}>`;
  await transporter().sendMail({
    from,
    to,
    subject: "Kode OTP Riwayat Layanan inHARMONY",
    text: `Halo ${name || "Peserta"},\n\nKode OTP Anda: ${otp}\nBerlaku 10 menit.\n\nJangan membagikan OTP kepada siapa pun.`,
    html: emailHtml(name, otp, expiresAt),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const employeeKey = historyIdentityKey(body?.nip || body?.employee_id || body?.employee_no);
  const emailKey = historyEmailKey(body?.email);
  const companyToken = vaccinationHistoryCompanyToken(body?.company_token || body?.company);
  if (!companyToken) return fail("Akses harus melalui QR Portal Peserta perusahaan.", 400);
  if (!employeeKey || !emailKey) return fail("NIP dan Email Perusahaan wajib diisi.", 400);

  try {
    const supabase = supabaseAdmin();
    const portal = await resolveVaccinationHistoryCompanyPortal(supabase, companyToken);
    if (!portal) return fail("QR Portal Peserta tidak aktif atau tidak ditemukan.", 404);

    const { data: matches, error: personError } = await supabase
      .from("vaccination_persons")
      .select("id,company_id,participant_name,employee_id,employee_key,email,email_key,participant_type,active")
      .eq("participant_type", "EMPLOYEE")
      .eq("company_id", portal.company_id)
      .eq("active", true)
      .eq("employee_key", employeeKey)
      .eq("email_key", emailKey)
      .limit(2);
    if (personError) throw new Error(personError.message);

    if (!matches || matches.length !== 1) {
      return ok({
        message: "Jika NIP dan email terdaftar serta sesuai, kode OTP akan dikirim ke email perusahaan.",
        matched: false,
      });
    }

    const person = matches[0];
    const recent = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from("vaccination_history_portal_otps")
      .select("id", { count: "exact", head: true })
      .eq("person_id", person.id)
      .gte("created_at", recent);
    if (countError) throw new Error(countError.message);
    if ((count || 0) >= 5) return fail("Permintaan OTP terlalu sering. Coba kembali dalam 15 menit.", 429);

    if (!smtpConfigured()) return fail("SMTP email belum dikonfigurasi. OTP tidak dapat dikirim.", 500);

    const otp = portalMakeOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error: otpError } = await supabase.from("vaccination_history_portal_otps").insert({
      person_id: person.id,
      employee_id: historyText(person.employee_id),
      email: emailKey,
      otp_hash: portalHashOtp(otp),
      expires_at: expiresAt,
      used_at: null,
      attempts: 0,
      created_at: new Date().toISOString(),
    });
    if (otpError) throw new Error(otpError.message);

    await sendOtpEmail(emailKey, historyText(person.participant_name), otp, expiresAt);

    return ok({
      matched: true,
      email: maskEmail(emailKey),
      expires_at: expiresAt,
      company_name: portal.company.company_name,
      message: `OTP sudah dikirim ke ${maskEmail(emailKey)}.`,
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal mengirim OTP riwayat layanan.", 500);
  }
}
