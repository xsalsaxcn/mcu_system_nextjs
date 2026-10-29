import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";

// VACCINATION_REGISTER_PRODUCT_OPTIONS_V153_1
// V497_R2_SERVICE_STOCK_OPTIONS_SAFE
// V506_BAZAR_REGISTRATION_EXACT_SERVICE_STOCK

function normalizeServiceMode(value: any) {
  return String(value || "").trim().toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
}

async function loadServiceStockRemaining(supabase: any, sessionId: number) {
  const allocationsResult = await supabase
    .from("vaccination_session_stock_allocations")
    .select("lot_id,service_mode,allocated_qty,active")
    .eq("session_id", sessionId)
    .eq("active", true)
    .limit(10000);

  if (allocationsResult.error) {
    const code = String(allocationsResult.error?.code || "");
    const message = String(allocationsResult.error?.message || "").toLowerCase();
    if (code === "42P01" || message.includes("vaccination_session_stock_allocations")) {
      return { enabled: false, map: new Map<string, any>() };
    }
    throw new Error(allocationsResult.error.message);
  }

  const allocations = allocationsResult.data || [];
  if (!allocations.length) return { enabled: false, map: new Map<string, any>() };

  const lotIds = Array.from(
    new Set(allocations.map((row: any) => Number(row.lot_id)).filter(Boolean)),
  );

  const usedMap = new Map<string, number>();
  if (lotIds.length) {
    const usedResult = await supabase
      .from("vaccination_registration_items")
      .select("lot_id,service_mode,status,registration:vaccination_registrations!inner(session_id)")
      .in("lot_id", lotIds)
      .in("status", ["ADMINISTERED", "DONE"])
      .eq("active", true)
      .eq("registration.session_id", sessionId)
      .limit(20000);

    if (usedResult.error) throw new Error(usedResult.error.message);

    for (const row of usedResult.data || []) {
      const lotId = Number((row as any).lot_id || 0);
      if (!lotId) continue;
      const mode = normalizeServiceMode((row as any).service_mode);
      const key = `${lotId}:${mode}`;
      usedMap.set(key, (usedMap.get(key) || 0) + 1);
    }
  }

  const map = new Map<string, any>();
  for (const row of allocations) {
    const lotId = Number((row as any).lot_id || 0);
    if (!lotId) continue;
    const mode = normalizeServiceMode((row as any).service_mode);
    const key = `${lotId}:${mode}`;
    const allocated = Number((row as any).allocated_qty || 0);
    const used = usedMap.get(key) || 0;
    map.set(key, {
      allocated,
      used,
      remaining: Math.max(0, allocated - used),
    });
  }

  return { enabled: true, map };
}


async function loadAssignedVaccineIds(
  supabase: any,
  sessionId: number,
  serviceMode: "HEALTHDAY" | "BAZAR",
) {
  const result = await supabase
    .from("vaccination_session_product_assignments")
    .select("vaccine_id,service_mode,active")
    .eq("session_id", sessionId)
    .eq("service_mode", serviceMode)
    .eq("active", true)
    .limit(10000);

  if (result.error) {
    const code = String(result.error?.code || "");
    const message = String(result.error?.message || "").toLowerCase();
    if (
      code === "42P01" ||
      message.includes("vaccination_session_product_assignments")
    ) {
      return { enabled: false, ids: new Set<number>() };
    }
    throw new Error(result.error.message);
  }

  const ids = new Set<number>();
  for (const row of result.data || []) {
    const vaccineId = Number((row as any).vaccine_id || 0);
    if (vaccineId) ids.add(vaccineId);
  }
  return { enabled: true, ids };
}
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
    .select("id,session_name,default_vaccine_id,default_lot_id,existing_queue_profile")
    .eq("id", sessionId)
    .single();

  if (sessionResult.error) return fail(sessionResult.error.message, 500);

  const salesOffersResult = await supabase
    .from("vaccination_vaccine_sales_options")
    .select("id,vaccine_id,sale_mode,package_dose_count,price,label,active")
    .eq("active", true)
    .order("vaccine_id", { ascending: true })
    .order("sale_mode", { ascending: true });
  if (salesOffersResult.error) return fail(salesOffersResult.error.message, 500);
  const salesOffersByVaccine = new Map<number, any[]>();
  for (const offer of salesOffersResult.data || []) {
    const vaccineId = Number((offer as any).vaccine_id || 0);
    if (!vaccineId) continue;
    if (!salesOffersByVaccine.has(vaccineId)) salesOffersByVaccine.set(vaccineId, []);
    salesOffersByVaccine.get(vaccineId)!.push(offer);
  }

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

  let healthdayOptions = options;

  let bazarOptions: any[] = [];
  const healthdayBazarEnabled =
    String(sessionResult.data?.existing_queue_profile || "LEGACY")
      .trim()
      .toUpperCase() === "HEALTHDAY_BAZAR";

  let serviceStock: { enabled: boolean; map: Map<string, any> };
  let bazarAssignments: { enabled: boolean; ids: Set<number> };
  try {
    [serviceStock, bazarAssignments] = await Promise.all([
      loadServiceStockRemaining(supabase, sessionId),
      loadAssignedVaccineIds(supabase, sessionId, "BAZAR"),
    ]);
  } catch (error: any) {
    return fail(error?.message || "Gagal membaca stok/assignment Healthday-Bazar.", 500);
  }

  const decorateOption = (option: any, serviceMode: "HEALTHDAY" | "BAZAR") => {
    const lotId = Number(option?.lot_id || option?.lot?.id || 0);
    const stock = lotId ? serviceStock.map.get(`${lotId}:${serviceMode}`) : null;
    const vaccineId = Number(option?.vaccine_id || option?.vaccine?.id || 0);
    return {
      ...option,
      service_mode: serviceMode,
      sales_options: salesOffersByVaccine.get(vaccineId) || [],
      service_stock_allocated: stock ? Number(stock.allocated || 0) : null,
      service_stock_used: stock ? Number(stock.used || 0) : null,
      service_stock_remaining: stock ? Number(stock.remaining || 0) : null,
    };
  };

  if (serviceStock.enabled) {
    healthdayOptions = healthdayOptions
      .map((option: any) => decorateOption(option, "HEALTHDAY"))
      .filter((option: any) => Number(option.service_stock_remaining || 0) > 0);
  } else {
    healthdayOptions = healthdayOptions.map((option: any) =>
      decorateOption(option, "HEALTHDAY"),
    );
  }

  if (healthdayBazarEnabled) {
    const [vaccinesResult, lotsResult] = await Promise.all([
      supabase
        .from("vaccination_vaccines")
        .select("id,name,brand,price,price_category,active")
        .eq("active", true)
        .order("name", { ascending: true }),
      supabase
        .from("vaccination_vaccine_lots")
        .select("id,vaccine_id,lot_number,expiry_date,stock_initial,stock_added,stock_used,active,stock_scope,stock_session_id,stock_company_name")
        .eq("active", true)
        .order("expiry_date", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true }),
    ]);

    if (vaccinesResult.error) return fail(vaccinesResult.error.message, 500);
    if (lotsResult.error) return fail(lotsResult.error.message, 500);

    const pricedVaccines = new Map<number, any>(
      (vaccinesResult.data || [])
        .filter((vaccine: any) => {
          const basePrice = Number(vaccine?.price || 0);
          const offers = salesOffersByVaccine.get(Number(vaccine?.id || 0)) || [];
          return basePrice > 0 || offers.some((offer: any) => Number(offer?.price || 0) > 0);
        })
        .map((vaccine: any) => [Number(vaccine.id), vaccine]),
    );

    bazarOptions = (lotsResult.data || [])
      .map((lot: any) => {
        const vaccineId = Number(lot?.vaccine_id || 0);
        const vaccine = pricedVaccines.get(vaccineId);
        if (!vaccine) return null;

        const scope = String(lot?.stock_scope || "GENERAL").trim().toUpperCase();
        const exactSessionLot =
          scope === "SESSION" && Number(lot?.stock_session_id || 0) === sessionId;
        if (!exactSessionLot) return null;

        if (bazarAssignments.enabled && bazarAssignments.ids.size > 0) {
          if (!bazarAssignments.ids.has(vaccineId)) return null;
        }

        return {
          id: `bazar-${sessionId}-${Number(vaccine.id)}-${Number(lot.id)}`,
          session_id: sessionId,
          vaccine_id: Number(vaccine.id),
          lot_id: Number(lot.id),
          dose_number: 1,
          active: true,
          option_source: "BAZAR_SESSION_SERVICE_STOCK",
          vaccine,
          lot,
        };
      })
      .filter(Boolean)
      .map((option: any) => decorateOption(option, "BAZAR"))
      .filter((option: any) =>
        serviceStock.enabled
          ? Number(option.service_stock_remaining || 0) > 0
          : false,
      );
  }

  return ok({
    session: sessionResult.data,
    options: healthdayOptions,
    healthdayOptions,
    bazarOptions,
    serviceStockEnabled: serviceStock.enabled,
    bazarAssignmentReady: bazarAssignments.enabled,
  });
}
