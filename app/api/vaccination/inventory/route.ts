import { NextRequest } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";

// VACCINATION_ROLE_GUARD_V150
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "inventory")) return fail("Akses modul vaksinasi ditolak untuk role ini.", 403);

  const supabase = supabaseAdmin();
  const result = await supabase
    .from("vaccination_vaccine_lots")
    .select("*, vaccine:vaccination_vaccines(id,name,brand,price,price_category)")
    .order("active", { ascending: false })
    .order("id", { ascending: false });

  if (result.error) return fail(result.error.message, 500);

  const lotIds = (result.data || []).map((lot: any) => Number(lot.id)).filter(Boolean);
  const usedByLot = new Map<number, number>();
  const inboundByLot = new Map<number, number>();
  const inboundTypes = new Set(["STOCK_IN", "IN", "ADD", "ADDED", "RESTOCK", "RETURN_STOCK", "STOCK_RETURN", "RETURN_IN", "ADJUSTMENT_IN"]);

  if (lotIds.length) {
    const [recordsResult, movementsResult] = await Promise.all([
      supabase
        .from("vaccination_records")
        .select("id,lot_id,status")
        .in("lot_id", lotIds)
        .neq("status", "VOIDED")
        .limit(20000),
      supabase
        .from("vaccination_inventory_movements")
        .select("id,lot_id,movement_type,qty")
        .in("lot_id", lotIds)
        .limit(20000),
    ]);

    if (!recordsResult.error) {
      for (const record of recordsResult.data || []) {
        const key = Number(record.lot_id);
        usedByLot.set(key, (usedByLot.get(key) || 0) + 1);
      }
    }

    if (!movementsResult.error) {
      for (const movement of movementsResult.data || []) {
        const type = clean(movement.movement_type).toUpperCase();
        if (!inboundTypes.has(type)) continue;
        const key = Number(movement.lot_id);
        inboundByLot.set(key, (inboundByLot.get(key) || 0) + Math.abs(Number(movement.qty || 0)));
      }
    }
  }

  const rows = (result.data || []).map((lot: any) => {
    const initial = Number(lot.stock_initial || 0);
    const addedFromField = Number(lot.stock_added || 0);
    const addedFromMovements = inboundByLot.get(Number(lot.id)) || 0;
    // V150.12: cumulative inbound is canonicalized from both the lot field and
    // traceable stock-in/return movements. This prevents the report enhancer
    // from reverting a successful stock transaction back to an older balance.
    const added = Math.max(addedFromField, addedFromMovements);
    const usedFromRecords = usedByLot.get(Number(lot.id)) || 0;
    const used = Math.max(Number(lot.stock_used || 0), usedFromRecords);
    const systemRemaining = initial + added - used;
    const physicalRaw = lot.stock_physical_count;
    const physical = physicalRaw === null || physicalRaw === undefined || physicalRaw === "" ? null : Number(physicalRaw);
    const difference = physical === null || Number.isNaN(physical) ? null : physical - systemRemaining;

    return {
      ...lot,
      stock_added: added,
      stock_system_remaining: systemRemaining,
      stock_physical_count: physical,
      stock_difference: difference,
    };
  });

  return ok({ rows });
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "inventory")) return fail("Akses modul vaksinasi ditolak untuk role ini.", 403);

  const body = await req.json().catch(() => ({}));
  const lotId = toInt(body.lotId || body.id, 0);
  if (!lotId) return fail("Lot wajib dipilih.");

  const supabase = supabaseAdmin();

  if (clean(body.action).toLowerCase() === "stock-transaction") {
    const stockAction = clean(body.stockAction).toUpperCase();
    const inventoryTarget = clean(body.inventoryTarget).toUpperCase();
    const quantity = Math.max(0, toInt(body.quantity, 0));

    if (!["ADD_STOCK", "RETURN_STOCK"].includes(stockAction)) return fail("Pilih Stok: Tambah Stock atau Return Stock.");
    if (!["SYSTEM", "PHYSICAL"].includes(inventoryTarget)) return fail("Pilih Inventory: Sistem atau Fisik.");
    if (inventoryTarget === "SYSTEM" && !quantity) return fail("Jumlah stok wajib lebih dari 0.");

    const beforeResult = await supabase
      .from("vaccination_vaccine_lots")
      .select("id,vaccine_id,stock_initial,stock_added,stock_used,stock_physical_count,inventory_notes")
      .eq("id", lotId)
      .maybeSingle();
    if (beforeResult.error) return fail(beforeResult.error.message, 500);
    if (!beforeResult.data) return fail("Lot tidak ditemukan.", 404);

    const [recordsResult, movementsResult] = await Promise.all([
      supabase
        .from("vaccination_records")
        .select("id,status")
        .eq("lot_id", lotId)
        .neq("status", "VOIDED")
        .limit(20000),
      supabase
        .from("vaccination_inventory_movements")
        .select("id,movement_type,qty")
        .eq("lot_id", lotId)
        .limit(20000),
    ]);
    if (recordsResult.error) return fail(recordsResult.error.message, 500);
    if (movementsResult.error) return fail(movementsResult.error.message, 500);

    const lot = beforeResult.data as any;
    const initial = Number(lot.stock_initial || 0);
    const inboundTypes = new Set(["STOCK_IN", "IN", "ADD", "ADDED", "RESTOCK", "RETURN_STOCK", "STOCK_RETURN", "RETURN_IN", "ADJUSTMENT_IN"]);
    const movementAdded = (movementsResult.data || []).reduce((sum: number, movement: any) => {
      const type = clean(movement.movement_type).toUpperCase();
      return inboundTypes.has(type) ? sum + Math.abs(Number(movement.qty || 0)) : sum;
    }, 0);
    const beforeAdded = Math.max(Number(lot.stock_added || 0), movementAdded);
    const used = Math.max(Number(lot.stock_used || 0), (recordsResult.data || []).length);
    const beforeRemaining = initial + beforeAdded - used;
    const physicalBefore = lot.stock_physical_count === null || lot.stock_physical_count === undefined ? null : Number(lot.stock_physical_count);
    const note = clean(body.inventoryNotes);
    const createdBy = (user as any).email || (user as any).name || (user as any).id || "system";

    if (inventoryTarget === "PHYSICAL") {
      if (beforeRemaining < 0) return fail("Sisa Sistem masih negatif. Perbaiki Inventory Sistem terlebih dahulu sebelum menyamakan Sisa Fisik.");
      if (quantity !== beforeRemaining) return fail(`Sisa Fisik harus sama dengan Sisa Sistem (${beforeRemaining}).`);

      const nextNotes = note || "Stock opname fisik - match Sisa Sistem";
      const updateResult = await supabase
        .from("vaccination_vaccine_lots")
        .update({
          stock_physical_count: beforeRemaining,
          inventory_notes: nextNotes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lotId)
        .select("*")
        .single();
      if (updateResult.error) return fail(updateResult.error.message, 500);

      const movementResult = await supabase.from("vaccination_inventory_movements").insert({
        vaccine_id: lot.vaccine_id,
        lot_id: lotId,
        movement_type: "physical_check",
        qty: beforeRemaining,
        reference_type: "inventory_physical",
        reference_id: lotId,
        notes: nextNotes,
        created_by: createdBy,
      });
      if (movementResult.error) {
        await supabase
          .from("vaccination_vaccine_lots")
          .update({ stock_physical_count: lot.stock_physical_count, inventory_notes: lot.inventory_notes, updated_at: new Date().toISOString() })
          .eq("id", lotId);
        return fail(movementResult.error.message, 500);
      }

      return ok({ message: `Sisa Fisik berhasil disamakan dengan Sisa Sistem: ${beforeRemaining}.`, lot: updateResult.data, stockSystemRemaining: beforeRemaining, stockPhysicalCount: beforeRemaining });
    }

    const nextAdded = beforeAdded + quantity;
    const nextRemaining = initial + nextAdded - used;
    if (nextRemaining < 0) {
      const minimum = Math.max(1, -beforeRemaining);
      return fail(`Sisa Sistem masih akan negatif (${nextRemaining}). Tambah/return minimal ${minimum}.`);
    }

    if (physicalBefore !== null && physicalBefore !== nextRemaining) {
      const needed = physicalBefore - beforeRemaining;
      if (needed > 0) return fail(`Sisa Sistem setelah transaksi harus match Sisa Fisik (${physicalBefore}). Jumlah stock masuk yang diperlukan: ${needed}.`);
      return fail(`Sisa Sistem setelah transaksi (${nextRemaining}) tidak match Sisa Fisik (${physicalBefore}). Gunakan Inventory Fisik untuk stock opname atau lakukan koreksi stock-out yang sesuai.`);
    }

    const label = stockAction === "RETURN_STOCK" ? "Return Stock" : "Tambah Stock";
    const nextNotes = note || `${label} - Inventory Sistem`;
    const physicalAfter = physicalBefore === null ? nextRemaining : physicalBefore;
    const updateResult = await supabase
      .from("vaccination_vaccine_lots")
      .update({ stock_added: nextAdded, stock_physical_count: physicalAfter, inventory_notes: nextNotes, updated_at: new Date().toISOString() })
      .eq("id", lotId)
      .select("*")
      .single();
    if (updateResult.error) return fail(updateResult.error.message, 500);

    const movementResult = await supabase.from("vaccination_inventory_movements").insert({
      vaccine_id: lot.vaccine_id,
      lot_id: lotId,
      movement_type: stockAction === "RETURN_STOCK" ? "return_stock" : "stock_in",
      qty: quantity,
      reference_type: "inventory_system",
      reference_id: lotId,
      notes: nextNotes,
      created_by: createdBy,
    });
    if (movementResult.error) {
      await supabase
        .from("vaccination_vaccine_lots")
        .update({ stock_added: beforeAdded, stock_physical_count: lot.stock_physical_count, inventory_notes: lot.inventory_notes, updated_at: new Date().toISOString() })
        .eq("id", lotId);
      return fail(movementResult.error.message, 500);
    }

    return ok({ message: `${label} ${quantity} berhasil. Sisa Sistem = Sisa Fisik = ${nextRemaining}.`, lot: updateResult.data, stockSystemRemaining: nextRemaining, stockPhysicalCount: physicalAfter });
  }

  const result = await supabase
    .from("vaccination_vaccine_lots")
    .update({
      stock_added: Math.max(0, toInt(body.stockAdded, 0)),
      stock_physical_count: body.stockPhysicalCount === "" || body.stockPhysicalCount == null ? null : Math.max(0, toInt(body.stockPhysicalCount, 0)),
      inventory_notes: clean(body.inventoryNotes) || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lotId)
    .select("*")
    .single();

  if (result.error) return fail(result.error.message, 500);
  return ok({ message: "Inventory berhasil diupdate.", lot: result.data });
}
