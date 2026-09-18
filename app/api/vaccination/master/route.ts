import { NextRequest } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";

// VACCINATION_ROLE_GUARD_V150
// V153_21_MASTER_ROW_EDIT_DELETE_SAFE
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
    for (const row of normalizedRows) {
      if (!grouped.has(row.externalProductKey)) grouped.set(row.externalProductKey, []);
      grouped.get(row.externalProductKey)!.push(row);
    }

    const importedAt = new Date().toISOString();
    const createdBy = (user as any).email || (user as any).name || (user as any).id || "system";

    let createdVaccines = 0;
    let mappedProducts = 0;
    let createdLots = 0;
    let updatedLots = 0;

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
        const existingLot = lotsByKey.get(lotKey);
        const physicalCount = Math.max(0, Number(item.availableQuantity || 0));

        if (existingLot) {
          const updateResult = await supabase
            .from("vaccination_vaccine_lots")
            .update({
              stock_physical_count: physicalCount,
              active: true,
              updated_at: importedAt,
            })
            .eq("id", existingLot.id)
            .select("*")
            .single();

          if (updateResult.error) return fail(updateResult.error.message, 500);
          lotsByKey.set(lotKey, updateResult.data);
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
              inventory_notes: `Import ${PRODUCT_SOURCE} · ${Array.from(item.locations).join(", ")}`,
              stock_used: 0,
              active: true,
            })
            .select("*")
            .single();

          if (insertResult.error) return fail(insertResult.error.message, 500);
          lotsByKey.set(lotKey, insertResult.data);
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
      message: `Import produk & lot selesai. Mapping: ${mappedProducts}, master vaksin baru: ${createdVaccines}, lot baru: ${createdLots}, lot diperbarui: ${updatedLots}.`,
      imported: {
        mappedProducts,
        createdVaccines,
        createdLots,
        updatedLots,
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

  if (action === "update-lot-details") {
    const lotId = toInt(body.lotId || body.id, 0);
    const lotNumber = clean(body.lotNumber);
    if (!lotId) return fail("Lot wajib dipilih.");
    if (!lotNumber) return fail("Lot Number wajib diisi.");

    const beforeResult = await supabase
      .from("vaccination_vaccine_lots")
      .select("id,vaccine_id,stock_added")
      .eq("id", lotId)
      .maybeSingle();

    if (beforeResult.error) return fail(beforeResult.error.message, 500);
    if (!beforeResult.data) return fail("Lot tidak ditemukan.", 404);

    const beforeAdded = Number(beforeResult.data.stock_added || 0);
    const nextAdded = Math.max(0, toInt(body.stockAdded, beforeAdded));

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
