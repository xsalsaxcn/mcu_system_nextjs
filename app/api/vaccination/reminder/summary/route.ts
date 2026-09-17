import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin } from "../../_utils";
import { shiftYmd, todayInVaccinationTimezone } from "@/lib/vaccination/reminderEngine";
import { vaccinationReminderSmtpConfigured } from "@/lib/vaccination/reminderEmail";

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
        "id,source_type,participant_name,vaccine_name,next_due_date,reminder_date,reminder_stage,status,sent_at,error_message,recipient_name,recipient_email,recipient_type,company_name,attempt_count,superseded_at",
      )
      .gte("reminder_date", from)
      .lte("reminder_date", until)
      .is("superseded_at", null)
      .order("reminder_date", { ascending: true })
      .order("id", { ascending: true })
      .limit(5000);

    if (result.error) throw new Error(result.error.message);
    const rows = result.data || [];

    const sent = rows.filter((row: any) => clean(row.status).toUpperCase() === "SENT").length;
    const failed = rows.filter((row: any) => clean(row.status).toUpperCase() === "FAILED").length;
    const skipped = rows.filter((row: any) => clean(row.status).toUpperCase() === "SKIPPED").length;
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
        schedule: ["H7", "H3", "H1", "H0"],
        cron: "08:00 WIB setiap hari",
        cronConfigured: Boolean(clean(process.env.CRON_SECRET)),
        smtpConfigured: vaccinationReminderSmtpConfigured(),
        timezone: clean(process.env.VACCINATION_REMINDER_TIMEZONE) || "Asia/Jakarta",
      },
      summary: { sent, failed, skipped, incoming, dueToday },
      items: items.slice(0, 1000),
    });
  } catch (error: any) {
    return fail(String(error?.message || error || "Gagal memuat Reminder Vaksinasi."), 500);
  }
}
