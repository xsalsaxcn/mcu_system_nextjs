import { NextRequest } from "next/server";
import { addDays, clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

async function getSessionVaccines(supabase: any, sessionId: number) {
  const result = await supabase
    .from("vaccination_session_vaccines")
    .select(`
      *,
      vaccine:vaccination_vaccines(id,name,brand,default_next_dose_days,reminder_days_before),
      lot:vaccination_vaccine_lots(id,lot_number,expiry_date,stock_initial,stock_used)
    `)
    .eq("session_id", sessionId)
    .eq("active", true)
    .order("id", { ascending: true });

  if (result.error) return [];
  return result.data || [];
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  const supabase = supabaseAdmin();

  let regQuery = supabase
    .from("vaccination_registrations")
    .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date,public_queue_token,default_vaccine_id,default_lot_id), vaccine:vaccination_vaccines(id,name,brand,default_next_dose_days)")
    .in("queue_status", ["CALLED", "IN_PROGRESS", "WAITING"])
    .order("id", { ascending: true })
    .limit(300);

  if (sessionId) regQuery = regQuery.eq("session_id", sessionId);

  const regsResult = await regQuery;
  if (regsResult.error) return fail(regsResult.error.message, 500);

  const vaccinesResult = await supabase
    .from("vaccination_vaccines")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });

  if (vaccinesResult.error) return fail(vaccinesResult.error.message, 500);

  const lotsResult = await supabase
    .from("vaccination_vaccine_lots")
    .select("*, vaccine:vaccination_vaccines(id,name,brand,default_next_dose_days)")
    .eq("active", true)
    .order("id", { ascending: false });

  if (lotsResult.error) return fail(lotsResult.error.message, 500);

  const sessionVaccines = sessionId ? await getSessionVaccines(supabase, sessionId) : [];

  return ok({
    registrations: regsResult.data || [],
    vaccines: vaccinesResult.data || [],
    lots: lotsResult.data || [],
    sessionVaccines,
  });
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const registrationId = toInt(body.registrationId || body.registration_id, 0);
  const doseNumber = Math.max(1, toInt(body.doseNumber, 1));
  const administeredAtRaw = clean(body.administeredAt);
  const administeredAt = administeredAtRaw ? new Date(administeredAtRaw) : new Date();

  if (!registrationId) return fail("Peserta/antrian wajib dipilih.");

  const supabase = supabaseAdmin();

  const regResult = await supabase.from("vaccination_registrations").select("*").eq("id", registrationId).single();
  if (regResult.error) return fail(regResult.error.message, 500);
  const reg = regResult.data;

  const requestedVaccines = Array.isArray(body.vaccines)
    ? body.vaccines
    : [
        {
          vaccineId: body.vaccineId || body.vaccine_id,
          lotId: body.lotId || body.lot_id,
          doseNumber,
        },
      ];

  let vaccineItems = requestedVaccines
    .map((item: any) => ({
      vaccineId: toInt(item.vaccineId || item.vaccine_id, 0),
      lotId: toInt(item.lotId || item.lot_id, 0),
      doseNumber: Math.max(1, toInt(item.doseNumber || item.dose_number, doseNumber)),
    }))
    .filter((item: any) => item.vaccineId && item.lotId);

  if (!vaccineItems.length) {
    const sessionVaccines = await getSessionVaccines(supabase, toInt(reg.session_id, 0));
    vaccineItems = sessionVaccines.map((item: any) => ({
      vaccineId: toInt(item.vaccine_id, 0),
      lotId: toInt(item.lot_id, 0),
      doseNumber: Math.max(1, toInt(item.dose_number, 1)),
    }));
  }

  if (!vaccineItems.length) return fail("Minimal satu vaksin dan lot number wajib dipilih.");

  const records: any[] = [];

  for (const item of vaccineItems) {
    const vaccineResult = await supabase.from("vaccination_vaccines").select("*").eq("id", item.vaccineId).single();
    if (vaccineResult.error) return fail(vaccineResult.error.message, 500);
    const vaccine = vaccineResult.data;

    const lotResult = await supabase.from("vaccination_vaccine_lots").select("*").eq("id", item.lotId).single();
    if (lotResult.error) return fail(lotResult.error.message, 500);
    const lot = lotResult.data;

    if (Number(lot.vaccine_id) !== Number(item.vaccineId)) {
      return fail(`Lot ${lot.lot_number} tidak sesuai dengan vaksin ${vaccine.name}.`);
    }

    const nextDueDate = addDays(administeredAt, vaccine.default_next_dose_days);

    const recordPayload = {
      registration_id: registrationId,
      session_id: reg.session_id,
      participant_name: reg.participant_name,
      vaccine_id: item.vaccineId,
      lot_id: item.lotId,
      vaccine_name: vaccine.name,
      lot_number: lot.lot_number,
      dose_number: item.doseNumber,
      administered_at: administeredAt.toISOString(),
      administered_by: ((user as any).email || (user as any).name || (user as any).id || "system"),
      next_due_date: nextDueDate,
      notes: clean(body.notes) || null,
      status: "ADMINISTERED",
    };

    const recordResult = await supabase.from("vaccination_records").insert(recordPayload).select("*").single();
    if (recordResult.error) return fail(recordResult.error.message, 500);

    records.push(recordResult.data);

    const newUsed = Number(lot.stock_used || 0) + 1;
    await supabase
      .from("vaccination_vaccine_lots")
      .update({ stock_used: newUsed, updated_at: new Date().toISOString() })
      .eq("id", item.lotId);

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
  }

  await supabase
    .from("vaccination_registrations")
    .update({
      queue_status: "ADMINISTERED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", registrationId);

  const ids = records.map((record) => record.id).join(",");
  const stickerUrl = records.length > 1 ? `/vaccination/sticker/bulk?ids=${encodeURIComponent(ids)}` : `/vaccination/sticker/${records[0].id}`;

  return ok({
    message: records.length > 1 ? `${records.length} vaksin berhasil ditandai Done. Sticker siap diprint.` : "Vaksin berhasil ditandai Done. Sticker siap diprint.",
    record: records[0],
    records,
    stickerUrl,
  });
}
