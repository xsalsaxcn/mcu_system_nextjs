import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin } from "../../_utils";
import { shiftYmd, todayInVaccinationTimezone } from "@/lib/vaccination/reminderEngine";
import { vaccinationReminderSmtpConfigured } from "@/lib/vaccination/reminderEmail";
import { vaccinationReminderWhatsAppConfigured } from "@/lib/vaccination/reminderWhatsApp";
import { resolveReminderPhonesForRows } from "@/lib/vaccination/reminderPhone";

export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value ?? "").trim();
}

type ViewKey = "INCOMING" | "SENT" | "FAILED" | "DUE_TODAY";

function normalizeView(value: any): ViewKey {
  const view = clean(value).toUpperCase();
  if (["SENT", "FAILED", "DUE_TODAY"].includes(view)) return view as ViewKey;
  return "INCOMING";
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const role = clean((user as any)?.role).toLowerCase();
  if (
    ![
      "admin",
      "vaccination_admin",
      "vaccination_supervisor",
      "vaccination_report",
      "vaccination_validation",
    ].includes(role)
  ) {
    return fail("Tidak memiliki akses Reminder Vaksinasi.", 403);
  }

  try {
    const supabase = supabaseAdmin();
    const today = todayInVaccinationTimezone();
    const from = shiftYmd(today, -30);
    const until = shiftYmd(today, 60);
    const view = normalizeView(req.nextUrl.searchParams.get("view"));

    const result = await supabase
      .from("vaccination_reminders")
      .select(
        "id,source_type,source_key,record_id,registration_id,history_service_id,person_id,participant_name,vaccine_name,next_due_date,reminder_date,reminder_stage,status,sent_at,error_message,recipient_name,recipient_email,recipient_phone,recipient_type,company_name,attempt_count,superseded_at,wa_status,wa_attempt_count,wa_last_attempt_at,wa_sent_at,wa_meta_message_id,wa_error_message",
      )
      .gte("reminder_date", from)
      .lte("reminder_date", until)
      .is("superseded_at", null)
      .order("reminder_date", { ascending: true })
      .order("id", { ascending: true })
      .limit(5000);

    if (result.error) throw new Error(result.error.message);
    const rawRows = result.data || [];
    const resolvedPhones = await resolveReminderPhonesForRows(supabase, rawRows);
    const rows = rawRows.map((row: any) => ({
      ...row,
      recipient_phone:
        resolvedPhones.get(Number(row.id)) || clean(row.recipient_phone) || null,
    }));

    // V153.15:
    // Keep Last reminder scoped to ONE reminder schedule date.
    // CURRENT_RECORD and HISTORY_SERVICE duplicates may have different source_key values,
    // so source_key is intentionally not used. However, reminder_date MUST be part of
    // the identity so a manual send for H-3 does not overwrite H-1 / Hari-H history.
    const scheduleIdentity = (row: any) => {
      const participant = clean(row.participant_name).toLowerCase().replace(/\s+/g, " ");
      const vaccine = clean(row.vaccine_name).toLowerCase().replace(/\s+/g, " ");
      const nextDueDate = clean(row.next_due_date);
      const reminderDate = clean(row.reminder_date);
      if (!participant || !vaccine || !nextDueDate || !reminderDate) return "";
      return `${participant}|${vaccine}|${nextDueDate}|${reminderDate}`;
    };

    const lastSentBySchedule = new Map<string, string>();
    for (const row of rows as any[]) {
      if (clean(row.status).toUpperCase() !== "SENT" || !clean(row.sent_at)) continue;
      const key = scheduleIdentity(row);
      if (!key) continue;
      const sentAt = clean(row.sent_at);
      const previous = lastSentBySchedule.get(key);
      if (!previous || sentAt > previous) lastSentBySchedule.set(key, sentAt);
    }

    const withLastReminder = (row: any) => {
      const key = scheduleIdentity(row);
      const emailSentAt = (key ? lastSentBySchedule.get(key) : "") || clean(row.sent_at);
      const waSentAt = clean(row.wa_sent_at);
      const lastReminderAt =
        emailSentAt && waSentAt
          ? emailSentAt >= waSentAt
            ? emailSentAt
            : waSentAt
          : emailSentAt || waSentAt || "";

      return {
        ...row,
        last_reminder_at: lastReminderAt || null,
      };
    };

    const sent = rows.filter((row: any) => clean(row.status).toUpperCase() === "SENT").length;
    const failed = rows.filter((row: any) => clean(row.status).toUpperCase() === "FAILED").length;
    const skipped = rows.filter((row: any) => clean(row.status).toUpperCase() === "SKIPPED").length;
    const waSent = rows.filter((row: any) => clean(row.wa_status).toUpperCase() === "SENT").length;
    const waFailed = rows.filter((row: any) => clean(row.wa_status).toUpperCase() === "FAILED").length;
    const waSkipped = rows.filter((row: any) => clean(row.wa_status).toUpperCase() === "SKIPPED").length;
    const waPending = rows.filter((row: any) => ["PENDING", "SENDING"].includes(clean(row.wa_status).toUpperCase())).length;
    const dueToday = rows.filter((row: any) => {
      const status = clean(row.status).toUpperCase();
      return clean(row.reminder_date) === today && !["SENT", "SUPERSEDED", "CANCELLED"].includes(status);
    }).length;
    const incoming = rows.filter((row: any) => {
      const status = clean(row.status).toUpperCase();
      return clean(row.reminder_date) >= today && ["PENDING", "FAILED", "SKIPPED", "SENDING"].includes(status);
    }).length;

    let items: any[] = [];
    if (view === "SENT") {
      items = rows
        .filter((row: any) => clean(row.status).toUpperCase() === "SENT")
        .sort((a: any, b: any) => String(b.sent_at || b.reminder_date).localeCompare(String(a.sent_at || a.reminder_date)));
    } else if (view === "FAILED") {
      items = rows
        .filter((row: any) => ["FAILED", "SKIPPED"].includes(clean(row.status).toUpperCase()))
        .sort((a: any, b: any) => String(a.reminder_date).localeCompare(String(b.reminder_date)));
    } else if (view === "DUE_TODAY") {
      items = rows.filter((row: any) => {
        const status = clean(row.status).toUpperCase();
        return clean(row.reminder_date) === today && !["SENT", "SUPERSEDED", "CANCELLED"].includes(status);
      });
    } else {
      items = rows.filter((row: any) => {
        const status = clean(row.status).toUpperCase();
        return clean(row.reminder_date) >= today && ["PENDING", "FAILED", "SKIPPED", "SENDING"].includes(status);
      });
    }

    return ok({
      today,
      view,
      automation: {
        emailSchedule: ["H7", "H3", "H1", "H0"],
        whatsappSchedule: ["H3", "H1"],
        cron: "08:00 WIB setiap hari",
        cronConfigured: Boolean(clean(process.env.CRON_SECRET)),
        smtpConfigured: vaccinationReminderSmtpConfigured(),
        whatsappConfigured: vaccinationReminderWhatsAppConfigured(),
        timezone: clean(process.env.VACCINATION_REMINDER_TIMEZONE) || "Asia/Jakarta",
      },
      summary: { sent, failed, skipped, incoming, dueToday, waSent, waFailed, waSkipped, waPending },
      items: items.slice(0, 1000).map(withLastReminder),
    });
  } catch (error: any) {
    return fail(String(error?.message || error || "Gagal memuat Reminder Vaksinasi."), 500);
  }
}
