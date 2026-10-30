import { NextRequest } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAYMENT_METHODS = new Set(["QRIS", "DEBIT", "CREDIT_CARD", "TRANSFER"]);

function actorLabel(user: any) {
  return clean(user?.email || user?.name || user?.id) || "Tim Registrasi";
}

function normalizePayment(value: any) {
  const raw = clean(value).toUpperCase().replace(/[ -]+/g, "_");
  const alias = raw === "CC" || raw === "CREDITCARD" || raw === "KARTU_KREDIT" ? "CREDIT_CARD" : raw;
  return PAYMENT_METHODS.has(alias) ? alias : "";
}

function normalizeSaleMode(value: any): "PACKAGE" | "NON_PACKAGE" {
  return clean(value).toUpperCase() === "PACKAGE" ? "PACKAGE" : "NON_PACKAGE";
}

function money(value: any) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function bazarUsesInternalQueue(session: any) {
  const config = session?.existing_flow_config || {};
  const legacy = config?.queue !== false;
  return config?.queue_bazar === undefined ? legacy : config?.queue_bazar !== false;
}

async function nextBazarQueue(supabase: any, sessionId: number) {
  const result = await supabase
    .from("vaccination_registrations")
    .select("bazar_queue_sequence,bazar_queue_number")
    .eq("session_id", sessionId)
    .not("bazar_queue_number", "is", null);
  if (result.error) throw new Error(result.error.message);
  let max = 0;
  for (const row of result.data || []) {
    const sequence = Number((row as any).bazar_queue_sequence || 0);
    const match = clean((row as any).bazar_queue_number).match(/(\d+)$/);
    max = Math.max(max, sequence, match ? Number(match[1]) : 0);
  }
  const sequence = max + 1;
  return { sequence, number: `B-${String(sequence).padStart(3, "0")}` };
}

async function loadBazarStockRemaining(supabase: any, sessionId: number, lotIds: number[]) {
  const map = new Map<number, number>();
  if (!lotIds.length) return { enabled: false, map };
  const allocationsResult = await supabase
    .from("vaccination_session_stock_allocations")
    .select("lot_id,allocated_qty,active")
    .eq("session_id", sessionId)
    .eq("service_mode", "BAZAR")
    .eq("active", true)
    .in("lot_id", lotIds);
  if (allocationsResult.error) throw new Error(allocationsResult.error.message);
  const allocations = allocationsResult.data || [];
  if (!allocations.length) return { enabled: false, map };

  const usedResult = await supabase
    .from("vaccination_registration_items")
    .select("lot_id,status,registration:vaccination_registrations!inner(session_id)")
    .in("lot_id", lotIds)
    .eq("service_mode", "BAZAR")
    .eq("active", true)
    .in("status", ["ADMINISTERED", "DONE"])
    .eq("registration.session_id", sessionId)
    .limit(20000);
  if (usedResult.error) throw new Error(usedResult.error.message);

  const used = new Map<number, number>();
  for (const row of usedResult.data || []) {
    const lotId = Number((row as any).lot_id || 0);
    if (lotId) used.set(lotId, (used.get(lotId) || 0) + 1);
  }
  for (const row of allocations) {
    const lotId = Number((row as any).lot_id || 0);
    if (!lotId) continue;
    map.set(lotId, Math.max(0, Number((row as any).allocated_qty || 0) - (used.get(lotId) || 0)));
  }
  return { enabled: true, map };
}

async function prepareItems(supabase: any, sessionId: number, selectedItemsRaw: any[], paymentMethod: string) {
  const selectedItems = Array.isArray(selectedItemsRaw) ? selectedItemsRaw : [];
  if (!selectedItems.length) throw new Error("Self Booking tidak memiliki produk Bazar.");

  const vaccineIds = Array.from(new Set<number>(selectedItems.map((item: any) => Number(item?.vaccineId || 0)).filter((id: number) => id > 0)));
  const lotIds = Array.from(new Set<number>(selectedItems.map((item: any) => Number(item?.lotId || 0)).filter((id: number) => id > 0)));
  if (!vaccineIds.length || !lotIds.length) throw new Error("Produk Self Booking tidak valid.");

  const [assignments, sessionLots, offers, vaccines, stock] = await Promise.all([
    supabase
      .from("vaccination_session_product_assignments")
      .select("vaccine_id")
      .eq("session_id", sessionId)
      .eq("service_mode", "BAZAR")
      .eq("active", true)
      .in("vaccine_id", vaccineIds),
    supabase
      .from("vaccination_session_vaccines")
      .select("vaccine_id,lot_id,active,lot:vaccination_vaccine_lots(id,lot_number,active)")
      .eq("session_id", sessionId)
      .eq("active", true)
      .in("vaccine_id", vaccineIds)
      .in("lot_id", lotIds),
    supabase
      .from("vaccination_vaccine_sales_options")
      .select("id,vaccine_id,sale_mode,package_dose_count,price,active")
      .in("vaccine_id", vaccineIds)
      .eq("active", true),
    supabase
      .from("vaccination_vaccines")
      .select("id,name,brand,price,active")
      .in("id", vaccineIds),
    loadBazarStockRemaining(supabase, sessionId, lotIds),
  ]);
  for (const result of [assignments, sessionLots, offers, vaccines]) {
    if (result.error) throw new Error(result.error.message);
  }

  const assignmentSet = new Set<number>((assignments.data || []).map((row: any) => Number(row.vaccine_id || 0)));
  const sessionLotSet = new Set<string>();
  const lotNumberById = new Map<number, string>();
  for (const row of sessionLots.data || []) {
    const lot: any = Array.isArray((row as any).lot) ? (row as any).lot[0] : (row as any).lot;
    if (!lot || lot.active === false) continue;
    const vaccineId = Number((row as any).vaccine_id || 0);
    const lotId = Number((row as any).lot_id || 0);
    if (vaccineId && lotId) sessionLotSet.add(`${vaccineId}:${lotId}`);
    if (lotId) lotNumberById.set(lotId, clean(lot.lot_number) || "-");
  }
  const vaccineById = new Map<number, any>((vaccines.data || []).map((row: any) => [Number(row.id), row]));
  const offerByKey = new Map<string, any>();
  for (const row of offers.data || []) {
    offerByKey.set(`${Number((row as any).vaccine_id || 0)}:${normalizeSaleMode((row as any).sale_mode)}`, row);
  }

  const rows: any[] = [];
  let total = 0;
  for (const selected of selectedItems) {
    const vaccineId = Number(selected?.vaccineId || 0);
    const lotId = Number(selected?.lotId || 0);
    const saleMode = normalizeSaleMode(selected?.saleMode);
    if (!assignmentSet.has(vaccineId) || !sessionLotSet.has(`${vaccineId}:${lotId}`)) {
      throw new Error("Ada produk Self Booking yang sudah tidak aktif pada Session Bazar ini.");
    }
    if (stock.enabled && Number(stock.map.get(lotId) || 0) <= 0) {
      throw new Error(`Stok ${clean(selected?.vaccineName) || "produk"} sudah habis pada Session Bazar ini.`);
    }
    const vaccine = vaccineById.get(vaccineId);
    if (!vaccine || vaccine.active === false) throw new Error("Produk Bazar sudah tidak aktif.");
    const offer = offerByKey.get(`${vaccineId}:${saleMode}`);
    const unitPrice = money(offer?.price ?? (saleMode === "NON_PACKAGE" ? vaccine.price : 0));
    if (unitPrice <= 0) throw new Error(saleMode === "PACKAGE" ? "Harga Paket sudah tidak tersedia." : "Harga Non Paket sudah tidak tersedia.");
    const surchargePercent = paymentMethod === "CREDIT_CARD" ? 3 : 0;
    const surchargeAmount = money(unitPrice * surchargePercent / 100);
    const paymentTotal = money(unitPrice + surchargeAmount);
    total = money(total + paymentTotal);
    rows.push({
      vaccineId,
      lotId,
      vaccineName: clean(vaccine.name) || clean(selected?.vaccineName) || "Produk Bazar",
      brand: clean(vaccine.brand),
      lotNumber: lotNumberById.get(lotId) || clean(selected?.lotNumber) || "-",
      saleMode,
      salesOptionId: Number(offer?.id || 0) || null,
      packageDoseCount: Math.max(1, Number(offer?.package_dose_count || selected?.packageDoseCount || 1)),
      unitPrice,
      surchargePercent,
      surchargeAmount,
      paymentTotal,
    });
  }
  return { rows, total };
}

function activeBazarRegistration(row: any) {
  const service = clean(row?.patient_service_status).toUpperCase();
  const status = clean(row?.bazar_queue_status).toUpperCase();
  return (service === "BAZAR" || service === "COMBINATION") && !["CANCELLED", "CANCELED", "VOID", "BATAL"].includes(status);
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "register")) return fail("Akses registrasi vaksinasi ditolak.", 403);
  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  if (!sessionId) return fail("Session wajib dipilih.");
  const supabase = supabaseAdmin();
  const result = await supabase
    .from("vaccination_bazar_self_bookings")
    .select("*")
    .eq("session_id", sessionId)
    .order("submitted_at", { ascending: false })
    .limit(1000);
  if (result.error) {
    if (clean(result.error.message).includes("vaccination_bazar_self_bookings")) {
      return fail("Fitur Self Booking Bazar belum aktif pada database.", 503);
    }
    return fail(result.error.message, 500);
  }
  return ok({ bookings: result.data || [] });
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "register")) return fail("Akses registrasi vaksinasi ditolak.", 403);
  const body = await req.json().catch(() => ({}));
  const action = clean(body.action).toUpperCase();
  const bookingId = toInt(body.bookingId || body.booking_id, 0);
  if (!bookingId) return fail("Self Booking tidak ditemukan.");
  const supabase = supabaseAdmin();

  const bookingResult = await supabase
    .from("vaccination_bazar_self_bookings")
    .select("*")
    .eq("id", bookingId)
    .single();
  if (bookingResult.error) return fail(bookingResult.error.message, 404);
  const booking = bookingResult.data;

  if (action === "CANCEL") {
    if (clean(booking.booking_status).toUpperCase() === "PROCESSED") return fail("Self Booking yang sudah diproses tidak dapat dibatalkan dari penampungan.", 409);
    const reason = clean(body.reason || body.cancelReason || body.cancel_reason);
    if (!reason) return fail("Alasan pembatalan wajib diisi.");
    const update = await supabase
      .from("vaccination_bazar_self_bookings")
      .update({ booking_status: "CANCELLED", cancel_reason: reason, processed_by: actorLabel(user), updated_at: new Date().toISOString() })
      .eq("id", bookingId)
      .select("*")
      .single();
    if (update.error) return fail(update.error.message, 500);
    return ok({ message: "Self Booking dibatalkan.", booking: update.data });
  }

  if (action !== "PROCESS") return fail("Aksi Self Booking tidak dikenali.");
  if (clean(booking.booking_status).toUpperCase() !== "PENDING") return fail("Self Booking ini sudah diproses atau dibatalkan.", 409);

  const paymentMethod = normalizePayment(body.paymentMethod || body.payment_method);
  if (!paymentMethod) return fail("Pilih metode pembayaran: QRIS, Debit, Credit Card, atau Transfer.");
  if (body.paymentValidated !== true && body.payment_validated !== true) return fail("Centang Validasi Pembayaran sebelum memproses Self Booking.");

  const sessionId = Number(booking.session_id || 0);
  const sessionResult = await supabase
    .from("vaccination_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (sessionResult.error) return fail(sessionResult.error.message, 500);
  const session = sessionResult.data;

  const duplicates = await supabase
    .from("vaccination_registrations")
    .select("id,patient_service_status,bazar_queue_status,bazar_queue_number")
    .eq("session_id", sessionId)
    .eq("employee_id", clean(booking.employee_id))
    .order("id", { ascending: false })
    .limit(50);
  if (duplicates.error) return fail(duplicates.error.message, 500);
  const activeBazar = (duplicates.data || []).find(activeBazarRegistration);
  if (activeBazar) {
    return fail(`Peserta sudah memiliki pendaftaran Bazar aktif pada Session ini${clean(activeBazar.bazar_queue_number) ? ` (${clean(activeBazar.bazar_queue_number)})` : ""}.`, 409);
  }

  let prepared: { rows: any[]; total: number };
  try {
    prepared = await prepareItems(supabase, sessionId, booking.selected_items || [], paymentMethod);
  } catch (error: any) {
    return fail(error?.message || "Produk Self Booking tidak dapat diproses.", 409);
  }

  const internalQueue = bazarUsesInternalQueue(session);
  const nextQueue = internalQueue ? await nextBazarQueue(supabase, sessionId) : null;
  const now = new Date().toISOString();
  const actor = actorLabel(user);
  const registrationPayload: Record<string, any> = {
    session_id: sessionId,
    source_id: Number(booking.source_id || session.source_id || 0) || null,
    participant_id: Number(booking.participant_id || 0) || null,
    history_person_id: Number(booking.history_person_id || 0) || null,
    family_role: "PARENT",
    parent_history_person_id: null,
    vaccine_id: prepared.rows[0]?.vaccineId || null,
    participant_name: clean(booking.participant_name),
    employee_id: clean(booking.employee_id) || null,
    nik: clean(booking.nik) || null,
    email: clean(booking.email) || null,
    phone: clean(booking.phone) || null,
    company_name: clean(booking.company_name || session.company_name) || null,
    department: clean(booking.department) || null,
    payment_price: prepared.total,
    payment_method: paymentMethod,
    payment_note: "Self Booking Bazar · pembayaran tervalidasi",
    queue_number: null,
    queue_status: "REGISTERED",
    bazar_queue_number: nextQueue?.number || null,
    bazar_queue_sequence: nextQueue?.sequence || null,
    bazar_queue_status: internalQueue ? "WAITING" : "REGISTERED",
    validation_status: null,
    patient_service_status: "BAZAR",
    registered_by: `SELF_BOOKING · ${actor}`,
    registered_at: now,
    updated_at: now,
  };

  const insertRegistration = await supabase
    .from("vaccination_registrations")
    .insert(registrationPayload)
    .select("*")
    .single();
  if (insertRegistration.error) return fail(insertRegistration.error.message, 500);
  const registration = insertRegistration.data;

  const itemRows = prepared.rows.map((item) => ({
    registration_id: Number(registration.id),
    session_id: sessionId,
    vaccine_id: item.vaccineId,
    lot_id: item.lotId,
    dose_number: 1,
    price_category: null,
    price: item.unitPrice,
    payment_method: paymentMethod,
    payment_note: "Self Booking Bazar · pembayaran tervalidasi",
    item_note: null,
    service_mode: "BAZAR",
    sales_option_id: item.salesOptionId,
    sale_mode: item.saleMode,
    package_dose_count: item.packageDoseCount,
    sales_price_snapshot: item.unitPrice,
    payment_surcharge_percent: item.surchargePercent,
    payment_surcharge_amount: item.surchargeAmount,
    payment_total: item.paymentTotal,
    item_source: "bazar_self_booking",
    status: "WAITING",
    active: true,
    created_by: actor,
  }));
  const itemInsert = await supabase.from("vaccination_registration_items").insert(itemRows).select("id");
  if (itemInsert.error) {
    await supabase.from("vaccination_registrations").delete().eq("id", Number(registration.id));
    return fail(itemInsert.error.message, 500);
  }

  const bookingUpdate = await supabase
    .from("vaccination_bazar_self_bookings")
    .update({
      payment_method: paymentMethod,
      payment_status: "VALIDATED",
      booking_status: "PROCESSED",
      registration_id: Number(registration.id),
      processed_at: now,
      processed_by: actor,
      updated_at: now,
    })
    .eq("id", bookingId)
    .eq("booking_status", "PENDING")
    .select("*")
    .single();
  if (bookingUpdate.error) {
    await supabase.from("vaccination_registration_items").delete().eq("registration_id", Number(registration.id));
    await supabase.from("vaccination_registrations").delete().eq("id", Number(registration.id));
    return fail(bookingUpdate.error.message, 500);
  }

  return ok({
    message: internalQueue
      ? `Pembayaran tervalidasi. Self Booking diproses ke Registrasi Bazar ${nextQueue?.number || ""}.`
      : "Pembayaran tervalidasi. Self Booking masuk ke Registrasi Bazar dan menunggu nomor antrean vendor.",
    booking: bookingUpdate.data,
    registration: {
      id: Number(registration.id),
      bazarQueueNumber: nextQueue?.number || "",
      bazarQueueStatus: internalQueue ? "WAITING" : "REGISTERED",
      registrationType: "SELF BOOKING",
      paymentMethod,
    },
  });
}
