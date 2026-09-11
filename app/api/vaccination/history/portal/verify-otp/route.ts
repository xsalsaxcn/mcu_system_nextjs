import { NextRequest, NextResponse } from "next/server";
import { fail, supabaseAdmin } from "../../../_utils";
import { historyEmailKey, historyIdentityKey, historyText } from "@/lib/vaccination/history";
import {
  portalHashOtp,
  portalHashSecret,
  portalMakeToken,
  setVaccinationHistoryPortalCookie,
  vaccinationHistorySessionExpiresAt,
} from "@/lib/vaccination/historyPortalAuth";
import { resolveVaccinationHistoryCompanyPortal, vaccinationHistoryCompanyToken } from "@/lib/vaccination/historyCompanyPortal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const employeeKey = historyIdentityKey(body?.nip || body?.employee_id || body?.employee_no);
  const emailKey = historyEmailKey(body?.email);
  const otp = historyText(body?.otp);
  const companyToken = vaccinationHistoryCompanyToken(body?.company_token || body?.company);
  if (!companyToken) return fail("Akses harus melalui QR Portal Peserta perusahaan.", 400);
  if (!employeeKey || !emailKey || !otp) return fail("NIP, Email Perusahaan, dan OTP wajib diisi.", 400);

  try {
    const supabase = supabaseAdmin();
    const portal = await resolveVaccinationHistoryCompanyPortal(supabase, companyToken);
    if (!portal) return fail("QR Portal Peserta tidak aktif atau tidak ditemukan.", 404);

    const { data: matches, error: personError } = await supabase
      .from("vaccination_persons")
      .select("id,participant_name,employee_id,employee_key,email,email_key,participant_type,active")
      .eq("participant_type", "EMPLOYEE")
      .eq("company_id", portal.company_id)
      .eq("active", true)
      .eq("employee_key", employeeKey)
      .eq("email_key", emailKey)
      .limit(2);
    if (personError) throw new Error(personError.message);
    if (!matches || matches.length !== 1) return fail("NIP, Email Perusahaan, atau OTP tidak sesuai.", 400);
    const person = matches[0];

    const { data: otpRow, error: otpError } = await supabase
      .from("vaccination_history_portal_otps")
      .select("id,otp_hash,expires_at,used_at,attempts")
      .eq("person_id", person.id)
      .eq("email", emailKey)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (otpError) throw new Error(otpError.message);
    if (!otpRow) return fail("OTP tidak ditemukan atau sudah digunakan.", 400);
    if (otpRow.expires_at && new Date(otpRow.expires_at).getTime() < Date.now()) return fail("OTP sudah kedaluwarsa.", 400);
    if (Number(otpRow.attempts || 0) >= 5) return fail("OTP terkunci karena terlalu banyak percobaan.", 429);

    if (portalHashOtp(otp) !== otpRow.otp_hash) {
      await supabase
        .from("vaccination_history_portal_otps")
        .update({ attempts: Number(otpRow.attempts || 0) + 1 })
        .eq("id", otpRow.id);
      return fail("OTP salah.", 400);
    }

    await supabase.from("vaccination_history_portal_otps").update({ used_at: new Date().toISOString() }).eq("id", otpRow.id);

    const token = portalMakeToken();
    const expiresAt = vaccinationHistorySessionExpiresAt();
    const { error: sessionError } = await supabase.from("vaccination_history_portal_sessions").insert({
      person_id: person.id,
      session_token_hash: portalHashSecret(`portal:${token}`),
      expires_at: expiresAt,
      revoked_at: null,
      created_at: new Date().toISOString(),
    });
    if (sessionError) throw new Error(sessionError.message);

    const res = NextResponse.json({
      ok: true,
      participant_name: person.participant_name,
      redirect: `/vaccination/history-portal?company=${encodeURIComponent(companyToken)}`,
    });
    setVaccinationHistoryPortalCookie(res, token);
    return res;
  } catch (error: any) {
    return fail(error?.message || "Gagal verifikasi OTP riwayat layanan.", 500);
  }
}
