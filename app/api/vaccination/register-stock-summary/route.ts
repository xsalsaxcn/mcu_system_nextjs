import { NextRequest } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

// V545_REGISTER_SERVICE_SPECIFIC_STOCK_SUMMARY
const FINAL_ITEM = new Set(["ADMINISTERED", "DONE", "FINISHED"]);
const CANCELLED_ITEM = new Set(["CANCELLED", "CANCELED", "VOID", "VOIDED", "BATAL"]);
const INBOUND = new Set(["STOCK_IN", "IN", "ADD", "ADDED", "RESTOCK", "RETURN_STOCK", "STOCK_RETURN", "RETURN_IN", "ADJUSTMENT_IN", "STOCK_TRANSFER_IN"]);
const OUTBOUND = new Set(["STOCK_OUT_ADJUSTMENT", "ADJUSTMENT_OUT", "MANUAL_STOCK_OUT", "STOCK_REDUCTION", "STOCK_TRANSFER_OUT"]);

function mode(value: any): "HEALTHDAY" | "BAZAR" {
  return clean(value).toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "register")) return fail("Akses Registrasi ditolak untuk role ini.", 403);

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  const serviceMode = mode(req.nextUrl.searchParams.get("service_mode"));
  if (!sessionId) return ok({ rows: [], serviceMode });

  const supabase = supabaseAdmin();
  const [assignmentResult, allocationResult, itemResult] = await Promise.all([
    supabase
      .from("vaccination_session_product_assignments")
      .select("vaccine_id,service_mode,active")
      .eq("session_id", sessionId)
      .eq("service_mode", serviceMode)
      .eq("active", true)
      .limit(10000),
    supabase
      .from("vaccination_session_stock_allocations")
      .select("id,session_id,vaccine_id,lot_id,allocated_qty,service_mode,active")
      .eq("session_id", sessionId)
      .eq("service_mode", serviceMode)
      .eq("active", true)
      .limit(10000),
    // V605: Healthday avoids an unnecessary PostgREST registration embed;
    // missing/ambiguous embedded relations must not silently yield stock 0.
    // Bazar query is intentionally unchanged during the active event.
    (serviceMode === "HEALTHDAY"
      ? supabase
          .from("vaccination_registration_items")
          .select("id,registration_id,vaccine_id,lot_id,service_mode,status,active")
          .eq("session_id", sessionId)
          .eq("service_mode", "HEALTHDAY")
          .eq("active", true)
          .limit(20000)
      : supabase
          .from("vaccination_registration_items")
          .select("id,vaccine_id,lot_id,service_mode,status,active,registration:vaccination_registrations(id,queue_number,bazar_queue_number,queue_status,bazar_queue_status)")
          .eq("session_id", sessionId)
          .eq("service_mode", serviceMode)
          .eq("active", true)
          .limit(20000)),
  ]);
  if (assignmentResult.error) return fail(assignmentResult.error.message, 500);
  if (allocationResult.error) return fail(allocationResult.error.message, 500);
  if (itemResult.error) return fail(itemResult.error.message, 500);

  // V605: attach Healthday queue metadata from a separate, explicit read.
  // No mutation; preserve exactly the old item/arrival count semantics.
  let serviceItems: any[] = itemResult.data || [];
  if (serviceMode === "HEALTHDAY" && serviceItems.length) {
    const registrationIds = Array.from(new Set<number>(
      serviceItems.map((item: any) => Number(item.registration_id || 0))
        .filter((id: number) => Number.isInteger(id) && id > 0),
    ));
    if (registrationIds.length) {
      const registrationResult = await supabase
        .from("vaccination_registrations")
        .select("id,queue_number,queue_status")
        .in("id", registrationIds)
        .limit(20000);
      if (registrationResult.error) return fail(registrationResult.error.message, 500);
      const registrationMap = new Map<number, any>(
        (registrationResult.data || []).map((row: any) => [Number(row.id), row]),
      );
      serviceItems = serviceItems.map((item: any) => ({
        ...item, registration: registrationMap.get(Number(item.registration_id)) || null,
      }));
    }
  }

  const allocations = allocationResult.data || [];
  const lotIds = Array.from(new Set<number>(allocations.map((row: any) => Number(row.lot_id || 0)).filter(Boolean)));
  const lotsResult = lotIds.length
    ? await supabase
        .from("vaccination_vaccine_lots")
        .select("id,vaccine_id,lot_number,stock_initial,stock_added,stock_used,stock_scope,stock_session_id,active,vaccine:vaccination_vaccines(id,name,brand)")
        .in("id", lotIds)
        .eq("active", true)
    : { data: [], error: null } as any;
  if (lotsResult.error) return fail(lotsResult.error.message, 500);

  const movementResult = lotIds.length
    ? await supabase
        .from("vaccination_inventory_movements")
        .select("id,lot_id,movement_type,qty")
        .in("lot_id", lotIds)
        .limit(20000)
    : { data: [], error: null } as any;
  if (movementResult.error) return fail(movementResult.error.message, 500);

  const vaccineIds = new Set<number>();
  for (const row of assignmentResult.data || []) vaccineIds.add(Number((row as any).vaccine_id || 0));
  for (const row of allocations) vaccineIds.add(Number((row as any).vaccine_id || 0));
  for (const row of serviceItems) vaccineIds.add(Number((row as any).vaccine_id || 0));
  vaccineIds.delete(0);

  const vaccineResult = vaccineIds.size
    ? await supabase.from("vaccination_vaccines").select("id,name,brand").in("id", Array.from(vaccineIds))
    : { data: [], error: null } as any;
  if (vaccineResult.error) return fail(vaccineResult.error.message, 500);
  const vaccineMap = new Map<number, any>((vaccineResult.data || []).map((row: any) => [Number(row.id), row]));
  const lotMap = new Map<number, any>((lotsResult.data || []).map((row: any) => [Number(row.id), row]));

  const movementByLot = new Map<number, { inbound: number; outbound: number }>();
  for (const movement of movementResult.data || []) {
    const lotId = Number((movement as any).lot_id || 0);
    const type = clean((movement as any).movement_type).toUpperCase();
    const bucket = movementByLot.get(lotId) || { inbound: 0, outbound: 0 };
    if (INBOUND.has(type)) bucket.inbound += Math.abs(Number((movement as any).qty || 0));
    if (OUTBOUND.has(type)) bucket.outbound += Math.abs(Number((movement as any).qty || 0));
    movementByLot.set(lotId, bucket);
  }

  const usedByLot = new Map<number, number>();
  for (const item of serviceItems) {
    const status = clean((item as any).status).toUpperCase();
    if (!FINAL_ITEM.has(status)) continue;
    const lotId = Number((item as any).lot_id || 0);
    if (lotId) usedByLot.set(lotId, (usedByLot.get(lotId) || 0) + 1);
  }

  const stockByVaccine = new Map<number, number>();
  for (const allocation of allocations as any[]) {
    const vaccineId = Number(allocation.vaccine_id || 0);
    const lotId = Number(allocation.lot_id || 0);
    if (!vaccineId || !lotId) continue;
    const lot = lotMap.get(lotId);
    if (!lot) continue;
    if (clean(lot.stock_scope).toUpperCase() === "SESSION" && Number(lot.stock_session_id || 0) !== sessionId) continue;

    const movement = movementByLot.get(lotId) || { inbound: 0, outbound: 0 };
    const added = Math.max(Number(lot.stock_added || 0), movement.inbound);
    const globalRemaining = Math.max(0, Number(lot.stock_initial || 0) + added - Number(lot.stock_used || 0) - movement.outbound);
    const serviceUsed = usedByLot.get(lotId) || 0;
    const bucketRemaining = Math.max(0, Number(allocation.allocated_qty || 0) - serviceUsed);
    const remaining = Math.min(globalRemaining, bucketRemaining);
    stockByVaccine.set(vaccineId, (stockByVaccine.get(vaccineId) || 0) + remaining);
  }

  // V546: "Sudah Datang" harus mencakup peserta yang masih pending + yang sudah selesai.
  // Peserta final/DONE TIDAK ikut registered pending lagi karena stoknya sudah dikonsumsi,
  // tetapi tetap dihitung sebagai pernah datang agar angka operasional tidak kurang.
  const pendingByVaccine = new Map<number, { registered: number; arrived: number; finalized: number }>();
  for (const item of serviceItems) {
    const status = clean((item as any).status).toUpperCase();
    if (CANCELLED_ITEM.has(status)) continue;
    const vaccineId = Number((item as any).vaccine_id || 0);
    if (!vaccineId) continue;
    const current = pendingByVaccine.get(vaccineId) || { registered: 0, arrived: 0, finalized: 0 };

    if (FINAL_ITEM.has(status)) {
      current.arrived += 1;
      current.finalized += 1;
      pendingByVaccine.set(vaccineId, current);
      continue;
    }

    current.registered += 1;
    const registration: any = Array.isArray((item as any).registration)
      ? (item as any).registration[0]
      : (item as any).registration;
    const queueNumber = serviceMode === "BAZAR" ? clean(registration?.bazar_queue_number) : clean(registration?.queue_number);
    const queueStatus = clean(serviceMode === "BAZAR" ? registration?.bazar_queue_status : registration?.queue_status).toUpperCase();
    if (queueNumber || !["", "IMPORTED", "REGISTERED"].includes(queueStatus)) current.arrived += 1;
    pendingByVaccine.set(vaccineId, current);
  }

  const rows = Array.from(vaccineIds).map((vaccineId) => {
    const vaccine = vaccineMap.get(vaccineId) || { id: vaccineId, name: `Produk ${vaccineId}`, brand: "" };
    const stock = stockByVaccine.get(vaccineId) || 0;
    const pending = pendingByVaccine.get(vaccineId) || { registered: 0, arrived: 0, finalized: 0 };
    return {
      vaccineId,
      name: clean(vaccine.name) || `Produk ${vaccineId}`,
      brand: clean(vaccine.brand),
      serviceMode,
      stockLocation: stock,
      registered: pending.registered,
      arrived: pending.arrived,
      finalized: pending.finalized,
      available: Math.max(0, stock - pending.registered),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "id"));

  return ok({ sessionId, serviceMode, rows });
}
