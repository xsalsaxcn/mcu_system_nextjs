import nodemailer from "nodemailer";
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

  if (text.startsWith("+62")) {
    text = `0${text.slice(3)}`;
  }

  if (text.startsWith("62")) {
    text = `0${text.slice(2)}`;
  }

  return text;
}


function hashOtp(otp: string) {
  return crypto
    .createHash("sha256")
    .update(`${process.env.APP_SECRET || "harmony"}:${otp}`)
    .digest("hex");
}


function makeOtp() {
  return String(
    Math.floor(
      100000 + Math.random() * 900000
    )
  );
}



function createTransporter() {
  return nodemailer.createTransport({
    host:
      process.env.SMTP_HOST ||
      "smtp.office365.com",

    port: 587,

    secure: false,

    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}



async function sendOtpEmail(params: {
  to: string;
  otp: string;
}) {

  const transporter =
    createTransporter();


  await transporter.sendMail({

    from:
      `inHARMONY Wellness <${process.env.SMTP_USER}>`,

    to: params.to,

    subject:
      "Kode OTP Aktivasi Akun Wellness",


    text:
`Kode OTP Aktivasi Akun Wellness

Kode OTP Anda:

${params.otp}

Kode berlaku selama 10 menit.
Jangan berikan kode ini kepada siapapun.
`,


    html:
`
<div style="font-family:Arial,sans-serif">

<h2>inHARMONY Wellness</h2>

<p>
Kode OTP aktivasi akun Anda:
</p>

<h1 style="letter-spacing:8px">
${params.otp}
</h1>

<p>
Kode berlaku selama 10 menit.
</p>

<p>
Jangan berikan kode ini kepada siapapun.
</p>

</div>
`,
  });
}



export async function POST(
  req: NextRequest
) {

  const body =
    await req.json()
      .catch(() => ({}));


  const employeeNo =
    clean(
      body.employee_no ||
      body.code
    );


  const email =
    clean(body.email)
      .toLowerCase();


  const phone =
    normalizePhone(body.phone);



  if (
    !employeeNo ||
    !email ||
    !phone
  ) {
    return fail(
      "No karyawan, email, dan no HP wajib diisi."
    );
  }



  try {

    const supabase =
      getSupabaseAdmin();



    const {
      data: participant,
      error,
    } =
      await supabase
        .from(
          "wellness_participants"
        )
        .select(
          "id,code,name,email,phone,is_active,user_id"
        )
        .eq(
          "code",
          employeeNo
        )
        .maybeSingle();



    if (error) {
      throw error;
    }



    if (!participant) {

      return fail(
        "No karyawan tidak ditemukan di database Wellness.",
        404
      );

    }



    if (
      participant.is_active === 0 ||
      participant.is_active === false
    ) {

      return fail(
        "Peserta Wellness tidak aktif.",
        403
      );

    }



    const storedEmail =
      clean(
        participant.email
      )
      .toLowerCase();



    const storedPhone =
      normalizePhone(
        participant.phone
      );



    if (
      storedEmail &&
      storedEmail !== email
    ) {

      return fail(
        "Email tidak sesuai dengan data karyawan yang terdaftar.",
        400
      );

    }



    if (
      storedPhone &&
      storedPhone !== phone
    ) {

      return fail(
        "No HP tidak sesuai dengan data karyawan yang terdaftar.",
        400
      );

    }



    const otp =
      makeOtp();



    const expiresAt =
      new Date(
        Date.now() + 10 * 60 * 1000
      )
      .toISOString();



    const {
      error: otpError
    } =
      await supabase
        .from(
          "wellness_signup_otps"
        )
        .insert({

          participant_id:
            participant.id,

          employee_no:
            employeeNo,

          email,

          phone,

          otp_hash:
            hashOtp(otp),

          expires_at:
            expiresAt,

          used_at:
            null,

          attempts:
            0,

          created_at:
            new Date()
              .toISOString(),

        });



    if (otpError) {
      throw otpError;
    }



    await sendOtpEmail({
      to: email,
      otp,
    });



    return ok({

      participant_name:
        participant.name,

      expires_at:
        expiresAt,

      delivery:
        "email",

      message:
        "OTP sudah dikirim ke email Anda. Silakan cek inbox email.",

    });



  } catch (error: any) {

    return fail(
      error?.message ||
      "Gagal membuat OTP.",
      500
    );

  }

}