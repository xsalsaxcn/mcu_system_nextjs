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


// V601: Employee ID is a family/company lookup key, not a unique person identity.
// Fail closed on conflicting names/NIK even if one legacy person id happens to match.
function sameBookingPerson(a: any, b: any): boolean {
  const norm = (value: any) => clean(value).toUpperCase().replace(/\s+/g, " ");
  const aid = Number(a?.history_person_id || a?.historyPersonId || 0);
  const bid = Number(b?.history_person_id || b?.historyPersonId || 0);
  const apid = Number(a?.participant_id || a?.participantId || 0);
  const bpid = Number(b?.participant_id || b?.participantId || 0);
  const anik = norm(a?.nik), bnik = norm(b?.nik);
  const aname = norm(a?.participant_name || a?.participantName || a?.name);
  const bname = norm(b?.participant_name || b?.participantName || b?.name);
  const aemp = norm(a?.employee_id || a?.employeeId);
  const bemp = norm(b?.employee_id || b?.employeeId);
  if (aid && bid && aid !== bid) return false;
  if (apid && bpid && apid !== bpid) return false;
  if (anik && bnik && anik !== bnik) return false;
  if (aname && bname && aname !== bname) return false;
  if (aid && bid && aid === bid) return true;
  if (apid && bpid && apid === bpid) return true;
  if (anik && bnik && anik === bnik) return true;
  return Boolean(aname && bname && aname === bname && aemp && bemp && aemp === bemp);
}

function safeQuantity(value: any): number {
  const number = Number(value == null ? 1 : value);
  if (!Number.isInteger(number) || number < 1 || number > 3) {
    throw new Error("Jumlah dosis berbayar harus 1 sampai 3 per produk. Hubungi tim untuk kebutuhan khusus.");
  }
  return number;
}

function safeStartDose(value: any): number {
  const number = Number(value == null ? 1 : value);
  if (!Number.isInteger(number) || number < 1 || number > 10) {
    throw new Error("Nomor dosis pertama yang dibeli tidak valid.");
  }
  return number;
}


function paidDoseCollisions(priorItems: any[], newRows: any[]): string[] {
  const collisions: string[] = [];
  for (const item of newRows) {
    const start = item.startDose;
    const end = start + (item.saleMode === "PACKAGE" ? item.packageDoseCount : item.quantity) - 1;
    for (const prior of priorItems) {
      if (Number(prior.vaccine_id) !== item.vaccineId) continue;
      const priorStart = Math.max(1, Number(prior.dose_number || 1));
      const priorEnd = priorStart + Math.max(1, Number(prior.package_dose_count || 1)) - 1;
      if (start <= priorEnd && end >= priorStart) {
        collisions.push(`${item.vaccineName} (dosis ${start}${end !== start ? `-${end}` : ""}; registrasi #${prior?.registration?.id || "?"} sudah mencakup dosis ${priorStart}-${priorEnd})`);
      }
    }
  }
  return Array.from(new Set(collisions));
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
    .select("lot_id,service_mode,allocated_qty,active")
    .eq("session_id", sessionId)
    .eq("service_mode", "BAZAR")
    .eq("active", true)
    .in("lot_id", lotIds);
  if (allocationsResult.error) throw new Error(allocationsResult.error.message);

  const allocations = allocationsResult.data || [];
  if (!allocations.length) return { enabled: false, map };

  // V570_R1_SELFBOOKING_STOCK_CANONICAL_CAP:
  // allocation tetap menentukan jatah layanan Bazar, tetapi stok publik tidak
  // boleh melebihi stok Lot canonical yang sama dengan Inventory.
  const [itemsResult, lotsResult, movementsResult] = await Promise.all([
    supabase
      .from("vaccination_registration_items")
      .select("lot_id,service_mode,status,active,registration:vaccination_registrations!inner(session_id)")
      .in("lot_id", lotIds)
      .eq("active", true)
      .in("status", ["ADMINISTERED", "DONE", "FINISHED"])
      .eq("registration.session_id", sessionId)
      .limit(20000),
    supabase
      .from("vaccination_vaccine_lots")
      .select("id,stock_initial,stock_added,stock_used,active")
      .in("id", lotIds)
      .eq("active", true)
      .limit(10000),
    supabase
      .from("vaccination_inventory_movements")
      .select("lot_id,movement_type,qty")
      .in("lot_id", lotIds)
      .limit(20000),
  ]);

  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (lotsResult.error) throw new Error(lotsResult.error.message);
  if (movementsResult.error) throw new Error(movementsResult.error.message);

  const totalUsed = new Map<number, number>();
  const bazarUsed = new Map<number, number>();
  const trackedLots = new Set<number>();

  for (const row of itemsResult.data || []) {
    const lotId = Number((row as any).lot_id || 0);
    if (!lotId) continue;
    trackedLots.add(lotId);
    totalUsed.set(lotId, (totalUsed.get(lotId) || 0) + 1);
    if (clean((row as any).service_mode).toUpperCase() === "BAZAR") {
      bazarUsed.set(lotId, (bazarUsed.get(lotId) || 0) + 1);
    }
  }

  const inboundTypes = new Set([
    "STOCK_IN",
    "IN",
    "ADD",
    "ADDED",
    "RESTOCK",
    "RETURN_STOCK",
    "STOCK_RETURN",
    "RETURN_IN",
    "ADJUSTMENT_IN",
    "STOCK_TRANSFER_IN",
  ]);
  const adjustmentOutTypes = new Set([
    "STOCK_OUT_ADJUSTMENT",
    "ADJUSTMENT_OUT",
    "MANUAL_STOCK_OUT",
    "STOCK_REDUCTION",
    "STOCK_TRANSFER_OUT",
  ]);
  const inboundByLot = new Map<number, number>();
  const adjustmentOutByLot = new Map<number, number>();

  for (const row of movementsResult.data || []) {
    const lotId = Number((row as any).lot_id || 0);
    if (!lotId) continue;
    const type = clean((row as any).movement_type).toUpperCase();
    const qty = Math.abs(Number((row as any).qty || 0));
    if (inboundTypes.has(type)) {
      inboundByLot.set(lotId, (inboundByLot.get(lotId) || 0) + qty);
    }
    if (adjustmentOutTypes.has(type)) {
      adjustmentOutByLot.set(
        lotId,
        (adjustmentOutByLot.get(lotId) || 0) + qty,
      );
    }
  }

  const lotRemaining = new Map<number, number>();
  for (const row of lotsResult.data || []) {
    const lotId = Number((row as any).id || 0);
    if (!lotId) continue;
    const initial = Number((row as any).stock_initial || 0);
    const added = Math.max(
      Number((row as any).stock_added || 0),
      inboundByLot.get(lotId) || 0,
    );
    const used = trackedLots.has(lotId)
      ? totalUsed.get(lotId) || 0
      : Math.max(0, Number((row as any).stock_used || 0));
    const adjustmentOut = adjustmentOutByLot.get(lotId) || 0;
    lotRemaining.set(
      lotId,
      Math.max(0, initial + added - used - adjustmentOut),
    );
  }

  const allocatedByLot = new Map<number, number>();
  for (const row of allocations) {
    const lotId = Number((row as any).lot_id || 0);
    if (!lotId) continue;
    allocatedByLot.set(
      lotId,
      (allocatedByLot.get(lotId) || 0) +
        Math.max(0, Number((row as any).allocated_qty || 0)),
    );
  }

  for (const [lotId, allocated] of allocatedByLot.entries()) {
    const allocationRemaining = Math.max(
      0,
      allocated - (bazarUsed.get(lotId) || 0),
    );
    const canonicalRemaining = lotRemaining.get(lotId);

    // Never show/sell more than the canonical Lot can physically/systemically hold.
    map.set(
      lotId,
      canonicalRemaining === undefined
        ? allocationRemaining
        : Math.min(allocationRemaining, canonicalRemaining),
    );
  }

  return { enabled: allocations.length > 0, map };
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
  const seen = new Set<string>();
  for (const selected of selectedItems) {
    const vaccineId = Number(selected?.vaccineId || selected?.vaccine_id || 0);
    const lotId = Number(selected?.lotId || selected?.lot_id || 0);
    const saleMode = normalizeSaleMode(selected?.saleMode || selected?.sale_mode);
    const quantity = safeQuantity(selected?.quantity);
    const startDose = safeStartDose(selected?.startDose || selected?.start_dose);
    const key = `${vaccineId}:${lotId}`;
    if (seen.has(key)) throw new Error("Produk sama dipilih lebih dari sekali. Gunakan Jumlah Dosis.");
    seen.add(key);
    if (saleMode === "PACKAGE" && quantity !== 1) throw new Error("Paket sudah mencakup beberapa dosis; tidak boleh dikalikan lagi.");
    const option = catalogMap.get(key);
    if (!option) throw new Error("Ada produk Self Booking yang sudah tidak aktif atau stoknya tidak tersedia pada Session Bazar ini.");
    if (option.stockRemaining != null && Number(option.stockRemaining) < quantity) {
      throw new Error("Stok Bazar tidak cukup untuk jumlah dosis berbayar yang dipilih.");
    }
    const offer = (option.salesOptions || []).find((row: any) => normalizeSaleMode(row.saleMode) === saleMode);
    if (!offer) throw new Error(saleMode === "PACKAGE" ? "Harga Paket sudah tidak tersedia." : "Harga Non Paket sudah tidak tersedia.");
    const unitPrice = money(offer.price);
    const surchargePercent = paymentMethod === "CREDIT_CARD" ? 3 : 0;
    const surchargeAmount = money(unitPrice * quantity * surchargePercent / 100);
    const paymentTotal = money(unitPrice * quantity + surchargeAmount);
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
      quantity,
      startDose,
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
    const candidateRegistration = registrationMap.get(clean(row.employee_id));
    const registration = candidateRegistration && sameBookingPerson(candidateRegistration, row)
      ? candidateRegistration : null;
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
    // Prevent changing a linked person's identity when merely editing a pending cart.
    const identityText = (value: any) => clean(value).toUpperCase();
    if ((Number(booking.history_person_id || 0) || Number(booking.participant_id || 0)) &&
        identityText(participantName) !== identityText(booking.participant_name)) {
      return fail("Booking sudah terhubung ke identitas peserta. Gunakan booking berbeda untuk anggota keluarga.", 409);
    }
    if (clean(booking.nik) && nik && identityText(booking.nik) !== identityText(nik)) {
      return fail("NIK KTP tidak cocok dengan pemilik booking. Periksa data sebelum validasi pembayaran.", 409);
    }
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
      quantity: item.quantity,
      startDose: item.startDose,
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

  // V601: a paid follow-up dose is not the same transaction as dose 1;
  // the same Employee ID can also belong to several FAMILY persons.
  // A repeated dose interval for the same actual person remains blocked.
  let priorBazarItems: any[] = [];
  const selectedVaccineIds = Array.from(new Set((booking.selected_items || []).map((item: any) => Number(item?.vaccine_id || item?.vaccineId || 0)).filter(Boolean)));
  if (selectedVaccineIds.length) {
    const existingItems = await supabase
      .from("vaccination_registration_items")
      .select("vaccine_id,dose_number,package_dose_count,active,status,vaccine:vaccination_vaccines(id,name),registration:vaccination_registrations!inner(id,session_id,employee_id,participant_id,history_person_id,participant_name,nik,bazar_queue_status)")
      .eq("registration.session_id", sessionId)
      .eq("registration.employee_id", clean(booking.employee_id))
      .eq("service_mode", "BAZAR")
      .eq("active", true)
      .in("vaccine_id", selectedVaccineIds)
      .limit(10000);
    if (existingItems.error) return fail(existingItems.error.message, 500);
    priorBazarItems = (existingItems.data || []).filter((row: any) => {
      const itemStatus = clean(row?.status).toUpperCase();
      const registrationStatus = clean(row?.registration?.bazar_queue_status).toUpperCase();
      return !["CANCELLED", "CANCELED"].includes(itemStatus) &&
        !["CANCELLED", "CANCELED"].includes(registrationStatus) &&
        sameBookingPerson(row?.registration, booking);
    });
  }

  let prepared: { rows: any[]; total: number };
  try {
    prepared = await prepareItems(supabase, sessionId, booking.selected_items || [], paymentMethod);
  } catch (error: any) {
    return fail(error?.message || "Produk Self Booking tidak dapat diproses.", 409);
  }

  // Each NON_PACKAGE quantity is a paid series entitlement; only one clinical
  // item enters the current Validation flow. Remaining doses require scheduling.
  const collisions = paidDoseCollisions(priorBazarItems, prepared.rows);
  if (collisions.length) {
    return fail(`Dosis Bazar berikut sudah tercatat untuk peserta ini: ${Array.from(new Set(collisions)).join("; ")}. Periksa registrasi sebelumnya atau pilih nomor dosis lanjutan yang belum dibeli.`, 409);
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
    bazar_queue_status: internalQueue ? "WAITING" : "PENDING_VALIDATION",
    validation_status: internalQueue ? null : "PENDING",
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
    dose_number: item.startDose,
    price_category: null,
    price: money(item.unitPrice * item.quantity),
    payment_method: paymentMethod,
    payment_note: "Self Booking Bazar · pembayaran tervalidasi",
    item_note: (item.saleMode === "PACKAGE" ? item.packageDoseCount : item.quantity) > 1
      ? `PREPAID ${item.saleMode === "PACKAGE" ? item.packageDoseCount : item.quantity} dosis; mulai dosis ${item.startDose}. Hanya dosis saat kunjungan ini masuk alur Validasi; sisa dosis wajib dijadwalkan terpisah.`
      : (item.startDose > 1 ? `Dosis lanjutan ke-${item.startDose}; cek riwayat dan interval medis.` : null),
    service_mode: "BAZAR",
    sales_option_id: item.salesOptionId,
    sale_mode: item.saleMode,
    package_dose_count: item.saleMode === "PACKAGE" ? item.packageDoseCount : item.quantity,
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
      : "Pembayaran tervalidasi. Self Booking masuk ke Registrasi Bazar dan Menunggu Validasi.",
    booking: bookingUpdate.data,
    registration: {
      id: Number(registration.id),
      bazarQueueNumber: nextQueue?.number || "",
      bazarQueueStatus: internalQueue ? "WAITING" : "PENDING_VALIDATION",
      registrationType: "SELF BOOKING",
      paymentMethod,
    },
  });
}
