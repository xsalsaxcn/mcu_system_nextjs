import { NextRequest } from "next/server";
import { addDays, clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  const supabase = supabaseAdmin();

  let regQuery = supabase
    .from("vaccination_registrations")
    .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date,public_queue_token), vaccine:vaccination_vaccines(id,name,brand,default_next_dose_days)")
    .in("queue_status", ["CALLED", "IN_PROGRESS", "WAITING"])
    .order("id", { ascending: true })
    .limit(300);

  if (sessionId) regQuery = regQuery.eq("session_id", sessionId);

  const regsResult = await regQuery;
  if (regsResult.error) return fail(regsResult.error.message, 500);

  const vaccinesResult = await supabase.from("vaccination_vaccines").select("*").eq("active", true).order("name", { ascending: true });
  if (vaccinesResult.error) return fail(vaccinesResult.error.message, 500);

  const lotsResult = await supabase
    .from("vaccination_vaccine_lots")
    .select("*, vaccine:vaccination_vaccines(id,name,brand,default_next_dose_days)")
    .eq("active", true)
    .order("id", { ascending: false });

  if (lotsResult.error) return fail(lotsResult.error.message, 500);

  return ok({ registrations: regsResult.data || [], vaccines: vaccinesResult.data || [], lots: lotsResult.data || [] });
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const registrationId = toInt(body.registrationId || body.registration_id, 0);
  const vaccineId = toInt(body.vaccineId || body.vaccine_id, 0);
  const lotId = toInt(body.lotId || body.lot_id, 0);
  const doseNumber = Math.max(1, toInt(body.doseNumber, 1));
  const administeredAtRaw = clean(body.administeredAt);
  const administeredAt = administeredAtRaw ? new Date(administeredAtRaw) : new Date();

  if (!registrationId) return fail("Peserta/antrian wajib dipilih.");
  if (!vaccineId) return fail("Vaksin wajib dipilih.");
  if (!lotId) return fail("Lot number wajib dipilih.");

  const supabase = supabaseAdmin();

  const regResult = await supabase.from("vaccination_registrations").select("*").eq("id", registrationId).single();
  if (regResult.error) return fail(regResult.error.message, 500);
  const reg = regResult.data;

  const vaccineResult = await supabase.from("vaccination_vaccines").select("*").eq("id", vaccineId).single();
  if (vaccineResult.error) return fail(vaccineResult.error.message, 500);
  const vaccine = vaccineResult.data;

  const lotResult = await supabase.from("vaccination_vaccine_lots").select("*").eq("id", lotId).single();
  if (lotResult.error) return fail(lotResult.error.message, 500);
  const lot = lotResult.data;

  if (Number(lot.vaccine_id) !== Number(vaccineId)) return fail("Lot number tidak sesuai dengan vaksin yang dipilih.");

  const nextDueDate = addDays(administeredAt, vaccine.default_next_dose_days);

  const recordResult = await supabase
    .from("vaccination_records")
    .insert({
      registration_id: registrationId,
      session_id: reg.session_id,
      participant_name: reg.participant_name,
      vaccine_id: vaccineId,
      lot_id: lotId,
      vaccine_name: vaccine.name,
      lot_number: lot.lot_number,
      dose_number: doseNumber,
      administered_at: administeredAt.toISOString(),
      administered_by: ((user as any).email || (user as any).name || (user as any).id || "system"),
      next_due_date: nextDueDate,
      notes: clean(body.notes) || null,
      status: "ADMINISTERED",
    })
    .select("*")
    .single();

  if (recordResult.error) return fail(recordResult.error.message, 500);

  await supabase.from("vaccination_vaccine_lots").update({ stock_used: Number(lot.stock_used || 0) + 1, updated_at: new Date().toISOString() }).eq("id", lotId);
  await supabase.from("vaccination_registrations").update({ vaccine_id: vaccineId, queue_status: "ADMINISTERED", updated_at: new Date().toISOString() }).eq("id", registrationId);

  if (nextDueDate && clean(reg.email)) {
    const reminderDays = Array.isArray(vaccine.reminder_days_before) ? vaccine.reminder_days_before : [7, 3, 1];
    const reminderRows = reminderDays.map((days: number) => {
      const d = new Date(nextDueDate);
      d.setDate(d.getDate() - Number(days || 0));
      return {
        record_id: recordResult.data.id,
        registration_id: registrationId,
        participant_email: reg.email,
        participant_name: reg.participant_name,
        vaccine_name: vaccine.name,
        next_due_date: nextDueDate,
        reminder_date: d.toISOString().slice(0, 10),
        status: "PENDING",
      };
    });
    await supabase.from("vaccination_reminders").insert(reminderRows);
  }

  return ok({ message: "Vaksin berhasil ditandai Done. Sticker siap diprint.", record: recordResult.data, stickerUrl: `/vaccination/sticker/${recordResult.data.id}` });
}
