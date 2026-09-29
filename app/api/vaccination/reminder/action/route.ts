import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin } from "../../_utils";
import { sendVaccinationReminderEmail, vaccinationReminderSmtpConfigured } from "@/lib/vaccination/reminderEmail";
import {
  sendVaccinationReminderWhatsApp,
  vaccinationReminderRecipientPhone,
  vaccinationReminderWhatsAppConfigured,
} from "@/lib/vaccination/reminderWhatsApp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value ?? "").trim();
}

function validEmail(value: any) {
  const text = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : "";
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const role = clean((user as any)?.role).toLowerCase();
  if (!["admin", "vaccination_admin", "vaccination_supervisor"].includes(role)) {
    return fail("Hanya Admin/Supervisor Vaksinasi yang dapat menjalankan aksi reminder.", 403);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body?.id || 0);
    const action = clean(body?.action).toLowerCase();
    if (!id) return fail("ID reminder tidak valid.", 400);
    if (!["send", "cancel"].includes(action)) return fail("Aksi reminder tidak valid.", 400);

    const supabase = supabaseAdmin();
    const query = await supabase
      .from("vaccination_reminders")
      .select("*")
      .eq("id", id)
      .is("superseded_at", null)
      .maybeSingle();

    if (query.error) throw new Error(query.error.message);
    const row: any = query.data;
    if (!row) return fail("Reminder tidak ditemukan atau sudah superseded.", 404);

    const status = clean(row.status).toUpperCase();
    const waStatus = clean(row.wa_status).toUpperCase();

    if (action === "cancel") {
      if (status === "SENT" || waStatus === "SENT") {
        return fail("Reminder yang sudah terkirim melalui Email/WhatsApp tidak dapat dibatalkan.", 409);
      }
      if (status === "CANCELLED") return ok({ action: "cancel", id, status: "CANCELLED" });
      if (status === "SUPERSEDED") return fail("Reminder sudah tidak aktif.", 409);

      const updated = await supabase
        .from("vaccination_reminders")
        .update({
          status: "CANCELLED",
          wa_status: ["H3", "H1"].includes(clean(row.reminder_stage).toUpperCase())
            ? "CANCELLED"
            : row.wa_status,
          error_message: "Reminder dibatalkan manual oleh admin.",
          wa_error_message: ["H3", "H1"].includes(clean(row.reminder_stage).toUpperCase())
            ? "Reminder dibatalkan manual oleh admin."
            : row.wa_error_message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .is("superseded_at", null)
        .select("id,status,wa_status")
        .maybeSingle();

      if (updated.error) throw new Error(updated.error.message);
      return ok({
        action: "cancel",
        id,
        status: updated.data?.status || "CANCELLED",
        waStatus: updated.data?.wa_status || null,
      });
    }

    if (["CANCELLED", "SUPERSEDED"].includes(status)) {
      return fail("Reminder ini sudah tidak aktif dan tidak dapat dikirim.", 409);
    }
    if (status === "SENDING" || waStatus === "SENDING") {
      return fail("Reminder sedang diproses. Silakan refresh beberapa saat lagi.", 409);
    }

    const email = validEmail(row.recipient_email || row.participant_email);
    const phone = vaccinationReminderRecipientPhone(row.recipient_phone);
    const reminderStage = clean(row.reminder_stage).toUpperCase();
    const waEligible = ["H3", "H1"].includes(reminderStage);

    const emailResult: any = {
      attempted: false,
      sent: false,
      skipped: false,
      reason: "NOT_ATTEMPTED",
    };
    const whatsappResult: any = {
      attempted: false,
      sent: false,
      skipped: !waEligible,
      reason: waEligible ? "NOT_ATTEMPTED" : "STAGE_NOT_ELIGIBLE",
    };

    if (email && vaccinationReminderSmtpConfigured()) {
      emailResult.attempted = true;
      const attemptCount = Number(row.attempt_count || 0) + 1;
      const markSending = await supabase
        .from("vaccination_reminders")
        .update({
          status: "SENDING",
          attempt_count: attemptCount,
          last_attempt_at: new Date().toISOString(),
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .is("superseded_at", null);
      if (markSending.error) throw new Error(markSending.error.message);

      try {
        await sendVaccinationReminderEmail({
          to: email,
          recipientName: clean(row.recipient_name),
          participantName: clean(row.participant_name) || "Peserta",
          serviceName: clean(row.vaccine_name) || "Vaksinasi",
          nextDueDate: clean(row.next_due_date),
          reminderStage,
          companyName: clean(row.company_name),
          recipientType: clean(row.recipient_type),
        });

        const sentAt = new Date().toISOString();
        const update = await supabase
          .from("vaccination_reminders")
          .update({
            status: "SENT",
            sent_at: sentAt,
            error_message: null,
            updated_at: sentAt,
          })
          .eq("id", id);
        if (update.error) throw new Error(update.error.message);
        Object.assign(emailResult, { sent: true, reason: "SENT", sentAt });
      } catch (error: any) {
        const message = clean(error?.message || error || "Gagal mengirim email.");
        await supabase
          .from("vaccination_reminders")
          .update({
            status: "FAILED",
            error_message: message.slice(0, 1000),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        Object.assign(emailResult, { reason: "FAILED", error: message });
      }
    } else {
      const message = email
        ? "SMTP email belum dikonfigurasi lengkap."
        : clean(row.recipient_type).toUpperCase() === "PARENT"
          ? "Email parent belum tersedia atau tidak valid."
          : "Email peserta belum tersedia atau tidak valid.";
      emailResult.skipped = true;
      emailResult.reason = email ? "SMTP_NOT_CONFIGURED" : "EMAIL_INVALID";
      emailResult.error = message;
      await supabase
        .from("vaccination_reminders")
        .update({
          status: "SKIPPED",
          error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .neq("status", "SENT");
    }

    if (waEligible) {
      if (!phone) {
        const message = "No HP penerima belum tersedia atau tidak valid.";
        whatsappResult.skipped = true;
        whatsappResult.reason = "PHONE_INVALID";
        whatsappResult.error = message;
        await supabase
          .from("vaccination_reminders")
          .update({
            wa_status: "SKIPPED",
            wa_error_message: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .neq("wa_status", "SENT");
      } else if (!vaccinationReminderWhatsAppConfigured()) {
        const message = "Notiva Vaccination Reminder belum dikonfigurasi.";
        whatsappResult.skipped = true;
        whatsappResult.reason = "NOTIVA_NOT_CONFIGURED";
        whatsappResult.error = message;
      } else {
        whatsappResult.attempted = true;
        const waAttemptAt = new Date().toISOString();
        const waAttemptCount = Number(row.wa_attempt_count || 0) + 1;
        const markWaSending = await supabase
          .from("vaccination_reminders")
          .update({
            wa_status: "SENDING",
            wa_attempt_count: waAttemptCount,
            wa_last_attempt_at: waAttemptAt,
            wa_error_message: null,
            updated_at: waAttemptAt,
          })
          .eq("id", id)
          .is("superseded_at", null);
        if (markWaSending.error) throw new Error(markWaSending.error.message);

        const result = await sendVaccinationReminderWhatsApp({
          phone,
          recipientName: clean(row.recipient_name),
          participantName: clean(row.participant_name) || "Peserta",
          serviceName: clean(row.vaccine_name) || "Vaksinasi",
          nextDueDate: clean(row.next_due_date),
          reminderStage,
        });

        Object.assign(whatsappResult, result);
        if (result.sent) {
          const sentAt = result.sent_at || new Date().toISOString();
          await supabase
            .from("vaccination_reminders")
            .update({
              wa_status: "SENT",
              wa_sent_at: sentAt,
              wa_meta_message_id: result.meta_message_id || null,
              wa_error_message: null,
              updated_at: sentAt,
            })
            .eq("id", id);
        } else {
          const message = result.error || "Gagal mengirim WhatsApp reminder.";
          await supabase
            .from("vaccination_reminders")
            .update({
              wa_status: result.skipped ? "SKIPPED" : "FAILED",
              wa_error_message: message.slice(0, 1000),
              updated_at: new Date().toISOString(),
            })
            .eq("id", id);
        }
      }
    }

    if (emailResult.sent || whatsappResult.sent) {
      return ok({
        action: "send",
        id,
        email: emailResult,
        whatsapp: whatsappResult,
      });
    }

    const errors = [emailResult.error, whatsappResult.error].filter(Boolean).join(" · ");
    return fail(errors || "Tidak ada channel reminder yang berhasil dikirim.", 422);
  } catch (error: any) {
    return fail(String(error?.message || error || "Aksi reminder gagal."), 500);
  }
}
