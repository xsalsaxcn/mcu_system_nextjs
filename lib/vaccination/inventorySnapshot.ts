// V519_INVENTORY_SERVICE_FILTER_CANONICAL_DEDUPE_PRODUCT_FILTER
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

function clean(value: any) {
  return String(value ?? "").trim();
}

export async function buildVaccinationInventorySnapshot() {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("vaccination_vaccine_lots")
    .select("*, vaccine:vaccination_vaccines(id,name,brand,price,price_category)")
    .order("active", { ascending: false })
    .order("id", { ascending: false });

  if (result.error) throw new Error(result.error.message);

  const lots = result.data || [];
  const lotIds: number[] = lots.map((lot: any) => Number(lot.id)).filter((id: number) => id > 0);
  const vaccineIds: number[] = Array.from(
    new Set<number>(lots.map((lot: any) => Number(lot.vaccine_id || lot.vaccine?.id || 0)).filter((id: number) => id > 0)),
  );

  const usedByLot = new Map<number, number>();
  const inboundByLot = new Map<number, number>();
  const adjustmentOutByLot = new Map<number, number>();
  const movementCountByLot = new Map<number, number>();
  const lastMovementByLot = new Map<number, any>();
  const serviceUsed = new Map<string, number>();
  const inboundTypes = new Set(["STOCK_IN", "IN", "ADD", "ADDED", "RESTOCK", "RETURN_STOCK", "STOCK_RETURN", "RETURN_IN", "ADJUSTMENT_IN"]);
  const adjustmentOutTypes = new Set(["STOCK_OUT_ADJUSTMENT", "ADJUSTMENT_OUT", "MANUAL_STOCK_OUT", "STOCK_REDUCTION"]);

  let allocations: any[] = [];
  let salesOptions: any[] = [];
  let movementRows: any[] = [];

  if (lotIds.length) {
    const [recordsResult, movementsResult, allocationsResult, itemsResult, salesResult] = await Promise.all([
      supabase
        .from("vaccination_records")
        .select("id,lot_id,status")
        .in("lot_id", lotIds)
        .neq("status", "VOIDED")
        .limit(20000),
      supabase
        .from("vaccination_inventory_movements")
        .select("id,vaccine_id,lot_id,movement_type,qty,reference_type,reference_id,notes,created_by,created_at")
        .in("lot_id", lotIds)
        .order("created_at", { ascending: false })
        .limit(20000),
      supabase
        .from("vaccination_session_stock_allocations")
        .select("id,session_id,vaccine_id,lot_id,allocated_qty,low_stock_threshold,dedicated,active,service_mode,notes,updated_at")
        .in("lot_id", lotIds)
        .eq("active", true)
        .limit(20000),
      supabase
        .from("vaccination_registration_items")
        .select("id,registration_id,session_id,vaccine_id,lot_id,service_mode,status,administered_record_id,active")
        .in("lot_id", lotIds)
        .eq("active", true)
        .limit(20000),
      vaccineIds.length
        ? supabase
            .from("vaccination_vaccine_sales_options")
            .select("id,vaccine_id,sale_mode,package_dose_count,price,label,active")
            .in("vaccine_id", vaccineIds)
            .eq("active", true)
            .limit(10000)
        : Promise.resolve({ data: [], error: null }),
    ]);

    for (const [label, queryResult] of [
      ["record pemakaian", recordsResult],
      ["movement inventory", movementsResult],
      ["alokasi Healthday/Bazar", allocationsResult],
      ["item registrasi", itemsResult],
      ["harga Paket/Non Paket", salesResult],
    ] as Array<[string, any]>) {
      if (queryResult?.error) throw new Error(`Gagal membaca ${label}: ${queryResult.error.message}`);
    }

    allocations = allocationsResult.data || [];
    salesOptions = salesResult.data || [];
    movementRows = movementsResult.data || [];

    for (const record of recordsResult.data || []) {
      const key = Number(record.lot_id);
      usedByLot.set(key, (usedByLot.get(key) || 0) + 1);
    }

    for (const movement of movementRows) {
      const lotId = Number(movement.lot_id || 0);
      const type = clean(movement.movement_type).toUpperCase();
      movementCountByLot.set(lotId, (movementCountByLot.get(lotId) || 0) + 1);
      if (!lastMovementByLot.has(lotId)) lastMovementByLot.set(lotId, movement);
      if (inboundTypes.has(type)) {
        inboundByLot.set(lotId, (inboundByLot.get(lotId) || 0) + Math.abs(Number(movement.qty || 0)));
      }
      if (adjustmentOutTypes.has(type)) {
        adjustmentOutByLot.set(lotId, (adjustmentOutByLot.get(lotId) || 0) + Math.abs(Number(movement.qty || 0)));
      }
    }

    for (const item of itemsResult.data || []) {
      const status = clean(item.status).toUpperCase();
      if (!["ADMINISTERED", "DONE", "FINISHED"].includes(status)) continue;
      const sessionId = Number(item.session_id || 0);
      const lotId = Number(item.lot_id || 0);
      const serviceMode = clean(item.service_mode).toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
      const key = `${sessionId}:${lotId}:${serviceMode}`;
      serviceUsed.set(key, (serviceUsed.get(key) || 0) + 1);
    }
  }

  const sessionIds: number[] = Array.from(
    new Set<number>([
      ...lots.map((lot: any) => Number(lot.stock_session_id || 0)),
      ...allocations.map((row: any) => Number(row.session_id || 0)),
    ].filter((id: number) => id > 0)),
  );

  let sessions: any[] = [];
  if (sessionIds.length) {
    const sessionsResult = await supabase
      .from("vaccination_sessions")
      .select("id,session_name,company_name,location,session_date,status")
      .in("id", sessionIds)
      .limit(5000);
    if (sessionsResult.error) throw new Error(sessionsResult.error.message);
    sessions = sessionsResult.data || [];
  }
  const sessionMap = new Map<number, any>(sessions.map((row: any) => [Number(row.id), row]));

  const allocationsByLot = new Map<number, any[]>();
  for (const allocation of allocations) {
    const lotId = Number(allocation.lot_id || 0);
    const serviceMode = clean(allocation.service_mode).toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
    const sessionId = Number(allocation.session_id || 0);
    const allocated = Math.max(0, Number(allocation.allocated_qty || 0));
    const used = serviceUsed.get(`${sessionId}:${lotId}:${serviceMode}`) || 0;
    const session = sessionMap.get(sessionId) || null;
    const enriched = {
      ...allocation,
      service_mode: serviceMode,
      allocated_qty: allocated,
      used_qty: used,
      remaining_qty: allocated - used,
      session,
      session_name: clean(session?.session_name),
      company_name: clean(session?.company_name),
      location: clean(session?.location),
      session_date: session?.session_date || null,
    };
    if (!allocationsByLot.has(lotId)) allocationsByLot.set(lotId, []);
    allocationsByLot.get(lotId)!.push(enriched);
  }

  const salesByVaccine = new Map<number, any[]>();
  for (const option of salesOptions) {
    const vaccineId = Number(option.vaccine_id || 0);
    if (!salesByVaccine.has(vaccineId)) salesByVaccine.set(vaccineId, []);
    salesByVaccine.get(vaccineId)!.push(option);
  }

  const rawRows = lots.map((lot: any) => {
    const initial = Number(lot.stock_initial || 0);
    const addedFromField = Number(lot.stock_added || 0);
    const addedFromMovements = inboundByLot.get(Number(lot.id)) || 0;
    const added = Math.max(addedFromField, addedFromMovements);
    const usedFromRecords = usedByLot.get(Number(lot.id)) || 0;
    const used = Math.max(Number(lot.stock_used || 0), usedFromRecords);
    const adjustmentOut = adjustmentOutByLot.get(Number(lot.id)) || 0;
    const systemRemaining = initial + added - used - adjustmentOut;
    const physicalRaw = lot.stock_physical_count;
    const physical = physicalRaw === null || physicalRaw === undefined || physicalRaw === "" ? null : Number(physicalRaw);
    const difference = physical === null || Number.isNaN(physical) ? null : physical - systemRemaining;
    const lotAllocations = allocationsByLot.get(Number(lot.id)) || [];
    const saleOptions = salesByVaccine.get(Number(lot.vaccine_id || lot.vaccine?.id || 0)) || [];
    const nonPackage = saleOptions.find((row: any) => clean(row.sale_mode).toUpperCase() !== "PACKAGE");
    const packageOption = saleOptions.find((row: any) => clean(row.sale_mode).toUpperCase() === "PACKAGE");
    const stockSession = sessionMap.get(Number(lot.stock_session_id || 0)) || null;
    const serviceModes = Array.from(new Set(lotAllocations.map((row: any) => row.service_mode))).sort();
    const lastMovement = lastMovementByLot.get(Number(lot.id)) || null;

    return {
      ...lot,
      stock_added: added,
      stock_used: used,
      stock_adjustment_out: adjustmentOut,
      stock_system_remaining: systemRemaining,
      stock_physical_count: physical,
      stock_difference: difference,
      stock_session: stockSession,
      service_allocations: lotAllocations,
      service_modes: serviceModes,
      non_package_price: nonPackage?.price ?? lot.vaccine?.price ?? null,
      package_price: packageOption?.price ?? null,
      package_dose_count: packageOption ? Math.max(1, Number(packageOption.package_dose_count || 1)) : null,
      movement_count: movementCountByLot.get(Number(lot.id)) || 0,
      last_movement_at: lastMovement?.created_at || null,
      last_movement_type: clean(lastMovement?.movement_type),
    };
  });


  // V519: collapse accidental duplicate lot rows for Inventory display/reporting.
  // Identity = same product + lot number + stock ownership target. We DO NOT sum
  // stock_initial across aliases because duplicated catalog rows can carry the same
  // opening stock. Real participant usage / explicit movements from every alias are
  // still consolidated so no historical trace is lost.
  function canonicalLotKey(row: any) {
    const scope = clean(row?.stock_scope || "GENERAL").toUpperCase() || "GENERAL";
    const company = clean(row?.stock_company_name).toLowerCase();
    const sessionId = Number(row?.stock_session_id || 0);
    const vaccineId = Number(row?.vaccine_id || row?.vaccine?.id || 0);
    const lotNumber = clean(row?.lot_number).toLowerCase();
    return [vaccineId, lotNumber, scope, company, sessionId].join("|");
  }

  function canonicalSignal(row: any) {
    const allocationSignal = (row?.service_allocations || []).reduce(
      (sum: number, item: any) => sum + Math.max(0, Number(item?.allocated_qty || 0)),
      0,
    );
    return (
      Number(row?.movement_count || 0) * 1_000_000 +
      Number(row?.stock_used || 0) * 100_000 +
      allocationSignal * 1_000 +
      Number(row?.stock_added || 0) * 100 +
      Number(row?.stock_initial || 0) * 10 +
      (row?.active === false ? 0 : 1)
    );
  }

  const duplicateGroups = new Map<string, any[]>();
  for (const row of rawRows) {
    const key = canonicalLotKey(row);
    if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
    duplicateGroups.get(key)!.push(row);
  }

  const rows = Array.from(duplicateGroups.values()).map((group) => {
    const ranked = [...group].sort((a: any, b: any) => {
      const scoreDiff = canonicalSignal(b) - canonicalSignal(a);
      if (scoreDiff) return scoreDiff;
      return Number(a?.id || 0) - Number(b?.id || 0);
    });
    const canonical = ranked[0];
    const sourceLotIds = Array.from(
      new Set<number>(group.map((row: any) => Number(row?.id || 0)).filter((id: number) => id > 0)),
    ).sort((a, b) => a - b);

    const initial = Math.max(0, ...group.map((row: any) => Number(row?.stock_initial || 0)));
    const addedFromFields = Math.max(0, ...group.map((row: any) => Number(row?.stock_added || 0)));
    const addedFromMovements = sourceLotIds.reduce((sum, lotId) => sum + (inboundByLot.get(lotId) || 0), 0);
    const added = Math.max(addedFromFields, addedFromMovements);
    const usedFromRecords = sourceLotIds.reduce((sum, lotId) => sum + (usedByLot.get(lotId) || 0), 0);
    const usedFromLegacy = Math.max(0, ...group.map((row: any) => Number(row?.stock_used || 0)));
    const used = Math.max(usedFromLegacy, usedFromRecords);
    const adjustmentOut = sourceLotIds.reduce((sum, lotId) => sum + (adjustmentOutByLot.get(lotId) || 0), 0);
    const systemRemaining = initial + added - used - adjustmentOut;

    const physicalCandidates = [canonical, ...group]
      .map((row: any) => row?.stock_physical_count)
      .filter((value: any) => value !== null && value !== undefined && value !== "")
      .map(Number)
      .filter((value: number) => Number.isFinite(value));
    const physical = physicalCandidates.length ? physicalCandidates[0] : null;
    const difference = physical === null ? null : physical - systemRemaining;

    const allocationGroups = new Map<string, any[]>();
    for (const row of group) {
      for (const allocation of row?.service_allocations || []) {
        const sessionId = Number(allocation?.session_id || 0);
        const mode = clean(allocation?.service_mode).toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
        const key = `${sessionId}:${mode}`;
        if (!allocationGroups.has(key)) allocationGroups.set(key, []);
        allocationGroups.get(key)!.push(allocation);
      }
    }

    const mergedAllocations = Array.from(allocationGroups.entries()).map(([key, values]) => {
      const [sessionText, mode] = key.split(":");
      const sessionId = Number(sessionText || 0);
      const base = [...values].sort((a: any, b: any) => Number(b?.allocated_qty || 0) - Number(a?.allocated_qty || 0))[0] || {};
      const allocated = Math.max(0, ...values.map((item: any) => Number(item?.allocated_qty || 0)));
      const aliasLotIds = new Set<number>();
      for (const row of group) {
        const matches = (row?.service_allocations || []).some(
          (item: any) => Number(item?.session_id || 0) === sessionId &&
            (clean(item?.service_mode).toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY") === mode,
        );
        if (matches) aliasLotIds.add(Number(row?.id || 0));
      }
      const usedQty = Array.from(aliasLotIds).reduce(
        (sum, lotId) => sum + (serviceUsed.get(`${sessionId}:${lotId}:${mode}`) || 0),
        0,
      );
      return {
        ...base,
        id: `canonical-${canonical.id}-${sessionId}-${mode}`,
        lot_id: Number(canonical.id),
        service_mode: mode,
        allocated_qty: allocated,
        used_qty: usedQty,
        remaining_qty: allocated - usedQty,
        source_allocation_ids: values.map((item: any) => item?.id).filter(Boolean),
      };
    });

    const serviceModes = Array.from(new Set(mergedAllocations.map((item: any) => item.service_mode))).sort();
    const movementCount = sourceLotIds.reduce((sum, lotId) => sum + (movementCountByLot.get(lotId) || 0), 0);
    const movementCandidates = sourceLotIds
      .map((lotId) => lastMovementByLot.get(lotId))
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime());
    const lastMovement = movementCandidates[0] || null;

    return {
      ...canonical,
      source_lot_ids: sourceLotIds,
      duplicate_count: sourceLotIds.length,
      duplicate_lot_ids: sourceLotIds.filter((id) => id !== Number(canonical?.id || 0)),
      stock_initial: initial,
      stock_added: added,
      stock_used: used,
      stock_adjustment_out: adjustmentOut,
      stock_system_remaining: systemRemaining,
      stock_physical_count: physical,
      stock_difference: difference,
      service_allocations: mergedAllocations,
      service_modes: serviceModes,
      movement_count: movementCount,
      last_movement_at: lastMovement?.created_at || canonical?.last_movement_at || null,
      last_movement_type: clean(lastMovement?.movement_type) || clean(canonical?.last_movement_type),
    };
  });

  const allSessionsResult = await supabase
    .from("vaccination_sessions")
    .select("id,session_name,company_name,location,session_date,status")
    .order("session_date", { ascending: false })
    .limit(5000);
  if (allSessionsResult.error) throw new Error(allSessionsResult.error.message);
  const transferSessions = (allSessionsResult.data || []).filter(
    (row: any) => clean(row?.status).toUpperCase() !== "CANCELLED",
  );

  return { rows, sessions, transferSessions };
}
