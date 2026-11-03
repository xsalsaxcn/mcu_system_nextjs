import { NextRequest } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { buildVaccinationInventorySnapshot } from "@/lib/vaccination/inventorySnapshot";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

// V544_AIA_RETURN_ONLY
export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "inventory_return")) return fail("Akses Retur Inventory ditolak untuk role ini.", 403);
  try {
    return ok(await buildVaccinationInventorySnapshot());
  } catch (error: any) {
    return fail(error?.message || "Gagal mengambil Inventory Retur.", 500);
  }
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "inventory_return")) return fail("Akses Retur Inventory ditolak untuk role ini.", 403);

  const body = await req.json().catch(() => ({}));
  if (clean(body.action).toLowerCase() !== "return-stock") return fail("Action tidak dikenali.", 400);

  const lotId = toInt(body.lotId || body.id, 0);
  const sessionId = toInt(body.sessionId, 0);
  const serviceMode = clean(body.serviceMode).toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
  const quantity = Math.max(0, toInt(body.quantity, 0));
  const note = clean(body.note || body.inventoryNotes);
  if (!lotId) return fail("Lot wajib dipilih.");
  if (!sessionId) return fail("Session / Lokasi wajib dipilih.");
  if (!quantity) return fail("Jumlah retur wajib lebih dari 0.");

  const supabase = supabaseAdmin();
  const [lotResult, sessionResult, allocationResult] = await Promise.all([
    supabase
      .from("vaccination_vaccine_lots")
      .select("id,vaccine_id,lot_number,stock_initial,stock_added,stock_used,stock_physical_count,stock_scope,stock_company_name,stock_session_id,inventory_notes")
      .eq("id", lotId)
      .eq("active", true)
      .maybeSingle(),
    supabase
      .from("vaccination_sessions")
      .select("id,session_name,company_name,location,status")
      .eq("id", sessionId)
      .maybeSingle(),
    supabase
      .from("vaccination_session_stock_allocations")
      .select("*")
      .eq("session_id", sessionId)
      .eq("lot_id", lotId)
      .eq("service_mode", serviceMode)
      .eq("active", true)
      .maybeSingle(),
  ]);
  if (lotResult.error) return fail(lotResult.error.message, 500);
  if (!lotResult.data) return fail("Lot tidak ditemukan.", 404);
  if (sessionResult.error) return fail(sessionResult.error.message, 500);
  if (!sessionResult.data) return fail("Session / Lokasi tidak ditemukan.", 404);
  if (allocationResult.error && String(allocationResult.error.code || "") !== "PGRST116") return fail(allocationResult.error.message, 500);

  const lot = lotResult.data as any;
  const session = sessionResult.data as any;
  if (clean(session.status).toUpperCase() === "CANCELLED") return fail("Session / Lokasi sudah dibatalkan.", 409);

  // Return-only portal is strictly scoped to a Session-owned lot. It may never
  // write into another Session's stock owner.
  if (clean(lot.stock_scope || "GENERAL").toUpperCase() !== "SESSION" || Number(lot.stock_session_id || 0) !== sessionId) {
    return fail("Lot ini bukan milik Session / Lokasi yang dipilih. Retur dibatalkan agar stok tidak nyasar.", 409);
  }

  const beforeAdded = Number(lot.stock_added || 0);
  const beforePhysical = lot.stock_physical_count === null || lot.stock_physical_count === undefined
    ? null
    : Number(lot.stock_physical_count);
  const nextAdded = beforeAdded + quantity;
  const nextPhysical = beforePhysical === null ? null : beforePhysical + quantity;
  const previousAllocation = allocationResult.data || null;
  const allocatedBefore = Math.max(0, Number(previousAllocation?.allocated_qty || 0));
  const allocatedAfter = allocatedBefore + quantity;
  const actor = (user as any)?.username || (user as any)?.name || (user as any)?.id || "AIA Return";
  const locationLabel = clean(session.location) || clean(session.session_name) || `Session ${sessionId}`;
  const auditNote = `[AIA Retur] ${serviceMode} · ${locationLabel} · ${note || "-"}`;

  const lotUpdate = await supabase
    .from("vaccination_vaccine_lots")
    .update({
      stock_added: nextAdded,
      stock_physical_count: nextPhysical,
      inventory_notes: auditNote,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lotId)
    .select("*")
    .single();
  if (lotUpdate.error) return fail(lotUpdate.error.message, 500);

  const allocationWrite = await supabase
    .from("vaccination_session_stock_allocations")
    .upsert({
      session_id: sessionId,
      vaccine_id: Number(lot.vaccine_id),
      lot_id: lotId,
      allocated_qty: allocatedAfter,
      low_stock_threshold: Math.min(5, allocatedAfter),
      dedicated: true,
      active: true,
      service_mode: serviceMode,
      notes: `[AIA Retur] Return Stock`,
      created_by: actor,
      updated_at: new Date().toISOString(),
    }, { onConflict: "session_id,lot_id,service_mode" });
  if (allocationWrite.error) {
    await supabase.from("vaccination_vaccine_lots").update({
      stock_added: beforeAdded,
      stock_physical_count: lot.stock_physical_count,
      inventory_notes: lot.inventory_notes,
      updated_at: new Date().toISOString(),
    }).eq("id", lotId);
    return fail(allocationWrite.error.message, 500);
  }

  const movementResult = await supabase.from("vaccination_inventory_movements").insert({
    vaccine_id: Number(lot.vaccine_id),
    lot_id: lotId,
    movement_type: "return_stock",
    qty: quantity,
    reference_type: "aia_return_inventory",
    reference_id: sessionId,
    notes: auditNote,
    created_by: actor,
  });
  if (movementResult.error) {
    await supabase.from("vaccination_vaccine_lots").update({
      stock_added: beforeAdded,
      stock_physical_count: lot.stock_physical_count,
      inventory_notes: lot.inventory_notes,
      updated_at: new Date().toISOString(),
    }).eq("id", lotId);
    if (previousAllocation) {
      await supabase.from("vaccination_session_stock_allocations").upsert(previousAllocation, { onConflict: "session_id,lot_id,service_mode" });
    }
    return fail(`Retur dibatalkan karena audit movement gagal: ${movementResult.error.message}`, 500);
  }

  return ok({
    message: `Retur ${quantity} berhasil ke ${locationLabel} · ${serviceMode === "BAZAR" ? "Bazar" : "Healthday"}.`,
  });
}
