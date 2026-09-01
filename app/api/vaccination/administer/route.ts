import { NextRequest } from "next/server";
import { addDays, clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

function normalizePrintHandler(value: any) {
  const raw = clean(value).toUpperCase();
  return raw === "VALIDASI" || raw === "TIM_VALIDASI" || raw === "TIM VALIDASI" ? "VALIDASI" : "MEDIS";
}

function missingColumn(error: any) {
  const msg = String(error?.message || "").toLowerCase();
  return String(error?.code || "") === "42703" || msg.includes("column") || msg.includes("schema cache");
}

async function getPrintLabelHandler(supabase: any, sessionId: number, fallback: any) {
  const fallbackMode = normalizePrintHandler(fallback || "MEDIS");
  if (!sessionId) return fallbackMode;

  const result = await supabase
    .from("vaccination_sessions")
    .select("print_label_handler")
    .eq("id", sessionId)
    .maybeSingle();

  if (result.error) return fallbackMode;
  return normalizePrintHandler(result.data?.print_label_handler || fallbackMode);
}

async function getSessionVaccines(supabase: any, sessionId: number) {
  const result = await supabase
    .from("vaccination_session_vaccines")
    .select(`
      *,
      vaccine:vaccination_vaccines(id,name,brand,default_next_dose_days,reminder_days_before,price,price_category),
      lot:vaccination_vaccine_lots(id,lot_number,expiry_date,stock_initial,stock_added,stock_used)
    `)
    .eq("session_id", sessionId)
    .eq("active", true)
    .order("id", { ascending: true });

  if (result.error) return [];
  return result.data || [];
}


async function attachRegistrationItems(supabase: any, registrations: any[]) {
  const ids = (registrations || []).map((row: any) => Number(row.id)).filter(Boolean);
  if (!ids.length) return registrations || [];

  const itemsResult = await supabase
    .from("vaccination_registration_items")
    .select("*, vaccine:vaccination_vaccines(id,name,brand,default_next_dose_days,price,price_category), lot:vaccination_vaccine_lots(id,lot_number,expiry_date,stock_initial,stock_added,stock_used)")
    .in("registration_id", ids)
    .eq("active", true)
    .order("id", { ascending: true });

  if (itemsResult.error) throw new Error(itemsResult.error.message);

  const byReg = new Map<number, any[]>();
  for (const item of itemsResult.data || []) {
    const key = Number(item.registration_id);
    if (!byReg.has(key)) byReg.set(key, []);
    byReg.get(key)!.push(item);
  }

  return (registrations || []).map((registration: any) => ({
    ...registration,
    items: byReg.get(Number(registration.id)) || [],
  }));
}

async function getRegistrationItems(supabase: any, registrationId: number) {
  const result = await supabase
    .from("vaccination_registration_items")
    .select("*, vaccine:vaccination_vaccines(id,name,brand,default_next_dose_days,reminder_days_before), lot:vaccination_vaccine_lots(id,lot_number,expiry_date,stock_initial,stock_added,stock_used)")
    .eq("registration_id", registrationId)
    .eq("active", true)
    .order("id", { ascending: true });

  if (result.error) throw new Error(result.error.message);
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
    .in("queue_status", ["CALLED", "IN_PROGRESS", "WAITING", "WAITING_WITH_NOTE"])
    .order("queue_number", { ascending: true, nullsFirst: false })
    .limit(500);

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

  let recordsQuery = supabase
    .from("vaccination_records")
    .select("*, registration:vaccination_registrations(id,queue_number,participant_name,mcu_id,employee_id,department,company_name), session:vaccination_sessions(id,session_name,company_name)")
    .order("administered_at", { ascending: false })
    .limit(1000);

  if (sessionId) recordsQuery = recordsQuery.eq("session_id", sessionId);

  const recordsResult = await recordsQuery;
  if (recordsResult.error) return fail(recordsResult.error.message, 500);

  const sessionVaccines = sessionId ? await getSessionVaccines(supabase, sessionId) : [];
  const doctorNames = Array.from(
    new Set((recordsResult.data || []).map((record: any) => clean(record.administered_by)).filter(Boolean))
  ).sort();

  let registrationsWithItems: any[] = [];
  try {
    registrationsWithItems = await attachRegistrationItems(supabase, regsResult.data || []);
  } catch (error: any) {
    return fail(error?.message || "Gagal mengambil item produk peserta.", 500);
  }

  return ok({
    registrations: registrationsWithItems,
    vaccines: vaccinesResult.data || [],
    lots: lotsResult.data || [],
    sessionVaccines,
    completedRecords: recordsResult.data || [],
    doctorNames,
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
  const administeredBy = clean(body.administeredByName) || clean(body.doctorName) || ((user as any).email || (user as any).name || (user as any).id || "system");

  if (!registrationId) return fail("Peserta/antrian wajib dipilih.");

  const supabase = supabaseAdmin();

  const regResult = await supabase.from("vaccination_registrations").select("*").eq("id", registrationId).single();
  if (regResult.error) return fail(regResult.error.message, 500);
  const reg = regResult.data;
  const printLabelHandler = await getPrintLabelHandler(
    supabase,
    toInt(reg.session_id, 0),
    body.printLabelHandler || body.print_label_handler
  );
  const validationPrint = printLabelHandler === "VALIDASI";

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
      itemId: toInt(item.itemId || item.item_id || item.id, 0) || null,
      vaccineId: toInt(item.vaccineId || item.vaccine_id, 0),
      lotId: toInt(item.lotId || item.lot_id, 0),
      doseNumber: Math.max(1, toInt(item.doseNumber || item.dose_number, doseNumber)),
    }))
    .filter((item: any) => item.vaccineId && item.lotId);

  if (!vaccineItems.length) {
    const regItems = await getRegistrationItems(supabase, registrationId);
    vaccineItems = regItems.map((item: any) => ({
      itemId: toInt(item.id, 0) || null,
      vaccineId: toInt(item.vaccine_id, 0),
      lotId: toInt(item.lot_id, 0),
      doseNumber: Math.max(1, toInt(item.dose_number, 1)),
    })).filter((item: any) => item.vaccineId && item.lotId);
  }

  if (!vaccineItems.length) {
    const sessionVaccines = await getSessionVaccines(supabase, toInt(reg.session_id, 0));
    vaccineItems = sessionVaccines.map((item: any) => ({
      itemId: null,
      vaccineId: toInt(item.vaccine_id, 0),
      lotId: toInt(item.lot_id, 0),
      doseNumber: Math.max(1, toInt(item.dose_number, 1)),
    }));
  }

  if (!vaccineItems.length) return fail("Minimal satu vaksin dan lot number wajib dipilih.");

  const activeItemsBefore = await getRegistrationItems(supabase, registrationId);
  const itemById = new Map<number, any>((activeItemsBefore || []).map((item: any) => [Number(item.id), item]));

  // Jika UI mengirim itemId, pakai data item dari database sebagai sumber kebenaran.
  // Ini membuat vaksin tambahan dari Registrasi tetap bisa di-Done meskipun produk/lot sama
  // dengan vaksin sebelumnya atau state UI belum refresh sempurna.
  vaccineItems = vaccineItems.map((item: any) => {
    if (!item.itemId) return item;
    const existing = itemById.get(Number(item.itemId));
    if (!existing) return item;
    return {
      ...item,
      vaccineId: toInt(existing.vaccine_id, item.vaccineId),
      lotId: toInt(existing.lot_id, item.lotId),
      doseNumber: Math.max(1, toInt(existing.dose_number, item.doseNumber || 1)),
      status: existing.status,
    };
  });

  const doneItemKeys = new Set(
    (activeItemsBefore || [])
      .filter((item: any) => ["ADMINISTERED", "DONE"].includes(String(item.status || "").toUpperCase()))
      .map((item: any) => `${Number(item.vaccine_id)}:${Number(item.lot_id)}`)
  );

  vaccineItems = vaccineItems.filter((item: any) => {
    if (item.itemId) {
      const existing = itemById.get(Number(item.itemId));
      return existing && !["ADMINISTERED", "DONE"].includes(String(existing?.status || "").toUpperCase());
    }
    return !doneItemKeys.has(`${Number(item.vaccineId)}:${Number(item.lotId)}`);
  });

  if (!vaccineItems.length) return fail("Semua vaksin yang dipilih sudah berstatus Done.");

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
      administered_by: administeredBy,
      next_due_date: nextDueDate,
      notes: clean(body.notes) || null,
      status: "ADMINISTERED",
    };

    const recordResult = await supabase.from("vaccination_records").insert(recordPayload).select("*").single();
    if (recordResult.error) return fail(recordResult.error.message, 500);

    records.push(recordResult.data);

    if ((item as any).itemId) {
      await supabase
        .from("vaccination_registration_items")
        .update({
          status: "ADMINISTERED",
          administered_record_id: recordResult.data.id,
          administered_at: administeredAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", (item as any).itemId)
        .eq("registration_id", registrationId);
    } else {
      await supabase
        .from("vaccination_registration_items")
        .update({
          status: "ADMINISTERED",
          administered_record_id: recordResult.data.id,
          administered_at: administeredAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("registration_id", registrationId)
        .eq("vaccine_id", item.vaccineId)
        .eq("lot_id", item.lotId)
        .eq("active", true);
    }

    const newUsed = Number(lot.stock_used || 0) + 1;
    await supabase
      .from("vaccination_vaccine_lots")
      .update({ stock_used: newUsed, updated_at: new Date().toISOString() })
      .eq("id", item.lotId);

    await supabase.from("vaccination_inventory_movements").insert({
      vaccine_id: item.vaccineId,
      lot_id: item.lotId,
      movement_type: "administered",
      qty: -1,
      reference_type: "vaccination_record",
      reference_id: recordResult.data.id,
      notes: `${reg.participant_name || "Peserta"} · ${vaccine.name} · Lot ${lot.lot_number}`,
      created_by: administeredBy,
    });

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

  if (!records.length) return fail("Tidak ada vaksin Not Done yang diproses.");

  const remainingItemsResult = await supabase
    .from("vaccination_registration_items")
    .select("id,status")
    .eq("registration_id", registrationId)
    .eq("active", true);

  if (remainingItemsResult.error) return fail(remainingItemsResult.error.message, 500);

  const hasRemainingNotDone = (remainingItemsResult.data || []).some((item: any) => !["ADMINISTERED", "DONE"].includes(String(item.status || "").toUpperCase()));

  const now = new Date().toISOString();
  const nextRegistrationPayload: any = hasRemainingNotDone
    ? {
        queue_status: "IN_PROGRESS",
        status_note: reg.status_note || "Masih ada produk/vaksin Not Done.",
        updated_at: now,
      }
    : validationPrint
      ? {
          queue_status: "PENDING_VALIDATION",
          validation_status: "PENDING",
          print_status: "NOT_PRINTED",
          updated_at: now,
        }
      : {
          queue_status: "ADMINISTERED",
          status_note: reg.status_note,
          updated_at: now,
        };

  const registrationUpdate = await supabase
    .from("vaccination_registrations")
    .update(nextRegistrationPayload)
    .eq("id", registrationId);

  if (registrationUpdate.error) {
    if (validationPrint && missingColumn(registrationUpdate.error)) {
      const fallbackUpdate = await supabase
        .from("vaccination_registrations")
        .update({ queue_status: "PENDING_VALIDATION", updated_at: now })
        .eq("id", registrationId);
      if (fallbackUpdate.error) return fail(fallbackUpdate.error.message, 500);
    } else {
      return fail(registrationUpdate.error.message, 500);
    }
  }

  const ids = records.map((record) => record.id).join(",");
  const stickerUrl = records.length > 1 ? `/vaccination/sticker/bulk?ids=${encodeURIComponent(ids)}` : `/vaccination/sticker/${records[0].id}`;
  const validationMessage = records.length > 1
    ? `${records.length} produk berhasil ditandai Done. Peserta dikirim ke Tim Validasi untuk print label dan status selesai.`
    : "Produk berhasil ditandai Done. Peserta dikirim ke Tim Validasi untuk print label dan status selesai.";
  const validationPartialMessage = records.length > 1
    ? `${records.length} produk berhasil ditandai Done. Masih ada produk Not Done; peserta belum dikirim ke Tim Validasi.`
    : "Produk berhasil ditandai Done. Masih ada produk Not Done; peserta belum dikirim ke Tim Validasi.";
  const medisMessage = records.length > 1
    ? `${records.length} vaksin berhasil ditandai Done. Sticker siap diprint.`
    : "Vaksin berhasil ditandai Done. Sticker siap diprint.";
  const message = validationPrint
    ? (hasRemainingNotDone ? validationPartialMessage : validationMessage)
    : medisMessage;

  return ok({
    message,
    record: records[0],
    records,
    stickerUrl: validationPrint ? null : stickerUrl,
    printLabelHandler,
    validationPending: validationPrint && !hasRemainingNotDone,
  });
}
