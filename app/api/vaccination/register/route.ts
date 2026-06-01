import { NextRequest } from "next/server";
import { clean, fail, formatQueueNumber, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

function userLabel(user: any) {
  return user?.email || user?.name || user?.id || "system";
}

async function getNextQueueNumber(supabase: any, sessionId: number) {
  const result = await supabase
    .from("vaccination_registrations")
    .select("queue_number")
    .eq("session_id", sessionId)
    .not("queue_number", "is", null);

  if (result.error) throw new Error(result.error.message);

  let maxNumber = 0;
  for (const row of result.data || []) {
    const text = String(row.queue_number || "");
    const match = text.match(/(\d+)$/);
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > maxNumber) maxNumber = n;
  }

  return formatQueueNumber(maxNumber + 1);
}

function normalizeItems(rawItems: any[], fallback: Record<string, any> = {}) {
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((item: any) => ({
      id: toInt(item.id || item.itemId || item.item_id, 0) || null,
      vaccine_id: toInt(item.vaccineId || item.vaccine_id, 0),
      lot_id: toInt(item.lotId || item.lot_id, 0) || null,
      dose_number: Math.max(1, toInt(item.doseNumber || item.dose_number, 1)),
      price_category: clean(item.priceCategory || item.price_category) || clean(fallback.priceCategory) || null,
      price: item.price === "" || item.price == null ? (fallback.price ?? null) : Number(item.price),
      payment_method: clean(item.paymentMethod || item.payment_method) || clean(fallback.paymentMethod) || null,
      payment_note: clean(item.paymentNote || item.payment_note) || clean(fallback.paymentNote) || null,
      item_note: clean(item.itemNote || item.item_note) || null,
    }))
    .filter((item: any) => item.vaccine_id);
}

async function attachRegistrationItems(supabase: any, registrations: any[]) {
  const regIds = (registrations || []).map((row: any) => Number(row.id)).filter(Boolean);
  if (!regIds.length) return registrations || [];

  const itemsResult = await supabase
    .from("vaccination_registration_items")
    .select("*, vaccine:vaccination_vaccines(id,name,brand,price,price_category), lot:vaccination_vaccine_lots(id,lot_number,expiry_date,stock_initial,stock_added,stock_used)")
    .in("registration_id", regIds)
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

async function createItemsForRegistration(supabase: any, registration: any, items: any[], user: any, source = "registration") {
  if (!items.length) return [];

  const vaccineIds = Array.from(new Set(items.map((item) => item.vaccine_id).filter(Boolean)));
  const vaccinesResult = await supabase
    .from("vaccination_vaccines")
    .select("id,price,price_category")
    .in("id", vaccineIds);

  if (vaccinesResult.error) throw new Error(vaccinesResult.error.message);
  const vaccineMap = new Map<number, any>((vaccinesResult.data || []).map((v: any) => [Number(v.id), v]));

  const rows = items.map((item) => {
    const vaccine = vaccineMap.get(Number(item.vaccine_id)) || {};
    return {
      registration_id: registration.id,
      session_id: registration.session_id,
      vaccine_id: item.vaccine_id,
      lot_id: item.lot_id || null,
      dose_number: item.dose_number || 1,
      price_category: item.price_category || vaccine.price_category || null,
      price: item.price == null ? (vaccine.price ?? null) : item.price,
      payment_method: item.payment_method || null,
      payment_note: item.payment_note || null,
      item_note: item.item_note || null,
      item_source: source,
      status: source === "registration_edit" ? "WAITING" : (String(registration.queue_status || "").toUpperCase() === "ADMINISTERED" ? "ADMINISTERED" : "WAITING"),
      active: true,
      created_by: userLabel(user),
    };
  });

  const result = await supabase
    .from("vaccination_registration_items")
    .insert(rows)
    .select("*, vaccine:vaccination_vaccines(id,name,brand,price,price_category), lot:vaccination_vaccine_lots(id,lot_number,expiry_date)");

  if (result.error) throw new Error(result.error.message);
  return result.data || [];
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  const sourceId = toInt(req.nextUrl.searchParams.get("source_id"), 0);
  const supabase = supabaseAdmin();

  let query = supabase
    .from("vaccination_registrations")
    .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date,public_queue_token,source_id,source_name,default_vaccine_id,default_lot_id), vaccine:vaccination_vaccines(id,name,brand,price,price_category)")
    .order("id", { ascending: false })
    .limit(1000);

  if (sessionId) query = query.eq("session_id", sessionId);
  if (sourceId) query = query.eq("source_id", sourceId);

  const result = await query;
  if (result.error) return fail(result.error.message, 500);

  try {
    const registrations = await attachRegistrationItems(supabase, result.data || []);
    return ok({ registrations });
  } catch (error: any) {
    return fail(error?.message || "Gagal mengambil item vaksin registrasi.", 500);
  }
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const action = clean(body.action);
  const supabase = supabaseAdmin();

  if (action === "release-queue") {
    const registrationId = toInt(body.registrationId || body.registration_id, 0);
    if (!registrationId) return fail("Peserta registrasi wajib dipilih.");

    const regResult = await supabase
      .from("vaccination_registrations")
      .select("*")
      .eq("id", registrationId)
      .single();

    if (regResult.error) return fail(regResult.error.message, 500);

    const reg = regResult.data;
    if (clean(reg.queue_number)) {
      return ok({ message: `Nomor antrian sudah dirilis: ${reg.queue_number}`, registration: reg });
    }

    const queueNumber = await getNextQueueNumber(supabase, Number(reg.session_id));

    const updateResult = await supabase
      .from("vaccination_registrations")
      .update({
        queue_number: queueNumber,
        queue_status: "WAITING",
        updated_at: new Date().toISOString(),
      })
      .eq("id", registrationId)
      .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date,public_queue_token,source_id,source_name,default_vaccine_id,default_lot_id), vaccine:vaccination_vaccines(id,name,brand,price,price_category)")
      .single();

    if (updateResult.error) return fail(updateResult.error.message, 500);

    return ok({ message: `Nomor antrian berhasil dirilis: ${queueNumber}`, registration: updateResult.data });
  }

  if (action === "update-products") {
    const registrationId = toInt(body.registrationId || body.registration_id, 0);
    if (!registrationId) return fail("Peserta registrasi wajib dipilih.");

    const regResult = await supabase
      .from("vaccination_registrations")
      .select("*")
      .eq("id", registrationId)
      .single();

    if (regResult.error) return fail(regResult.error.message, 500);
    const registration = regResult.data;

    const items = normalizeItems(body.items || [], {
      paymentMethod: body.paymentMethod,
      paymentNote: body.paymentNote,
    });

    const oldItems = await supabase
      .from("vaccination_registration_items")
      .select("*, vaccine:vaccination_vaccines(id,name,brand,price,price_category), lot:vaccination_vaccine_lots(id,lot_number,expiry_date)")
      .eq("registration_id", registrationId)
      .eq("active", true);

    if (oldItems.error) return fail(oldItems.error.message, 500);

    const oldRows = oldItems.data || [];
    const administeredRows = oldRows.filter((item: any) => ["ADMINISTERED", "DONE"].includes(String(item.status || "").toUpperCase()));
    const administeredIds = new Set(administeredRows.map((item: any) => Number(item.id)).filter(Boolean));

    // Produk yang sudah Done tidak boleh diubah/hapus. Produk tersebut dipertahankan.
    // Baris yang belum Done akan diganti sesuai input terbaru dari registrasi.
    const editableItems = items.filter((item: any) => !item.id || !administeredIds.has(Number(item.id)));
    const preservedAdministered = administeredRows;

    if (!editableItems.length && !preservedAdministered.length) return fail("Minimal satu produk/vaksin wajib dipilih.");

    const deleteResult = await supabase
      .from("vaccination_registration_items")
      .delete()
      .eq("registration_id", registrationId)
      .eq("active", true)
      .not("status", "in", '("ADMINISTERED","DONE")');

    if (deleteResult.error) return fail(deleteResult.error.message, 500);

    let insertedItems: any[] = [];
    if (editableItems.length) {
      try {
        insertedItems = await createItemsForRegistration(supabase, registration, editableItems, user, "registration_edit");
      } catch (error: any) {
        return fail(error?.message || "Gagal menyimpan produk peserta.", 500);
      }
    }

    const currentStatus = String(registration.queue_status || "").toUpperCase();
    const hasQueue = Boolean(clean(registration.queue_number));
    const newStatus = editableItems.length && hasQueue ? "WAITING_WITH_NOTE" : (registration.queue_status || "REGISTERED");
    const note = clean(body.changeNote || body.statusNote || body.note) || (editableItems.length ? "Produk/tindakan diubah dari registrasi." : clean(registration.status_note));
    const firstEditable: any = editableItems[0] || {};
    const firstPreserved: any = preservedAdministered[0] || {};
    const firstItem: any = firstEditable.vaccine_id ? firstEditable : firstPreserved;

    const updateResult = await supabase
      .from("vaccination_registrations")
      .update({
        vaccine_id: firstItem.vaccine_id || registration.vaccine_id || null,
        payment_price: firstEditable.price ?? registration.payment_price ?? null,
        payment_method: firstEditable.payment_method || registration.payment_method || null,
        payment_note: firstEditable.payment_note || registration.payment_note || null,
        queue_status: newStatus,
        status_note: note || null,
        last_product_change_at: editableItems.length ? new Date().toISOString() : registration.last_product_change_at,
        last_product_change_by: editableItems.length ? userLabel(user) : registration.last_product_change_by,
        updated_at: new Date().toISOString(),
      })
      .eq("id", registrationId)
      .select("*, vaccine:vaccination_vaccines(id,name,brand,price,price_category)")
      .single();

    if (updateResult.error) return fail(updateResult.error.message, 500);

    const combinedItems = [...preservedAdministered, ...insertedItems];

    return ok({
      message: newStatus === "WAITING_WITH_NOTE" ? "Produk berhasil diubah. Status kembali ke Waiting With Note untuk dipanggil ulang." : "Produk berhasil diubah.",
      registration: { ...updateResult.data, items: combinedItems },
      items: combinedItems,
    });
  }

  const sessionId = toInt(body.sessionId || body.session_id, 0);
  const participantName = clean(body.participantName || body.participant_name);

  if (!sessionId) return fail("Session wajib dipilih.");
  if (!participantName) return fail("Nama peserta wajib diisi.");

  const sessionResult = await supabase.from("vaccination_sessions").select("*").eq("id", sessionId).single();
  if (sessionResult.error) return fail(sessionResult.error.message, 500);
  const session = sessionResult.data || {};

  const vaccineIdInput = toInt(body.vaccineId, 0);
  const vaccineId = vaccineIdInput || toInt(session.default_vaccine_id, 0) || null;
  const lotId = toInt(body.lotId, 0) || toInt(session.default_lot_id, 0) || null;
  const queueNumber = clean(body.queueNumber) || await getNextQueueNumber(supabase, sessionId);

  const payload: Record<string, any> = {
    session_id: sessionId,
    source_id: toInt(body.sourceId, 0) || toInt(session.source_id, 0) || null,
    participant_id: toInt(body.participantId, 0) || null,
    vaccine_id: vaccineId || null,
    participant_name: participantName,
    employee_id: clean(body.employeeId) || null,
    nik: clean(body.nik) || null,
    mcu_id: clean(body.mcuId) || null,
    email: clean(body.email) || null,
    phone: clean(body.phone) || null,
    company_name: clean(body.companyName) || clean(session.company_name) || null,
    department: clean(body.department) || null,
    payment_price: body.paymentPrice === "" || body.paymentPrice == null ? null : Number(body.paymentPrice),
    payment_method: clean(body.paymentMethod) || null,
    payment_note: clean(body.paymentNote) || null,
    queue_number: queueNumber,
    queue_status: "WAITING",
    registered_by: userLabel(user),
  };

  const result = await supabase
    .from("vaccination_registrations")
    .insert(payload)
    .select("*, session:vaccination_sessions(id,session_name,company_name,location,session_date,public_queue_token,source_id,source_name,default_vaccine_id,default_lot_id), vaccine:vaccination_vaccines(id,name,brand,price,price_category)")
    .single();

  if (result.error) return fail(result.error.message, 500);

  let insertedItems: any[] = [];
  const items = normalizeItems(body.items || [], { paymentMethod: body.paymentMethod, paymentNote: body.paymentNote });
  if (!items.length && vaccineId) {
    items.push({
      id: null,
      vaccine_id: vaccineId,
      lot_id: lotId,
      dose_number: 1,
      price_category: clean(body.priceCategory) || null,
      price: body.paymentPrice === "" || body.paymentPrice == null ? null : Number(body.paymentPrice),
      payment_method: clean(body.paymentMethod) || null,
      payment_note: clean(body.paymentNote) || null,
      item_note: null,
    });
  }

  if (items.length) {
    try {
      insertedItems = await createItemsForRegistration(supabase, result.data, items, user, "walk_in");
    } catch (error: any) {
      return fail(error?.message || "Registrasi berhasil, tapi gagal membuat item vaksin.", 500);
    }
  }

  return ok({
    message: `Registrasi ulang berhasil. Nomor antrian: ${queueNumber}`,
    registration: { ...result.data, items: insertedItems },
  });
}
