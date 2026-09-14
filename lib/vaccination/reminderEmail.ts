import nodemailer from "nodemailer";

function clean(value: any) {
  return String(value ?? "").trim();
}

function escapeHtml(value: any) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateId(value: string) {
  const text = clean(value);
  if (!text) return "-";
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function vaccinationReminderSmtpConfigured() {
  return Boolean(
    clean(process.env.SMTP_HOST) &&
      clean(process.env.SMTP_PORT) &&
      clean(process.env.SMTP_USER) &&
      clean(process.env.SMTP_PASS),
  );
}

function getTransporter() {
  const host = clean(process.env.SMTP_HOST || "smtp.office365.com");
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = clean(process.env.SMTP_SECURE).toLowerCase() === "true";
  const user = clean(process.env.SMTP_USER);
  const pass = clean(process.env.SMTP_PASS);

  if (!host || !port || !user || !pass) {
    throw new Error("SMTP email belum dikonfigurasi lengkap.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

function stageSentence(stage: string) {
  const normalized = clean(stage).toUpperCase();
  if (normalized === "H7") return "Jadwal layanan berikutnya akan jatuh tempo dalam 7 hari.";
  if (normalized === "H3") return "Jadwal layanan berikutnya akan jatuh tempo dalam 3 hari.";
  if (normalized === "H1") return "Jadwal layanan berikutnya adalah besok.";
  return "Jadwal layanan berikutnya jatuh tempo hari ini.";
}

export async function sendVaccinationReminderEmail(params: {
  to: string;
  recipientName?: string;
  participantName: string;
  serviceName: string;
  nextDueDate: string;
  reminderStage: string;
  companyName?: string;
  recipientType?: string;
}) {
  if (!vaccinationReminderSmtpConfigured()) {
    throw new Error("SMTP email belum dikonfigurasi lengkap.");
  }

  const transporter = getTransporter();
  const smtpUser = clean(process.env.SMTP_USER);
  const recipientName = clean(params.recipientName) || clean(params.participantName) || "Bapak/Ibu";
  const participantName = clean(params.participantName) || "Peserta";
  const serviceName = clean(params.serviceName) || "Layanan Vaksinasi";
  const companyName = clean(params.companyName);
  const dueText = formatDateId(params.nextDueDate);
  const sentence = stageSentence(params.reminderStage);
  const isParent = clean(params.recipientType).toUpperCase() === "PARENT";

  const text = [
    `Yth. ${recipientName},`,
    "",
    sentence,
    isParent ? `Peserta: ${participantName}` : "",
    `Layanan: ${serviceName}`,
    `Jadwal berikutnya: ${dueText}`,
    companyName ? `Perusahaan/Instansi: ${companyName}` : "",
    "",
    "Informasi ini merupakan pengingat jadwal berdasarkan data layanan yang tercatat di inHARMONY.",
    "Jika terdapat perbedaan data, silakan menghubungi Admin inHARMONY.",
    "",
    "Salam sehat,",
    "inHARMONY Clinic",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f5f8fb;padding:24px;color:#0f172a">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden">
      <div style="background:#042E66;padding:22px 26px;color:#ffffff">
        <div style="font-size:12px;letter-spacing:.08em;font-weight:700;opacity:.85">inHARMONY CLINIC</div>
        <div style="font-size:22px;font-weight:800;margin-top:5px">Pengingat Jadwal Layanan Vaksinasi</div>
      </div>
      <div style="padding:26px">
        <p style="margin:0 0 16px">Yth. <b>${escapeHtml(recipientName)}</b>,</p>
        <p style="margin:0 0 18px">${escapeHtml(sentence)}</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:18px;margin:0 0 18px">
          <div style="font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase">Layanan</div>
          <div style="font-size:18px;font-weight:800;color:#042E66;margin-top:4px">${escapeHtml(serviceName)}</div>
          ${isParent ? `<div style="margin-top:12px"><span style="color:#64748b">Peserta:</span> <b>${escapeHtml(participantName)}</b></div>` : ""}
          <div style="margin-top:8px"><span style="color:#64748b">Jadwal berikutnya:</span> <b>${escapeHtml(dueText)}</b></div>
          ${companyName ? `<div style="margin-top:8px"><span style="color:#64748b">Perusahaan/Instansi:</span> ${escapeHtml(companyName)}</div>` : ""}
        </div>
        <p style="font-size:13px;color:#64748b;line-height:1.6;margin:0">
          Informasi ini merupakan pengingat jadwal berdasarkan data layanan yang tercatat di inHARMONY.
          Jika terdapat perbedaan data, silakan menghubungi Admin inHARMONY.
        </p>
      </div>
      <div style="padding:15px 26px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
        Email otomatis dari inHARMONY Clinic. Mohon tidak membalas email ini.
      </div>
    </div>
  </div>`;

  await transporter.sendMail({
    from: `inHARMONY Clinic <${smtpUser}>`,
    to: params.to,
    subject: "Pengingat Jadwal Layanan Vaksinasi - inHARMONY",
    text,
    html,
  });
}
