// V499_SESSION_PRODUCT_ASSIGNMENT_WITHOUT_LOT
import { NextRequest } from "next/server";
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

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "master")) return fail("Akses modul vaksinasi ditolak untuk role ini.", 403);

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
    .select("id,session_id,vaccine_id,service_mode,active,created_at,updated_at")
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
    vaccines: vaccinesResult.data || [],
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

    const lotsByKey = new Map<string, any>();
    for (const lot of lots) {
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

    const [lotResult, sessionResult, recordsResult] = await Promise.all([
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
    ]);

    if (lotResult.error) return fail(lotResult.error.message, 500);
    if (!lotResult.data) return fail("Lot tidak ditemukan.", 404);
    if (sessionResult.error) return fail(sessionResult.error.message, 500);
    if (!sessionResult.data) return fail("Session / Lokasi tujuan tidak ditemukan.", 404);
    if (recordsResult.error) return fail(recordsResult.error.message, 500);

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

    const activeRecordCount = (recordsResult.data || []).filter(
      (row: any) =>
        !["CANCELLED", "CANCELED", "VOID", "VOIDED", "BATAL"].includes(
          String(row.status || "").toUpperCase(),
        ),
    ).length;
    const used = Math.max(Number(lot.stock_used || 0), activeRecordCount);
    const remaining =
      Number(lot.stock_initial || 0) +
      Number(lot.stock_added || 0) -
      used;

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
      await supabase.from("vaccination_session_vaccines").select("id").eq("lot_id", id).limit(1),
    ];
    const referenceError = references.find((item) => item.error)?.error;
    if (referenceError) return fail(referenceError.message, 500);
    if (references.some((item) => (item.data || []).length > 0)) {
      return fail(`Lot ${lotResult.data.lot_number} sudah pernah dipakai pada data operasional, sehingga tidak aman untuk dihapus.`);
    }

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
      await supabase.from("vaccination_session_vaccines").select("id").eq("vaccine_id", id).limit(1),
    ];
    const referenceError = references.find((item) => item.error)?.error;
    if (referenceError) return fail(referenceError.message, 500);
    if (references.some((item) => (item.data || []).length > 0)) {
      return fail(`Produk ${vaccineResult.data.name} sudah pernah dipakai pada registrasi/session/administrasi, sehingga tidak aman untuk dihapus.`);
    }

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

    if (!vaccineId) return fail("Master vaksin / produk wajib dipilih.");
    if (!sessionId) return fail("Session / Lokasi wajib dipilih.");

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
          active: true,
          updated_at: nowIso,
        },
        { onConflict: "session_id,vaccine_id,service_mode" },
      )
      .select("id,session_id,vaccine_id,service_mode,active,created_at,updated_at")
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
        dose_count: Math.max(1, toInt(body.doseCount, 1)),
        default_next_dose_days: body.defaultNextDoseDays === "" || body.defaultNextDoseDays == null ? null : toInt(body.defaultNextDoseDays, 0),
        active: body.active !== false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (result.error) return fail(result.error.message, 500);
    return ok({ message: "Master vaksin berhasil diperbarui.", vaccine: result.data });
  }

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

    let ownership: Record<string, any>;
    try {
      ownership = await stockOwnershipFromBody(supabase, body);
    } catch (error: any) {
      return fail(error?.message || "Scope stok tidak valid.");
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
    const movements = [];
    const initialQty = Math.max(0, toInt(body.stockInitial, 0));
    const addedQty = Math.max(0, toInt(body.stockAdded, 0));
    if (initialQty) movements.push({ vaccine_id: vaccineId, lot_id: result.data.id, movement_type: "initial", qty: initialQty, reference_type: "vaccine_lot", reference_id: result.data.id, notes: "Jumlah awal lot", created_by: createdBy });
    if (addedQty) movements.push({ vaccine_id: vaccineId, lot_id: result.data.id, movement_type: "stock_in", qty: addedQty, reference_type: "vaccine_lot", reference_id: result.data.id, notes: clean(body.inventoryNotes) || "Tambahan stok", created_by: createdBy });
    if (movements.length) await supabase.from("vaccination_inventory_movements").insert(movements);

    return ok({ message: "Lot number berhasil dibuat.", lot: result.data });
  }

  if (action === "update-lot-details") {
    const lotId = toInt(body.lotId || body.id, 0);
    const lotNumber = clean(body.lotNumber);
    if (!lotId) return fail("Lot wajib dipilih.");
    if (!lotNumber) return fail("Lot Number wajib diisi.");

    const beforeResult = await supabase
      .from("vaccination_vaccine_lots")
      .select("id,vaccine_id,stock_added,stock_scope,stock_company_name,stock_session_id")
      .eq("id", lotId)
      .maybeSingle();

    if (beforeResult.error) return fail(beforeResult.error.message, 500);
    if (!beforeResult.data) return fail("Lot tidak ditemukan.", 404);

    const beforeAdded = Number(beforeResult.data.stock_added || 0);
    const nextAdded = Math.max(0, toInt(body.stockAdded, beforeAdded));

    let ownership: Record<string, any>;
    try {
      ownership = await stockOwnershipFromBody(supabase, body, beforeResult.data);
    } catch (error: any) {
      return fail(error?.message || "Scope stok tidak valid.");
    }

    const result = await supabase
      .from("vaccination_vaccine_lots")
      .update({
        lot_number: lotNumber,
        expiry_date: clean(body.expiryDate) || null,
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

    const delta = nextAdded - beforeAdded;
    if (delta !== 0) {
      await supabase.from("vaccination_inventory_movements").insert({
        vaccine_id: beforeResult.data.vaccine_id || result.data.vaccine_id,
        lot_id: lotId,
        movement_type: delta > 0 ? "stock_in" : "adjustment_minus",
        qty: delta,
        reference_type: "vaccine_lot",
        reference_id: lotId,
        notes: clean(body.inventoryNotes) || "Update detail lot",
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
