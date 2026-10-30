import { NextRequest } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { buildVaccinationInventorySnapshot } from "@/lib/vaccination/inventorySnapshot";

// V522_INVENTORY_SAFE_ARCHIVE
// VACCINATION_ROLE_GUARD_V150
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "inventory")) return fail("Akses modul vaksinasi ditolak untuk role ini.", 403);

  try {
    return ok(await buildVaccinationInventorySnapshot());
  } catch (error: any) {
    return fail(error?.message || "Gagal mengambil inventory.", 500);
  }
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "inventory")) return fail("Akses modul vaksinasi ditolak untuk role ini.", 403);

  const body = await req.json().catch(() => ({}));
  const lotId = toInt(body.lotId || body.id, 0);
  if (!lotId) return fail("Lot wajib dipilih.");

  const supabase = supabaseAdmin();

  if (clean(body.action).toLowerCase() === "archive-lot") {
    const primaryLotId = toInt(body.lotId || body.id, 0);
    const reason = clean(body.reason);
    if (!primaryLotId) return fail("Lot wajib dipilih.");
    if (!reason) return fail("Alasan hapus wajib diisi.");

    const snapshot = await buildVaccinationInventorySnapshot();
    const canonicalRow = (snapshot.rows || []).find((row: any) => {
      const ids = Array.isArray(row?.source_lot_ids) && row.source_lot_ids.length
        ? row.source_lot_ids.map(Number)
        : [Number(row?.id || 0)];
      return ids.includes(primaryLotId);
    });
    if (!canonicalRow) return fail("Produk/Lot tidak ditemukan pada Inventory aktif.", 404);

    const remaining = Number(canonicalRow?.stock_system_remaining || 0);
    if (remaining !== 0) return fail(`Produk/Lot masih memiliki Sisa Sistem ${remaining}. Kurangi atau transfer stok sampai 0 sebelum dihapus dari Inventory.`, 409);

    const lotIds = Array.from(new Set<number>(
      (Array.isArray(canonicalRow?.source_lot_ids) && canonicalRow.source_lot_ids.length
        ? canonicalRow.source_lot_ids
        : [canonicalRow?.id])
        .map(Number)
        .filter((id: number) => id > 0),
    ));
    const [lotsResult, allocationsResult] = await Promise.all([
      supabase.from("vaccination_vaccine_lots").select("id,vaccine_id,lot_number,active").in("id", lotIds),
      supabase.from("vaccination_session_stock_allocations").select("id,lot_id,active").in("lot_id", lotIds).eq("active", true),
    ]);
    if (lotsResult.error) return fail(lotsResult.error.message, 500);
    if (allocationsResult.error) return fail(allocationsResult.error.message, 500);

    const lotUpdate = await supabase.from("vaccination_vaccine_lots").update({ active: false, updated_at: new Date().toISOString() }).in("id", lotIds);
    if (lotUpdate.error) return fail(lotUpdate.error.message, 500);

    const allocationIds = (allocationsResult.data || []).map((row: any) => Number(row?.id || 0)).filter(Boolean);
    if (allocationIds.length) {
      const allocationUpdate = await supabase.from("vaccination_session_stock_allocations").update({ active: false, updated_at: new Date().toISOString() }).in("id", allocationIds);
      if (allocationUpdate.error) {
        await supabase.from("vaccination_vaccine_lots").update({ active: true, updated_at: new Date().toISOString() }).in("id", lotIds);
        return fail(allocationUpdate.error.message, 500);
      }
    }

    const createdBy = (user as any).email || (user as any).name || (user as any).id || "system";
    const movementRows = (lotsResult.data || []).map((lot: any) => ({
      vaccine_id: Number(lot?.vaccine_id || 0),
      lot_id: Number(lot?.id || 0),
      movement_type: "inventory_archive",
      qty: 0,
      reference_type: "inventory_archive",
      reference_id: Number(lot?.id || 0),
      notes: `[Inventory] Hapus dari Inventory aktif · ${reason}`,
      created_by: createdBy,
    }));
    const movementResult = movementRows.length ? await supabase.from("vaccination_inventory_movements").insert(movementRows) : { error: null };
    if (movementResult.error) {
      await supabase.from("vaccination_vaccine_lots").update({ active: true, updated_at: new Date().toISOString() }).in("id", lotIds);
      if (allocationIds.length) await supabase.from("vaccination_session_stock_allocations").update({ active: true, updated_at: new Date().toISOString() }).in("id", allocationIds);
      return fail(`Hapus dibatalkan karena audit gagal disimpan: ${movementResult.error.message}`, 500);
    }

    return ok({ message: `${clean(canonicalRow?.vaccine?.name) || "Produk"} · Lot ${clean(canonicalRow?.lot_number) || "-"} berhasil dihapus dari Inventory aktif. Riwayat transaksi tetap tersimpan.` });
  }

  if (clean(body.action).toLowerCase() === "stock-transaction") {
    const stockAction = clean(body.stockAction).toUpperCase();
    const inventoryTarget = clean(body.inventoryTarget).toUpperCase();
    const quantity = Math.max(0, toInt(body.quantity, 0));

    if (!["ADD_STOCK", "RETURN_STOCK", "REMOVE_STOCK"].includes(stockAction)) return fail("Pilih Stok: Tambah Stock, Return Stock, atau Kurangi Stock.");
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
    const adjustmentOutTypes = new Set(["STOCK_OUT_ADJUSTMENT", "ADJUSTMENT_OUT", "MANUAL_STOCK_OUT", "STOCK_REDUCTION"]);
    const movementAdded = (movementsResult.data || []).reduce((sum: number, movement: any) => {
      const type = clean(movement.movement_type).toUpperCase();
      return inboundTypes.has(type) ? sum + Math.abs(Number(movement.qty || 0)) : sum;
    }, 0);
    const movementOut = (movementsResult.data || []).reduce((sum: number, movement: any) => {
      const type = clean(movement.movement_type).toUpperCase();
      return adjustmentOutTypes.has(type) ? sum + Math.abs(Number(movement.qty || 0)) : sum;
    }, 0);
    const beforeAdded = Math.max(Number(lot.stock_added || 0), movementAdded);
    const used = Math.max(Number(lot.stock_used || 0), (recordsResult.data || []).length);
    const beforeRemaining = initial + beforeAdded - used - movementOut;
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

    const isRemove = stockAction === "REMOVE_STOCK";
    if (isRemove && quantity > beforeRemaining) {
      return fail(`Stok tidak cukup. Sisa Sistem saat ini ${beforeRemaining}, tidak bisa dikurangi ${quantity}.`, 409);
    }

    const nextAdded = isRemove ? beforeAdded : beforeAdded + quantity;
    const nextMovementOut = movementOut + (isRemove ? quantity : 0);
    const nextRemaining = initial + nextAdded - used - nextMovementOut;
    if (nextRemaining < 0) return fail(`Sisa Sistem tidak boleh negatif (${nextRemaining}).`, 409);

    const label = isRemove ? "Kurangi Stock" : stockAction === "RETURN_STOCK" ? "Return Stock" : "Tambah Stock";
    const nextNotes = note || `${label} - Inventory Sistem`;
    const physicalAfter = physicalBefore === null
      ? nextRemaining
      : isRemove
        ? Math.max(0, physicalBefore - quantity)
        : physicalBefore + quantity;
    const updateResult = await supabase
      .from("vaccination_vaccine_lots")
      .update({
        stock_added: nextAdded,
        stock_physical_count: physicalAfter,
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
      movement_type: isRemove ? "adjustment_out" : stockAction === "RETURN_STOCK" ? "return_stock" : "stock_in",
      qty: quantity,
      reference_type: isRemove ? "inventory_adjustment_out" : "inventory_system",
      reference_id: lotId,
      notes: nextNotes,
      created_by: createdBy,
    });
    if (movementResult.error) {
      await supabase
        .from("vaccination_vaccine_lots")
        .update({
          stock_added: beforeAdded,
          stock_physical_count: lot.stock_physical_count,
          inventory_notes: lot.inventory_notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lotId);
      return fail(movementResult.error.message, 500);
    }

    return ok({
      message: `${label} ${quantity} berhasil. Sisa Sistem ${nextRemaining}.`,
      lot: updateResult.data,
      stockSystemRemaining: nextRemaining,
      stockPhysicalCount: physicalAfter,
    });
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
