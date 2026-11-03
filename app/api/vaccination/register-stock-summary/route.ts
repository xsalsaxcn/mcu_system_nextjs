import { NextRequest } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

// V544_REGISTER_LOCATION_STOCK_SUMMARY
const FINAL_ITEM = new Set(["ADMINISTERED", "DONE", "FINISHED"]);
const CANCELLED_ITEM = new Set(["CANCELLED", "CANCELED", "VOID", "VOIDED", "BATAL"]);
const INBOUND = new Set(["STOCK_IN", "IN", "ADD", "ADDED", "RESTOCK", "RETURN_STOCK", "STOCK_RETURN", "RETURN_IN", "ADJUSTMENT_IN"]);
const OUTBOUND = new Set(["STOCK_OUT_ADJUSTMENT", "ADJUSTMENT_OUT", "MANUAL_STOCK_OUT", "STOCK_REDUCTION"]);

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "register")) return fail("Akses Registrasi ditolak untuk role ini.", 403);

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  if (!sessionId) return ok({ rows: [] });

  const supabase = supabaseAdmin();
  const lotsResult = await supabase
    .from("vaccination_vaccine_lots")
    .select("id,vaccine_id,lot_number,stock_initial,stock_added,stock_used,stock_scope,stock_session_id,active,vaccine:vaccination_vaccines(id,name,brand)")
    .eq("active", true)
    .eq("stock_scope", "SESSION")
    .eq("stock_session_id", sessionId)
    .limit(5000);
  if (lotsResult.error) return fail(lotsResult.error.message, 500);

  const lots = lotsResult.data || [];
  const lotIds = lots.map((row: any) => Number(row.id || 0)).filter(Boolean);

  const [movementResult, itemResult] = await Promise.all([
    lotIds.length
      ? supabase
          .from("vaccination_inventory_movements")
          .select("id,lot_id,movement_type,qty")
          .in("lot_id", lotIds)
          .limit(20000)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("vaccination_registration_items")
      .select("id,vaccine_id,lot_id,service_mode,status,active,registration:vaccination_registrations(id,queue_number,bazar_queue_number,queue_status,bazar_queue_status)")
      .eq("session_id", sessionId)
      .eq("active", true)
      .limit(20000),
  ]);
  if (movementResult.error) return fail(movementResult.error.message, 500);
  if (itemResult.error) return fail(itemResult.error.message, 500);

  const movementByLot = new Map<number, { inbound: number; outbound: number }>();
  for (const movement of movementResult.data || []) {
    const lotId = Number((movement as any).lot_id || 0);
    const type = clean((movement as any).movement_type).toUpperCase();
    const bucket = movementByLot.get(lotId) || { inbound: 0, outbound: 0 };
    if (INBOUND.has(type)) bucket.inbound += Math.abs(Number((movement as any).qty || 0));
    if (OUTBOUND.has(type)) bucket.outbound += Math.abs(Number((movement as any).qty || 0));
    movementByLot.set(lotId, bucket);
  }

  const stockByVaccine = new Map<number, { id: number; name: string; brand: string; stock: number }>();
  for (const lot of lots as any[]) {
    const vaccineId = Number(lot.vaccine_id || lot.vaccine?.id || 0);
    if (!vaccineId) continue;
    const movement = movementByLot.get(Number(lot.id || 0)) || { inbound: 0, outbound: 0 };
    const added = Math.max(Number(lot.stock_added || 0), movement.inbound);
    const remaining = Math.max(0, Number(lot.stock_initial || 0) + added - Number(lot.stock_used || 0) - movement.outbound);
    const current = stockByVaccine.get(vaccineId) || {
      id: vaccineId,
      name: clean(lot.vaccine?.name) || `Produk ${vaccineId}`,
      brand: clean(lot.vaccine?.brand),
      stock: 0,
    };
    current.stock += remaining;
    stockByVaccine.set(vaccineId, current);
  }

  const pendingByVaccine = new Map<number, { registered: number; arrived: number }>();
  for (const item of itemResult.data || []) {
    const status = clean((item as any).status).toUpperCase();
    if (CANCELLED_ITEM.has(status) || FINAL_ITEM.has(status)) continue;
    const vaccineId = Number((item as any).vaccine_id || 0);
    if (!vaccineId) continue;
    const current = pendingByVaccine.get(vaccineId) || { registered: 0, arrived: 0 };
    current.registered += 1;

    const mode = clean((item as any).service_mode).toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
    const registration: any = Array.isArray((item as any).registration)
      ? (item as any).registration[0]
      : (item as any).registration;
    const queueNumber = mode === "BAZAR" ? clean(registration?.bazar_queue_number) : clean(registration?.queue_number);
    const queueStatus = clean(mode === "BAZAR" ? registration?.bazar_queue_status : registration?.queue_status).toUpperCase();
    if (queueNumber || !["", "IMPORTED", "REGISTERED"].includes(queueStatus)) current.arrived += 1;

    pendingByVaccine.set(vaccineId, current);
  }

  const vaccineIds = new Set<number>([...stockByVaccine.keys(), ...pendingByVaccine.keys()]);
  const rows = Array.from(vaccineIds).map((vaccineId) => {
    const stock = stockByVaccine.get(vaccineId) || { id: vaccineId, name: `Produk ${vaccineId}`, brand: "", stock: 0 };
    const pending = pendingByVaccine.get(vaccineId) || { registered: 0, arrived: 0 };
    return {
      vaccineId,
      name: stock.name,
      brand: stock.brand,
      stockLocation: stock.stock,
      registered: pending.registered,
      arrived: pending.arrived,
      available: Math.max(0, stock.stock - pending.registered),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "id"));

  return ok({ sessionId, rows });
}
