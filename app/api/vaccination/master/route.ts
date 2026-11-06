// V542_SESSION_STOCK_ISOLATION
// V540_INITIAL_STOCK_EDIT_AND_DELETE_GUARD
// V531_PRODUCT_SERIES_GLOBAL_RULE
// V504_EDIT_LOT_PRODUCT_FIELDS_ACTIVE_SAFE_DETACH
// V499_SESSION_PRODUCT_ASSIGNMENT_WITHOUT_LOT
// V501_PLANNED_INITIAL_STOCK_AND_SERVICE_FILTER
// V502_STOCK_TRANSACTION_AUDIT
import { NextRequest } from "next/server";

// V503_MASTER_UPDATE_REQUIRES_EXPLICIT_PRODUCT_EDIT
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";

// VACCINATION_ROLE_GUARD_V150
// VACCINATION_SESSION_STOCK_OWNERSHIP_V2
// V153_22_SESSION_LOT_RECONCILE_SAFE
// V153_21_MASTER_ROW_EDIT_DELETE_SAFE
// V496_MASTER_LOT_STOCK_TRANSFER_SAFE
// V497_SESSION_SERVICE_STOCK_SPLIT_SAFE
// V153_18_PRODUCT_LOT_IMPORT_MAPPING_SAFE
export const dynamic = "force-dynamic";

const PRODUCT_SOURCE = "ODOO_STOCK_QUANT";

function normalizeName(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function importQty(value: any) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function sanitizeStockScope(value: any) {
  const scope = clean(value).toUpperCase();
  if (scope === "SESSION") return "SESSION";
  if (scope === "COMPANY") return "COMPANY";
  return "GENERAL";
}

function normalizeCompanyName(value: any) {
  return clean(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeServiceMode(value: any) {
  return clean(value).toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
}

async function stockOwnershipFromBody(
  supabase: any,
  body: any,
  fallback?: any,
) {
  const scopeInput =
    body.stockScope !== undefined || body.stock_scope !== undefined
      ? body.stockScope ?? body.stock_scope
      : fallback?.stock_scope;
  const companyInput =
    body.stockCompanyName !== undefined || body.stock_company_name !== undefined
      ? body.stockCompanyName ?? body.stock_company_name
      : fallback?.stock_company_name;
  const sessionInput =
    body.stockSessionId !== undefined || body.stock_session_id !== undefined
      ? body.stockSessionId ?? body.stock_session_id
      : fallback?.stock_session_id;

  const stockScope = sanitizeStockScope(scopeInput);
  let stockCompanyName = clean(companyInput);
  let stockSessionId = toInt(sessionInput, 0);

  if (stockScope === "GENERAL") {
    return {
      stock_scope: "GENERAL",
      stock_company_name: null,
      stock_session_id: null,
    };
  }

  if (stockScope === "COMPANY") {
    if (!stockCompanyName) {
      throw new Error("Perusahaan wajib dipilih jika Scope Stok = Perusahaan.");
    }
    return {
      stock_scope: "COMPANY",
      stock_company_name: stockCompanyName,
      stock_session_id: null,
    };
  }

  if (!stockSessionId) {
    throw new Error("Session/Lokasi wajib dipilih jika Scope Stok = Session/Lokasi.");
  }

  const sessionResult = await supabase
    .from("vaccination_sessions")
    .select("id,session_name,company_name,location,session_date")
    .eq("id", stockSessionId)
    .maybeSingle();

  if (sessionResult.error) throw new Error(sessionResult.error.message);
  if (!sessionResult.data) throw new Error("Session/Lokasi tujuan stok tidak ditemukan.");

  const canonicalCompany = clean(sessionResult.data.company_name);
  if (!canonicalCompany) {
    throw new Error("Session/Lokasi tujuan stok belum memiliki perusahaan.");
  }

  if (
    stockCompanyName &&
    normalizeCompanyName(stockCompanyName) !== normalizeCompanyName(canonicalCompany)
  ) {
    throw new Error(
      `Session/Lokasi yang dipilih milik ${canonicalCompany}, bukan ${stockCompanyName}.`,
    );
  }

  stockCompanyName = canonicalCompany;
  stockSessionId = Number(sessionResult.data.id);

  return {
    stock_scope: "SESSION",
    stock_company_name: stockCompanyName,
    stock_session_id: stockSessionId,
  };
}

// V600_AUTO_SESSION_SERVICE_ALLOCATION_ON_MASTER_SAVE
// Stock allocations are a service-level reservation of a Session-owned Lot.
// The Master write is the only place this reconciliation is invoked.
// Never infer a service from a product name or use an allocation belonging to another Session.
type MasterAutoAllocationPlan = {
  sessionId: number;
  vaccineId: number;
  lotId: number;
  serviceMode: "HEALTHDAY" | "BAZAR";
  allocatedQty: number;
  existingId: number;
  unchanged: boolean;
};

async function prepareMasterAutoAllocation(
  supabase: any,
  input: {
    ownership: Record<string, any>;
    vaccineId: number;
    lotId?: number;
    stockInitial: number;
    stockAdded: number;
    stockUsed: number;
    previousTotal: number;
    preferredMode?: any;
  },
): Promise<MasterAutoAllocationPlan | null> {
  if (input.ownership.stock_scope !== "SESSION") return null;
  const sessionId = Number(input.ownership.stock_session_id || 0);
  const lotId = Number(input.lotId || 0);
  if (!sessionId || !input.vaccineId) throw new Error("Session dan produk Lot wajib valid sebelum alokasi otomatis.");
  const total = input.stockInitial + input.stockAdded;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Jumlah stok Lot tidak valid.");
  if (total < input.stockUsed) throw new Error("Stok total tidak boleh di bawah jumlah yang sudah dipakai.");
  // A catalog-only clone (stock 0) must NEVER allocate inventory.
  if (total === 0 && (!lotId || input.previousTotal === 0)) return null;

  const [sessionResult, assignmentsResult, allocationsResult] = await Promise.all([
    supabase.from("vaccination_sessions").select("id,company_name,status")
      .eq("id", sessionId).maybeSingle(),
    supabase.from("vaccination_session_product_assignments")
      .select("service_mode,active").eq("session_id", sessionId)
      .eq("vaccine_id", input.vaccineId).eq("active", true),
    lotId
      ? supabase.from("vaccination_session_stock_allocations")
          .select("id,session_id,vaccine_id,lot_id,service_mode,allocated_qty,active")
          .eq("lot_id", lotId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sessionResult.error) throw new Error(sessionResult.error.message);
  if (!sessionResult.data) throw new Error("Session pemilik Lot tidak ditemukan.");
  if (String(sessionResult.data.status || "").toUpperCase() === "CANCELLED") {
    throw new Error("Tidak boleh membuat alokasi pada Session yang dibatalkan.");
  }
  if (
    normalizeCompanyName(sessionResult.data.company_name) !==
    normalizeCompanyName(input.ownership.stock_company_name)
  ) throw new Error("Perusahaan Lot tidak sama dengan pemilik Session.");
  if (assignmentsResult.error) throw new Error(assignmentsResult.error.message);
  if (allocationsResult.error) throw new Error(allocationsResult.error.message);

  const allocationRows = allocationsResult.data || [];
  if (lotId) {
    // A Lot with historical stock-out/transfer may have less usable stock than
    // stock_initial + stock_added. Do not silently re-open that stock as quota.
    const movementsResult = await supabase.from("vaccination_inventory_movements")
      .select("movement_type,qty").eq("lot_id", lotId).limit(10000);
    if (movementsResult.error) throw new Error(movementsResult.error.message);
    const unsafeOutTypes = new Set([
      "STOCK_TRANSFER_OUT", "ADJUSTMENT_OUT", "STOCK_OUT_ADJUSTMENT",
      "MANUAL_STOCK_OUT", "STOCK_REDUCTION", "TRANSFER_OUT",
      "STOCK_TRANSFER_SERVICE",
    ]);
    if ((movementsResult.data || []).some((row: any) =>
      unsafeOutTypes.has(clean(row.movement_type).toUpperCase()) &&
      Math.abs(Number(row.qty || 0)) > 0
    )) {
      throw new Error("Lot pernah mengalami pengurangan/transfer stok. Alokasi otomatis ditahan agar stok terpakai tidak terhitung ulang.");
    }
    if ((movementsResult.data || []).length >= 10000) {
      throw new Error("Riwayat movement Lot melebihi batas audit; alokasi otomatis ditahan.");
    }
  }
  for (const row of allocationRows) {
    if (Number(row.session_id || 0) !== sessionId || Number(row.vaccine_id || 0) !== input.vaccineId) {
      throw new Error("Safety stop: Lot memiliki alokasi di Session/produk lain. Periksa relasi, jangan pindahkan stok otomatis.");
    }
  }
  const allowedModes = new Set<string>(
    (assignmentsResult.data || []).map((row: any) => clean(row.service_mode).toUpperCase())
      .filter((mode: string) => mode === "HEALTHDAY" || mode === "BAZAR"),
  );
  const allocatedModes = new Set<string>(
    allocationRows.map((row: any) => clean(row.service_mode).toUpperCase())
      .filter((mode: string) => mode === "HEALTHDAY" || mode === "BAZAR"),
  );
  const positiveModes = new Set<string>(
    allocationRows.filter((row: any) => row.active !== false && Number(row.allocated_qty || 0) > 0)
      .map((row: any) => clean(row.service_mode).toUpperCase()),
  );
  const preferred = clean(input.preferredMode).toUpperCase();
  const isExplicit = preferred === "HEALTHDAY" || preferred === "BAZAR";
  let chosen = "";
  if (isExplicit && (allowedModes.has(preferred) || allocatedModes.has(preferred))) chosen = preferred;
  else if (positiveModes.size === 1) chosen = Array.from(positiveModes)[0];
  else if (allocatedModes.size === 1) chosen = Array.from(allocatedModes)[0];
  else if (allowedModes.size === 1) chosen = Array.from(allowedModes)[0];
  if (chosen !== "HEALTHDAY" && chosen !== "BAZAR") {
    throw new Error("Layanan Lot tidak tunggal/ambigu. Pilih Healthday atau Bazar di Master sebelum menyimpan stok awal.");
  }
  if (allowedModes.size && !allowedModes.has(chosen)) {
    throw new Error("Layanan alokasi tidak cocok dengan assignment produk aktif pada Session.");
  }
  if (!allowedModes.has(chosen) && !allocatedModes.has(chosen)) {
    throw new Error("Produk belum terhubung ke layanan Session yang dipilih. Simpan assignment produk terlebih dahulu.");
  }
  const target = allocationRows.find((row: any) => clean(row.service_mode).toUpperCase() === chosen);
  const otherQty = allocationRows
    .filter((row: any) => clean(row.service_mode).toUpperCase() !== chosen)
    .reduce((sum: number, row: any) => sum + Math.max(0, Number(row.allocated_qty || 0)), 0);
  if (otherQty > total) throw new Error("Jatah layanan lain melebihi stok Lot saat ini; perubahan otomatis ditahan.");
  const oldQty = Math.max(0, Number(target?.allocated_qty || 0));
  const delta = total - input.previousTotal;
  const maxTarget = total - otherQty;
  const newQty = oldQty === 0
    ? maxTarget
    : delta > 0
      ? Math.min(maxTarget, oldQty + delta)
      : Math.min(oldQty, maxTarget);
  if (newQty <= 0 && (!target || Number(target.allocated_qty || 0) === 0)) return null;
  // A reduction to zero must deactivate the old quota, not leave it available.

  // When reducing a stock value, do not lower the quota below administered items.
  if (lotId && newQty < oldQty) {
    const usedResult = await supabase.from("vaccination_registration_items")
      .select("id,service_mode").eq("lot_id", lotId).eq("active", true)
      .in("status", ["ADMINISTERED", "DONE", "FINISHED"]).limit(20000);
    if (usedResult.error) throw new Error(usedResult.error.message);
    const usedService = (usedResult.data || []).filter(
      (row: any) => normalizeServiceMode(row.service_mode) === chosen,
    ).length;
    if ((usedResult.data || []).length >= 20000) throw new Error("Audit pemakaian terlalu besar; update stok ditahan.");
    if (newQty < usedService) throw new Error("Alokasi baru lebih kecil dari dosis layanan yang sudah diberikan.");
  }
  if (newQty + otherQty > total) throw new Error("Safety stop: alokasi layanan melebihi stok Lot.");
  return {
    sessionId, vaccineId: input.vaccineId, lotId,
    serviceMode: chosen as "HEALTHDAY" | "BAZAR",
    allocatedQty: newQty,
    existingId: Number(target?.id || 0),
    unchanged: !!target && Number(target.allocated_qty || 0) === newQty && target.active !== false,
  };
}

async function applyMasterAutoAllocation(
  supabase: any,
  plan: MasterAutoAllocationPlan | null,
  lotId: number,
  createdBy: string,
) {
  if (!plan || plan.unchanged) return;
  if (!lotId) throw new Error("Lot ID belum tersedia untuk alokasi otomatis.");
  const result = await supabase.from("vaccination_session_stock_allocations")
    .upsert({
      session_id: plan.sessionId,
      vaccine_id: plan.vaccineId,
      lot_id: lotId,
      service_mode: plan.serviceMode,
      allocated_qty: plan.allocatedQty,
      low_stock_threshold: Math.min(5, plan.allocatedQty),
      dedicated: true,
      active: plan.allocatedQty > 0,
      notes: "Alokasi otomatis dari penyimpanan stok awal Master V600",
      created_by: createdBy,
      updated_at: new Date().toISOString(),
    }, { onConflict: "session_id,lot_id,service_mode" });
  if (result.error) throw new Error("Alokasi otomatis gagal: " + result.error.message);
}

function isStockQuantImportedLot(lot: any) {
  const note = clean(lot?.inventory_notes).toLowerCase();
  return note.includes("import odoo_stock_quant") || note.includes("import stock.quant");
}

async function lotHasOperationalReferences(supabase: any, lotId: number) {
  const [records, items, sessionVaccines] = await Promise.all([
    supabase.from("vaccination_records").select("id").eq("lot_id", lotId).limit(1),
    supabase.from("vaccination_registration_items").select("id").eq("lot_id", lotId).limit(1),
    supabase.from("vaccination_session_vaccines").select("id").eq("lot_id", lotId).limit(1),
  ]);

  const failed = [records, items, sessionVaccines].find((result: any) => result.error);
  if (failed?.error) throw new Error(failed.error.message);

  return [records, items, sessionVaccines].some(
    (result: any) => (result.data || []).length > 0,
  );
}


function normalizeSeriesSchedule(value: any) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((row: any, index: number) => ({
      dose_number: Math.max(1, toInt(row?.dose_number ?? row?.doseNumber ?? index + 1, index + 1)),
      next_due_days: Math.max(0, toInt(row?.next_due_days ?? row?.nextDueDays, 0)),
    }))
    .filter((row: any) => row.next_due_days > 0)
    .sort((a: any, b: any) => a.dose_number - b.dose_number)
    .map((row: any, index: number) => ({ dose_number: index + 1, next_due_days: row.next_due_days }));
}

async function saveSeriesSetting(supabase: any, vaccineId: number, body: any) {
  const isSeries = body?.isSeries === true || String(body?.isSeries || "").toLowerCase() === "true";
  const schedule = isSeries ? normalizeSeriesSchedule(body?.seriesSchedule) : [];
  if (isSeries && !schedule.length) throw new Error("Vaksin Series membutuhkan minimal satu jeda dosis berikutnya.");
  const result = await supabase
    .from("vaccination_vaccine_series_settings")
    .upsert({ vaccine_id: vaccineId, is_series: isSeries, schedule, updated_at: new Date().toISOString() }, { onConflict: "vaccine_id" })
    .select("vaccine_id,is_series,schedule,updated_at")
    .single();
  if (result.error) {
    const message = String(result.error?.message || "");
    const missing = String(result.error?.code || "") === "42P01" || message.toLowerCase().includes("vaccination_vaccine_series_settings");
    if (isSeries || !missing) throw new Error(missing ? "Tabel Vaksin Series belum aktif. Jalankan SQL V531 terlebih dahulu." : message);
    return null;
  }
  return result.data;
}
export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "master")) return fail("Akses modul vaksinasi ditolak untuk role ini.", 403);

  const supabase = supabaseAdmin();

  const getAction = clean(req.nextUrl.searchParams.get("action"));
  if (getAction === "stock-transactions") {
    const vaccineId = toInt(req.nextUrl.searchParams.get("vaccine_id"), 0);
    const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
    const companyName = clean(req.nextUrl.searchParams.get("company_name"));
    const requestedService = clean(req.nextUrl.searchParams.get("service_mode")).toUpperCase();

    if (!vaccineId) return fail("Produk / vaksin wajib dipilih.");

    let allowedSessionIds: number[] = [];
    if (sessionId) {
      allowedSessionIds = [sessionId];
    } else if (companyName) {
      const companySessions = await supabase
        .from("vaccination_sessions")
        .select("id,company_name")
        .limit(5000);

      if (companySessions.error) return fail(companySessions.error.message, 500);
      allowedSessionIds = (companySessions.data || [])
        .filter(
          (row: any) =>
            normalizeCompanyName(row.company_name) ===
            normalizeCompanyName(companyName),
        )
        .map((row: any) => Number(row.id || 0))
        .filter(Boolean);
    }

    let recordsQuery = supabase
      .from("vaccination_records")
      .select(
        "id,registration_id,session_id,participant_name,vaccine_id,lot_id,vaccine_name,lot_number,dose_number,administered_at,administered_by,status",
      )
      .eq("vaccine_id", vaccineId)
      .order("administered_at", { ascending: false })
      .limit(5000);

    if (sessionId) {
      recordsQuery = recordsQuery.eq("session_id", sessionId);
    } else if (companyName) {
      if (!allowedSessionIds.length) {
        return ok({
          usage: [],
          movements: [],
          summary: { usage_count: 0, participant_count: 0 },
        });
      }
      recordsQuery = recordsQuery.in("session_id", allowedSessionIds);
    }

    const recordsResult = await recordsQuery;
    if (recordsResult.error) return fail(recordsResult.error.message, 500);
    const records = (recordsResult.data || []).filter(
      (row: any) =>
        !["CANCELLED", "VOID"].includes(clean(row.status).toUpperCase()),
    );

    const registrationIds = Array.from(
      new Set(
        records
          .map((row: any) => Number(row.registration_id || 0))
          .filter(Boolean),
      ),
    );

    let itemRows: any[] = [];
    if (registrationIds.length) {
      const itemsResult = await supabase
        .from("vaccination_registration_items")
        .select(
          "id,registration_id,vaccine_id,lot_id,service_mode,status,administered_record_id,active",
        )
        .in("registration_id", registrationIds)
        .eq("vaccine_id", vaccineId)
        .eq("active", true)
        .limit(10000);

      if (!itemsResult.error) itemRows = itemsResult.data || [];
    }

    const sessionIds = Array.from(
      new Set(
        records
          .map((row: any) => Number(row.session_id || 0))
          .filter(Boolean),
      ),
    );
    const sessionMap = new Map<number, any>();
    if (sessionIds.length) {
      const sessionsResult = await supabase
        .from("vaccination_sessions")
        .select("id,session_name,company_name,location,session_date")
        .in("id", sessionIds);

      if (!sessionsResult.error) {
        for (const row of sessionsResult.data || []) {
          sessionMap.set(Number(row.id), row);
        }
      }
    }

    function serviceForRecord(record: any) {
      const recordId = Number(record.id || 0);
      const registrationId = Number(record.registration_id || 0);
      const lotId = Number(record.lot_id || 0);

      const exact =
        itemRows.find(
          (item: any) =>
            Number(item.administered_record_id || 0) === recordId &&
            recordId > 0,
        ) ||
        itemRows.find(
          (item: any) =>
            Number(item.registration_id || 0) === registrationId &&
            Number(item.vaccine_id || 0) === vaccineId &&
            (!lotId || Number(item.lot_id || 0) === lotId) &&
            ["ADMINISTERED", "DONE", "FINISHED"].includes(
              clean(item.status).toUpperCase(),
            ),
        );

      return normalizeServiceMode(exact?.service_mode);
    }

    const usage = records
      .map((record: any) => {
        const serviceMode = serviceForRecord(record);
        const session = sessionMap.get(Number(record.session_id || 0));
        return {
          ...record,
          service_mode: serviceMode,
          qty: -1,
          session_label: session
            ? clean(session.session_name) || clean(session.location) || `Session ${session.id || ""}`
            : "",
        };
      })
      .filter(
        (row: any) =>
          !requestedService ||
          !["HEALTHDAY", "BAZAR"].includes(requestedService) ||
          row.service_mode === requestedService,
      );

    let lotsQuery = supabase
      .from("vaccination_vaccine_lots")
      .select(
        "id,lot_number,stock_scope,stock_company_name,stock_session_id",
      )
      .eq("vaccine_id", vaccineId)
      .limit(5000);

    if (sessionId) {
      lotsQuery = lotsQuery.or(
        `stock_session_id.eq.${sessionId},stock_scope.eq.GENERAL`,
      );
    }

    const lotResult = await lotsQuery;
    const lotRows = lotResult.error ? [] : lotResult.data || [];
    const filteredLotRows = companyName
      ? lotRows.filter((lot: any) => {
          const scope = sanitizeStockScope(lot.stock_scope);
          if (scope === "GENERAL") return true;
          return (
            normalizeCompanyName(lot.stock_company_name) ===
            normalizeCompanyName(companyName)
          );
        })
      : lotRows;

    const lotIds = filteredLotRows
      .map((row: any) => Number(row.id || 0))
      .filter(Boolean);
    const lotNumberById = new Map<number, string>(
      filteredLotRows.map((row: any) => [
        Number(row.id || 0),
        clean(row.lot_number),
      ]),
    );

    let movements: any[] = [];
    if (lotIds.length) {
      const movementResult = await supabase
        .from("vaccination_inventory_movements")
        .select(
          "id,vaccine_id,lot_id,movement_type,qty,reference_type,reference_id,notes,created_by,created_at",
        )
        .in("lot_id", lotIds)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (!movementResult.error) {
        movements = (movementResult.data || []).map((row: any) => ({
          ...row,
          lot_number: lotNumberById.get(Number(row.lot_id || 0)) || "",
        }));
      }
    }

    return ok({
      usage,
      movements,
      summary: {
        usage_count: usage.length,
        participant_count: new Set(
          usage.map((row: any) => clean(row.participant_name)).filter(Boolean),
        ).size,
      },
    });
  }

  const vaccinesResult = await supabase
    .from("vaccination_vaccines")
    .select("*")
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  if (vaccinesResult.error) return fail(vaccinesResult.error.message, 500);

  const seriesSettingsResult = await supabase
    .from("vaccination_vaccine_series_settings")
    .select("vaccine_id,is_series,schedule,updated_at")
    .limit(10000);
  const seriesReady = !seriesSettingsResult.error;
  const seriesByVaccine = new Map<number, any>((seriesSettingsResult.data || []).map((row: any) => [Number(row.vaccine_id), row]));
  const vaccinesWithSeries = (vaccinesResult.data || []).map((vaccine: any) => {
    const setting = seriesByVaccine.get(Number(vaccine.id));
    return {
      ...vaccine,
      is_series: setting?.is_series === true,
      series_schedule: Array.isArray(setting?.schedule) ? setting.schedule : [],
    };
  });

  const lotsResult = await supabase
    .from("vaccination_vaccine_lots")
    .select("*, vaccine:vaccination_vaccines(id,name,brand,default_next_dose_days)")
    .order("active", { ascending: false })
    .order("id", { ascending: false });

  if (lotsResult.error) return fail(lotsResult.error.message, 500);

  const [ownershipProbe, stockSessionsResult] = await Promise.all([
    supabase
      .from("vaccination_vaccine_lots")
      .select("id,stock_scope,stock_company_name,stock_session_id")
      .limit(1),
    supabase
      .from("vaccination_sessions")
      .select("id,session_name,company_name,location,session_date,status")
      .order("session_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(5000),
  ]);
  // VACCINATION_STOCK_SESSION_SCHEMA_REPAIR_V2_1
  const companyStockReady = !ownershipProbe.error;
  const companyStockMessage = companyStockReady
    ? ""
    : [
        "Scope stok Session/Lokasi belum aktif di API database.",
        "Jalankan sql_vaccination_company_stock_ownership_v2_1_repair.sql lalu refresh halaman.",
        ownershipProbe.error?.code ? `DB ${ownershipProbe.error.code}` : "",
        ownershipProbe.error?.message || "",
      ]
        .filter(Boolean)
        .join(" · ");

  const serviceStockAllocationsResult = await supabase
    .from("vaccination_session_stock_allocations")
    .select("id,session_id,vaccine_id,lot_id,allocated_qty,low_stock_threshold,dedicated,active,service_mode,notes,updated_at")
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(20000);

  const serviceStockReady = !serviceStockAllocationsResult.error;
  const serviceStockMessage = serviceStockReady
    ? ""
    : [
        "Pembagian stok Healthday/Bazar belum aktif.",
        "Jalankan sql_vaccination_v497_session_service_stock_split.sql lalu refresh halaman.",
        serviceStockAllocationsResult.error?.code ? `DB ${serviceStockAllocationsResult.error.code}` : "",
        serviceStockAllocationsResult.error?.message || "",
      ]
        .filter(Boolean)
        .join(" · ");

  const sessionProductAssignmentsResult = await supabase
    .from("vaccination_session_product_assignments")
    .select("id,session_id,vaccine_id,service_mode,planned_stock_initial,active,created_at,updated_at")
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(20000);

  const sessionProductAssignmentReady = !sessionProductAssignmentsResult.error;
  const sessionProductAssignmentMessage = sessionProductAssignmentReady
    ? ""
    : [
        "Assignment produk ke Session belum aktif.",
        "Jalankan sql_vaccination_v499_session_product_assignment.sql lalu refresh halaman.",
        sessionProductAssignmentsResult.error?.code ? `DB ${sessionProductAssignmentsResult.error.code}` : "",
        sessionProductAssignmentsResult.error?.message || "",
      ]
        .filter(Boolean)
        .join(" · " );

  const mappingResult = await supabase
    .from("vaccination_product_mappings")
    .select(`
      id,
      source_system,
      external_product_key,
      external_product_code,
      external_product_name,
      external_product_label,
      source_location,
      vaccine_id,
      active,
      last_imported_at,
      created_at,
      updated_at,
      vaccine:vaccination_vaccines(id,name,brand,active)
    `)
    .eq("source_system", PRODUCT_SOURCE)
    .order("active", { ascending: false })
    .order("external_product_name", { ascending: true });

  const mappingReady = !mappingResult.error;
  const mappingMessage = mappingReady
    ? ""
    : "Mapping import belum aktif. Jalankan sql_vaccination_v153_18_product_import_mapping.sql di Supabase.";

  return ok({
    vaccines: vaccinesWithSeries,
    seriesReady,
    seriesMessage: seriesReady ? "" : "Fitur Vaksin Series belum aktif. Jalankan SQL V531.",
    lots: lotsResult.data || [],
    productMappings: mappingReady ? mappingResult.data || [] : [],
    mappingReady,
    mappingMessage,
    companyStockReady,
    companyStockMessage,
    serviceStockReady,
    serviceStockMessage,
    serviceStockAllocations: serviceStockReady ? serviceStockAllocationsResult.data || [] : [],
    sessionProductAssignmentReady,
    sessionProductAssignmentMessage,
    sessionProductAssignments: sessionProductAssignmentReady ? sessionProductAssignmentsResult.data || [] : [],
    stockSessions: stockSessionsResult.error ? [] : stockSessionsResult.data || [],
  });
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "master")) return fail("Akses modul vaksinasi ditolak untuk role ini.", 403);

  const body = await req.json().catch(() => ({}));
  const action = clean(body.action);
  const supabase = supabaseAdmin();

  if (action === "duplicate-session-catalog") {
    const sourceSessionId = toInt(body.sourceSessionId || body.source_session_id, 0);
    const targetSessionIds: number[] = Array.from(
      new Set<number>(
        (Array.isArray(body.targetSessionIds) ? body.targetSessionIds : [])
          .map((value: any) => toInt(value, 0))
          .filter((id: number) => id > 0 && id !== sourceSessionId),
      ),
    );
    const requestedVaccineIds: number[] = Array.from(
      new Set<number>(
        (Array.isArray(body.vaccineIds) ? body.vaccineIds : [])
          .map((value: any) => toInt(value, 0))
          .filter((id: number) => id > 0),
      ),
    );
    if (!sourceSessionId) return fail("Session sumber wajib dipilih.");
    if (!targetSessionIds.length) return fail("Pilih minimal satu Session tujuan.");
    if (!requestedVaccineIds.length) return fail("Pilih minimal satu produk untuk diduplikat.");

    const sessionIds: number[] = [sourceSessionId, ...targetSessionIds];
    const sessionsResult = await supabase
      .from("vaccination_sessions")
      .select("id,session_name,company_name,status,source_id,source_name")
      .in("id", sessionIds);
    if (sessionsResult.error) return fail(sessionsResult.error.message, 500);
    const sessionMap = new Map<number, any>((sessionsResult.data || []).map((row: any) => [Number(row.id), row]));
    const sourceSession = sessionMap.get(sourceSessionId);
    if (!sourceSession) return fail("Session sumber tidak ditemukan.", 404);
    const sourceCompany = normalizeCompanyName(sourceSession.company_name);
    for (const targetId of targetSessionIds) {
      const target = sessionMap.get(targetId);
      if (!target) return fail(`Session tujuan ID ${targetId} tidak ditemukan.`, 404);
      if (String(target.status || "").toUpperCase() === "CANCELLED") return fail(`Session ${target.session_name || targetId} berstatus CANCELLED.`);
      if (sourceCompany && normalizeCompanyName(target.company_name) !== sourceCompany) {
        return fail(`Session ${target.session_name || targetId} berbeda perusahaan dengan Session sumber.`);
      }
    }

    const [assignmentResult, allocationResult, sourceBatchMappingResult] = await Promise.all([
      supabase
        .from("vaccination_session_product_assignments")
        .select("vaccine_id,service_mode,planned_stock_initial,active")
        .eq("session_id", sourceSessionId)
        .eq("active", true),
      supabase
        .from("vaccination_session_stock_allocations")
        .select("vaccine_id,lot_id,service_mode,active")
        .eq("session_id", sourceSessionId)
        .eq("active", true),
      supabase
        .from("vaccination_session_batch_mappings")
        .select("source_id,source_batch_name,vaccine_id,lot_id,dose_number,active")
        .eq("session_id", sourceSessionId)
        .eq("active", true),
    ]);
    if (assignmentResult.error) return fail(assignmentResult.error.message, 500);
    if (allocationResult.error) return fail(allocationResult.error.message, 500);
    if (sourceBatchMappingResult.error) return fail(sourceBatchMappingResult.error.message, 500);

    const requestedSet = new Set<number>(requestedVaccineIds);
    const sourceAssignments = (assignmentResult.data || []).filter((row: any) => requestedSet.has(Number(row.vaccine_id || 0)));
    const sourceAllocations = (allocationResult.data || []).filter((row: any) => requestedSet.has(Number(row.vaccine_id || 0)));
    const sourceBatchMappings = (sourceBatchMappingResult.data || []).filter(
      (row: any) => requestedSet.has(Number(row.vaccine_id || 0)),
    );
    const sourceLotIds = Array.from(
      new Set<number>(
        [
          ...sourceAllocations.map((row: any) => Number(row.lot_id || 0)),
          ...sourceBatchMappings.map((row: any) => Number(row.lot_id || 0)),
        ].filter((id: number) => id > 0),
      ),
    );
    const sourceLotsResult = sourceLotIds.length
      ? await supabase
          .from("vaccination_vaccine_lots")
          .select("id,vaccine_id,lot_number,expiry_date,active,stock_scope,stock_company_name,stock_session_id")
          .in("id", sourceLotIds)
      : { data: [], error: null } as any;
    if (sourceLotsResult.error) return fail(sourceLotsResult.error.message, 500);
    const sourceLotMap = new Map<number, any>((sourceLotsResult.data || []).map((row: any) => [Number(row.id), row]));

    const sourceCatalogVaccineIds = new Set<number>();
    for (const row of sourceAssignments) sourceCatalogVaccineIds.add(Number(row.vaccine_id || 0));
    for (const row of sourceAllocations) sourceCatalogVaccineIds.add(Number(row.vaccine_id || 0));
    const invalidVaccineIds: number[] = requestedVaccineIds.filter((id: number) => !sourceCatalogVaccineIds.has(Number(id)));
    if (invalidVaccineIds.length) {
      return fail(`Ada ${invalidVaccineIds.length} produk yang bukan milik Session sumber. Refresh Master lalu pilih ulang semua produk.`);
    }

    const modesByVaccine = new Map<number, Set<string>>();
    const addMode = (vaccineIdInput: any, modeInput: any) => {
      const vaccineId = Number(vaccineIdInput || 0);
      if (!vaccineId || !requestedSet.has(vaccineId)) return;
      const mode = String(modeInput || "HEALTHDAY").toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
      if (!modesByVaccine.has(vaccineId)) modesByVaccine.set(vaccineId, new Set<string>());
      modesByVaccine.get(vaccineId)!.add(mode);
    };
    for (const row of sourceAssignments) addMode(row.vaccine_id, row.service_mode);
    for (const row of sourceAllocations) addMode(row.vaccine_id, row.service_mode);
    for (const vaccineId of requestedVaccineIds) {
      if (!modesByVaccine.get(Number(vaccineId))?.size) addMode(vaccineId, "HEALTHDAY");
    }

    const sourceCatalogKeys = new Set<string>();
    for (const row of sourceAllocations) {
      const vaccineId = Number(row.vaccine_id || 0);
      const sourceLot = sourceLotMap.get(Number(row.lot_id || 0));
      const lotNumberKey = clean(sourceLot?.lot_number).toLowerCase();
      if (!vaccineId || !lotNumberKey) continue;
      const mode = String(row.service_mode || "HEALTHDAY").toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
      sourceCatalogKeys.add(`${vaccineId}:${lotNumberKey}:${mode}`);
    }

    const actor = (user as any)?.email || (user as any)?.name || (user as any)?.id || "system";
    let assignmentCount = 0;
    let lotCatalogCount = 0;
    let catalogLotCreatedCount = 0;
    let existingTargetStockPreserved = 0;
    let staleCatalogRowsDisabled = 0;
    let staleAssignmentRowsDisabled = 0;
    let batchMappingClonedCount = 0;
    let batchMappingUpdatedCount = 0;

    for (const targetSessionId of targetSessionIds) {
      const targetSession = sessionMap.get(targetSessionId);
      if (!targetSession) return fail(`Session tujuan ID ${targetSessionId} tidak ditemukan.`, 404);
      const targetLotBySourceLotId = new Map<number, number>();

      // V542: mirror klasifikasi Healthday/Bazar tanpa pernah menimpa planned stock target.
      const targetAssignmentResult = await supabase
        .from("vaccination_session_product_assignments")
        .select("id,vaccine_id,service_mode,planned_stock_initial,active")
        .eq("session_id", targetSessionId)
        .in("vaccine_id", requestedVaccineIds);
      if (targetAssignmentResult.error) return fail(targetAssignmentResult.error.message, 500);
      const targetAssignmentByKey = new Map<string, any>();
      for (const row of targetAssignmentResult.data || []) {
        const key = `${Number(row.vaccine_id || 0)}:${normalizeServiceMode(row.service_mode)}`;
        targetAssignmentByKey.set(key, row);
      }

      for (const row of targetAssignmentResult.data || []) {
        if (row.active === false) continue;
        const vaccineId = Number(row.vaccine_id || 0);
        const mode = normalizeServiceMode(row.service_mode);
        const allowedModes = modesByVaccine.get(vaccineId) || new Set<string>(["HEALTHDAY"]);
        if (allowedModes.has(mode)) continue;
        // Hanya assignment zero-stock legacy duplicate yang boleh dinonaktifkan otomatis.
        if (Number(row.planned_stock_initial || 0) !== 0) continue;
        const disableResult = await supabase
          .from("vaccination_session_product_assignments")
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq("id", row.id);
        if (disableResult.error) return fail(disableResult.error.message, 500);
        staleAssignmentRowsDisabled += 1;
      }

      for (const vaccineId of requestedVaccineIds) {
        for (const mode of Array.from(modesByVaccine.get(Number(vaccineId)) || new Set<string>(["HEALTHDAY"]))) {
          const key = `${Number(vaccineId)}:${mode}`;
          const existingAssignment = targetAssignmentByKey.get(key);
          if (existingAssignment) {
            // Non-destructive: planned_stock_initial target dipertahankan persis.
            if (existingAssignment.active === false) {
              const reenable = await supabase
                .from("vaccination_session_product_assignments")
                .update({ active: true, updated_at: new Date().toISOString() })
                .eq("id", existingAssignment.id);
              if (reenable.error) return fail(reenable.error.message, 500);
            } else if (Number(existingAssignment.planned_stock_initial || 0) > 0) {
              existingTargetStockPreserved += 1;
            }
          } else {
            const insertAssignment = await supabase
              .from("vaccination_session_product_assignments")
              .insert({
                session_id: targetSessionId,
                vaccine_id: Number(vaccineId),
                service_mode: mode,
                planned_stock_initial: 0,
                active: true,
                updated_at: new Date().toISOString(),
              });
            if (insertAssignment.error) return fail(insertAssignment.error.message, 500);
          }
          assignmentCount += 1;
        }
      }

      // Disable only stale catalog-generated zero-stock rows. Real/manual target stock is never touched.
      const oldCatalogResult = await supabase
        .from("vaccination_session_stock_allocations")
        .select("id,vaccine_id,lot_id,service_mode,allocated_qty,notes,active,lot:vaccination_vaccine_lots(id,lot_number)")
        .eq("session_id", targetSessionId)
        .eq("active", true)
        .in("vaccine_id", requestedVaccineIds)
        .ilike("notes", "Catalog only from Session %");
      if (oldCatalogResult.error) return fail(oldCatalogResult.error.message, 500);
      for (const row of oldCatalogResult.data || []) {
        if (Number(row.allocated_qty || 0) !== 0) continue;
        const lotNumberKey = clean((row as any)?.lot?.lot_number).toLowerCase();
        const mode = normalizeServiceMode(row.service_mode);
        const key = `${Number(row.vaccine_id || 0)}:${lotNumberKey}:${mode}`;
        if (sourceCatalogKeys.has(key)) continue;
        const disableResult = await supabase
          .from("vaccination_session_stock_allocations")
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq("id", row.id);
        if (disableResult.error) return fail(disableResult.error.message, 500);
        staleCatalogRowsDisabled += 1;
      }

      for (const sourceRow of sourceAllocations) {
        const vaccineId = Number(sourceRow.vaccine_id || 0);
        const sourceLotId = Number(sourceRow.lot_id || 0);
        if (!vaccineId || !sourceLotId || !requestedSet.has(vaccineId)) continue;
        const sourceLot = sourceLotMap.get(sourceLotId);
        if (!sourceLot) return fail(`Lot sumber ID ${sourceLotId} tidak ditemukan. Refresh Master lalu coba lagi.`, 409);
        const lotNumber = clean(sourceLot.lot_number);
        if (!lotNumber) return fail(`Lot sumber ID ${sourceLotId} tidak memiliki Lot Number.`, 409);
        const mode = normalizeServiceMode(sourceRow.service_mode);

        // V542 core isolation: target Session must own its own Lot row even when Lot Number is identical.
        const targetLotResult = await supabase
          .from("vaccination_vaccine_lots")
          .select("id,vaccine_id,lot_number,stock_initial,stock_added,stock_used,stock_scope,stock_company_name,stock_session_id,active")
          .eq("vaccine_id", vaccineId)
          .eq("lot_number", lotNumber)
          .eq("stock_scope", "SESSION")
          .eq("stock_session_id", targetSessionId)
          .limit(2);
        if (targetLotResult.error) return fail(targetLotResult.error.message, 500);
        if ((targetLotResult.data || []).length > 1) {
          return fail(`Data Lot ${lotNumber} pada Session ${targetSession.session_name || targetSessionId} duplikat. Safety stop sebelum duplikasi.`, 409);
        }

        let targetLot = (targetLotResult.data || [])[0] || null;
        if (!targetLot) {
          const createTargetLot = await supabase
            .from("vaccination_vaccine_lots")
            .insert({
              vaccine_id: vaccineId,
              lot_number: lotNumber,
              expiry_date: sourceLot.expiry_date || null,
              stock_initial: 0,
              stock_added: 0,
              stock_used: 0,
              stock_physical_count: null,
              inventory_notes: `Catalog only from Session ${sourceSessionId}; stock not copied`,
              stock_scope: "SESSION",
              stock_company_name: clean(targetSession.company_name) || null,
              stock_session_id: targetSessionId,
              active: true,
            })
            .select("id,vaccine_id,lot_number,stock_initial,stock_added,stock_used,stock_scope,stock_company_name,stock_session_id,active")
            .single();
          if (createTargetLot.error) {
            if (String(createTargetLot.error.code || "") === "23505") {
              return fail("Schema Lot masih memakai UNIQUE(vaccine_id, lot_number). Jalankan SQL V542 Session Stock Isolation terlebih dahulu, lalu ulangi Duplikat Katalog.", 409);
            }
            return fail(createTargetLot.error.message, 500);
          }
          targetLot = createTargetLot.data;
          catalogLotCreatedCount += 1;
        } else if (
          Number(targetLot.stock_initial || 0) > 0 ||
          Number(targetLot.stock_added || 0) > 0 ||
          Number(targetLot.stock_used || 0) > 0
        ) {
          existingTargetStockPreserved += 1;
        }

        const targetLotId = Number(targetLot?.id || 0);
        if (!targetLotId) return fail(`Gagal menentukan Lot target untuk ${lotNumber}.`, 500);
        targetLotBySourceLotId.set(sourceLotId, targetLotId);

        const existingAllocationResult = await supabase
          .from("vaccination_session_stock_allocations")
          .select("id,allocated_qty,active,notes")
          .eq("session_id", targetSessionId)
          .eq("lot_id", targetLotId)
          .eq("service_mode", mode)
          .maybeSingle();
        if (existingAllocationResult.error) return fail(existingAllocationResult.error.message, 500);
        if (!existingAllocationResult.data) {
          const allocationInsert = await supabase
            .from("vaccination_session_stock_allocations")
            .insert({
              session_id: targetSessionId,
              vaccine_id: vaccineId,
              lot_id: targetLotId,
              service_mode: mode,
              allocated_qty: 0,
              low_stock_threshold: 5,
              dedicated: true,
              active: true,
              notes: `Catalog only from Session ${sourceSessionId}; stock not copied`,
              created_by: actor,
              updated_at: new Date().toISOString(),
            });
          if (allocationInsert.error) return fail(allocationInsert.error.message, 500);
        } else if (Number(existingAllocationResult.data.allocated_qty || 0) > 0) {
          existingTargetStockPreserved += 1;
        }

        const sessionVaccineResult = await supabase
          .from("vaccination_session_vaccines")
          .select("id,active")
          .eq("session_id", targetSessionId)
          .eq("vaccine_id", vaccineId)
          .eq("lot_id", targetLotId)
          .eq("dose_number", 1)
          .maybeSingle();
        if (sessionVaccineResult.error) return fail(sessionVaccineResult.error.message, 500);
        if (!sessionVaccineResult.data) {
          const sessionVaccineInsert = await supabase
            .from("vaccination_session_vaccines")
            .insert({
              session_id: targetSessionId,
              vaccine_id: vaccineId,
              lot_id: targetLotId,
              dose_number: 1,
              active: true,
              updated_at: new Date().toISOString(),
            });
          if (sessionVaccineInsert.error) return fail(sessionVaccineInsert.error.message, 500);
        } else if (sessionVaccineResult.data.active === false) {
          const sessionVaccineEnable = await supabase
            .from("vaccination_session_vaccines")
            .update({ active: true, updated_at: new Date().toISOString() })
            .eq("id", sessionVaccineResult.data.id);
          if (sessionVaccineEnable.error) return fail(sessionVaccineEnable.error.message, 500);
        }
        lotCatalogCount += 1;
      }

      // V564: Duplicate Katalog juga membawa mapping BatchName dari Session sumber.
      // lot_id selalu diarahkan ke Lot clone milik Session tujuan; stok tetap tidak disalin.
      const targetSourceId = Number(targetSession.source_id || 0);
      const sourceSourceId = Number(sourceSession.source_id || 0);
      if (targetSourceId && sourceSourceId && targetSourceId === sourceSourceId && sourceBatchMappings.length) {
        const existingTargetMappingsResult = await supabase
          .from("vaccination_session_batch_mappings")
          .select("id,source_batch_name,vaccine_id,lot_id,dose_number,active")
          .eq("session_id", targetSessionId)
          .eq("source_id", targetSourceId)
          .limit(5000);
        if (existingTargetMappingsResult.error) return fail(existingTargetMappingsResult.error.message, 500);

        const existingTargetMappings = new Map<string, any>();
        for (const row of existingTargetMappingsResult.data || []) {
          const key = normalizeName(row.source_batch_name);
          if (key) existingTargetMappings.set(key, row);
        }

        for (const sourceMapping of sourceBatchMappings) {
          if (Number(sourceMapping.source_id || 0) !== sourceSourceId) continue;
          const batchName = clean(sourceMapping.source_batch_name);
          const sourceMappingLotId = Number(sourceMapping.lot_id || 0);
          const vaccineId = Number(sourceMapping.vaccine_id || 0);
          if (!batchName || !sourceMappingLotId || !vaccineId) continue;

          let targetLotId = Number(targetLotBySourceLotId.get(sourceMappingLotId) || 0);
          if (!targetLotId) {
            const sourceLot = sourceLotMap.get(sourceMappingLotId);
            const lotNumber = clean(sourceLot?.lot_number);
            if (lotNumber) {
              const fallbackTargetLot = await supabase
                .from("vaccination_vaccine_lots")
                .select("id")
                .eq("vaccine_id", vaccineId)
                .eq("lot_number", lotNumber)
                .eq("stock_scope", "SESSION")
                .eq("stock_session_id", targetSessionId)
                .eq("active", true)
                .maybeSingle();
              if (fallbackTargetLot.error) return fail(fallbackTargetLot.error.message, 500);
              targetLotId = Number(fallbackTargetLot.data?.id || 0);
            }
          }
          if (!targetLotId) continue;

          const key = normalizeName(batchName);
          const existing = existingTargetMappings.get(key);
          const desiredDose = Math.max(1, Number(sourceMapping.dose_number || 1));
          if (existing) {
            const changed =
              Number(existing.vaccine_id || 0) !== vaccineId ||
              Number(existing.lot_id || 0) !== targetLotId ||
              Math.max(1, Number(existing.dose_number || 1)) !== desiredDose ||
              existing.active === false;
            if (changed) {
              const updateMapping = await supabase
                .from("vaccination_session_batch_mappings")
                .update({
                  vaccine_id: vaccineId,
                  lot_id: targetLotId,
                  dose_number: desiredDose,
                  active: true,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existing.id);
              if (updateMapping.error) return fail(updateMapping.error.message, 500);
              batchMappingUpdatedCount += 1;
            }
            continue;
          }

          const insertMapping = await supabase
            .from("vaccination_session_batch_mappings")
            .insert({
              session_id: targetSessionId,
              source_id: targetSourceId,
              source_batch_name: batchName,
              vaccine_id: vaccineId,
              lot_id: targetLotId,
              dose_number: desiredDose,
              active: true,
              updated_at: new Date().toISOString(),
            });
          if (insertMapping.error) return fail(insertMapping.error.message, 500);
          batchMappingClonedCount += 1;
        }
      }
    }

    return ok({
      message: `Katalog berhasil diduplikat ke ${targetSessionIds.length} Session. Produk + Lot Number + mapping BatchName ikut; stok target tidak disalin dan stok target yang sudah ada tidak diubah.`,
      targetSessionCount: targetSessionIds.length,
      productCount: requestedVaccineIds.length,
      assignmentCount,
      lotCatalogCount,
      catalogLotCreatedCount,
      existingTargetStockPreserved,
      stockCopied: 0,
      staleCatalogRowsDisabled,
      staleAssignmentRowsDisabled,
      batchMappingClonedCount,
      batchMappingUpdatedCount,
      classificationMirrored: true,
      sessionStockIsolation: true,
    });
  }

  if (action === "import-stock-quant") {
    const rawRows = Array.isArray(body.rows) ? body.rows : [];
    if (!rawRows.length) return fail("Tidak ada data produk/lot yang dapat di-import.");
    if (rawRows.length > 5000) return fail("Maksimal 5000 row per sekali import.");

    const probe = await supabase
      .from("vaccination_product_mappings")
      .select("id")
      .limit(1);

    if (probe.error) {
      return fail(
        "Tabel mapping produk belum tersedia. Jalankan sql_vaccination_v153_18_product_import_mapping.sql di Supabase terlebih dahulu.",
        500,
      );
    }

    const normalizedRows = rawRows
      .map((row: any) => ({
        externalProductKey: clean(row.externalProductKey).toLowerCase(),
        externalProductCode: clean(row.externalProductCode),
        externalProductName: clean(row.externalProductName),
        externalProductLabel: clean(row.externalProductLabel) || clean(row.externalProductName),
        sourceLocation: clean(row.sourceLocation),
        lotNumber: clean(row.lotNumber),
        availableQuantity: importQty(row.availableQuantity),
        requestedVaccineId: toInt(row.vaccineId, 0),
      }))
      .filter(
        (row: any) =>
          row.externalProductKey &&
          row.externalProductName &&
          row.sourceLocation &&
          row.lotNumber,
      );

    if (!normalizedRows.length) {
      return fail("Tidak ada row detail Product + Location + Lot/Serial Number yang valid.");
    }

    const vaccinesResult = await supabase
      .from("vaccination_vaccines")
      .select("*")
      .order("id", { ascending: true });
    if (vaccinesResult.error) return fail(vaccinesResult.error.message, 500);

    const lotsResult = await supabase
      .from("vaccination_vaccine_lots")
      .select("*")
      .order("id", { ascending: true });
    if (lotsResult.error) return fail(lotsResult.error.message, 500);

    const mappingsResult = await supabase
      .from("vaccination_product_mappings")
      .select("*")
      .eq("source_system", PRODUCT_SOURCE);
    if (mappingsResult.error) return fail(mappingsResult.error.message, 500);

    const vaccines: any[] = vaccinesResult.data || [];
    const lots: any[] = lotsResult.data || [];
    const existingMappings: any[] = mappingsResult.data || [];

    const vaccineById = new Map<number, any>(
      vaccines.map((vaccine: any) => [Number(vaccine.id), vaccine]),
    );
    const vaccineByName = new Map<string, any>();
    for (const vaccine of vaccines) {
      const key = normalizeName(vaccine.name);
      if (key && !vaccineByName.has(key)) vaccineByName.set(key, vaccine);
    }

    const mappingByKey = new Map<string, any>();
    const mappingKeyByVaccineId = new Map<number, string>();
    for (const mapping of existingMappings) {
      const mappingKey = clean(mapping.external_product_key).toLowerCase();
      mappingByKey.set(mappingKey, mapping);
      const mappedVaccineId = Number(mapping.vaccine_id || 0);
      if (mappedVaccineId && mapping.active !== false) {
        mappingKeyByVaccineId.set(mappedVaccineId, mappingKey);
      }
    }

    // V542: stock.quant is global/GENERAL inventory. Never let a SESSION/COMPANY Lot
    // with the same Product + Lot Number become the import target after Session isolation.
    const lotsByKey = new Map<string, any>();
    for (const lot of lots) {
      if (sanitizeStockScope(lot.stock_scope) !== "GENERAL") continue;
      lotsByKey.set(`${Number(lot.vaccine_id)}|${clean(lot.lot_number)}`, lot);
    }

    const grouped = new Map<string, any[]>();
    const expectedLotsByExternalKey = new Map<string, Set<string>>();
    for (const row of normalizedRows) {
      if (!grouped.has(row.externalProductKey)) grouped.set(row.externalProductKey, []);
      grouped.get(row.externalProductKey)!.push(row);

      if (!expectedLotsByExternalKey.has(row.externalProductKey)) {
        expectedLotsByExternalKey.set(row.externalProductKey, new Set<string>());
      }
      expectedLotsByExternalKey.get(row.externalProductKey)!.add(row.lotNumber);
    }

    const importedAt = new Date().toISOString();
    const createdBy = (user as any).email || (user as any).name || (user as any).id || "system";

    let createdVaccines = 0;
    let mappedProducts = 0;
    let createdLots = 0;
    let updatedLots = 0;
    let repairedLotLinks = 0;

    for (const [externalKey, groupRows] of grouped.entries()) {
      const first = groupRows[0];

      const requestedIds = Array.from(
        new Set(
          groupRows
            .map((row: any) => Number(row.requestedVaccineId || 0))
            .filter(Boolean),
        ),
      );

      if (requestedIds.length > 1) {
        return fail(`Mapping produk ${first.externalProductLabel} tidak konsisten.`);
      }

      let vaccineId = requestedIds[0] || 0;
      if (vaccineId && !vaccineById.has(vaccineId)) {
        return fail(`Master vaksin ID ${vaccineId} untuk ${first.externalProductLabel} tidak ditemukan.`);
      }

      if (!vaccineId) {
        const existingMapping = mappingByKey.get(externalKey);
        const mappedId = Number(existingMapping?.vaccine_id || 0);
        if (mappedId && vaccineById.has(mappedId)) vaccineId = mappedId;
      }

      if (!vaccineId) {
        const exact = vaccineByName.get(normalizeName(first.externalProductName));
        if (exact?.id) vaccineId = Number(exact.id);
      }

      if (!vaccineId) {
        const createResult = await supabase
          .from("vaccination_vaccines")
          .insert({
            name: first.externalProductName,
            brand: null,
            description: `Import ${PRODUCT_SOURCE} · ${first.externalProductLabel}`,
            dose_count: 1,
            default_next_dose_days: null,
            active: true,
          })
          .select("*")
          .single();

        if (createResult.error) return fail(createResult.error.message, 500);
        vaccineId = Number(createResult.data.id);
        createdVaccines += 1;

        vaccines.push(createResult.data);
        vaccineById.set(vaccineId, createResult.data);
        const nameKey = normalizeName(createResult.data.name);
        if (nameKey && !vaccineByName.has(nameKey)) {
          vaccineByName.set(nameKey, createResult.data);
        }
      }

      const existingExternalKeyForVaccine = mappingKeyByVaccineId.get(vaccineId);
      if (
        existingExternalKeyForVaccine &&
        existingExternalKeyForVaccine !== externalKey
      ) {
        const otherMapping = mappingByKey.get(existingExternalKeyForVaccine);
        return fail(
          `Master vaksin ${vaccineById.get(vaccineId)?.name || vaccineId} sudah dimapping ke ${otherMapping?.external_product_label || existingExternalKeyForVaccine}. Satu master vaksin hanya boleh punya satu produk stock.quant aktif.`,
        );
      }

      const sourceLocations = Array.from(
        new Set(groupRows.map((row: any) => row.sourceLocation).filter(Boolean)),
      );

      const mappingPayload = {
        source_system: PRODUCT_SOURCE,
        external_product_key: externalKey,
        external_product_code: first.externalProductCode || null,
        external_product_name: first.externalProductName,
        external_product_label: first.externalProductLabel,
        source_location: sourceLocations.join(", ") || null,
        vaccine_id: vaccineId,
        active: true,
        last_imported_at: importedAt,
        updated_at: importedAt,
      };

      const mappingUpsert = await supabase
        .from("vaccination_product_mappings")
        .upsert(mappingPayload, {
          onConflict: "source_system,external_product_key",
        })
        .select("*")
        .single();

      if (mappingUpsert.error) return fail(mappingUpsert.error.message, 500);
      mappingByKey.set(externalKey, mappingUpsert.data);
      mappingKeyByVaccineId.set(vaccineId, externalKey);
      mappedProducts += 1;

      const lotGroups = new Map<string, any>();
      for (const row of groupRows) {
        if (!lotGroups.has(row.lotNumber)) {
          lotGroups.set(row.lotNumber, {
            lotNumber: row.lotNumber,
            availableQuantity: 0,
            locations: new Set<string>(),
          });
        }
        const item = lotGroups.get(row.lotNumber)!;
        item.availableQuantity += row.availableQuantity;
        item.locations.add(row.sourceLocation);
      }

      for (const item of lotGroups.values()) {
        const lotKey = `${vaccineId}|${item.lotNumber}`;
        let existingLot = lotsByKey.get(lotKey);
        const physicalCount = Math.max(0, Number(item.availableQuantity || 0));
        const importNote = `Import ${PRODUCT_SOURCE} · product=${externalKey} · ${Array.from(item.locations).join(", ")}`;

        // V153.22: mapping dapat diedit setelah import. Build lama mengubah mapping
        // tanpa memindahkan lot import dari vaccine_id lama, sehingga Session tidak
        // menemukan lot karena filter Session memang harus memakai vaccine_id yang sama.
        // Saat stock.quant di-import ulang, repair hanya lot import yang belum pernah
        // dipakai dan jelas tidak lagi termasuk lot yang diharapkan mapping lamanya.
        if (!existingLot) {
          const staleCandidates = lots.filter((lot: any) => {
            if (lot.active === false || !isStockQuantImportedLot(lot)) return false;
            // V542: repair stock.quant links only inside GENERAL scope.
            if (sanitizeStockScope(lot.stock_scope) !== "GENERAL") return false;
            if (clean(lot.lot_number) !== item.lotNumber) return false;

            const currentVaccineId = Number(lot.vaccine_id || 0);
            if (!currentVaccineId || currentVaccineId === vaccineId) return false;

            const currentExternalKey = mappingKeyByVaccineId.get(currentVaccineId);
            if (!currentExternalKey || currentExternalKey === externalKey) return false;

            const currentExpectedLots = expectedLotsByExternalKey.get(currentExternalKey);
            return Boolean(currentExpectedLots && !currentExpectedLots.has(item.lotNumber));
          });

          for (const candidate of staleCandidates) {
            const candidateId = Number(candidate.id || 0);
            if (!candidateId) continue;

            let referenced = false;
            try {
              referenced = await lotHasOperationalReferences(supabase, candidateId);
            } catch (error: any) {
              return fail(error?.message || "Gagal memvalidasi histori lot import.", 500);
            }
            if (referenced) continue;

            const previousKey = `${Number(candidate.vaccine_id || 0)}|${clean(candidate.lot_number)}`;
            const repairResult = await supabase
              .from("vaccination_vaccine_lots")
              .update({
                vaccine_id: vaccineId,
                stock_physical_count: physicalCount,
                inventory_notes: importNote,
                active: true,
                updated_at: importedAt,
              })
              .eq("id", candidateId)
              .select("*")
              .single();

            if (repairResult.error) return fail(repairResult.error.message, 500);

            lotsByKey.delete(previousKey);
            lotsByKey.set(lotKey, repairResult.data);
            const index = lots.findIndex((lot: any) => Number(lot.id) === candidateId);
            if (index >= 0) lots[index] = repairResult.data;
            existingLot = repairResult.data;
            repairedLotLinks += 1;
            break;
          }
        }

        if (existingLot) {
          const updateResult = await supabase
            .from("vaccination_vaccine_lots")
            .update({
              stock_physical_count: physicalCount,
              inventory_notes: importNote,
              active: true,
              updated_at: importedAt,
            })
            .eq("id", existingLot.id)
            .select("*")
            .single();

          if (updateResult.error) return fail(updateResult.error.message, 500);
          lotsByKey.set(lotKey, updateResult.data);
          const index = lots.findIndex((lot: any) => Number(lot.id) === Number(existingLot.id));
          if (index >= 0) lots[index] = updateResult.data;
          updatedLots += 1;
        } else {
          const insertResult = await supabase
            .from("vaccination_vaccine_lots")
            .insert({
              vaccine_id: vaccineId,
              lot_number: item.lotNumber,
              expiry_date: null,
              stock_initial: physicalCount,
              stock_added: 0,
              stock_physical_count: physicalCount,
              inventory_notes: importNote,
              stock_used: 0,
              // V542: stock.quant import is always isolated as GENERAL stock.
              stock_scope: "GENERAL",
              stock_company_name: null,
              stock_session_id: null,
              active: true,
            })
            .select("*")
            .single();

          if (insertResult.error) return fail(insertResult.error.message, 500);
          lotsByKey.set(lotKey, insertResult.data);
          lots.push(insertResult.data);
          createdLots += 1;

          if (physicalCount > 0) {
            await supabase.from("vaccination_inventory_movements").insert({
              vaccine_id: vaccineId,
              lot_id: insertResult.data.id,
              movement_type: "initial",
              qty: physicalCount,
              reference_type: "stock_quant_import",
              reference_id: insertResult.data.id,
              notes: `Import ${PRODUCT_SOURCE}`,
              created_by: createdBy,
            });
          }
        }
      }
    }

    return ok({
      message: `Import produk & lot selesai. Mapping: ${mappedProducts}, master vaksin baru: ${createdVaccines}, lot baru: ${createdLots}, lot diperbarui: ${updatedLots}, link lot diperbaiki: ${repairedLotLinks}.`,
      imported: {
        mappedProducts,
        createdVaccines,
        createdLots,
        updatedLots,
        repairedLotLinks,
      },
    });
  }

  if (action === "update-product-mapping") {
    const id = toInt(body.id, 0);
    const vaccineId = toInt(body.vaccineId, 0);
    if (!id) return fail("Mapping produk wajib dipilih.");
    if (!vaccineId) return fail("Master vaksin wajib dipilih.");

    const vaccineResult = await supabase
      .from("vaccination_vaccines")
      .select("id,name,active")
      .eq("id", vaccineId)
      .maybeSingle();
    if (vaccineResult.error) return fail(vaccineResult.error.message, 500);
    if (!vaccineResult.data) return fail("Master vaksin tidak ditemukan.", 404);
    if (vaccineResult.data.active === false) return fail("Master vaksin nonaktif tidak dapat dipakai untuk mapping.");

    const currentResult = await supabase
      .from("vaccination_product_mappings")
      .select("id,source_system,external_product_key")
      .eq("id", id)
      .maybeSingle();
    if (currentResult.error) return fail(currentResult.error.message, 500);
    if (!currentResult.data) return fail("Mapping produk tidak ditemukan.", 404);

    const conflictResult = await supabase
      .from("vaccination_product_mappings")
      .select("id,external_product_label,external_product_name")
      .eq("source_system", currentResult.data.source_system || PRODUCT_SOURCE)
      .eq("vaccine_id", vaccineId)
      .neq("id", id)
      .eq("active", true)
      .limit(1);
    if (conflictResult.error) return fail(conflictResult.error.message, 500);
    if ((conflictResult.data || []).length) {
      const other = conflictResult.data?.[0];
      return fail(`Master vaksin ini sudah dimapping ke ${other?.external_product_label || other?.external_product_name || "produk import lain"}.`);
    }

    const result = await supabase
      .from("vaccination_product_mappings")
      .update({
        vaccine_id: vaccineId,
        active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (result.error) return fail(result.error.message, 500);
    return ok({ message: "Mapping produk berhasil diperbarui.", mapping: result.data });
  }

  if (action === "delete-product-mapping") {
    const id = toInt(body.id, 0);
    if (!id) return fail("Mapping produk wajib dipilih.");

    const result = await supabase
      .from("vaccination_product_mappings")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (result.error) return fail(result.error.message, 500);
    if (!result.data) return fail("Mapping produk tidak ditemukan.", 404);
    return ok({ message: "Mapping produk berhasil dihapus. Master vaksin dan lot tetap aman." });
  }

  if (action === "save-session-service-stock") {
    const lotId = toInt(body.lotId || body.id, 0);
    const sessionId = toInt(body.sessionId || body.stockSessionId, 0);
    const companyName = clean(body.companyName || body.stockCompanyName);
    const healthdayQty = Math.max(0, toInt(body.healthdayQty ?? body.healthday_qty, 0));
    const bazarQty = Math.max(0, toInt(body.bazarQty ?? body.bazar_qty, 0));

    if (!lotId) return fail("Lot wajib dipilih.");
    if (!sessionId) return fail("Session / Lokasi wajib dipilih.");
    if (!companyName) return fail("Perusahaan wajib dipilih.");

    const [lotResult, sessionResult] = await Promise.all([
      supabase
        .from("vaccination_vaccine_lots")
        .select("id,vaccine_id,lot_number,stock_initial,stock_added,stock_used,stock_scope,stock_company_name,stock_session_id")
        .eq("id", lotId)
        .maybeSingle(),
      supabase
        .from("vaccination_sessions")
        .select("id,session_name,company_name,location,session_date,status")
        .eq("id", sessionId)
        .maybeSingle(),
    ]);

    if (lotResult.error) return fail(lotResult.error.message, 500);
    if (!lotResult.data) return fail("Lot tidak ditemukan.", 404);
    if (sessionResult.error) return fail(sessionResult.error.message, 500);
    if (!sessionResult.data) return fail("Session / Lokasi tidak ditemukan.", 404);

    const lot = lotResult.data as any;
    const session = sessionResult.data as any;
    const canonicalCompany = clean(session.company_name);
    if (!canonicalCompany) return fail("Session / Lokasi belum memiliki perusahaan.", 409);
    if (normalizeCompanyName(companyName) !== normalizeCompanyName(canonicalCompany)) {
      return fail(`Session / Lokasi yang dipilih milik ${canonicalCompany}, bukan ${companyName}.`, 409);
    }
    if (String(session.status || "").toUpperCase() === "CANCELLED") {
      return fail("Session / Lokasi sudah dibatalkan.", 409);
    }
    if (
      sanitizeStockScope(lot.stock_scope) !== "SESSION" ||
      Number(lot.stock_session_id || 0) !== Number(sessionId)
    ) {
      return fail("Lot harus memiliki Scope Stok = Session/Lokasi yang sama sebelum pembagian Healthday/Bazar disimpan.", 409);
    }

    const globalRemaining = Math.max(
      0,
      Number(lot.stock_initial || 0) +
        Number(lot.stock_added || 0) -
        Number(lot.stock_used || 0),
    );
    const requestedTotal = healthdayQty + bazarQty;
    if (requestedTotal > globalRemaining) {
      return fail(
        `Total stok Healthday + Bazar (${requestedTotal}) melebihi sisa stok Lot ${lot.lot_number} (${globalRemaining}).`,
        409,
      );
    }

    const createdBy =
      (user as any).email ||
      (user as any).name ||
      (user as any).id ||
      "system";
    const nowIso = new Date().toISOString();

    const rows = [
      {
        session_id: sessionId,
        vaccine_id: Number(lot.vaccine_id),
        lot_id: lotId,
        allocated_qty: healthdayQty,
        low_stock_threshold: Math.min(5, healthdayQty),
        dedicated: true,
        active: healthdayQty > 0,
        service_mode: "HEALTHDAY",
        notes: "Alokasi stok Healthday (Gratis) dari Master Vaksin",
        created_by: createdBy,
        updated_at: nowIso,
      },
      {
        session_id: sessionId,
        vaccine_id: Number(lot.vaccine_id),
        lot_id: lotId,
        allocated_qty: bazarQty,
        low_stock_threshold: Math.min(5, bazarQty),
        dedicated: true,
        active: bazarQty > 0,
        service_mode: "BAZAR",
        notes: "Alokasi stok Bazar (Bayar) dari Master Vaksin",
        created_by: createdBy,
        updated_at: nowIso,
      },
    ];

    const allocationResult = await supabase
      .from("vaccination_session_stock_allocations")
      .upsert(rows, { onConflict: "session_id,lot_id,service_mode" })
      .select("*");

    if (allocationResult.error) {
      return fail(
        `Pembagian stok Healthday/Bazar gagal: ${allocationResult.error.message}`,
        500,
      );
    }

    return ok({
      message: `Pembagian stok Lot ${lot.lot_number} disimpan: Healthday ${healthdayQty}, Bazar ${bazarQty}, belum dialokasikan ${Math.max(0, globalRemaining - requestedTotal)}.`,
      allocations: allocationResult.data || [],
      remainingUnallocated: Math.max(0, globalRemaining - requestedTotal),
    });
  }

  if (action === "transfer-lot-stock") {
    const lotId = toInt(body.lotId || body.id, 0);
    const targetCompanyName = clean(body.targetCompanyName || body.stockCompanyName);
    const targetSessionId = toInt(body.targetSessionId || body.stockSessionId, 0);
    const targetServiceMode = normalizeServiceMode(body.targetServiceMode || body.serviceMode);

    if (!lotId) return fail("Lot wajib dipilih.");
    if (!targetCompanyName) return fail("Perusahaan tujuan wajib dipilih.");
    if (!targetSessionId) return fail("Session / Lokasi tujuan wajib dipilih.");

    const [lotResult, sessionResult, recordsResult, movementsResult] = await Promise.all([
      supabase
        .from("vaccination_vaccine_lots")
        .select("id,vaccine_id,lot_number,stock_initial,stock_added,stock_used,stock_physical_count,stock_scope,stock_company_name,stock_session_id,inventory_notes")
        .eq("id", lotId)
        .maybeSingle(),
      supabase
        .from("vaccination_sessions")
        .select("id,session_name,company_name,location,session_date,status")
        .eq("id", targetSessionId)
        .maybeSingle(),
      supabase
        .from("vaccination_records")
        .select("id,status")
        .eq("lot_id", lotId)
        .limit(20000),
      supabase
        .from("vaccination_inventory_movements")
        .select("id,movement_type,qty")
        .eq("lot_id", lotId)
        .limit(20000),
    ]);

    if (lotResult.error) return fail(lotResult.error.message, 500);
    if (!lotResult.data) return fail("Lot tidak ditemukan.", 404);
    if (sessionResult.error) return fail(sessionResult.error.message, 500);
    if (!sessionResult.data) return fail("Session / Lokasi tujuan tidak ditemukan.", 404);
    if (recordsResult.error) return fail(recordsResult.error.message, 500);
    if (movementsResult.error) return fail(movementsResult.error.message, 500);

    const targetSession = sessionResult.data as any;
    const canonicalCompany = clean(targetSession.company_name);
    if (!canonicalCompany) {
      return fail("Session / Lokasi tujuan belum memiliki perusahaan.", 409);
    }
    if (
      normalizeCompanyName(targetCompanyName) !==
      normalizeCompanyName(canonicalCompany)
    ) {
      return fail(
        `Session / Lokasi yang dipilih milik ${canonicalCompany}, bukan ${targetCompanyName}.`,
        409,
      );
    }
    if (String(targetSession.status || "").toUpperCase() === "CANCELLED") {
      return fail("Session / Lokasi tujuan sudah dibatalkan.", 409);
    }

    const lot = lotResult.data as any;
    if (
      sanitizeStockScope(lot.stock_scope) === "SESSION" &&
      Number(lot.stock_session_id || 0) === Number(targetSessionId)
    ) {
      return fail("Lot ini sudah dimiliki oleh Session / Lokasi tujuan tersebut.", 409);
    }

    // V542 compatibility guard: after Session isolation, target may already own a
    // zero-stock catalog clone with the same Product + Lot Number. Do not let the
    // transfer mutate this source Lot into a duplicate target owner row. The user
    // can stock the target-owned catalog Lot directly; real target stock is never merged silently.
    const targetSameLotResult = await supabase
      .from("vaccination_vaccine_lots")
      .select("id,stock_initial,stock_added,stock_used,stock_physical_count,active")
      .eq("vaccine_id", Number(lot.vaccine_id))
      .eq("lot_number", clean(lot.lot_number))
      .eq("stock_scope", "SESSION")
      .eq("stock_session_id", Number(targetSessionId))
      .neq("id", lotId)
      .limit(2);
    if (targetSameLotResult.error) return fail(targetSameLotResult.error.message, 500);
    if ((targetSameLotResult.data || []).length > 1) {
      return fail("Safety stop V542: Session tujuan memiliki lebih dari satu Lot yang sama. Audit data dulu sebelum transfer.", 409);
    }
    const targetSameLot = (targetSameLotResult.data || [])[0];
    if (targetSameLot) {
      const targetHasStock =
        Number(targetSameLot.stock_initial || 0) > 0 ||
        Number(targetSameLot.stock_added || 0) > 0 ||
        Number(targetSameLot.stock_used || 0) > 0 ||
        Number(targetSameLot.stock_physical_count || 0) > 0;
      return fail(
        targetHasStock
          ? `Session tujuan sudah memiliki Lot ${lot.lot_number} dengan stok sendiri. V542 tidak akan merge dua stok Session secara otomatis.`
          : `Session tujuan sudah memiliki Lot katalog ${lot.lot_number} dengan stok 0. Isi/atur stok pada Lot milik Session tujuan tersebut; V542 tidak akan memindahkan ownership Lot sumber melewati isolasi Session.`,
        409,
      );
    }

    const activeRecordCount = (recordsResult.data || []).filter(
      (row: any) =>
        !["CANCELLED", "CANCELED", "VOID", "VOIDED", "BATAL"].includes(
          String(row.status || "").toUpperCase(),
        ),
    ).length;
    const used = Math.max(Number(lot.stock_used || 0), activeRecordCount);
    const adjustmentOutTypes = new Set(["STOCK_OUT_ADJUSTMENT", "ADJUSTMENT_OUT", "MANUAL_STOCK_OUT", "STOCK_REDUCTION"]);
    const adjustmentOut = (movementsResult.data || []).reduce((sum: number, movement: any) => {
      const type = clean(movement?.movement_type).toUpperCase();
      return adjustmentOutTypes.has(type) ? sum + Math.abs(Number(movement?.qty || 0)) : sum;
    }, 0);
    const remaining =
      Number(lot.stock_initial || 0) +
      Number(lot.stock_added || 0) -
      used -
      adjustmentOut;

    if (remaining <= 0) {
      return fail("Tidak ada sisa stok yang dapat ditransfer.", 409);
    }

    const previousOwnership = {
      stock_scope: sanitizeStockScope(lot.stock_scope),
      stock_company_name: lot.stock_company_name ?? null,
      stock_session_id: lot.stock_session_id ?? null,
    };

    const sourceSessionId = Number(lot.stock_session_id || 0);
    let sourceSessionLabel = "";
    if (sourceSessionId) {
      const sourceSessionResult = await supabase
        .from("vaccination_sessions")
        .select("id,session_name,company_name,location,session_date")
        .eq("id", sourceSessionId)
        .maybeSingle();
      if (!sourceSessionResult.error && sourceSessionResult.data) {
        const sourceSession = sourceSessionResult.data as any;
        sourceSessionLabel = [
          clean(sourceSession.session_name),
          clean(sourceSession.location),
          clean(sourceSession.session_date),
        ]
          .filter(Boolean)
          .join(" · ");
      }
    }

    const sourceOwner =
      previousOwnership.stock_scope === "SESSION"
        ? `${clean(previousOwnership.stock_company_name) || "Perusahaan"}${sourceSessionLabel ? ` · ${sourceSessionLabel}` : ""}`
        : previousOwnership.stock_scope === "COMPANY"
          ? clean(previousOwnership.stock_company_name) || "Perusahaan"
          : "Global";

    const targetLabel = [
      clean(targetSession.session_name),
      clean(targetSession.location),
      clean(targetSession.session_date),
    ]
      .filter(Boolean)
      .join(" · ");

    const updateResult = await supabase
      .from("vaccination_vaccine_lots")
      .update({
        stock_scope: "SESSION",
        stock_company_name: canonicalCompany,
        stock_session_id: Number(targetSession.id),
        updated_at: new Date().toISOString(),
      })
      .eq("id", lotId)
      .select("*")
      .single();

    if (updateResult.error) return fail(updateResult.error.message, 500);

    const previousAllocationResult = await supabase
      .from("vaccination_session_stock_allocations")
      .select("*")
      .eq("lot_id", lotId)
      .eq("active", true)
      .limit(100);

    if (previousAllocationResult.error) {
      await supabase
        .from("vaccination_vaccine_lots")
        .update({
          ...previousOwnership,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lotId);
      return fail(
        `Transfer dibatalkan karena pembagian stok layanan gagal dibaca: ${previousAllocationResult.error.message}`,
        500,
      );
    }

    const createdBy =
      (user as any).email ||
      (user as any).name ||
      (user as any).id ||
      "system";
    const allocationDeactivate = await supabase
      .from("vaccination_session_stock_allocations")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("lot_id", lotId)
      .eq("active", true);

    if (allocationDeactivate.error) {
      await supabase
        .from("vaccination_vaccine_lots")
        .update({
          ...previousOwnership,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lotId);
      return fail(
        `Transfer dibatalkan karena alokasi stok lama gagal ditutup: ${allocationDeactivate.error.message}`,
        500,
      );
    }

    const targetAllocationResult = await supabase
      .from("vaccination_session_stock_allocations")
      .upsert(
        {
          session_id: Number(targetSession.id),
          vaccine_id: Number(lot.vaccine_id),
          lot_id: lotId,
          allocated_qty: remaining,
          low_stock_threshold: Math.min(5, remaining),
          dedicated: true,
          active: true,
          service_mode: targetServiceMode,
          notes: `Transfer sisa stok ke ${targetServiceMode === "BAZAR" ? "Bazar (Bayar)" : "Healthday (Gratis)"}`,
          created_by: createdBy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "session_id,lot_id,service_mode" },
      )
      .select("*")
      .single();

    if (targetAllocationResult.error) {
      await supabase
        .from("vaccination_vaccine_lots")
        .update({
          ...previousOwnership,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lotId);

      if ((previousAllocationResult.data || []).length) {
        await supabase
          .from("vaccination_session_stock_allocations")
          .upsert(previousAllocationResult.data, {
            onConflict: "session_id,lot_id,service_mode",
          });
      }

      return fail(
        `Transfer dibatalkan karena alokasi stok layanan tujuan gagal disimpan: ${targetAllocationResult.error.message}`,
        500,
      );
    }

    const note =
      `Transfer sisa stok ${remaining} · ${sourceOwner} -> ${canonicalCompany} · ${targetLabel || `Session ${targetSession.id}`} · ${targetServiceMode === "BAZAR" ? "Bazar (Bayar)" : "Healthday (Gratis)"}`;

    const movementResult = await supabase
      .from("vaccination_inventory_movements")
      .insert({
        vaccine_id: lot.vaccine_id,
        lot_id: lotId,
        movement_type: "stock_transfer",
        qty: remaining,
        reference_type: "stock_transfer_session",
        reference_id: Number(targetSession.id),
        notes: note,
        created_by: createdBy,
      });

    if (movementResult.error) {
      await supabase
        .from("vaccination_vaccine_lots")
        .update({
          ...previousOwnership,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lotId);

      await supabase
        .from("vaccination_session_stock_allocations")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("lot_id", lotId);

      if ((previousAllocationResult.data || []).length) {
        await supabase
          .from("vaccination_session_stock_allocations")
          .upsert(previousAllocationResult.data, {
            onConflict: "session_id,lot_id,service_mode",
          });
      }

      return fail(
        `Transfer dibatalkan karena audit inventory gagal disimpan: ${movementResult.error.message}`,
        500,
      );
    }

    return ok({
      message: `Sisa stok ${remaining} Lot ${lot.lot_number} berhasil ditransfer ke ${canonicalCompany} · ${targetLabel || `Session ${targetSession.id}`} · ${targetServiceMode === "BAZAR" ? "Bazar (Bayar)" : "Healthday (Gratis)"}.`,
      transferredQty: remaining,
      lot: updateResult.data,
      targetSession,
    });
  }

  if (action === "delete-lot") {
    const id = toInt(body.id || body.lotId, 0);
    if (!id) return fail("Lot wajib dipilih.");

    const lotResult = await supabase
      .from("vaccination_vaccine_lots")
      .select("id,lot_number")
      .eq("id", id)
      .maybeSingle();
    if (lotResult.error) return fail(lotResult.error.message, 500);
    if (!lotResult.data) return fail("Lot tidak ditemukan.", 404);

    const references = [
      await supabase.from("vaccination_records").select("id").eq("lot_id", id).limit(1),
      await supabase.from("vaccination_registration_items").select("id").eq("lot_id", id).limit(1),
    ];
    const referenceError = references.find((item) => item.error)?.error;
    if (referenceError) return fail(referenceError.message, 500);
    if (references.some((item) => (item.data || []).length > 0)) {
      return fail(`Lot ${lotResult.data.lot_number} sudah pernah dipakai pada transaksi peserta/administrasi nyata, sehingga tidak aman untuk dihapus.`);
    }

    // V540: assignment/alokasi Session adalah konfigurasi, bukan riwayat peserta.
    // Lepas hanya konfigurasi produk/lot; flow Session Dokter/Antrean/Registrasi tidak disentuh.
    const detachAllocation = await supabase
      .from("vaccination_session_stock_allocations")
      .delete()
      .eq("lot_id", id);
    if (detachAllocation.error) return fail(detachAllocation.error.message, 500);

    const detachSessionVaccine = await supabase
      .from("vaccination_session_vaccines")
      .delete()
      .eq("lot_id", id);
    if (detachSessionVaccine.error) return fail(detachSessionVaccine.error.message, 500);

    const deleteResult = await supabase
      .from("vaccination_vaccine_lots")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (deleteResult.error) return fail(deleteResult.error.message, 500);
    if (!deleteResult.data) return fail("Lot tidak ditemukan saat proses hapus.", 404);

    return ok({ message: `Lot ${lotResult.data.lot_number} berhasil dihapus.` });
  }

  if (action === "delete-vaccine") {
    const id = toInt(body.id || body.vaccineId, 0);
    if (!id) return fail("Master vaksin wajib dipilih.");

    const vaccineResult = await supabase
      .from("vaccination_vaccines")
      .select("id,name")
      .eq("id", id)
      .maybeSingle();
    if (vaccineResult.error) return fail(vaccineResult.error.message, 500);
    if (!vaccineResult.data) return fail("Master vaksin tidak ditemukan.", 404);

    const references = [
      await supabase.from("vaccination_records").select("id").eq("vaccine_id", id).limit(1),
      await supabase.from("vaccination_registrations").select("id").eq("vaccine_id", id).limit(1),
      await supabase.from("vaccination_registration_items").select("id").eq("vaccine_id", id).limit(1),
    ];
    const referenceError = references.find((item) => item.error)?.error;
    if (referenceError) return fail(referenceError.message, 500);
    if (references.some((item) => (item.data || []).length > 0)) {
      return fail(`Produk ${vaccineResult.data.name} sudah pernah dipakai pada transaksi peserta/administrasi nyata, sehingga tidak aman untuk dihapus.`);
    }

    // V540: assignment/alokasi Session saja tidak dianggap sebagai transaksi pasien.
    // Lepas konfigurasi produk; existing_flow_config Session sama sekali tidak diubah.
    const detachAllocation = await supabase
      .from("vaccination_session_stock_allocations")
      .delete()
      .eq("vaccine_id", id);
    if (detachAllocation.error) return fail(detachAllocation.error.message, 500);

    const detachSessionVaccine = await supabase
      .from("vaccination_session_vaccines")
      .delete()
      .eq("vaccine_id", id);
    if (detachSessionVaccine.error) return fail(detachSessionVaccine.error.message, 500);

    const deleteResult = await supabase
      .from("vaccination_vaccines")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (deleteResult.error) return fail(deleteResult.error.message, 500);
    if (!deleteResult.data) return fail("Master vaksin tidak ditemukan saat proses hapus.", 404);

    return ok({ message: `Produk ${vaccineResult.data.name} beserta lot/mapping yang belum terpakai berhasil dihapus.` });
  }

  if (action === "assign-product-session") {
    const vaccineId = toInt(body.vaccineId, 0);
    const sessionId = toInt(body.sessionId, 0);
    const companyName = clean(body.companyName);
    const serviceMode = String(body.serviceMode || "HEALTHDAY").trim().toUpperCase() === "BAZAR"
      ? "BAZAR"
      : "HEALTHDAY";
    const plannedStockInitial = Math.max(0, toInt(body.plannedStockInitial, 0));
    const expectedStockSessionId = toInt(body.expectedStockSessionId || body.expected_stock_session_id, 0);

    if (!vaccineId) return fail("Master vaksin / produk wajib dipilih.");
    if (!sessionId) return fail("Session / Lokasi wajib dipilih.");
    if (expectedStockSessionId && sessionId !== expectedStockSessionId) {
      return fail("Safety stop V542: assignment produk tidak boleh ditulis ke Session lain dari filter Master aktif.", 409);
    }

    const [vaccineResult, sessionResult] = await Promise.all([
      supabase
        .from("vaccination_vaccines")
        .select("id,name,active")
        .eq("id", vaccineId)
        .maybeSingle(),
      supabase
        .from("vaccination_sessions")
        .select("id,session_name,company_name,location,session_date,status")
        .eq("id", sessionId)
        .maybeSingle(),
    ]);

    if (vaccineResult.error) return fail(vaccineResult.error.message, 500);
    if (sessionResult.error) return fail(sessionResult.error.message, 500);
    if (!vaccineResult.data) return fail("Master vaksin / produk tidak ditemukan.", 404);
    if (!sessionResult.data) return fail("Session / Lokasi tidak ditemukan.", 404);

    const canonicalCompany = clean(sessionResult.data.company_name);
    if (!canonicalCompany) return fail("Session / Lokasi belum memiliki perusahaan.", 409);
    if (companyName && normalizeCompanyName(companyName) !== normalizeCompanyName(canonicalCompany)) {
      return fail(`Session / Lokasi yang dipilih milik ${canonicalCompany}, bukan ${companyName}.`, 409);
    }
    if (String(sessionResult.data.status || "").toUpperCase() === "CANCELLED") {
      return fail("Session / Lokasi sudah dibatalkan.", 409);
    }

    const nowIso = new Date().toISOString();
    const assignmentResult = await supabase
      .from("vaccination_session_product_assignments")
      .upsert(
        {
          session_id: sessionId,
          vaccine_id: vaccineId,
          service_mode: serviceMode,
          planned_stock_initial: plannedStockInitial,
          active: true,
          updated_at: nowIso,
        },
        { onConflict: "session_id,vaccine_id,service_mode" },
      )
      .select("id,session_id,vaccine_id,service_mode,planned_stock_initial,active,created_at,updated_at")
      .single();

    if (assignmentResult.error) {
      return fail(
        `Assignment produk ke Session gagal: ${assignmentResult.error.message}`,
        500,
      );
    }

    return ok({
      message: `Produk ${vaccineResult.data.name} di-assign ke Session ${serviceMode === "BAZAR" ? "Bazar" : "Healthday"}. Lot Number tetap opsional.`,
      assignment: assignmentResult.data,
    });
  }

  if (action === "update-vaccine") {
    const id = toInt(body.id || body.vaccineId, 0);
    const name = clean(body.name);
    const editIntent = clean(body.editIntent).toUpperCase();
    if (editIntent !== "PRODUCT_MASTER") {
      return fail(
        "Update nama Master Produk ditolak karena bukan dari mode Edit Produk eksplisit.",
        409,
      );
    }
    if (!id) return fail("Master vaksin wajib dipilih.");
    if (!name) return fail("Nama vaksin wajib diisi.");

    const result = await supabase
      .from("vaccination_vaccines")
      .update({
        name,
        brand: clean(body.brand) || null,
        description: clean(body.description) || null,
        price: body.price === "" || body.price == null ? null : Number(body.price),
        price_category: clean(body.priceCategory) || clean(body.price_category) || null,
        dose_count: (body.isSeries === true || String(body.isSeries || "").toLowerCase() === "true")
          ? normalizeSeriesSchedule(body.seriesSchedule).length + 1
          : Math.max(1, toInt(body.doseCount, 1)),
        default_next_dose_days: (body.isSeries === true || String(body.isSeries || "").toLowerCase() === "true")
          ? (normalizeSeriesSchedule(body.seriesSchedule)[0]?.next_due_days ?? null)
          : (body.defaultNextDoseDays === "" || body.defaultNextDoseDays == null ? null : toInt(body.defaultNextDoseDays, 0)),
        active: body.active !== false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (result.error) return fail(result.error.message, 500);
    try {
      const seriesSetting = await saveSeriesSetting(supabase, Number(result.data.id), body);
      return ok({ message: "Master vaksin berhasil diperbarui. Rule series berlaku ke semua Session produk ini.", vaccine: { ...result.data, is_series: seriesSetting?.is_series === true, series_schedule: seriesSetting?.schedule || [] } });
    } catch (seriesError: any) {
      return fail(seriesError?.message || "Gagal menyimpan rule Vaksin Series.", 500);
    }
  }

  if (action === "create-vaccine") {
    const name = clean(body.name);
    if (!name) return fail("Nama vaksin wajib diisi.");

    // V568: jangan buat Master Produk duplikat hanya karena user mengubah nama
    // dari editor Lot. Nama + brand aktif yang sama harus memakai Master yang sama.
    const brand = clean(body.brand);
    const duplicateProductResult = await supabase
      .from("vaccination_vaccines")
      .select("id,name,brand,active")
      .eq("active", true)
      .ilike("name", name)
      .limit(100);
    if (duplicateProductResult.error) return fail(duplicateProductResult.error.message, 500);
    const duplicateProduct = (duplicateProductResult.data || []).find(
      (row: any) => clean(row.brand).toLowerCase() === brand.toLowerCase(),
    );
    if (duplicateProduct) {
      return fail(
        `Master Produk ${duplicateProduct.name} (${duplicateProduct.brand || "-"}) sudah ada. Gunakan Edit Produk, jangan membuat produk baru dari Edit Lot.`,
        409,
      );
    }

    const result = await supabase
      .from("vaccination_vaccines")
      .insert({
        name,
        brand: clean(body.brand) || null,
        description: clean(body.description) || null,
        price: body.price === "" || body.price == null ? null : Number(body.price),
        price_category: clean(body.priceCategory) || clean(body.price_category) || null,
        dose_count: (body.isSeries === true || String(body.isSeries || "").toLowerCase() === "true")
          ? normalizeSeriesSchedule(body.seriesSchedule).length + 1
          : Math.max(1, toInt(body.doseCount, 1)),
        default_next_dose_days: (body.isSeries === true || String(body.isSeries || "").toLowerCase() === "true")
          ? (normalizeSeriesSchedule(body.seriesSchedule)[0]?.next_due_days ?? null)
          : (body.defaultNextDoseDays === "" || body.defaultNextDoseDays == null ? null : toInt(body.defaultNextDoseDays, 0)),
        active: body.active !== false,
      })
      .select("*")
      .single();

    if (result.error) return fail(result.error.message, 500);
    try {
      const seriesSetting = await saveSeriesSetting(supabase, Number(result.data.id), body);
      return ok({ message: "Master vaksin berhasil dibuat.", vaccine: { ...result.data, is_series: seriesSetting?.is_series === true, series_schedule: seriesSetting?.schedule || [] } });
    } catch (seriesError: any) {
      return fail(seriesError?.message || "Gagal menyimpan rule Vaksin Series.", 500);
    }
  }

  if (action === "create-lot") {
    const vaccineId = toInt(body.vaccineId, 0);
    const lotNumber = clean(body.lotNumber);
    if (!vaccineId) return fail("Vaksin wajib dipilih.");
    if (!lotNumber) return fail("Lot Number wajib diisi.");

    let ownership: Record<string, any>;
    try {
      ownership = await stockOwnershipFromBody(supabase, body);
    } catch (error: any) {
      return fail(error?.message || "Scope stok tidak valid.");
    }

    const expectedStockSessionId = toInt(body.expectedStockSessionId || body.expected_stock_session_id, 0);
    if (expectedStockSessionId) {
      if (ownership.stock_scope !== "SESSION" || Number(ownership.stock_session_id || 0) !== expectedStockSessionId) {
        return fail("Safety stop V542: target stok berbeda dengan Session yang sedang dipilih pada filter Master. Refresh halaman lalu edit dari Session tujuan yang benar.", 409);
      }
    }

    const initialQty = Math.max(0, toInt(body.stockInitial, 0));
    const addedQty = Math.max(0, toInt(body.stockAdded, 0));
    let autoPlan: MasterAutoAllocationPlan | null = null;
    try {
      autoPlan = await prepareMasterAutoAllocation(supabase, {
        ownership, vaccineId, stockInitial: initialQty, stockAdded: addedQty,
        stockUsed: 0, previousTotal: 0, preferredMode: body.serviceMode,
      });
    } catch (error: any) {
      return fail(error?.message || "Alokasi otomatis gagal diperiksa.", 409);
    }

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
        ...ownership,
      })
      .select("*")
      .single();

    if (result.error) return fail(result.error.message, 500);

    const createdBy = (user as any).email || (user as any).name || (user as any).id || "system";
    try {
      await applyMasterAutoAllocation(supabase, autoPlan, Number(result.data.id), createdBy);
    } catch (allocationError: any) {
      // A fresh Lot is not yet referenced or moved; remove it on allocation failure.
      const reverted = await supabase.from("vaccination_vaccine_lots").delete().eq("id", result.data.id);
      return fail(
        reverted.error
          ? `KRITIS: alokasi gagal dan rollback Lot juga gagal. Lot ${result.data.id} harus diperiksa manual: ${allocationError?.message || "Unknown"}`
          : `Lot tidak disimpan karena alokasi otomatis gagal: ${allocationError?.message || "Unknown"}`,
        500,
      );
    }
    const movements = [];
    if (initialQty) movements.push({ vaccine_id: vaccineId, lot_id: result.data.id, movement_type: "initial", qty: initialQty, reference_type: "vaccine_lot", reference_id: result.data.id, notes: "Jumlah awal lot", created_by: createdBy });
    if (addedQty) movements.push({ vaccine_id: vaccineId, lot_id: result.data.id, movement_type: "stock_in", qty: addedQty, reference_type: "vaccine_lot", reference_id: result.data.id, notes: clean(body.inventoryNotes) || "Tambahan stok", created_by: createdBy });
    if (movements.length) await supabase.from("vaccination_inventory_movements").insert(movements);

    return ok({ message: "Lot number berhasil dibuat.", lot: result.data });
  }

  if (action === "reassign-lot-vaccine") {
    const lotId = toInt(body.lotId || body.id, 0);
    const targetVaccineId = toInt(body.targetVaccineId || body.vaccineId, 0);

    if (!lotId) return fail("Lot wajib dipilih.");
    if (!targetVaccineId) return fail("Produk tujuan wajib dipilih.");

    const [lotResult, vaccineResult] = await Promise.all([
      supabase
        .from("vaccination_vaccine_lots")
        .select("id,vaccine_id,lot_number,stock_scope,stock_company_name,stock_session_id")
        .eq("id", lotId)
        .maybeSingle(),
      supabase
        .from("vaccination_vaccines")
        .select("id,name,active")
        .eq("id", targetVaccineId)
        .maybeSingle(),
    ]);

    if (lotResult.error) return fail(lotResult.error.message, 500);
    if (vaccineResult.error) return fail(vaccineResult.error.message, 500);
    if (!lotResult.data) return fail("Lot tidak ditemukan.", 404);
    if (!vaccineResult.data) return fail("Produk tujuan tidak ditemukan.", 404);
    if (vaccineResult.data.active === false) return fail("Produk tujuan sudah nonaktif.", 409);

    const currentVaccineId = Number(lotResult.data.vaccine_id || 0);
    if (currentVaccineId === targetVaccineId) {
      return ok({ message: "Produk induk Lot tidak berubah.", lot: lotResult.data });
    }

    const references = [
      await supabase.from("vaccination_records").select("id").eq("lot_id", lotId).limit(1),
      await supabase.from("vaccination_registration_items").select("id").eq("lot_id", lotId).limit(1),
    ];
    const referenceError = references.find((item) => item.error)?.error;
    if (referenceError) return fail(referenceError.message, 500);
    if (references.some((item) => (item.data || []).length > 0)) {
      return fail(
        `Lot ${lotResult.data.lot_number} sudah dipakai pada data operasional, jadi produk induknya tidak boleh dipindahkan.`,
        409,
      );
    }

    const duplicateResult = await supabase
      .from("vaccination_vaccine_lots")
      .select("id,stock_scope,stock_company_name,stock_session_id")
      .eq("vaccine_id", targetVaccineId)
      .eq("lot_number", lotResult.data.lot_number)
      .neq("id", lotId)
      .limit(100);
    if (duplicateResult.error) return fail(duplicateResult.error.message, 500);

    // V542: the same Product + Lot Number is valid in another stock owner.
    // Only block a duplicate inside the exact same owner scope.
    const currentScope = sanitizeStockScope((lotResult.data as any).stock_scope);
    const currentCompany = normalizeCompanyName((lotResult.data as any).stock_company_name);
    const currentSessionId = Number((lotResult.data as any).stock_session_id || 0);
    const sameOwnerDuplicate = (duplicateResult.data || []).find((row: any) => {
      const rowScope = sanitizeStockScope(row.stock_scope);
      if (rowScope !== currentScope) return false;
      if (currentScope === "SESSION") {
        return Number(row.stock_session_id || 0) === currentSessionId;
      }
      if (currentScope === "COMPANY") {
        return normalizeCompanyName(row.stock_company_name) === currentCompany;
      }
      return true;
    });
    if (sameOwnerDuplicate) {
      return fail(
        `Produk ${vaccineResult.data.name} sudah memiliki Lot ${lotResult.data.lot_number} pada tujuan stok yang sama.`,
        409,
      );
    }

    const updateResult = await supabase
      .from("vaccination_vaccine_lots")
      .update({
        vaccine_id: targetVaccineId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lotId)
      .select("*")
      .single();

    if (updateResult.error) return fail(updateResult.error.message, 500);

    const sessionVaccineUpdate = await supabase
      .from("vaccination_session_vaccines")
      .update({ vaccine_id: targetVaccineId })
      .eq("lot_id", lotId);

    if (sessionVaccineUpdate.error) {
      await supabase
        .from("vaccination_vaccine_lots")
        .update({
          vaccine_id: currentVaccineId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lotId);

      return fail(
        `Pemindahan Lot dibatalkan karena mapping Session gagal diperbarui: ${sessionVaccineUpdate.error.message}`,
        500,
      );
    }

    const movementUpdate = await supabase
      .from("vaccination_inventory_movements")
      .update({ vaccine_id: targetVaccineId })
      .eq("lot_id", lotId);

    if (movementUpdate.error) {
      await supabase
        .from("vaccination_vaccine_lots")
        .update({
          vaccine_id: currentVaccineId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lotId);
      await supabase
        .from("vaccination_session_vaccines")
        .update({ vaccine_id: currentVaccineId })
        .eq("lot_id", lotId);

      return fail(
        `Pemindahan Lot dibatalkan karena audit inventory gagal diperbarui: ${movementUpdate.error.message}`,
        500,
      );
    }

    return ok({
      message: `Lot ${lotResult.data.lot_number} dipindahkan ke produk ${vaccineResult.data.name}.`,
      lot: updateResult.data,
    });
  }

  if (action === "update-lot-details") {
    const lotId = toInt(body.lotId || body.id, 0);
    const lotNumber = clean(body.lotNumber);
    if (!lotId) return fail("Lot wajib dipilih.");
    if (!lotNumber) return fail("Lot Number wajib diisi.");

    const beforeResult = await supabase
      .from("vaccination_vaccine_lots")
      .select("id,vaccine_id,lot_number,expiry_date,stock_initial,stock_added,stock_used,stock_physical_count,inventory_notes,stock_scope,stock_company_name,stock_session_id,updated_at")
      .eq("id", lotId)
      .maybeSingle();

    if (beforeResult.error) return fail(beforeResult.error.message, 500);
    if (!beforeResult.data) return fail("Lot tidak ditemukan.", 404);

    const beforeInitial = Number(beforeResult.data.stock_initial || 0);
    const beforeAdded = Number(beforeResult.data.stock_added || 0);
    const nextInitial = Math.max(0, toInt(body.stockInitial, beforeInitial));
    const nextAdded = Math.max(0, toInt(body.stockAdded, beforeAdded));

    let ownership: Record<string, any>;
    try {
      ownership = await stockOwnershipFromBody(supabase, body, beforeResult.data);
    } catch (error: any) {
      return fail(error?.message || "Scope stok tidak valid.");
    }

    const expectedStockSessionId = toInt(body.expectedStockSessionId || body.expected_stock_session_id, 0);
    if (expectedStockSessionId) {
      if (ownership.stock_scope !== "SESSION" || Number(ownership.stock_session_id || 0) !== expectedStockSessionId) {
        return fail("Safety stop V542: target stok berbeda dengan Session yang sedang dipilih pada filter Master. Refresh halaman lalu edit dari Session tujuan yang benar.", 409);
      }
    }

    const beforeScope = sanitizeStockScope(beforeResult.data.stock_scope);
    const beforeSessionId = Number(beforeResult.data.stock_session_id || 0);
    if (beforeScope === "SESSION" && beforeSessionId) {
      const nextSessionId = Number(ownership.stock_session_id || 0);
      if (ownership.stock_scope !== "SESSION" || nextSessionId !== beforeSessionId) {
        return fail("Lot yang sudah dimiliki suatu Session tidak boleh dipindah ke Session/scope lain lewat Edit Produk. Gunakan Lot milik Session tujuan agar stok antar lokasi tetap terisolasi.", 409);
      }
    }

    let autoPlan: MasterAutoAllocationPlan | null = null;
    try {
      autoPlan = await prepareMasterAutoAllocation(supabase, {
        ownership,
        vaccineId: Number(beforeResult.data.vaccine_id || 0),
        lotId,
        stockInitial: nextInitial,
        stockAdded: nextAdded,
        stockUsed: Math.max(0, Number(beforeResult.data.stock_used || 0)),
        previousTotal: beforeInitial + beforeAdded,
        preferredMode: body.serviceMode,
      });
    } catch (error: any) {
      return fail(error?.message || "Alokasi otomatis gagal diperiksa.", 409);
    }

    const result = await supabase
      .from("vaccination_vaccine_lots")
      .update({
        lot_number: lotNumber,
        expiry_date: clean(body.expiryDate) || null,
        stock_initial: nextInitial,
        stock_added: nextAdded,
        stock_physical_count: body.stockPhysicalCount === "" || body.stockPhysicalCount == null
          ? null
          : Math.max(0, toInt(body.stockPhysicalCount, 0)),
        inventory_notes: clean(body.inventoryNotes) || null,
        ...ownership,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lotId)
      .select("*")
      .single();

    if (result.error) return fail(result.error.message, 500);

    try {
      await applyMasterAutoAllocation(
        supabase, autoPlan, lotId,
        (user as any).email || (user as any).name || (user as any).id || "system",
      );
    } catch (allocationError: any) {
      // Best-effort rollback with a write-version guard; do not create stock movements.
      const previous = beforeResult.data as any;
      const rollback = await supabase.from("vaccination_vaccine_lots").update({
        lot_number: previous.lot_number,
        expiry_date: previous.expiry_date,
        stock_initial: previous.stock_initial,
        stock_added: previous.stock_added,
        stock_used: previous.stock_used,
        stock_physical_count: previous.stock_physical_count,
        inventory_notes: previous.inventory_notes,
        stock_scope: previous.stock_scope,
        stock_company_name: previous.stock_company_name,
        stock_session_id: previous.stock_session_id,
        updated_at: previous.updated_at,
      }).eq("id", lotId).eq("updated_at", result.data.updated_at).select("id");
      const rollbackFailed = !!rollback.error || !(rollback.data || []).length;
      return fail(
        rollbackFailed
          ? `KRITIS: alokasi otomatis gagal dan stok Lot ${lotId} perlu rekonsiliasi manual: ${allocationError?.message || "Unknown"}`
          : `Perubahan stok ditarik kembali karena alokasi otomatis gagal: ${allocationError?.message || "Unknown"}`,
        500,
      );
    }

    const initialDelta = nextInitial - beforeInitial;
    if (initialDelta !== 0) {
      await supabase.from("vaccination_inventory_movements").insert({
        vaccine_id: beforeResult.data.vaccine_id || result.data.vaccine_id,
        lot_id: lotId,
        movement_type: initialDelta > 0 ? "initial" : "adjustment_minus",
        qty: initialDelta,
        reference_type: "vaccine_lot",
        reference_id: lotId,
        notes: clean(body.inventoryNotes) || "Update jumlah awal lot",
        created_by: (user as any).email || (user as any).name || (user as any).id || "system",
      });
    }

    const addedDelta = nextAdded - beforeAdded;
    if (addedDelta !== 0) {
      await supabase.from("vaccination_inventory_movements").insert({
        vaccine_id: beforeResult.data.vaccine_id || result.data.vaccine_id,
        lot_id: lotId,
        movement_type: addedDelta > 0 ? "stock_in" : "adjustment_minus",
        qty: addedDelta,
        reference_type: "vaccine_lot",
        reference_id: lotId,
        notes: clean(body.inventoryNotes) || "Update tambahan stok",
        created_by: (user as any).email || (user as any).name || (user as any).id || "system",
      });
    }

    return ok({ message: "Produk & detail lot berhasil diperbarui.", lot: result.data });
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
