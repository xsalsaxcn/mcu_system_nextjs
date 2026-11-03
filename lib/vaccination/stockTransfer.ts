function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeServiceMode(value: any): "HEALTHDAY" | "BAZAR" {
  return clean(value).toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
}

function normalizeCompany(value: any) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const FINAL_ITEM = new Set(["ADMINISTERED", "DONE", "FINISHED"]);
const CANCELLED_RECORD = new Set(["CANCELLED", "CANCELED", "VOID", "VOIDED", "BATAL"]);
const INBOUND = new Set(["STOCK_IN", "IN", "ADD", "ADDED", "RESTOCK", "RETURN_STOCK", "STOCK_RETURN", "RETURN_IN", "ADJUSTMENT_IN", "STOCK_TRANSFER_IN"]);
const OUTBOUND = new Set(["STOCK_OUT_ADJUSTMENT", "ADJUSTMENT_OUT", "MANUAL_STOCK_OUT", "STOCK_REDUCTION", "STOCK_TRANSFER_OUT"]);

export type SessionStockTransferInput = {
  supabase: any;
  lotId: number;
  sourceSessionId: number;
  sourceServiceMode: any;
  targetSessionId: number;
  targetServiceMode: any;
  quantity: number;
  actor?: any;
  sourceLabel?: string;
};

export async function transferVaccinationSessionStock(input: SessionStockTransferInput) {
  const { supabase } = input;
  const lotId = Number(input.lotId || 0);
  const sourceSessionId = Number(input.sourceSessionId || 0);
  const targetSessionId = Number(input.targetSessionId || 0);
  const quantity = Math.floor(Number(input.quantity || 0));
  const sourceServiceMode = normalizeServiceMode(input.sourceServiceMode);
  const targetServiceMode = normalizeServiceMode(input.targetServiceMode);
  const actor = clean(input.actor) || "system";
  const now = new Date().toISOString();

  if (!lotId) throw new Error("Lot sumber wajib dipilih.");
  if (!sourceSessionId) throw new Error("Session sumber wajib dipilih.");
  if (!targetSessionId) throw new Error("Session tujuan wajib dipilih.");
  if (!quantity || quantity <= 0) throw new Error("Jumlah transfer wajib lebih dari 0.");
  if (sourceSessionId === targetSessionId && sourceServiceMode === targetServiceMode) {
    throw new Error("Sumber dan tujuan transfer tidak boleh sama persis.");
  }

  const [lotResult, sessionResult, allocationResult, movementResult, recordResult, sourceUsedResult] = await Promise.all([
    supabase
      .from("vaccination_vaccine_lots")
      .select("id,vaccine_id,lot_number,expiry_date,stock_initial,stock_added,stock_used,stock_physical_count,stock_scope,stock_company_name,stock_session_id,inventory_notes,active")
      .eq("id", lotId)
      .maybeSingle(),
    supabase
      .from("vaccination_sessions")
      .select("id,session_name,company_name,location,session_date,status")
      .in("id", [sourceSessionId, targetSessionId]),
    supabase
      .from("vaccination_session_stock_allocations")
      .select("*")
      .eq("session_id", sourceSessionId)
      .eq("lot_id", lotId)
      .eq("service_mode", sourceServiceMode)
      .eq("active", true)
      .maybeSingle(),
    supabase
      .from("vaccination_inventory_movements")
      .select("id,movement_type,qty")
      .eq("lot_id", lotId)
      .limit(20000),
    supabase
      .from("vaccination_records")
      .select("id,status")
      .eq("lot_id", lotId)
      .limit(20000),
    supabase
      .from("vaccination_registration_items")
      .select("id,status")
      .eq("session_id", sourceSessionId)
      .eq("lot_id", lotId)
      .eq("service_mode", sourceServiceMode)
      .eq("active", true)
      .limit(20000),
  ]);

  if (lotResult.error) throw new Error(lotResult.error.message);
  if (!lotResult.data) throw new Error("Lot sumber tidak ditemukan.");
  if (sessionResult.error) throw new Error(sessionResult.error.message);
  if (allocationResult.error) throw new Error(allocationResult.error.message);
  if (!allocationResult.data) {
    throw new Error(`Alokasi stok sumber ${sourceServiceMode === "BAZAR" ? "Bazar" : "Healthday"} untuk Session ini tidak ditemukan.`);
  }
  if (movementResult.error) throw new Error(movementResult.error.message);
  if (recordResult.error) throw new Error(recordResult.error.message);
  if (sourceUsedResult.error) throw new Error(sourceUsedResult.error.message);

  const lot = lotResult.data as any;
  if (clean(lot.stock_scope).toUpperCase() !== "SESSION" || Number(lot.stock_session_id || 0) !== sourceSessionId) {
    throw new Error("Safety stop: Lot yang dipilih bukan milik Session sumber.");
  }

  const sessions = new Map<number, any>((sessionResult.data || []).map((row: any) => [Number(row.id), row]));
  const sourceSession = sessions.get(sourceSessionId);
  const targetSession = sessions.get(targetSessionId);
  if (!sourceSession) throw new Error("Session sumber tidak ditemukan.");
  if (!targetSession) throw new Error("Session tujuan tidak ditemukan.");
  if (clean(targetSession.status).toUpperCase() === "CANCELLED") throw new Error("Session tujuan sudah dibatalkan.");
  if (normalizeCompany(sourceSession.company_name) !== normalizeCompany(targetSession.company_name)) {
    throw new Error("Transfer stok hanya boleh antar Session perusahaan yang sama.");
  }

  const targetAssignmentResult = await supabase
    .from("vaccination_session_product_assignments")
    .select("id,active")
    .eq("session_id", targetSessionId)
    .eq("vaccine_id", Number(lot.vaccine_id || 0))
    .eq("service_mode", targetServiceMode)
    .eq("active", true)
    .limit(1);
  if (targetAssignmentResult.error) throw new Error(targetAssignmentResult.error.message);
  if (!(targetAssignmentResult.data || []).length) {
    throw new Error(`Produk belum terdaftar sebagai katalog ${targetServiceMode === "BAZAR" ? "Bazar" : "Healthday"} di Session tujuan. Duplikat katalog dulu, lalu transfer stok.`);
  }

  const inboundQty = (movementResult.data || []).reduce((sum: number, movement: any) => {
    const type = clean(movement.movement_type).toUpperCase();
    return INBOUND.has(type) ? sum + Math.abs(Number(movement.qty || 0)) : sum;
  }, 0);
  const outboundQty = (movementResult.data || []).reduce((sum: number, movement: any) => {
    const type = clean(movement.movement_type).toUpperCase();
    return OUTBOUND.has(type) ? sum + Math.abs(Number(movement.qty || 0)) : sum;
  }, 0);
  const activeRecordCount = (recordResult.data || []).filter((row: any) => !CANCELLED_RECORD.has(clean(row.status).toUpperCase())).length;
  const globalUsed = Math.max(Number(lot.stock_used || 0), activeRecordCount);
  const globalAdded = Math.max(Number(lot.stock_added || 0), inboundQty);
  const globalRemaining = Math.max(0, Number(lot.stock_initial || 0) + globalAdded - globalUsed - outboundQty);
  const sourceUsed = (sourceUsedResult.data || []).filter((row: any) => FINAL_ITEM.has(clean(row.status).toUpperCase())).length;
  const sourceAllocated = Math.max(0, Number(allocationResult.data.allocated_qty || 0));
  const sourceBucketRemaining = Math.max(0, sourceAllocated - sourceUsed);
  const transferable = Math.min(globalRemaining, sourceBucketRemaining);

  if (quantity > transferable) {
    throw new Error(`Jumlah transfer ${quantity} melebihi stok sumber yang tersedia (${transferable}).`);
  }

  if (sourceSessionId === targetSessionId) {
    const targetAllocationResult = await supabase
      .from("vaccination_session_stock_allocations")
      .select("*")
      .eq("session_id", targetSessionId)
      .eq("lot_id", lotId)
      .eq("service_mode", targetServiceMode)
      .maybeSingle();
    if (targetAllocationResult.error) throw new Error(targetAllocationResult.error.message);
    const previousTargetAllocation = targetAllocationResult.data || null;
    const nextSourceAllocated = sourceAllocated - quantity;
    const nextTargetAllocated = Math.max(0, Number(previousTargetAllocation?.allocated_qty || 0)) + quantity;

    const sourceUpdate = await supabase
      .from("vaccination_session_stock_allocations")
      .update({ allocated_qty: nextSourceAllocated, updated_at: now })
      .eq("id", allocationResult.data.id);
    if (sourceUpdate.error) throw new Error(sourceUpdate.error.message);

    const targetUpsert = await supabase
      .from("vaccination_session_stock_allocations")
      .upsert({
        session_id: targetSessionId,
        vaccine_id: Number(lot.vaccine_id || 0),
        lot_id: lotId,
        allocated_qty: nextTargetAllocated,
        low_stock_threshold: Math.min(5, nextTargetAllocated),
        dedicated: true,
        active: true,
        service_mode: targetServiceMode,
        notes: `[Inventory] Transfer layanan ${sourceServiceMode} -> ${targetServiceMode}`,
        created_by: actor,
        updated_at: now,
      }, { onConflict: "session_id,lot_id,service_mode" });
    if (targetUpsert.error) {
      await supabase.from("vaccination_session_stock_allocations").update({ allocated_qty: sourceAllocated, updated_at: new Date().toISOString() }).eq("id", allocationResult.data.id);
      throw new Error(targetUpsert.error.message);
    }

    const movement = await supabase.from("vaccination_inventory_movements").insert({
      vaccine_id: Number(lot.vaccine_id || 0),
      lot_id: lotId,
      movement_type: "stock_transfer_service",
      qty: quantity,
      reference_type: "inventory_transfer_service",
      reference_id: targetSessionId,
      notes: `[Inventory] Transfer ${quantity} dalam Session ${clean(sourceSession.location || sourceSession.session_name)} · ${sourceServiceMode} -> ${targetServiceMode}`,
      created_by: actor,
    });
    if (movement.error) {
      await supabase.from("vaccination_session_stock_allocations").update({ allocated_qty: sourceAllocated, updated_at: new Date().toISOString() }).eq("id", allocationResult.data.id);
      if (previousTargetAllocation) {
        await supabase.from("vaccination_session_stock_allocations").upsert(previousTargetAllocation, { onConflict: "session_id,lot_id,service_mode" });
      } else {
        await supabase.from("vaccination_session_stock_allocations").delete().eq("session_id", targetSessionId).eq("lot_id", lotId).eq("service_mode", targetServiceMode);
      }
      throw new Error(movement.error.message);
    }

    return {
      quantity,
      sourceLotId: lotId,
      targetLotId: lotId,
      sourceSessionId,
      targetSessionId,
      sourceServiceMode,
      targetServiceMode,
      sourceRemaining: transferable - quantity,
      message: `Transfer ${quantity} berhasil: ${sourceServiceMode === "BAZAR" ? "Bazar" : "Healthday"} -> ${targetServiceMode === "BAZAR" ? "Bazar" : "Healthday"} dalam Session ${clean(sourceSession.location || sourceSession.session_name)}.`,
    };
  }

  const targetLotResult = await supabase
    .from("vaccination_vaccine_lots")
    .select("id,vaccine_id,lot_number,expiry_date,stock_initial,stock_added,stock_used,stock_physical_count,stock_scope,stock_company_name,stock_session_id,inventory_notes,active")
    .eq("vaccine_id", Number(lot.vaccine_id || 0))
    .eq("lot_number", clean(lot.lot_number))
    .eq("stock_scope", "SESSION")
    .eq("stock_session_id", targetSessionId)
    .eq("active", true)
    .limit(2);
  if (targetLotResult.error) throw new Error(targetLotResult.error.message);
  if ((targetLotResult.data || []).length > 1) {
    throw new Error("Safety stop: ditemukan lebih dari satu Lot target aktif dengan produk + Lot Number yang sama.");
  }

  let targetLot: any = (targetLotResult.data || [])[0] || null;
  let createdTargetLot = false;
  if (!targetLot) {
    const createTargetLot = await supabase
      .from("vaccination_vaccine_lots")
      .insert({
        vaccine_id: Number(lot.vaccine_id || 0),
        lot_number: clean(lot.lot_number),
        expiry_date: lot.expiry_date || null,
        stock_initial: 0,
        stock_added: 0,
        stock_used: 0,
        stock_physical_count: 0,
        inventory_notes: `Transfer target from Session ${sourceSessionId}; isolated stock`,
        stock_scope: "SESSION",
        stock_company_name: clean(targetSession.company_name) || null,
        stock_session_id: targetSessionId,
        active: true,
      })
      .select("*")
      .single();
    if (createTargetLot.error) throw new Error(createTargetLot.error.message);
    targetLot = createTargetLot.data;
    createdTargetLot = true;
  }

  const targetLotId = Number(targetLot.id || 0);
  const [targetAllocationResult, targetUsedResult] = await Promise.all([
    supabase
      .from("vaccination_session_stock_allocations")
      .select("*")
      .eq("session_id", targetSessionId)
      .eq("lot_id", targetLotId)
      .eq("service_mode", targetServiceMode)
      .maybeSingle(),
    supabase
      .from("vaccination_registration_items")
      .select("id,status")
      .eq("session_id", targetSessionId)
      .eq("lot_id", targetLotId)
      .eq("service_mode", targetServiceMode)
      .eq("active", true)
      .limit(20000),
  ]);
  if (targetAllocationResult.error) throw new Error(targetAllocationResult.error.message);
  if (targetUsedResult.error) throw new Error(targetUsedResult.error.message);

  const previousSourceAllocation = { ...allocationResult.data };
  const previousTargetAllocation = targetAllocationResult.data ? { ...targetAllocationResult.data } : null;
  const previousTargetLot = { ...targetLot };
  const previousSourcePhysical = lot.stock_physical_count;
  const targetUsed = (targetUsedResult.data || []).filter((row: any) => FINAL_ITEM.has(clean(row.status).toUpperCase())).length;
  const nextSourceAllocated = sourceAllocated - quantity;
  const nextTargetAllocated = Math.max(0, Number(previousTargetAllocation?.allocated_qty || 0)) + quantity;
  const nextTargetAdded = Number(targetLot.stock_added || 0) + quantity;
  const sourcePhysical = lot.stock_physical_count === null || lot.stock_physical_count === undefined ? null : Number(lot.stock_physical_count);
  const targetPhysical = targetLot.stock_physical_count === null || targetLot.stock_physical_count === undefined ? null : Number(targetLot.stock_physical_count);

  const sourceAllocationUpdate = await supabase
    .from("vaccination_session_stock_allocations")
    .update({ allocated_qty: nextSourceAllocated, updated_at: now })
    .eq("id", allocationResult.data.id);
  if (sourceAllocationUpdate.error) throw new Error(sourceAllocationUpdate.error.message);

  const targetAllocationUpsert = await supabase
    .from("vaccination_session_stock_allocations")
    .upsert({
      session_id: targetSessionId,
      vaccine_id: Number(lot.vaccine_id || 0),
      lot_id: targetLotId,
      allocated_qty: nextTargetAllocated,
      low_stock_threshold: Math.min(5, Math.max(0, nextTargetAllocated - targetUsed)),
      dedicated: true,
      active: true,
      service_mode: targetServiceMode,
      notes: `[Inventory] Transfer stok dari Session ${sourceSessionId} · ${sourceServiceMode}`,
      created_by: actor,
      updated_at: now,
    }, { onConflict: "session_id,lot_id,service_mode" });
  if (targetAllocationUpsert.error) {
    await supabase.from("vaccination_session_stock_allocations").upsert(previousSourceAllocation, { onConflict: "session_id,lot_id,service_mode" });
    if (createdTargetLot) await supabase.from("vaccination_vaccine_lots").delete().eq("id", targetLotId);
    throw new Error(targetAllocationUpsert.error.message);
  }

  const targetLotUpdate = await supabase
    .from("vaccination_vaccine_lots")
    .update({
      stock_added: nextTargetAdded,
      stock_physical_count: targetPhysical === null ? quantity : targetPhysical + quantity,
      inventory_notes: `[Inventory] Transfer masuk ${quantity} dari ${clean(sourceSession.location || sourceSession.session_name)} · ${sourceServiceMode}`,
      updated_at: now,
    })
    .eq("id", targetLotId);
  if (targetLotUpdate.error) {
    await supabase.from("vaccination_session_stock_allocations").upsert(previousSourceAllocation, { onConflict: "session_id,lot_id,service_mode" });
    if (previousTargetAllocation) await supabase.from("vaccination_session_stock_allocations").upsert(previousTargetAllocation, { onConflict: "session_id,lot_id,service_mode" });
    else await supabase.from("vaccination_session_stock_allocations").delete().eq("session_id", targetSessionId).eq("lot_id", targetLotId).eq("service_mode", targetServiceMode);
    if (createdTargetLot) await supabase.from("vaccination_vaccine_lots").delete().eq("id", targetLotId);
    throw new Error(targetLotUpdate.error.message);
  }

  if (sourcePhysical !== null) {
    const sourcePhysicalUpdate = await supabase
      .from("vaccination_vaccine_lots")
      .update({ stock_physical_count: Math.max(0, sourcePhysical - quantity), updated_at: now })
      .eq("id", lotId);
    if (sourcePhysicalUpdate.error) {
      await supabase.from("vaccination_session_stock_allocations").upsert(previousSourceAllocation, { onConflict: "session_id,lot_id,service_mode" });
      if (previousTargetAllocation) await supabase.from("vaccination_session_stock_allocations").upsert(previousTargetAllocation, { onConflict: "session_id,lot_id,service_mode" });
      else await supabase.from("vaccination_session_stock_allocations").delete().eq("session_id", targetSessionId).eq("lot_id", targetLotId).eq("service_mode", targetServiceMode);
      await supabase.from("vaccination_vaccine_lots").update({ ...previousTargetLot, updated_at: new Date().toISOString() }).eq("id", targetLotId);
      if (createdTargetLot) await supabase.from("vaccination_vaccine_lots").delete().eq("id", targetLotId);
      throw new Error(sourcePhysicalUpdate.error.message);
    }
  }

  const sourceLabel = clean(sourceSession.location || sourceSession.session_name) || `Session ${sourceSessionId}`;
  const targetLabel = clean(targetSession.location || targetSession.session_name) || `Session ${targetSessionId}`;
  const movementInsert = await supabase.from("vaccination_inventory_movements").insert([
    {
      vaccine_id: Number(lot.vaccine_id || 0),
      lot_id: lotId,
      movement_type: "stock_transfer_out",
      qty: quantity,
      reference_type: "inventory_transfer",
      reference_id: targetSessionId,
      notes: `[Inventory] OUT ${quantity} · ${sourceLabel} ${sourceServiceMode} -> ${targetLabel} ${targetServiceMode} · target lot ${targetLotId}`,
      created_by: actor,
    },
    {
      vaccine_id: Number(lot.vaccine_id || 0),
      lot_id: targetLotId,
      movement_type: "stock_transfer_in",
      qty: quantity,
      reference_type: "inventory_transfer",
      reference_id: sourceSessionId,
      notes: `[Inventory] IN ${quantity} · ${sourceLabel} ${sourceServiceMode} -> ${targetLabel} ${targetServiceMode} · source lot ${lotId}`,
      created_by: actor,
    },
  ]);

  if (movementInsert.error) {
    await supabase.from("vaccination_session_stock_allocations").upsert(previousSourceAllocation, { onConflict: "session_id,lot_id,service_mode" });
    if (previousTargetAllocation) await supabase.from("vaccination_session_stock_allocations").upsert(previousTargetAllocation, { onConflict: "session_id,lot_id,service_mode" });
    else await supabase.from("vaccination_session_stock_allocations").delete().eq("session_id", targetSessionId).eq("lot_id", targetLotId).eq("service_mode", targetServiceMode);
    if (sourcePhysical !== null) await supabase.from("vaccination_vaccine_lots").update({ stock_physical_count: previousSourcePhysical, updated_at: new Date().toISOString() }).eq("id", lotId);
    await supabase.from("vaccination_vaccine_lots").update({
      stock_added: previousTargetLot.stock_added,
      stock_physical_count: previousTargetLot.stock_physical_count,
      inventory_notes: previousTargetLot.inventory_notes,
      updated_at: new Date().toISOString(),
    }).eq("id", targetLotId);
    if (createdTargetLot) await supabase.from("vaccination_vaccine_lots").delete().eq("id", targetLotId);
    throw new Error(movementInsert.error.message);
  }

  return {
    quantity,
    sourceLotId: lotId,
    targetLotId,
    sourceSessionId,
    targetSessionId,
    sourceServiceMode,
    targetServiceMode,
    sourceRemaining: transferable - quantity,
    message: `Transfer ${quantity} berhasil: ${sourceLabel} · ${sourceServiceMode === "BAZAR" ? "Bazar" : "Healthday"} -> ${targetLabel} · ${targetServiceMode === "BAZAR" ? "Bazar" : "Healthday"}.`,
  };
}
