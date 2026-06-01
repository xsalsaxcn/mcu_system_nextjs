import { NextRequest } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const supabase = supabaseAdmin();
  const result = await supabase
    .from("vaccination_vaccine_lots")
    .select("*, vaccine:vaccination_vaccines(id,name,brand,price,price_category)")
    .order("active", { ascending: false })
    .order("id", { ascending: false });

  if (result.error) return fail(result.error.message, 500);

  const lotIds = (result.data || []).map((lot: any) => Number(lot.id)).filter(Boolean);
  const usedByLot = new Map<number, number>();

  if (lotIds.length) {
    const recordsResult = await supabase
      .from("vaccination_records")
      .select("id,lot_id,status")
      .in("lot_id", lotIds)
      .neq("status", "VOIDED")
      .limit(20000);

    if (!recordsResult.error) {
      for (const record of recordsResult.data || []) {
        const key = Number(record.lot_id);
        usedByLot.set(key, (usedByLot.get(key) || 0) + 1);
      }
    }
  }

  const rows = (result.data || []).map((lot: any) => {
    const initial = Number(lot.stock_initial || 0);
    const added = Number(lot.stock_added || 0);
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

  const body = await req.json().catch(() => ({}));
  const lotId = toInt(body.lotId || body.id, 0);
  if (!lotId) return fail("Lot wajib dipilih.");

  const supabase = supabaseAdmin();
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
