import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin } from "../../_utils";
import { runAutomaticVaccinationReminder } from "@/lib/vaccination/reminderEngine";
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

async function execute() {
  if (!vaccinationReminderSmtpConfigured()) {
    return fail("SMTP email belum dikonfigurasi lengkap.", 503);
  }

  try {
    const supabase = supabaseAdmin();
    const result = await runAutomaticVaccinationReminder(supabase);
    return ok({
      automatic: true,
      schedule: "H-7, H-3, H-1, Hari H",
      ...result,
    });
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
  return execute();
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const role = clean((user as any)?.role).toLowerCase();
  if (!["admin", "vaccination_admin", "vaccination_supervisor"].includes(role)) {
    return fail("Hanya Admin/Supervisor Vaksinasi yang dapat menjalankan reminder manual.", 403);
  }
  return execute();
}
