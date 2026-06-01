import { NextRequest } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const supabase = supabaseAdmin();

  const vaccinesResult = await supabase
    .from("vaccination_vaccines")
    .select("*")
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  if (vaccinesResult.error) return fail(vaccinesResult.error.message, 500);

  const lotsResult = await supabase
    .from("vaccination_vaccine_lots")
    .select("*, vaccine:vaccination_vaccines(id,name,brand,default_next_dose_days)")
    .order("active", { ascending: false })
    .order("id", { ascending: false });

  if (lotsResult.error) return fail(lotsResult.error.message, 500);

  return ok({ vaccines: vaccinesResult.data || [], lots: lotsResult.data || [] });
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const action = clean(body.action);
  const supabase = supabaseAdmin();

  if (action === "create-vaccine") {
    const name = clean(body.name);
    if (!name) return fail("Nama vaksin wajib diisi.");

    const result = await supabase
      .from("vaccination_vaccines")
      .insert({
        name,
        brand: clean(body.brand) || null,
        description: clean(body.description) || null,
        price: body.price === "" || body.price == null ? null : Number(body.price),
        price_category: clean(body.priceCategory) || clean(body.price_category) || null,
        dose_count: Math.max(1, toInt(body.doseCount, 1)),
        default_next_dose_days: body.defaultNextDoseDays === "" || body.defaultNextDoseDays == null ? null : toInt(body.defaultNextDoseDays, 0),
        active: body.active !== false,
      })
      .select("*")
      .single();

    if (result.error) return fail(result.error.message, 500);
    return ok({ message: "Master vaksin berhasil dibuat.", vaccine: result.data });
  }

  if (action === "create-lot") {
    const vaccineId = toInt(body.vaccineId, 0);
    const lotNumber = clean(body.lotNumber);
    if (!vaccineId) return fail("Vaksin wajib dipilih.");
    if (!lotNumber) return fail("Lot Number wajib diisi.");

    const result = await supabase
      .from("vaccination_vaccine_lots")
      .insert({
        vaccine_id: vaccineId,
        lot_number: lotNumber,
        expiry_date: clean(body.expiryDate) || null,
        stock_initial: Math.max(0, toInt(body.stockInitial, 0)),
        stock_added: Math.max(0, toInt(body.stockAdded, 0)),
        stock_physical_count: body.stockPhysicalCount === "" || body.stockPhysicalCount == null ? null : Math.max(0, toInt(body.stockPhysicalCount, 0)),
        inventory_notes: clean(body.inventoryNotes) || null,
        stock_used: 0,
        active: body.active !== false,
      })
      .select("*")
      .single();

    if (result.error) return fail(result.error.message, 500);

    const createdBy = (user as any).email || (user as any).name || (user as any).id || "system";
    const movements = [];
    const initialQty = Math.max(0, toInt(body.stockInitial, 0));
    const addedQty = Math.max(0, toInt(body.stockAdded, 0));
    if (initialQty) movements.push({ vaccine_id: vaccineId, lot_id: result.data.id, movement_type: "initial", qty: initialQty, reference_type: "vaccine_lot", reference_id: result.data.id, notes: "Jumlah awal lot", created_by: createdBy });
    if (addedQty) movements.push({ vaccine_id: vaccineId, lot_id: result.data.id, movement_type: "stock_in", qty: addedQty, reference_type: "vaccine_lot", reference_id: result.data.id, notes: clean(body.inventoryNotes) || "Tambahan stok", created_by: createdBy });
    if (movements.length) await supabase.from("vaccination_inventory_movements").insert(movements);

    return ok({ message: "Lot number berhasil dibuat.", lot: result.data });
  }


  if (action === "update-lot-inventory") {
    const lotId = toInt(body.lotId || body.id, 0);
    if (!lotId) return fail("Lot wajib dipilih.");

    const beforeResult = await supabase
      .from("vaccination_vaccine_lots")
      .select("id,vaccine_id,stock_added")
      .eq("id", lotId)
      .maybeSingle();

    if (beforeResult.error) return fail(beforeResult.error.message, 500);
    const beforeAdded = Number(beforeResult.data?.stock_added || 0);
    const nextAdded = Math.max(0, toInt(body.stockAdded, 0));

    const result = await supabase
      .from("vaccination_vaccine_lots")
      .update({
        stock_added: nextAdded,
        stock_physical_count: body.stockPhysicalCount === "" || body.stockPhysicalCount == null ? null : Math.max(0, toInt(body.stockPhysicalCount, 0)),
        inventory_notes: clean(body.inventoryNotes) || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lotId)
      .select("*")
      .single();

    if (result.error) return fail(result.error.message, 500);

    const delta = nextAdded - beforeAdded;
    if (delta !== 0) {
      await supabase.from("vaccination_inventory_movements").insert({
        vaccine_id: beforeResult.data?.vaccine_id || result.data.vaccine_id,
        lot_id: lotId,
        movement_type: delta > 0 ? "stock_in" : "adjustment_minus",
        qty: delta,
        reference_type: "vaccine_lot",
        reference_id: lotId,
        notes: clean(body.inventoryNotes) || "Update tambahan stok",
        created_by: (user as any).email || (user as any).name || (user as any).id || "system",
      });
    }

    return ok({ message: "Inventory lot berhasil diupdate.", lot: result.data });
  }

  return fail("Action tidak dikenali.");
}
