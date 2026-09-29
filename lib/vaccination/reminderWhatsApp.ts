// V153.47_SAFE_VACCINATION_REMINDER_WHATSAPP_H3_H1
// Server-only helper for Vaccination Reminder -> Notiva transactional bridge.
// Email and WhatsApp delivery are intentionally independent.

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || ["null", "undefined", "nan", "-", "—"].includes(text.toLowerCase())) return "";
  return text;
}

function normalizeIndonesianPhone(value: unknown) {
  const digits = clean(value).replace(/\D+/g, "");
  if (!digits) return "";
  const normalized = digits.startsWith("0")
    ? `62${digits.slice(1)}`
    : digits.startsWith("8")
      ? `62${digits}`
      : digits;
  return /^62\d{8,13}$/.test(normalized) ? normalized : "";
}

function formatDueDate(value: unknown) {
  const text = clean(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text;

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export type VaccinationReminderWhatsAppResult = {
  attempted: boolean;
  sent: boolean;
  skipped: boolean;
  reason?: string;
  phone?: string;
  meta_message_id?: string;
  sent_at?: string;
  error?: string;
};

export function getVaccinationReminderWhatsAppConfig() {
  const baseUrl = clean(
    process.env.NOTIVA_VACCINATION_REMINDER_URL ||
      process.env.NOTIVA_VACCINATION_QUEUE_URL ||
      "https://wa-reminder-blast.vercel.app",
  ).replace(/\/+$/, "");

  const secret = clean(
    process.env.NOTIVA_VACCINATION_REMINDER_SECRET ||
      process.env.NOTIVA_VACCINATION_QUEUE_SECRET,
  );

  return {
    configured: Boolean(baseUrl && secret),
    baseUrl,
    secret,
    schedule: ["H3", "H1"],
  };
}

export function vaccinationReminderWhatsAppConfigured() {
  return getVaccinationReminderWhatsAppConfig().configured;
}

export function vaccinationReminderRecipientPhone(value: unknown) {
  return normalizeIndonesianPhone(value);
}

export async function sendVaccinationReminderWhatsApp(input: {
  phone: unknown;
  recipientName: unknown;
  participantName?: unknown;
  serviceName: unknown;
  nextDueDate: unknown;
  reminderStage: unknown;
}): Promise<VaccinationReminderWhatsAppResult> {
  const stage = clean(input.reminderStage).toUpperCase();
  if (!["H3", "H1"].includes(stage)) {
    return {
      attempted: false,
      sent: false,
      skipped: true,
      reason: "STAGE_NOT_ELIGIBLE",
    };
  }

  const phone = normalizeIndonesianPhone(input.phone);
  if (!phone) {
    return {
      attempted: false,
      sent: false,
      skipped: true,
      reason: "PHONE_INVALID",
      error: "No HP penerima belum tersedia atau tidak valid.",
    };
  }

  const config = getVaccinationReminderWhatsAppConfig();
  if (!config.configured) {
    return {
      attempted: false,
      sent: false,
      skipped: true,
      reason: "NOTIVA_NOT_CONFIGURED",
      phone,
      error: "Notiva Vaccination Reminder belum dikonfigurasi.",
    };
  }

  const recipientName = clean(input.recipientName) || clean(input.participantName) || "Peserta";
  const serviceName = clean(input.serviceName) || "Vaksinasi";
  const dueDate = formatDueDate(input.nextDueDate);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(`${config.baseUrl}/api/internal/vaccination-reminder`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vaccination-reminder-secret": config.secret,
      },
      body: JSON.stringify({
        phone,
        recipient_name: recipientName,
        participant_name: clean(input.participantName) || recipientName,
        service_name: serviceName,
        due_date: dueDate,
        reminder_stage: stage,
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    const json: any = await response.json().catch(() => ({}));
    if (!response.ok || !json?.success) {
      return {
        attempted: true,
        sent: false,
        skipped: false,
        reason: "NOTIVA_SEND_FAILED",
        phone,
        error: clean(json?.message || json?.error) || `Notiva HTTP ${response.status}`,
      };
    }

    return {
      attempted: true,
      sent: true,
      skipped: false,
      reason: "SENT",
      phone,
      meta_message_id: clean(json?.meta_message_id) || undefined,
      sent_at: clean(json?.sent_at) || new Date().toISOString(),
    };
  } catch (error: any) {
    return {
      attempted: true,
      sent: false,
      skipped: false,
      reason: "NOTIVA_REQUEST_FAILED",
      phone,
      error:
        error?.name === "AbortError"
          ? "Timeout menghubungi Notiva."
          : clean(error?.message) || "Gagal menghubungi Notiva.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
