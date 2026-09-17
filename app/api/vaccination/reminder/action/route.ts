import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin } from "../../_utils";
import { sendVaccinationReminderEmail, vaccinationReminderSmtpConfigured } from "@/lib/vaccination/reminderEmail";

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
    if (!['send', 'cancel'].includes(action)) return fail("Aksi reminder tidak valid.", 400);

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

    if (action === "cancel") {
      if (status === "SENT") return fail("Reminder yang sudah terkirim tidak dapat dibatalkan.", 409);
      if (status === "CANCELLED") return ok({ action: "cancel", id, status: "CANCELLED" });
      if (status === "SUPERSEDED") return fail("Reminder sudah tidak aktif.", 409);

      const updated = await supabase
        .from("vaccination_reminders")
        .update({
          status: "CANCELLED",
          error_message: "Reminder dibatalkan manual oleh admin.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .is("superseded_at", null)
        .select("id,status")
        .maybeSingle();

      if (updated.error) throw new Error(updated.error.message);
      return ok({ action: "cancel", id, status: updated.data?.status || "CANCELLED" });
    }

    if (!vaccinationReminderSmtpConfigured()) {
      return fail("SMTP email belum dikonfigurasi lengkap.", 503);
    }
    if (["CANCELLED", "SUPERSEDED"].includes(status)) {
      return fail("Reminder ini sudah tidak aktif dan tidak dapat dikirim.", 409);
    }
    if (status === "SENDING") {
      return fail("Reminder sedang diproses. Silakan refresh beberapa saat lagi.", 409);
    }

    const email = validEmail(row.recipient_email || row.participant_email);
    if (!email) {
      await supabase
        .from("vaccination_reminders")
        .update({
          status: "SKIPPED",
          error_message: clean(row.recipient_type).toUpperCase() === "PARENT"
            ? "Email parent belum tersedia atau tidak valid."
            : "Email peserta belum tersedia atau tidak valid.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      return fail("Email penerima belum tersedia atau tidak valid.", 422);
    }

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
        reminderStage: clean(row.reminder_stage),
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

      return ok({ action: "send", id, status: "SENT", sentAt });
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
      return fail(message, 500);
    }
  } catch (error: any) {
    return fail(String(error?.message || error || "Aksi reminder gagal."), 500);
  }
}
