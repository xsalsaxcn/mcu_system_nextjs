// Read-only secret verification for Vaccination Reminder.
// No DB reads/writes and no mail, WhatsApp, or reminder engine calls.
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export async function GET(req: NextRequest) {
  const authorization = clean(req.headers.get("authorization"));
  const reminderSecret = clean(process.env.VACCINATION_REMINDER_CRON_SECRET);
  const legacySecret = clean(process.env.CRON_SECRET);
  // Exactly the same precedence and comparison as the V585 R1 cron endpoint.
  const authorized = Boolean(
    (reminderSecret && authorization === `Bearer ${reminderSecret}`) ||
    (legacySecret && authorization === `Bearer ${legacySecret}`)
  );
  if (!authorized) {
    // Only harmless metadata in Vercel Runtime Logs: never secrets, token hashes, or header values.
    console.warn("VACCINATION_REMINDER_AUTH_CHECK_DENIED", {
      dedicatedConfigured: Boolean(reminderSecret),
      legacyConfigured: Boolean(legacySecret),
      bearerHeaderPresent: authorization.startsWith("Bearer "),
    });
    return NextResponse.json(
      { ok: false, message: "Unauthorized reminder auth check." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(
    { ok: true, authenticated: true, remindersSent: 0 },
    { headers: { "Cache-Control": "no-store" } }
  );
}
