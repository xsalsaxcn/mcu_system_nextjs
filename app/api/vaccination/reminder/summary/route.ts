import { NextRequest, NextResponse } from "next/server";
import { fail, ok, requireUser, supabaseAdmin } from "../../_utils";
import { shiftYmd, todayInVaccinationTimezone } from "@/lib/vaccination/reminderEngine";
import { vaccinationReminderSmtpConfigured } from "@/lib/vaccination/reminderEmail";
import { vaccinationReminderWhatsAppConfigured } from "@/lib/vaccination/reminderWhatsApp";
import { resolveReminderPhonesForRows } from "@/lib/vaccination/reminderPhone";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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

    // V583_REMINDER_DASHBOARD_BOUNDED_READER
    // Read only the requested view (<= 1,000 items), NOT thousands of reminder
    // rows plus their phone lookups before filtering. Counts come from head-only
    // queries, so dashboard totals stay accurate when reminder volume grows.
    const selectFields =
      "id,source_type,source_key,record_id,registration_id,history_service_id,person_id,participant_name,vaccine_name,next_due_date,reminder_date,reminder_stage,status,sent_at,error_message,recipient_name,recipient_email,recipient_phone,recipient_type,company_name,attempt_count,superseded_at,wa_status,wa_attempt_count,wa_last_attempt_at,wa_sent_at,wa_meta_message_id,wa_error_message";

    type CountFilter = {
      status?: string;
      statuses?: string[];
      waStatus?: string;
      waStatuses?: string[];
      todayOnly?: boolean;
      futureOnly?: boolean;
      excludeClosed?: boolean;
    };
    const countRows = async (filter: CountFilter = {}) => {
      let query = supabase
        .from("vaccination_reminders")
        .select("id", { head: true, count: "exact" })
        .gte("reminder_date", from)
        .lte("reminder_date", until)
        .is("superseded_at", null);
      if (filter.status) query = query.eq("status", filter.status);
      if (filter.statuses) query = query.in("status", filter.statuses);
      if (filter.waStatus) query = query.eq("wa_status", filter.waStatus);
      if (filter.waStatuses) query = query.in("wa_status", filter.waStatuses);
      if (filter.todayOnly) query = query.eq("reminder_date", today);
      if (filter.futureOnly) query = query.gte("reminder_date", today);
      if (filter.excludeClosed) {
        query = query.not("status", "in", "(SENT,SUPERSEDED,CANCELLED)");
      }
      const result = await query;
      if (result.error) throw new Error(result.error.message);
      return Number(result.count || 0);
    };

    let viewQuery = supabase
      .from("vaccination_reminders")
      .select(selectFields)
      .gte("reminder_date", from)
      .lte("reminder_date", until)
      .is("superseded_at", null);
    if (view === "SENT") {
      viewQuery = viewQuery.eq("status", "SENT");
    } else if (view === "FAILED") {
      viewQuery = viewQuery.in("status", ["FAILED", "SKIPPED"]);
    } else if (view === "DUE_TODAY") {
      viewQuery = viewQuery
        .eq("reminder_date", today)
        .not("status", "in", "(SENT,SUPERSEDED,CANCELLED)");
    } else {
      viewQuery = viewQuery
        .gte("reminder_date", today)
        .in("status", ["PENDING", "FAILED", "SKIPPED", "SENDING"]);
    }

    // Exact same date window as V582 / prior UI. Sort in memory only for
    // the bounded view rows; query ORDER gives deterministic tie-breaking.
    const viewPromise = viewQuery
      .order("reminder_date", { ascending: view !== "SENT" })
      .order("id", { ascending: true })
      .limit(1000);

    const sentForLastReminderPromise = supabase
      .from("vaccination_reminders")
      .select("participant_name,vaccine_name,next_due_date,reminder_date,status,sent_at")
      .gte("reminder_date", from)
      .lte("reminder_date", until)
      .is("superseded_at", null)
      .eq("status", "SENT")
      .order("sent_at", { ascending: false })
      .limit(1000);

    const [viewResult, sentResult, counts] = await Promise.all([
      viewPromise,
      sentForLastReminderPromise,
      Promise.all([
        countRows({ status: "SENT" }),
        countRows({ status: "FAILED" }),
        countRows({ status: "SKIPPED" }),
        countRows({ waStatus: "SENT" }),
        countRows({ waStatus: "FAILED" }),
        countRows({ waStatus: "SKIPPED" }),
        countRows({ waStatuses: ["PENDING", "SENDING"] }),
        countRows({ todayOnly: true, excludeClosed: true }),
        countRows({ futureOnly: true, statuses: ["PENDING", "FAILED", "SKIPPED", "SENDING"] }),
      ]),
    ]);
    if (viewResult.error) throw new Error(viewResult.error.message);
    if (sentResult.error) throw new Error(sentResult.error.message);

    // Resolve phone fallbacks ONLY for visible items: not all 4,000+ rows.
    const rawRows = viewResult.data || [];
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
    for (const row of sentResult.data || []) {
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

    const [sent, failed, skipped, waSent, waFailed, waSkipped, waPending, dueToday, incoming] = counts;

    // Keep pre-V583 ordering / per-view semantics, within the bounded result.
    let items: any[] = [...rows];
    if (view === "SENT") {
      items.sort((a: any, b: any) =>
        String(b.sent_at || b.reminder_date).localeCompare(String(a.sent_at || a.reminder_date)));
    } else if (view === "FAILED") {
      items.sort((a: any, b: any) =>
        String(a.reminder_date).localeCompare(String(b.reminder_date)));
    }

    return NextResponse.json(
      {
        ok: true,
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
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
          Vary: "Cookie",
        },
      },
    );
  } catch (error: any) {
    return fail(String(error?.message || error || "Gagal memuat Reminder Vaksinasi."), 500);
  }
}
