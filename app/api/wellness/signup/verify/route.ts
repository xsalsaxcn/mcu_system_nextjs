import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { setSessionCookie } from "@/lib/server/session";
import { fail } from "@/lib/server/response";

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

function randomPassword() {
  return crypto.randomBytes(18).toString("base64url");
}

function safeUsername(employeeNo: string) {
  return `wellness_${employeeNo}`.toLowerCase().replace(/[^a-z0-9_\-.]/g, "_").slice(0, 80);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const employeeNo = clean(body.employee_no || body.code);
  const email = clean(body.email).toLowerCase();
  const phone = normalizePhone(body.phone);
  const otp = clean(body.otp);

  if (!employeeNo || !email || !phone || !otp) return fail("No karyawan, email, no HP, dan OTP wajib diisi.");

  try {
    const supabase = getSupabaseAdmin();
    const { data: participant, error: participantError } = await supabase
      .from("wellness_participants")
      .select("id,code,name,email,phone,user_id,is_active")
      .eq("code", employeeNo)
      .maybeSingle();
    if (participantError) throw participantError;
    if (!participant) return fail("No karyawan tidak ditemukan.", 404);

    const storedEmail = clean(participant.email).toLowerCase();
    const storedPhone = normalizePhone(participant.phone);
    if (storedEmail && storedEmail !== email) return fail("Email tidak sesuai.", 400);
    if (storedPhone && storedPhone !== phone) return fail("No HP tidak sesuai.", 400);

    const { data: otpRow, error: otpError } = await supabase
      .from("wellness_signup_otps")
      .select("id,otp_hash,expires_at,used_at,attempts")
      .eq("participant_id", participant.id)
      .eq("employee_no", employeeNo)
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

    let userId = participant.user_id;
    let username = safeUsername(employeeNo);
    if (!userId) {
      const { data: existingUser } = await supabase.from("users").select("id,username").eq("username", username).maybeSingle();
      if (existingUser?.id) {
        userId = existingUser.id;
      } else {
        const { data: newUser, error: insertError } = await supabase
          .from("users")
          .insert({
            name: participant.name,
            username,
            password: randomPassword(),
            role: "wellness_participant",
            post_id: null,
            program_type: "wellness",
            is_active: 1,
          })
          .select("id,username")
          .single();
        if (insertError) throw insertError;
        userId = newUser.id;
        username = newUser.username;
      }

      const { error: updateParticipantError } = await supabase
        .from("wellness_participants")
        .update({ user_id: userId, email, phone, updated_at: new Date().toISOString() })
        .eq("id", participant.id);
      if (updateParticipantError) throw updateParticipantError;
    }

    const sessionUser = {
      id: Number(userId),
      name: participant.name,
      username,
      role: "wellness_participant",
      post_id: null,
      post_name: null,
      program_type: "wellness" as const,
    };

    const res = NextResponse.json({ ok: true, user: sessionUser, redirect: "/wellness/portal" });
    setSessionCookie(res, sessionUser);
    return res;
  } catch (error: any) {
    return fail(error?.message || "Gagal verifikasi OTP. Pastikan sql/wellness_signup_import_v214.sql sudah dijalankan.", 500);
  }
}
