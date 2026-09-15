import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";

// VACCINATION_REGISTER_PRODUCT_OPTIONS_V153_1
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "register")) {
    return fail("Akses Registrasi Vaksinasi ditolak untuk role ini.", 403);
  }

  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  if (!sessionId) return fail("session_id wajib diisi.");

  const supabase = supabaseAdmin();

  const sessionResult = await supabase
    .from("vaccination_sessions")
    .select("id,session_name,default_vaccine_id,default_lot_id")
    .eq("id", sessionId)
    .single();

  if (sessionResult.error) return fail(sessionResult.error.message, 500);

  const optionsResult = await supabase
    .from("vaccination_session_vaccines")
    .select(`
      id,
      session_id,
      vaccine_id,
      lot_id,
      dose_number,
      active,
      vaccine:vaccination_vaccines(id,name,brand,price,price_category),
      lot:vaccination_vaccine_lots(id,lot_number,expiry_date,stock_initial,stock_added,stock_used)
    `)
    .eq("session_id", sessionId)
    .eq("active", true)
    .order("id", { ascending: true });

  if (optionsResult.error) return fail(optionsResult.error.message, 500);

  let options: any[] = optionsResult.data || [];

  // Compatibility for old sessions that only store one default vaccine/lot.
  if (!options.length) {
    const vaccineId = toInt(sessionResult.data?.default_vaccine_id, 0);
    const lotId = toInt(sessionResult.data?.default_lot_id, 0);

    if (vaccineId) {
      const [vaccineResult, lotResult] = await Promise.all([
        supabase
          .from("vaccination_vaccines")
          .select("id,name,brand,price,price_category")
          .eq("id", vaccineId)
          .maybeSingle(),
        lotId
          ? supabase
              .from("vaccination_vaccine_lots")
              .select(
                "id,lot_number,expiry_date,stock_initial,stock_added,stock_used",
              )
              .eq("id", lotId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (vaccineResult.error) return fail(vaccineResult.error.message, 500);
      if (lotResult.error) return fail(lotResult.error.message, 500);

      options = [
        {
          id: `default-${sessionId}-${vaccineId}-${lotId || 0}`,
          session_id: sessionId,
          vaccine_id: vaccineId,
          lot_id: lotId || null,
          dose_number: 1,
          active: true,
          vaccine: vaccineResult.data || null,
          lot: lotResult.data || null,
        },
      ];
    }
  }

  return ok({
    session: sessionResult.data,
    options,
  });
}
