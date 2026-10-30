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

async function loadEffectiveBazarCatalog(supabase: any, sessionId: number) {
  const [assignmentResult, sessionLotsResult] = await Promise.all([
    supabase
      .from("vaccination_session_product_assignments")
      .select("vaccine_id")
      .eq("session_id", sessionId)
      .eq("service_mode", "BAZAR")
      .eq("active", true)
      .limit(10000),
    supabase
      .from("vaccination_vaccine_lots")
      .select("id,vaccine_id,lot_number,expiry_date,active,stock_scope,stock_session_id,vaccine:vaccination_vaccines(id,name,brand,price,price_category,active)")
      .eq("stock_scope", "SESSION")
      .eq("stock_session_id", sessionId)
      .eq("active", true)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(10000),
  ]);
  if (assignmentResult.error) throw new Error(assignmentResult.error.message);
  if (sessionLotsResult.error) throw new Error(sessionLotsResult.error.message);

  const assignedIds = new Set<number>(
    (assignmentResult.data || [])
      .map((row: any) => Number(row.vaccine_id || 0))
      .filter((id: number) => id > 0),
  );
  const lotIds = (sessionLotsResult.data || []).map((row: any) => Number(row.id || 0)).filter((id: number) => id > 0);
  const actualStock = await loadBazarStockRemaining(supabase, sessionId, lotIds);
  const vaccineIds = Array.from(new Set<number>((sessionLotsResult.data || []).map((row: any) => Number(row.vaccine_id || 0)).filter((id: number) => id > 0)));
  if (!vaccineIds.length) return [];

  const offersResult = await supabase
    .from("vaccination_vaccine_sales_options")
    .select("id,vaccine_id,sale_mode,package_dose_count,price,label,active")
    .in("vaccine_id", vaccineIds)
    .eq("active", true)
    .order("vaccine_id", { ascending: true });
  if (offersResult.error) throw new Error(offersResult.error.message);

  const offersByVaccine = new Map<number, any[]>();
  for (const offer of offersResult.data || []) {
    const vaccineId = Number((offer as any).vaccine_id || 0);
    if (!vaccineId) continue;
    if (!offersByVaccine.has(vaccineId)) offersByVaccine.set(vaccineId, []);
    offersByVaccine.get(vaccineId)!.push(offer);
  }

  const catalog: any[] = [];
  const seen = new Set<string>();
  for (const row of sessionLotsResult.data || []) {
    const vaccineId = Number((row as any).vaccine_id || 0);
    const lotId = Number((row as any).id || 0);
    if (!vaccineId || !lotId) continue;
    const vaccine: any = Array.isArray((row as any).vaccine) ? (row as any).vaccine[0] : (row as any).vaccine;
    if (!vaccine || vaccine.active === false) continue;

    const rawOffers = offersByVaccine.get(vaccineId) || [];
    const masterPrice = vaccine.price == null ? 0 : money(vaccine.price);
    const hasPricedOffer = rawOffers.some((offer: any) => money(offer?.price) > 0);
    const namedBazar = /(^|[^A-Z])BAZAR([^A-Z]|$)/i.test(clean(vaccine.name));
    const assignedBazar = assignedIds.has(vaccineId);
    const allocatedBazar = actualStock.map.has(lotId);
    const legacyPricedFallback = assignedIds.size === 0 && (masterPrice > 0 || hasPricedOffer);
    if (!assignedBazar && !allocatedBazar && !namedBazar && !legacyPricedFallback) continue;

    const key = `${vaccineId}:${lotId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const salesOptions = rawOffers
      .map((offer: any) => ({
        id: Number(offer.id || 0) || null,
        saleMode: normalizeSaleMode(offer.sale_mode),
        packageDoseCount: Math.max(1, Number(offer.package_dose_count || 1)),
        price: money(offer.price),
        label: clean(offer.label) || (normalizeSaleMode(offer.sale_mode) === "PACKAGE" ? "Paket" : "Non Paket"),
      }))
      .filter((offer: any) => offer.price > 0);
    if (masterPrice > 0 && !salesOptions.some((offer: any) => offer.saleMode === "NON_PACKAGE")) {
      salesOptions.unshift({ id: null, saleMode: "NON_PACKAGE", packageDoseCount: 1, price: masterPrice, label: "Non Paket" });
    }
    if (!salesOptions.length) continue;
    const remaining = actualStock.enabled ? Number(actualStock.map.get(lotId) || 0) : null;
    if (actualStock.enabled && remaining <= 0) continue;
    catalog.push({
      vaccineId,
      lotId,
      vaccineName: clean(vaccine.name) || "Produk Bazar",
      brand: clean(vaccine.brand),
      lotNumber: clean((row as any).lot_number) || "-",
      expiryDate: (row as any).expiry_date || null,
      stockRemaining: remaining,
      salesOptions,
    });
  }
  return catalog.sort((a, b) => `${a.vaccineName} ${a.brand}`.localeCompare(`${b.vaccineName} ${b.brand}`, "id"));
}

async function prepareItems(supabase: any, sessionId: number, selectedItemsRaw: any[], paymentMethod: string) {
  const selectedItems = Array.isArray(selectedItemsRaw) ? selectedItemsRaw : [];
  if (!selectedItems.length) throw new Error("Self Booking tidak memiliki produk Bazar.");
  const catalog = await loadEffectiveBazarCatalog(supabase, sessionId);
  const catalogMap = new Map<string, any>(catalog.map((item: any) => [`${item.vaccineId}:${item.lotId}`, item]));

  const rows: any[] = [];
  let total = 0;
  for (const selected of selectedItems) {
    const vaccineId = Number(selected?.vaccineId || selected?.vaccine_id || 0);
    const lotId = Number(selected?.lotId || selected?.lot_id || 0);
    const saleMode = normalizeSaleMode(selected?.saleMode || selected?.sale_mode);
    const option = catalogMap.get(`${vaccineId}:${lotId}`);
    if (!option) throw new Error("Ada produk Self Booking yang sudah tidak aktif atau stoknya tidak tersedia pada Session Bazar ini.");
    const offer = (option.salesOptions || []).find((row: any) => normalizeSaleMode(row.saleMode) === saleMode);
    if (!offer) throw new Error(saleMode === "PACKAGE" ? "Harga Paket sudah tidak tersedia." : "Harga Non Paket sudah tidak tersedia.");
    const unitPrice = money(offer.price);
    const surchargePercent = paymentMethod === "CREDIT_CARD" ? 3 : 0;
    const surchargeAmount = money(unitPrice * surchargePercent / 100);
    const paymentTotal = money(unitPrice + surchargeAmount);
    total = money(total + paymentTotal);
    rows.push({
      vaccineId,
      lotId,
      vaccineName: option.vaccineName,
      brand: option.brand,
      lotNumber: option.lotNumber,
      saleMode,
      salesOptionId: Number(offer.id || 0) || null,
      packageDoseCount: Math.max(1, Number(offer.packageDoseCount || 1)),
      unitPrice,
      surchargePercent,
      surchargeAmount,
      paymentTotal,
    });
  }
  return { rows, total };
}

async function enrichSelfBookings(supabase: any, rows: any[], sessionId: number) {
  if (!rows.length) return rows;
  const participantIds = Array.from(new Set<number>(rows.map((row: any) => Number(row.participant_id || 0)).filter((id: number) => id > 0)));
  const historyIds = Array.from(new Set<number>(rows.map((row: any) => Number(row.history_person_id || 0)).filter((id: number) => id > 0)));
  const employeeIds = Array.from(new Set<string>(rows.map((row: any) => clean(row.employee_id)).filter(Boolean)));

  const participantResult = participantIds.length
    ? await supabase.from("participants").select("*").in("id", participantIds)
    : { data: [], error: null };
  const historyResult = historyIds.length
    ? await supabase.from("vaccination_persons").select("id,participant_name,employee_id,nik,email,phone,birth_date,gender").in("id", historyIds)
    : { data: [], error: null };
  const registrationResult = employeeIds.length
    ? await supabase
        .from("vaccination_registrations")
        .select("id,employee_id,participant_name,nik,email,phone")
        .eq("session_id", sessionId)
        .in("employee_id", employeeIds)
        .order("id", { ascending: false })
        .limit(5000)
    : { data: [], error: null };
  for (const result of [participantResult, historyResult, registrationResult]) {
    if ((result as any).error) throw new Error((result as any).error.message);
  }

  const participantMap = new Map<number, any>((participantResult.data || []).map((row: any) => [Number(row.id), row]));
  const historyMap = new Map<number, any>((historyResult.data || []).map((row: any) => [Number(row.id), row]));
  const registrationMap = new Map<string, any>();
  for (const row of registrationResult.data || []) {
    const key = clean((row as any).employee_id);
    if (key && !registrationMap.has(key)) registrationMap.set(key, row);
  }

  return rows.map((row: any) => {
    const participant = participantMap.get(Number(row.participant_id || 0));
    const history = historyMap.get(Number(row.history_person_id || 0));
    const registration = registrationMap.get(clean(row.employee_id));
    return {
      ...row,
      participant_name: clean(row.participant_name) || clean(participant?.name || participant?.participant_name) || clean(history?.participant_name) || clean(registration?.participant_name),
      nik: clean(row.nik) || clean(participant?.nik || participant?.ktp || participant?.nik_ktp) || clean(history?.nik) || clean(registration?.nik),
      email: clean(row.email) || clean(participant?.email || participant?.email_company || participant?.company_email) || clean(history?.email) || clean(registration?.email),
      phone: clean(row.phone) || clean(participant?.phone || participant?.no_hp || participant?.mobile || participant?.phone_number) || clean(history?.phone) || clean(registration?.phone),
    };
  });
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
  const bookings = await enrichSelfBookings(supabase, result.data || [], sessionId);
  const catalog = await loadEffectiveBazarCatalog(supabase, sessionId);
  return ok({ bookings, catalog });
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
  const booking = (await enrichSelfBookings(supabase, [bookingResult.data], Number(bookingResult.data?.session_id || 0)))[0];

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

  if (action === "UPDATE") {
    if (clean(booking.booking_status).toUpperCase() !== "PENDING") return fail("Hanya Self Booking yang masih menunggu proses yang dapat diedit.", 409);
    const participantName = clean(body.participantName || body.participant_name || booking.participant_name);
    const nik = clean(body.nik ?? booking.nik);
    const email = clean(body.email ?? booking.email);
    const phone = clean(body.phone ?? booking.phone);
    if (!participantName) return fail("Nama peserta wajib diisi.");
    const selectedItems = Array.isArray(body.selectedItems) ? body.selectedItems : booking.selected_items;
    let prepared: { rows: any[]; total: number };
    try {
      prepared = await prepareItems(supabase, Number(booking.session_id || 0), selectedItems || [], "QRIS");
    } catch (error: any) {
      return fail(error?.message || "Perubahan produk Self Booking tidak valid.", 409);
    }
    const snapshots = prepared.rows.map((item: any) => ({
      vaccineId: item.vaccineId,
      lotId: item.lotId,
      vaccineName: item.vaccineName,
      brand: item.brand,
      lotNumber: item.lotNumber,
      saleMode: item.saleMode,
      salesOptionId: item.salesOptionId,
      packageDoseCount: item.packageDoseCount,
      unitPrice: item.unitPrice,
    }));
    const updated = await supabase
      .from("vaccination_bazar_self_bookings")
      .update({
        participant_name: participantName,
        nik: nik || null,
        email: email || null,
        phone: phone || null,
        selected_items: snapshots,
        estimated_total: prepared.total,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .eq("booking_status", "PENDING")
      .select("*")
      .single();
    if (updated.error) return fail(updated.error.message, 500);
    const enriched = (await enrichSelfBookings(supabase, [updated.data], Number(booking.session_id || 0)))[0];
    return ok({ message: "Self Booking berhasil diperbarui.", booking: enriched });
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
