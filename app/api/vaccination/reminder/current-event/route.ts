import { NextRequest, NextResponse } from "next/server";
import { fail, requireUser, supabaseAdmin } from "../../_utils";
import { shiftYmd, todayInVaccinationTimezone } from "@/lib/vaccination/reminderEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function clean(value: any) { return String(value ?? "").trim(); }
function positiveInt(value: any) { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : 0; }

// Read-only presentation: no registrations, records, reminder schedules or delivery status are mutated.
export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  const role = clean((user as any)?.role).toLowerCase();
  if (!["admin", "vaccination_admin", "vaccination_supervisor", "vaccination_report", "vaccination_validation"].includes(role)) {
    return fail("Tidak memiliki akses Reminder Vaksinasi.", 403);
  }
  try {
    const supabase = supabaseAdmin();
    const today = todayInVaccinationTimezone();
    // Sessions are selectors only. The API never changes event status or selection.
    const sessionsResult = await supabase.from("vaccination_sessions")
      .select("id,session_name,session_date,location,company_name,status")
      .order("session_date", { ascending: false }).order("id", { ascending: false }).limit(300);
    if (sessionsResult.error) throw new Error(sessionsResult.error.message);
    const sessions: any[] = sessionsResult.data || [];
    const requestedId = positiveInt(req.nextUrl.searchParams.get("session_id"));
    if (requestedId && !sessions.some((row: any) => Number(row.id) === requestedId)) {
      // Do not guess another session if the selected ID cannot be verified in the bounded list.
      return fail("Session yang dipilih tidak ditemukan dalam daftar terbaru.", 404);
    }
    const defaultSession = sessions.find((row: any) => clean(row.session_date) === today)
      || sessions.find((row: any) => clean(row.session_date) <= today)
      || sessions[0];
    const sessionId = requestedId || Number(defaultSession?.id || 0);
    const page = Math.min(Math.max(positiveInt(req.nextUrl.searchParams.get("page")) || 1, 1), 10000);
    const pageSize = 25;
    if (!sessionId) return NextResponse.json({ ok: true, today, sessions, sessionId: null, total: 0, page, pageSize, items: [] }, {headers: {"Cache-Control": "private, no-store"}});

    const base = () => supabase.from("vaccination_records").select(
      "id,registration_id,session_id,participant_name,vaccine_id,vaccine_name,dose_number,administered_at,next_due_date,status",
      { count: "exact" },
    ).eq("session_id", sessionId).in("status", ["ADMINISTERED", "DONE", "FINISHED"]);
    const result = await base().order("administered_at", { ascending: false })
      .order("id", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
    if (result.error) throw new Error(result.error.message);
    const records: any[] = result.data || [];
    const ids = records.map((row: any) => Number(row.id)).filter(Boolean);
    const registrationIds = [...new Set(records.map((row: any) => Number(row.registration_id)).filter(Boolean))];
    const vaccineIds = [...new Set(records.map((row: any) => Number(row.vaccine_id)).filter(Boolean))];

    const [registrations, series, reminders] = await Promise.all([
      registrationIds.length ? supabase.from("vaccination_registrations")
        .select("id,participant_name,employee_id,nik,company_name,email,phone")
        .in("id", registrationIds) : Promise.resolve({ data: [], error: null }),
      vaccineIds.length ? supabase.from("vaccination_vaccine_series_settings")
        .select("vaccine_id,is_series,schedule").in("vaccine_id", vaccineIds) : Promise.resolve({ data: [], error: null }),
      ids.length ? supabase.from("vaccination_reminders")
        .select("id,record_id,reminder_stage,reminder_date,status,wa_status,sent_at,wa_sent_at,error_message,wa_error_message,superseded_at")
        .in("record_id", ids).is("superseded_at", null)
        .order("reminder_date", { ascending: true }).limit(500) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const response of [registrations, series, reminders]) {
      if (response.error) throw new Error(response.error.message);
    }
    const regMap = new Map((registrations.data || []).map((row: any) => [Number(row.id), row]));
    const seriesMap = new Map((series.data || []).map((row: any) => [Number(row.vaccine_id), row]));
    const reminderMap = new Map<number, any[]>();
    for (const row of reminders.data || []) {
      const key = Number(row.record_id);
      if (!reminderMap.has(key)) reminderMap.set(key, []);
      reminderMap.get(key)!.push(row);
    }
    const stages = ["H7", "H3", "H1", "H0"];
    const items = records.map((record: any) => {
      const registration: any = regMap.get(Number(record.registration_id)) || {};
      const setting: any = seriesMap.get(Number(record.vaccine_id));
      const nextDueDate = clean(record.next_due_date);
      const existing = reminderMap.get(Number(record.id)) || [];
      // An expected date is not a dispatched or persisted reminder.
      const schedule = nextDueDate ? stages.map((stage) => {
        const days = stage === "H7" ? 7 : stage === "H3" ? 3 : stage === "H1" ? 1 : 0;
        const reminderDate = shiftYmd(nextDueDate, -days);
        const actual = existing.find((row) => clean(row.reminder_stage).toUpperCase() === stage && clean(row.reminder_date) === reminderDate);
        return {
          stage, reminder_date: reminderDate, persisted: Boolean(actual),
          email_status: clean(actual?.status) || "NOT_SCHEDULED",
          wa_status: clean(actual?.wa_status) || "NOT_SCHEDULED",
          sent_at: actual?.sent_at || null, wa_sent_at: actual?.wa_sent_at || null,
          error_message: actual?.error_message || null, wa_error_message: actual?.wa_error_message || null,
        };
      }) : [];
      const pending = schedule.filter((row) => row.reminder_date >= today && row.email_status !== "SENT" && row.email_status !== "CANCELLED");
      return {
        id: Number(record.id), registration_id: Number(record.registration_id),
        participant_name: clean(registration.participant_name) || clean(record.participant_name),
        employee_id: clean(registration.employee_id),
        company_name: clean(registration.company_name),
        vaccine_name: clean(record.vaccine_name), dose_number: Number(record.dose_number || 1),
        administered_at: record.administered_at, status: clean(record.status),
        series_type: setting ? (setting.is_series === true ? "SERIES" : "NON_SERIES") : "NOT_CLASSIFIED",
        next_due_date: nextDueDate || null,
        next_reminder_date: pending[0]?.reminder_date || null,
        reminder_schedule: schedule,
        schedule_note: nextDueDate ? "" : "Tidak ada tanggal dosis berikutnya yang tercatat; reminder tidak dijadwalkan otomatis.",
      };
    });
    return NextResponse.json({ ok: true, today, sessions, sessionId, page, pageSize,
      total: Number(result.count || 0), items },
      { headers: {"Cache-Control": "private, no-store, no-cache, max-age=0", Vary: "Cookie"} });
  } catch (error: any) {
    return fail(clean(error?.message || error || "Gagal memuat peserta Done."), 500);
  }
}
