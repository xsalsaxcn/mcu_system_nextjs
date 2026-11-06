import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";

// VACCINATION_REGISTER_PRODUCT_OPTIONS_V153_1
// V497_R2_SERVICE_STOCK_OPTIONS_SAFE
// V506_BAZAR_REGISTRATION_EXACT_SERVICE_STOCK

function normalizeServiceMode(value: any) {
  return String(value || "").trim().toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
}

async function loadServiceStockRemaining(supabase: any, sessionId: number) {
  const allocationsResult = await supabase
    .from("vaccination_session_stock_allocations")
    .select("lot_id,service_mode,allocated_qty,active")
    .eq("session_id", sessionId)
    .eq("active", true)
    .limit(10000);

  if (allocationsResult.error) {
    const code = String(allocationsResult.error?.code || "");
    const message = String(allocationsResult.error?.message || "").toLowerCase();
    if (code === "42P01" || message.includes("vaccination_session_stock_allocations")) {
      return { enabled: false, map: new Map<string, any>() };
    }
    throw new Error(allocationsResult.error.message);
  }

  const allocations = allocationsResult.data || [];
  if (!allocations.length) return { enabled: false, map: new Map<string, any>() };

  const lotIds = Array.from(
    new Set(allocations.map((row: any) => Number(row.lot_id)).filter(Boolean)),
  );

  const usedMap = new Map<string, number>();
  if (lotIds.length) {
    const usedResult = await supabase
      .from("vaccination_registration_items")
      // V606: registration_items already has session_id. Query it directly,
      // just like the working V605 Healthday stock-summary reader. PostgREST's
      // registration embedded !inner can fail (or hide valid rows) on a legacy
      // relationship; never make the eligibility list depend on that embed.
      .select("lot_id,service_mode,status")
      .eq("session_id", sessionId)
      .in("lot_id", lotIds)
      .in("status", ["ADMINISTERED", "DONE", "FINISHED"])
      .eq("active", true)
      .limit(20000);

    if (usedResult.error) throw new Error(usedResult.error.message);

    for (const row of usedResult.data || []) {
      const lotId = Number((row as any).lot_id || 0);
      if (!lotId) continue;
      const mode = normalizeServiceMode((row as any).service_mode);
      const key = `${lotId}:${mode}`;
      usedMap.set(key, (usedMap.get(key) || 0) + 1);
    }
  }

  const map = new Map<string, any>();
  for (const row of allocations) {
    const lotId = Number((row as any).lot_id || 0);
    if (!lotId) continue;
    const mode = normalizeServiceMode((row as any).service_mode);
    const key = `${lotId}:${mode}`;
    const allocated = Number((row as any).allocated_qty || 0);
    const used = usedMap.get(key) || 0;
    map.set(key, {
      allocated,
      used,
      remaining: Math.max(0, allocated - used),
    });
  }

  return { enabled: true, map };
}


async function loadAssignedVaccineIds(
  supabase: any,
  sessionId: number,
  serviceMode: "HEALTHDAY" | "BAZAR",
) {
  const result = await supabase
    .from("vaccination_session_product_assignments")
    .select("vaccine_id,service_mode,active")
    .eq("session_id", sessionId)
    .eq("service_mode", serviceMode)
    .eq("active", true)
    .limit(10000);

  if (result.error) {
    const code = String(result.error?.code || "");
    const message = String(result.error?.message || "").toLowerCase();
    if (
      code === "42P01" ||
      message.includes("vaccination_session_product_assignments")
    ) {
      return { enabled: false, ids: new Set<number>() };
    }
    throw new Error(result.error.message);
  }

  const ids = new Set<number>();
  for (const row of result.data || []) {
    const vaccineId = Number((row as any).vaccine_id || 0);
    if (vaccineId) ids.add(vaccineId);
  }
  return { enabled: true, ids };
}
// V577_ADMIN_BAZAR_MATCH_PUBLIC_STOCK:
// The Admin Bazar endpoint MUST use the identical allocation + lot + movement
// + administered-record remaining calculation as the deployed public Bazar.
// Keep Healthday calculation, registration posting, and public portal untouched.
function cleanValue(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function loadBazarCanonicalStockRemaining(supabase: any, sessionId: number) {
  const allocationsResult = await supabase
    .from("vaccination_session_stock_allocations")
    .select("lot_id,service_mode,allocated_qty,active")
    .eq("session_id", sessionId)
    .eq("service_mode", "BAZAR")
    .eq("active", true)
    .limit(10000);
  if (allocationsResult.error) throw new Error(allocationsResult.error.message);

  const allocations = allocationsResult.data || [];
  const lotIds = Array.from(
    new Set<number>(
      allocations
        .map((row: any) => Number(row.lot_id || 0))
        .filter((id: number) => id > 0),
    ),
  );
  if (!lotIds.length) return { enabled: false, map: new Map<number, number>() };

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
    if (cleanValue((row as any).service_mode).toUpperCase() === "BAZAR") {
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
    const type = cleanValue((row as any).movement_type).toUpperCase();
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

  const map = new Map<number, number>();
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

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "register")) {
    return fail("Akses Registrasi Vaksinasi ditolak untuk role ini.", 403);
  }

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  if (!sessionId) return fail("session_id wajib diisi.");

  const supabase = supabaseAdmin();

  const sessionResult = await supabase
    .from("vaccination_sessions")
    .select("id,session_name,default_vaccine_id,default_lot_id,existing_queue_profile")
    .eq("id", sessionId)
    .single();

  if (sessionResult.error) return fail(sessionResult.error.message, 500);

  const salesOffersResult = await supabase
    .from("vaccination_vaccine_sales_options")
    .select("id,vaccine_id,sale_mode,package_dose_count,price,label,active")
    .eq("active", true)
    .order("vaccine_id", { ascending: true })
    .order("sale_mode", { ascending: true });
  if (salesOffersResult.error) return fail(salesOffersResult.error.message, 500);
  const salesOffersByVaccine = new Map<number, any[]>();
  for (const offer of salesOffersResult.data || []) {
    const vaccineId = Number((offer as any).vaccine_id || 0);
    if (!vaccineId) continue;
    if (!salesOffersByVaccine.has(vaccineId)) salesOffersByVaccine.set(vaccineId, []);
    salesOffersByVaccine.get(vaccineId)!.push(offer);
  }

  const optionsResult = await supabase
    .from("vaccination_session_vaccines")
    .select(`
      id,
      session_id,
      vaccine_id,
      lot_id,
      dose_number,
      active,
      vaccine:vaccination_vaccines(id,name,brand,price,price_category),
      lot:vaccination_vaccine_lots(id,lot_number,expiry_date,stock_initial,stock_added,stock_used)
    `)
    .eq("session_id", sessionId)
    .eq("active", true)
    .order("id", { ascending: true });

  if (optionsResult.error) return fail(optionsResult.error.message, 500);

  let options: any[] = optionsResult.data || [];

  // Compatibility for old sessions that only store one default vaccine/lot.
  if (!options.length) {
    const vaccineId = toInt(sessionResult.data?.default_vaccine_id, 0);
    const lotId = toInt(sessionResult.data?.default_lot_id, 0);

    if (vaccineId) {
      const [vaccineResult, lotResult] = await Promise.all([
        supabase
          .from("vaccination_vaccines")
          .select("id,name,brand,price,price_category")
          .eq("id", vaccineId)
          .maybeSingle(),
        lotId
          ? supabase
              .from("vaccination_vaccine_lots")
              .select(
                "id,lot_number,expiry_date,stock_initial,stock_added,stock_used",
              )
              .eq("id", lotId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (vaccineResult.error) return fail(vaccineResult.error.message, 500);
      if (lotResult.error) return fail(lotResult.error.message, 500);

      options = [
        {
          id: `default-${sessionId}-${vaccineId}-${lotId || 0}`,
          session_id: sessionId,
          vaccine_id: vaccineId,
          lot_id: lotId || null,
          dose_number: 1,
          active: true,
          vaccine: vaccineResult.data || null,
          lot: lotResult.data || null,
        },
      ];
    }
  }

  let healthdayOptions = options;

  let bazarOptions: any[] = [];
  const healthdayBazarEnabled =
    String(sessionResult.data?.existing_queue_profile || "LEGACY")
      .trim()
      .toUpperCase() === "HEALTHDAY_BAZAR";

  let serviceStock: { enabled: boolean; map: Map<string, any> };
  let bazarAssignments: { enabled: boolean; ids: Set<number> };
  try {
    [serviceStock, bazarAssignments] = await Promise.all([
      loadServiceStockRemaining(supabase, sessionId),
      loadAssignedVaccineIds(supabase, sessionId, "BAZAR"),
    ]);
  } catch (error: any) {
    return fail(error?.message || "Gagal membaca stok/assignment Healthday-Bazar.", 500);
  }

  // V607: canonical Healthday source = ACTIVE same-Session HEALTHDAY allocation
  // and its exact active, SESSION-owned Lot. Do not gate an allocated Lot on
  // the cloned session_vaccines catalog or a separate recovered-cap Map.
  // Keep Bazar's independent source/reader unchanged.
  const healthdayOptionDiagnostics = {
    activeAllocations: 0,
    eligibleAllocatedLots: 0,
    ownedActiveLots: 0,
    availableOptions: 0,
    skippedOwnershipOrProduct: 0,
    skippedDepletedOrReserved: 0,
  };

  if (serviceStock.enabled) {
    const allocatedResult = await supabase
      .from("vaccination_session_stock_allocations")
      .select("session_id,vaccine_id,lot_id,allocated_qty,service_mode,active")
      .eq("session_id", sessionId)
      .eq("service_mode", "HEALTHDAY")
      .eq("active", true)
      .limit(10000);
    if (allocatedResult.error) return fail(allocatedResult.error.message, 500);

    const eligible = (allocatedResult.data || []).filter((row: any) => {
      const lotId = Number(row?.lot_id || 0);
      const vaccineId = Number(row?.vaccine_id || 0);
      return lotId > 0 && vaccineId > 0 &&
        Number(serviceStock.map.get(`${lotId}:HEALTHDAY`)?.remaining || 0) > 0;
    });
    healthdayOptionDiagnostics.activeAllocations = (allocatedResult.data || []).length;
    healthdayOptionDiagnostics.eligibleAllocatedLots = eligible.length;
    const eligibleLotIds = Array.from(new Set<number>(eligible.map((row: any) => Number(row.lot_id))));
    const eligibleVaccineIds = Array.from(new Set<number>(eligible.map((row: any) => Number(row.vaccine_id))));

    healthdayOptions = [];
    if (eligibleLotIds.length && eligibleVaccineIds.length) {
      const [lotsResult, vaccineResult, movementsResult] = await Promise.all([
        supabase.from("vaccination_vaccine_lots")
          .select("id,vaccine_id,lot_number,expiry_date,stock_initial,stock_added,stock_used,stock_scope,stock_session_id,active")
          .in("id", eligibleLotIds).eq("active", true).limit(10000),
        supabase.from("vaccination_vaccines")
          .select("id,name,brand,price,price_category,active")
          .in("id", eligibleVaccineIds).eq("active", true).limit(10000),
        supabase.from("vaccination_inventory_movements")
          .select("lot_id,movement_type,qty")
          .in("lot_id", eligibleLotIds).limit(20000),
      ]);
      if (lotsResult.error) return fail(lotsResult.error.message, 500);
      if (vaccineResult.error) return fail(vaccineResult.error.message, 500);
      if (movementsResult.error) return fail(movementsResult.error.message, 500);

      const lotMap = new Map<number, any>((lotsResult.data || []).map((r: any) => [Number(r.id), r]));
      const vaccineMap = new Map<number, any>((vaccineResult.data || []).map((r: any) => [Number(r.id), r]));
      const inboundTypes = new Set(["STOCK_IN", "IN", "ADD", "ADDED", "RESTOCK", "RETURN_STOCK", "STOCK_RETURN", "RETURN_IN", "ADJUSTMENT_IN", "STOCK_TRANSFER_IN"]);
      const outboundTypes = new Set(["STOCK_OUT_ADJUSTMENT", "ADJUSTMENT_OUT", "MANUAL_STOCK_OUT", "STOCK_REDUCTION", "STOCK_TRANSFER_OUT"]);
      const movements = new Map<number, { inbound: number; outbound: number }>();
      for (const row of movementsResult.data || []) {
        const lotId = Number((row as any).lot_id || 0);
        if (!lotId) continue;
        const type = String((row as any).movement_type || "").trim().toUpperCase();
        const qty = Math.abs(Number((row as any).qty || 0));
        const bucket = movements.get(lotId) || { inbound: 0, outbound: 0 };
        if (inboundTypes.has(type)) bucket.inbound += qty;
        if (outboundTypes.has(type)) bucket.outbound += qty;
        movements.set(lotId, bucket);
      }

      const seen = new Set<string>();
      for (const allocated of eligible) {
        const lotId = Number(allocated.lot_id || 0);
        const vaccineId = Number(allocated.vaccine_id || 0);
        const lot = lotMap.get(lotId);
        const vaccine = vaccineMap.get(vaccineId);
        // Strict owner and identity checks protect other Sessions and Bazar.
        if (!lot || !vaccine || Number(lot.vaccine_id) !== vaccineId ||
            String(lot.stock_scope || "").trim().toUpperCase() !== "SESSION" ||
            Number(lot.stock_session_id || 0) !== sessionId) {
          healthdayOptionDiagnostics.skippedOwnershipOrProduct += 1;
          continue;
        }
        healthdayOptionDiagnostics.ownedActiveLots += 1;
        const movement = movements.get(lotId) || { inbound: 0, outbound: 0 };
        const physicalRemaining = Math.max(0,
          Number(lot.stock_initial || 0) +
          Math.max(Number(lot.stock_added || 0), movement.inbound) -
          Number(lot.stock_used || 0) - movement.outbound,
        );
        const allocatedRemaining = Number(serviceStock.map.get(`${lotId}:HEALTHDAY`)?.remaining || 0);
        // Treat any active Bazar quota sharing this exact Lot as reserved;
        // never show the same physical doses for both services.
        const bazarReserved = Math.max(0, Number(serviceStock.map.get(`${lotId}:BAZAR`)?.remaining || 0));
        const remaining = Math.max(0, Math.min(allocatedRemaining, physicalRemaining - bazarReserved));
        if (remaining <= 0) {
          healthdayOptionDiagnostics.skippedDepletedOrReserved += 1;
          continue;
        }
        const key = `${vaccineId}:${lotId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        healthdayOptions.push({
          id: `healthday-owned-${sessionId}-${vaccineId}-${lotId}`,
          session_id: sessionId, vaccine_id: vaccineId, lot_id: lotId,
          dose_number: 1, active: true, vaccine, lot,
          service_mode: "HEALTHDAY",
          option_source: "ACTIVE_SESSION_HEALTHDAY_ALLOCATION",
          sales_options: salesOffersByVaccine.get(vaccineId) || [],
          service_stock_allocated: Number(allocated.allocated_qty || 0),
          service_stock_used: Number(serviceStock.map.get(`${lotId}:HEALTHDAY`)?.used || 0),
          service_stock_remaining: remaining,
        });
      }
      healthdayOptions.sort((a: any, b: any) =>
        `${a.vaccine?.name || ""} ${a.lot?.lot_number || ""}`.localeCompare(
          `${b.vaccine?.name || ""} ${b.lot?.lot_number || ""}`, "id"));
    }
  } else {
    // Legacy Sessions without any stock-allocation rows retain their old
    // behavior. No new allocation or implied stock is created.
    healthdayOptions = options.map((option: any) => ({
      ...option,
      service_mode: "HEALTHDAY",
      sales_options: salesOffersByVaccine.get(Number(option?.vaccine_id || 0)) || [],
      service_stock_allocated: null,
      service_stock_used: null,
      service_stock_remaining: null,
    }));
  }
  healthdayOptionDiagnostics.availableOptions = healthdayOptions.length;

  if (healthdayBazarEnabled) {
    // V575_ADMIN_BAZAR_CATALOG_PARITY:
    // Align Admin's Bazar choices with the already-working Self Booking catalog.
    // A product may be Bazar-eligible by explicit assignment, Bazar allocation,
    // its BAZAR name, or the legacy priced fallback when no assignments exist.
    // Never exclude an allocated Bazar product just because an assignment row
    // is missing. Only use Session-owned active Lots; never move stock or IDs.
    // V576_ADMIN_BAZAR_PUBLIC_CATALOG_PARITY
    // V576: query the same Session-owned Lot + joined Vaccine relation used by
    // /api/vaccination/public-bazar, rather than separately materializing all
    // Master vaccines. This avoids mismatched catalog snapshots/references.
    // Same stock computation as Self Booking. Unlike the old V576 cap, this
    // considers stock movements, FINISHED/DONE records, and multiple allocations.
    // Never treat a missing allocation as extra stock.
    let bazarCanonicalStock: { enabled: boolean; map: Map<number, number> };
    try {
      bazarCanonicalStock = await loadBazarCanonicalStockRemaining(supabase, sessionId);
    } catch (error: any) {
      return fail(error?.message || "Gagal membaca stok Bazar yang sama dengan Self Booking.", 500);
    }

    const lotsResult = await supabase
      .from("vaccination_vaccine_lots")
      .select("id,vaccine_id,lot_number,expiry_date,stock_initial,stock_added,stock_used,active,stock_scope,stock_session_id,vaccine:vaccination_vaccines(id,name,brand,price,price_category,active)")
      .eq("stock_scope", "SESSION")
      .eq("stock_session_id", sessionId)
      .eq("active", true)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(10000);

    if (lotsResult.error) return fail(lotsResult.error.message, 500);

    const bazarHasAllocations = bazarCanonicalStock.enabled;
    const seen = new Set<string>();
    bazarOptions = [];

    for (const lot of lotsResult.data || []) {
      const lotId = Number((lot as any)?.id || 0);
      const vaccineId = Number((lot as any)?.vaccine_id || 0);
      const vaccine = Array.isArray((lot as any)?.vaccine)
        ? (lot as any).vaccine[0]
        : (lot as any).vaccine;
      if (!lotId || !vaccineId || !vaccine || vaccine.active === false) continue;

      const basePrice = Number(vaccine.price || 0);
      const offers = (salesOffersByVaccine.get(vaccineId) || []).filter(
        (offer: any) => Number(offer?.price || 0) > 0,
      );
      const hasPrice = basePrice > 0 || offers.length > 0;
      if (!hasPrice) continue;

      const assignedBazar = bazarAssignments.ids.has(vaccineId);
      const allocatedBazar = serviceStock.map.has(`${lotId}:BAZAR`);
      const namedBazar = /(^|[^A-Z])BAZAR([^A-Z]|$)/i.test(String(vaccine.name || "").trim());
      const legacyPricedFallback = bazarAssignments.ids.size === 0 && hasPrice;
      if (!assignedBazar && !allocatedBazar && !namedBazar && !legacyPricedFallback) continue;

      // V577: Public Bazar source-of-truth for display eligibility.
      // Includes movement based inbound/adjustment, administered/FINISHED/DONE,
      // and the minimum of service quota and canonical Lot stock.
      const serviceAllocation = serviceStock.map.get(`${lotId}:BAZAR`);
      const remaining = bazarHasAllocations
        ? Number(bazarCanonicalStock.map.get(lotId) || 0)
        : null;
      if (bazarHasAllocations && Number(remaining || 0) <= 0) continue;

      const uniqueKey = `${vaccineId}:${lotId}`;
      if (seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);

      bazarOptions.push({
        id: `bazar-${sessionId}-${vaccineId}-${lotId}`,
        session_id: sessionId,
        vaccine_id: vaccineId,
        lot_id: lotId,
        dose_number: 1,
        active: true,
        option_source: "BAZAR_SESSION_CATALOG",
        vaccine,
        lot,
        service_mode: "BAZAR",
        sales_options: offers,
        service_stock_allocated: serviceAllocation
          ? Number(serviceAllocation.allocated || 0)
          : null,
        service_stock_used: serviceAllocation
          ? Number(serviceAllocation.used || 0)
          : null,
        service_stock_remaining: remaining,
      });
    }
    // V576 diagnostic counters are returned for operator parity checks only;
    // they do not mutate inventory and don't affect booking submission.
    bazarOptions.sort((a: any, b: any) =>
      `${a.vaccine?.name || ""} ${a.vaccine?.brand || ""}`.localeCompare(
        `${b.vaccine?.name || ""} ${b.vaccine?.brand || ""}`,
        "id",
      ),
    );
  }

  return ok({
    session: sessionResult.data,
    options: healthdayOptions,
    healthdayOptions,
    bazarOptions,
    serviceStockEnabled: serviceStock.enabled,
    healthdayOptionDiagnostics,
    bazarAssignmentReady: bazarAssignments.enabled,
    bazarCatalogCount: bazarOptions.length,
    bazarCatalogSource: "SESSION_ACTIVE_LOTS_PUBLIC_STOCK_PARITY_V577",
  });
}
