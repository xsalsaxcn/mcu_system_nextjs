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
        stock_used: 0,
        active: body.active !== false,
      })
      .select("*")
      .single();

    if (result.error) return fail(result.error.message, 500);
    return ok({ message: "Lot number berhasil dibuat.", lot: result.data });
  }

  return fail("Action tidak dikenali.");
}
