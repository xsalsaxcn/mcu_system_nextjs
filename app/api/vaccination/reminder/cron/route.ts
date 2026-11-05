import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin } from "../../_utils";
import {
  runAutomaticVaccinationReminder,
  sendDueVaccinationReminders,
  sendDueVaccinationReminderWhatsApp,
  syncVaccinationReminders,
  todayInVaccinationTimezone,
} from "@/lib/vaccination/reminderEngine";
import { vaccinationReminderSmtpConfigured } from "@/lib/vaccination/reminderEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function clean(value: any) {
  return String(value ?? "").trim();
}

function cronAuthorized(req: NextRequest) {
  const secret = clean(process.env.CRON_SECRET);
  if (!secret) return false;
  return clean(req.headers.get("authorization")) === `Bearer ${secret}`;
}

type Mode = "all" | "sync" | "email" | "wa";
function normalizeMode(value: any): Mode {
  const mode = clean(value).toLowerCase();
  return mode === "sync" || mode === "email" || mode === "wa" ? mode : "all";
}

// Each request is bounded. Independent invocations permit background scheduling
// without exceeding the function lifetime or double-sending claimed reminders.
async function execute(mode: Mode) {
  try {
    const supabase = supabaseAdmin();
    const today = todayInVaccinationTimezone();
    if (mode === "sync") {
      return ok({ automatic: true, mode, today, sync: await syncVaccinationReminders(supabase, today) });
    }
    if (mode === "email") {
      if (!vaccinationReminderSmtpConfigured()) {
        return fail("Email tidak dapat dikirim: SMTP belum dikonfigurasi lengkap.", 503);
      }
      const delivery = await sendDueVaccinationReminders(supabase, today, 3);
      return ok({ automatic: true, mode, today, delivery });
    }
    if (mode === "wa") {
      const whatsappDelivery = await sendDueVaccinationReminderWhatsApp(supabase, today, 3);
      if (!whatsappDelivery.configured) return fail("WhatsApp tidak dapat dikirim: koneksi Notiva belum dikonfigurasi.", 503);
      return ok({ automatic: true, mode, today, whatsappDelivery });
    }
    // Daily Vercel cron retains its original schedule and sync behavior;
    // delivery is explicitly bounded per channel to avoid premature timeout.
    const result = await runAutomaticVaccinationReminder(supabase);
    return ok({ automatic: true, mode: "all", emailSchedule: "H-7, H-3, H-1, Hari H", whatsappSchedule: "H-3, H-1", ...result });
  } catch (error: any) {
    console.error("VACCINATION_REMINDER_CRON_ERROR", error);
    return fail(String(error?.message || error || "Automatic vaccination reminder gagal."), 500);
  }
}

export async function GET(req: NextRequest) {
  if (!clean(process.env.CRON_SECRET)) {
    return fail("CRON_SECRET belum dikonfigurasi di environment production.", 503);
  }
  if (!cronAuthorized(req)) return fail("Unauthorized cron request.", 401);
  return execute(normalizeMode(req.nextUrl.searchParams.get("mode")));
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const role = clean((user as any)?.role).toLowerCase();
  if (!["admin", "vaccination_admin", "vaccination_supervisor"].includes(role)) {
    return fail("Hanya Admin/Supervisor Vaksinasi yang dapat menjalankan reminder manual.", 403);
  }
  const body = await req.json().catch(() => ({}));
  return execute(normalizeMode(body?.mode));
}
