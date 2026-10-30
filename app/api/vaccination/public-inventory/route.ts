import { NextRequest, NextResponse } from "next/server";
import { buildVaccinationInventoryReport } from "@/lib/vaccination/inventoryReport";
import { buildVaccinationInventorySnapshot } from "@/lib/vaccination/inventorySnapshot";
import { verifyVaccinationInventoryPublicToken } from "@/lib/vaccination/inventoryPublicPortal";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";

// V522_PUBLIC_INVENTORY_SAFE_ARCHIVE
// V518_INVENTORY_INITIAL_STOCK_BUCKET_SYNC_PAYMENT_METHOD

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toInt(value: any, fallback = 0) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) ? number : fallback;
}

function ids(value: string | null) {
  return String(value || "").split(",").map(Number).filter(Boolean);
}

function csv(value: any) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function normalized(value: any) {
  return clean(value).toLowerCase();
}

function normalizeCompanyName(value: any) {
  return normalized(value).replace(/\s+/g, " ");
}

function normalizeServiceMode(value: any) {
  return clean(value).toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
}

function sanitizeStockScope(value: any) {
  const normalizedScope = clean(value).toUpperCase();
  if (normalizedScope === "SESSION") return "SESSION";
  if (normalizedScope === "COMPANY") return "COMPANY";
  return "GENERAL";
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function ok(payload: any = {}) {
  return NextResponse.json({ ok: true, ...payload }, { headers: { "Cache-Control": "no-store" } });
}

function tokenFromRequest(req: NextRequest, body?: any) {
  return clean(body?.token || req.nextUrl.searchParams.get("token"));
}

function filterDetailRows(rows: any[], req: NextRequest) {
  const company = normalized(req.nextUrl.searchParams.get("company"));
  const session = normalized(req.nextUrl.searchParams.get("session"));
  const service = clean(req.nextUrl.searchParams.get("service_mode")).toUpperCase();
  const q = normalized(req.nextUrl.searchParams.get("q"));

  return (rows || []).filter((row: any) => {
    if (company && normalized(row?.company) !== company) return false;
    if (session && normalized(row?.session) !== session && normalized(row?.location) !== session) return false;
    if (service && service !== "ALL" && clean(row?.service_mode).toUpperCase() !== service) return false;
    if (q) {
      const haystack = normalized([
        row?.vaccine,
        row?.brand,
        row?.lot,
        row?.participant,
        row?.employee_id,
        row?.mcu_id,
        row?.company,
        row?.session,
        row?.location,
        row?.movement_type,
        row?.sale_mode,
      ].filter(Boolean).join(" "));
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function detailSummary(rows: any[]) {
  const participantRows = rows.filter((row: any) => clean(row?.movement_type).toLowerCase().startsWith("terpakai") && clean(row?.participant));
  return {
    rows: rows.length,
    participantRows: participantRows.length,
    healthday: participantRows.filter((row: any) => clean(row?.service_mode).toUpperCase() === "HEALTHDAY").length,
    bazar: participantRows.filter((row: any) => clean(row?.service_mode).toUpperCase() === "BAZAR").length,
    package: participantRows.filter((row: any) => clean(row?.sale_mode).toUpperCase() === "PACKAGE").length,
    nonPackage: participantRows.filter((row: any) => clean(row?.sale_mode).toUpperCase() === "NON_PACKAGE").length,
  };
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  try {
    if (!verifyVaccinationInventoryPublicToken(token)) {
      return fail("Link Portal Inventory tidak valid.", 403);
    }

    const action = clean(req.nextUrl.searchParams.get("action") || "snapshot").toLowerCase();
    if (action === "snapshot") {
      const payload = await buildVaccinationInventorySnapshot();
      return ok({ operational: true, capabilities: ["view", "filter", "movement-detail", "export", "add-stock", "remove-stock", "transfer-stock", "archive-lot"], ...payload });
    }

    const report = await buildVaccinationInventoryReport({
      vaccineIds: ids(req.nextUrl.searchParams.get("vaccine_ids")),
      lotIds: ids(req.nextUrl.searchParams.get("lot_ids") || req.nextUrl.searchParams.get("lot_id")),
      from: req.nextUrl.searchParams.get("from") || "",
      to: req.nextUrl.searchParams.get("to") || "",
    });
    const details = filterDetailRows(report.details || [], req);

    if (action === "export") {
      const headers = [
        "TANGGAL",
        "ARAH",
        "TIPE",
        "PERUSAHAAN_SUMBER_TUJUAN",
        "NAMA_PESERTA",
        "EMPLOYEE_ID",
        "MCU_ID",
        "SESSION",
        "LOKASI",
        "VAKSIN",
        "BRAND",
        "LOT",
        "LAYANAN",
        "JENIS_HARGA",
        "DOSIS_PAKET",
        "HARGA_SNAPSHOT",
        "PAYMENT_METHOD",
        "DOSE",
        "DOKTER_PETUGAS",
        "QTY",
        "PRINT_STATUS",
        "VALIDATION_STATUS",
        "REFERENSI",
        "CATATAN",
      ];
      const lines = [headers.join(",")];
      for (const row of details) {
        lines.push([
          row.date,
          row.direction,
          row.movement_type,
          row.company,
          row.participant,
          row.employee_id,
          row.mcu_id,
          row.session,
          row.location,
          row.vaccine,
          row.brand,
          row.lot,
          row.service_mode || "",
          row.sale_mode || "",
          row.package_dose_count || "",
          row.sales_price_snapshot ?? "",
          row.payment_method || "",
          row.dose,
          row.doctor,
          row.qty,
          row.print_status,
          row.validation_status,
          row.reference,
          row.note,
        ].map(csv).join(","));
      }
      const body = "\ufeff" + lines.join("\r\n");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="vaccination_inventory_public_${stamp}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (action !== "report") {
      return fail("Action tidak dikenali.", 400);
    }

    return ok({
      operational: true,
      filters: report.filters,
      products: report.products,
      summary: detailSummary(details),
      lotSummaries: report.lotSummaries,
      details,
    });
  } catch (error: any) {
    return fail(error?.message || "Portal Inventory gagal memuat data.", 500);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = tokenFromRequest(req, body);
  if (!verifyVaccinationInventoryPublicToken(token)) {
    return fail("Link Portal Inventory tidak valid atau sudah tidak berlaku.", 403);
  }

  const action = clean(body?.action).toLowerCase();
  const supabase = getSupabaseAdmin();
  const createdBy = "Public Inventory Portal";

  try {
    if (action === "stock-transaction") {
      const lotId = toInt(body?.lotId || body?.id, 0);
      const stockAction = clean(body?.stockAction).toUpperCase();
      const quantity = Math.max(0, toInt(body?.quantity, 0));
      const note = clean(body?.inventoryNotes || body?.notes);
      const sourceSessionId = toInt(body?.sessionId || body?.sourceSessionId, 0);
      const sourceServiceMode = clean(body?.serviceMode || body?.sourceServiceMode).toUpperCase() === "BAZAR"
        ? "BAZAR"
        : "HEALTHDAY";

      if (!lotId) return fail("Lot wajib dipilih.");
      if (!["SET_INITIAL_STOCK", "ADD_STOCK", "RETURN_STOCK", "REMOVE_STOCK"].includes(stockAction)) {
        return fail("Pilih aksi Stok Awal, Tambah Stok, Return Stok, atau Kurangi Stok.");
      }
      if (!quantity) return fail("Jumlah stok wajib lebih dari 0.");
      if (!sourceSessionId) {
        return fail("Pilih Session/Lokasi terlebih dahulu agar Alokasi, Terpakai, dan Sisa tercatat pada bucket yang benar.", 400);
      }

      const [lotResult, recordsResult, movementsResult, sessionResult, allocationResult, usedItemsResult] = await Promise.all([
        supabase
          .from("vaccination_vaccine_lots")
          .select("id,vaccine_id,lot_number,stock_initial,stock_added,stock_used,stock_physical_count,inventory_notes")
          .eq("id", lotId)
          .maybeSingle(),
        supabase
          .from("vaccination_records")
          .select("id,status")
          .eq("lot_id", lotId)
          .neq("status", "VOIDED")
          .limit(20000),
        supabase
          .from("vaccination_inventory_movements")
          .select("id,movement_type,qty")
          .eq("lot_id", lotId)
          .limit(20000),
        supabase
          .from("vaccination_sessions")
          .select("id,session_name,company_name,location,status")
          .eq("id", sourceSessionId)
          .maybeSingle(),
        supabase
          .from("vaccination_session_stock_allocations")
          .select("*")
          .eq("session_id", sourceSessionId)
          .eq("lot_id", lotId)
          .eq("service_mode", sourceServiceMode)
          .maybeSingle(),
        supabase
          .from("vaccination_registration_items")
          .select("id,status")
          .eq("session_id", sourceSessionId)
          .eq("lot_id", lotId)
          .eq("service_mode", sourceServiceMode)
          .eq("active", true)
          .in("status", ["ADMINISTERED", "DONE", "FINISHED"])
          .limit(20000),
      ]);

      if (lotResult.error) return fail(lotResult.error.message, 500);
      if (!lotResult.data) return fail("Lot tidak ditemukan.", 404);
      if (recordsResult.error) return fail(recordsResult.error.message, 500);
      if (movementsResult.error) return fail(movementsResult.error.message, 500);
      if (sessionResult.error) return fail(sessionResult.error.message, 500);
      if (!sessionResult.data) return fail("Session/Lokasi tidak ditemukan.", 404);
      if (allocationResult.error && String(allocationResult.error.code || "") !== "PGRST116") return fail(allocationResult.error.message, 500);
      if (usedItemsResult.error) return fail(usedItemsResult.error.message, 500);

      const lot = lotResult.data as any;
      const inboundTypes = new Set(["STOCK_IN", "IN", "ADD", "ADDED", "RESTOCK", "RETURN_STOCK", "STOCK_RETURN", "RETURN_IN", "ADJUSTMENT_IN"]);
      const adjustmentOutTypes = new Set(["STOCK_OUT_ADJUSTMENT", "ADJUSTMENT_OUT", "MANUAL_STOCK_OUT", "STOCK_REDUCTION"]);
      const movementAdded = (movementsResult.data || []).reduce((sum: number, movement: any) => {
        const type = clean(movement?.movement_type).toUpperCase();
        return inboundTypes.has(type) ? sum + Math.abs(Number(movement?.qty || 0)) : sum;
      }, 0);
      const movementOut = (movementsResult.data || []).reduce((sum: number, movement: any) => {
        const type = clean(movement?.movement_type).toUpperCase();
        return adjustmentOutTypes.has(type) ? sum + Math.abs(Number(movement?.qty || 0)) : sum;
      }, 0);
      const initial = Number(lot.stock_initial || 0);
      const beforeAdded = Math.max(Number(lot.stock_added || 0), movementAdded);
      const used = Math.max(Number(lot.stock_used || 0), (recordsResult.data || []).length);
      const beforeRemaining = initial + beforeAdded - used - movementOut;
      const isInitial = stockAction === "SET_INITIAL_STOCK";
      const isRemove = stockAction === "REMOVE_STOCK";

      if (isInitial && initial > 0) {
        return fail(`Stok awal Lot ${lot.lot_number || lotId} sudah ${initial}. Gunakan Tambah Stok atau Kurangi Stok agar histori tidak berubah.`, 409);
      }
      if (isRemove && quantity > beforeRemaining) {
        return fail(`Stok tidak cukup. Sisa saat ini ${beforeRemaining}, tidak bisa dikurangi ${quantity}.`, 409);
      }

      const nextInitial = isInitial ? quantity : initial;
      const nextAdded = isRemove || isInitial ? beforeAdded : beforeAdded + quantity;
      const nextMovementOut = movementOut + (isRemove ? quantity : 0);
      const nextRemaining = nextInitial + nextAdded - used - nextMovementOut;
      if (nextRemaining < 0) return fail("Sisa stok tidak boleh negatif.", 409);

      const physicalBefore = lot.stock_physical_count === null || lot.stock_physical_count === undefined
        ? null
        : Number(lot.stock_physical_count);
      const physicalAfter = physicalBefore === null
        ? nextRemaining
        : isRemove
          ? Math.max(0, physicalBefore - quantity)
          : physicalBefore + quantity;
      const label = isInitial
        ? "Stok Awal"
        : isRemove
          ? "Kurangi Stok"
          : stockAction === "RETURN_STOCK"
            ? "Return Stok"
            : "Tambah Stok";
      const nextNotes = `[Portal Inventory] ${label} · ${clean(sessionResult.data.location) || clean(sessionResult.data.session_name) || `Session ${sourceSessionId}`} · ${sourceServiceMode} · ${note || "-"}`;

      const previousAllocation = allocationResult.data || null;
      const allocatedBefore = Math.max(0, Number(previousAllocation?.allocated_qty || 0));
      const usedInBucket = (usedItemsResult.data || []).length;
      const allocatedAfter = isRemove
        ? Math.max(usedInBucket, allocatedBefore - quantity)
        : allocatedBefore + quantity;

      const updateResult = await supabase
        .from("vaccination_vaccine_lots")
        .update({
          stock_initial: nextInitial,
          stock_added: nextAdded,
          stock_physical_count: physicalAfter,
          inventory_notes: nextNotes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lotId)
        .select("*")
        .single();
      if (updateResult.error) return fail(updateResult.error.message, 500);

      const allocationWrite = await supabase
        .from("vaccination_session_stock_allocations")
        .upsert({
          session_id: sourceSessionId,
          vaccine_id: lot.vaccine_id,
          lot_id: lotId,
          allocated_qty: allocatedAfter,
          low_stock_threshold: Math.min(5, Math.max(0, allocatedAfter - usedInBucket)),
          dedicated: true,
          active: true,
          service_mode: sourceServiceMode,
          notes: `[Portal Inventory] ${label}`,
          updated_at: new Date().toISOString(),
        }, { onConflict: "session_id,lot_id,service_mode" });
      if (allocationWrite.error) {
        await supabase.from("vaccination_vaccine_lots").update({
          stock_initial: initial,
          stock_added: beforeAdded,
          stock_physical_count: lot.stock_physical_count,
          inventory_notes: lot.inventory_notes,
          updated_at: new Date().toISOString(),
        }).eq("id", lotId);
        return fail(allocationWrite.error.message, 500);
      }

      const movementResult = await supabase.from("vaccination_inventory_movements").insert({
        vaccine_id: lot.vaccine_id,
        lot_id: lotId,
        movement_type: isInitial ? "initial" : isRemove ? "adjustment_out" : stockAction === "RETURN_STOCK" ? "return_stock" : "stock_in",
        qty: quantity,
        reference_type: isInitial ? "public_inventory_initial" : isRemove ? "public_inventory_adjustment_out" : "public_inventory_system",
        reference_id: lotId,
        notes: nextNotes,
        created_by: createdBy,
      });
      if (movementResult.error) {
        await supabase
          .from("vaccination_vaccine_lots")
          .update({
            stock_initial: initial,
            stock_added: beforeAdded,
            stock_physical_count: lot.stock_physical_count,
            inventory_notes: lot.inventory_notes,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lotId);
        if (previousAllocation) {
          await supabase.from("vaccination_session_stock_allocations").upsert(previousAllocation, { onConflict: "session_id,lot_id,service_mode" });
        } else {
          await supabase.from("vaccination_session_stock_allocations")
            .delete()
            .eq("session_id", sourceSessionId)
            .eq("lot_id", lotId)
            .eq("service_mode", sourceServiceMode);
        }
        return fail(movementResult.error.message, 500);
      }

      return ok({
        message: `${label} ${quantity} berhasil untuk ${sourceServiceMode === "BAZAR" ? "Bazar" : "Healthday"}. Sisa stok ${nextRemaining}.`,
        stockSystemRemaining: nextRemaining,
        stockPhysicalCount: physicalAfter,
        allocation: { sessionId: sourceSessionId, serviceMode: sourceServiceMode, allocatedQty: allocatedAfter, usedQty: usedInBucket },
      });
    }

    if (action === "archive-lot") {
      const primaryLotId = toInt(body?.lotId || body?.id, 0);
      const reason = clean(body?.reason);
      if (!primaryLotId) return fail("Lot wajib dipilih.");
      if (!reason) return fail("Alasan hapus wajib diisi.");

      const snapshot = await buildVaccinationInventorySnapshot();
      const canonicalRow = (snapshot.rows || []).find((row: any) => {
        const ids = Array.isArray(row?.source_lot_ids) && row.source_lot_ids.length
          ? row.source_lot_ids.map(Number)
          : [Number(row?.id || 0)];
        return ids.includes(primaryLotId);
      });
      if (!canonicalRow) return fail("Produk/Lot tidak ditemukan pada Inventory aktif.", 404);

      const remaining = Number(canonicalRow?.stock_system_remaining || 0);
      if (remaining !== 0) {
        return fail(`Produk/Lot masih memiliki Sisa Sistem ${remaining}. Kurangi atau transfer stok sampai 0 sebelum dihapus dari Inventory.`, 409);
      }

      const lotIds = Array.from(new Set<number>(
        (Array.isArray(canonicalRow?.source_lot_ids) && canonicalRow.source_lot_ids.length
          ? canonicalRow.source_lot_ids
          : [canonicalRow?.id])
          .map(Number)
          .filter((id: number) => id > 0),
      ));
      if (!lotIds.length) return fail("Lot tidak ditemukan.", 404);

      const [lotsResult, allocationsResult] = await Promise.all([
        supabase
          .from("vaccination_vaccine_lots")
          .select("id,vaccine_id,lot_number,active")
          .in("id", lotIds),
        supabase
          .from("vaccination_session_stock_allocations")
          .select("id,lot_id,active")
          .in("lot_id", lotIds)
          .eq("active", true),
      ]);
      if (lotsResult.error) return fail(lotsResult.error.message, 500);
      if (allocationsResult.error) return fail(allocationsResult.error.message, 500);
      if (!(lotsResult.data || []).length) return fail("Lot tidak ditemukan.", 404);

      const lotUpdate = await supabase
        .from("vaccination_vaccine_lots")
        .update({ active: false, updated_at: new Date().toISOString() })
        .in("id", lotIds);
      if (lotUpdate.error) return fail(lotUpdate.error.message, 500);

      const allocationIds = (allocationsResult.data || []).map((row: any) => Number(row?.id || 0)).filter(Boolean);
      if (allocationIds.length) {
        const allocationUpdate = await supabase
          .from("vaccination_session_stock_allocations")
          .update({ active: false, updated_at: new Date().toISOString() })
          .in("id", allocationIds);
        if (allocationUpdate.error) {
          await supabase.from("vaccination_vaccine_lots").update({ active: true, updated_at: new Date().toISOString() }).in("id", lotIds);
          return fail(allocationUpdate.error.message, 500);
        }
      }

      const note = `[Portal Inventory] Hapus dari Inventory aktif · ${reason}`;
      const movementRows = (lotsResult.data || []).map((lot: any) => ({
        vaccine_id: Number(lot?.vaccine_id || 0),
        lot_id: Number(lot?.id || 0),
        movement_type: "inventory_archive",
        qty: 0,
        reference_type: "public_inventory_archive",
        reference_id: Number(lot?.id || 0),
        notes: note,
        created_by: createdBy,
      }));
      const movementResult = movementRows.length
        ? await supabase.from("vaccination_inventory_movements").insert(movementRows)
        : { error: null };
      if (movementResult.error) {
        await supabase.from("vaccination_vaccine_lots").update({ active: true, updated_at: new Date().toISOString() }).in("id", lotIds);
        if (allocationIds.length) {
          await supabase.from("vaccination_session_stock_allocations").update({ active: true, updated_at: new Date().toISOString() }).in("id", allocationIds);
        }
        return fail(`Hapus dibatalkan karena audit gagal disimpan: ${movementResult.error.message}`, 500);
      }

      return ok({
        message: `${clean(canonicalRow?.vaccine?.name) || "Produk"} · Lot ${clean(canonicalRow?.lot_number) || "-"} berhasil dihapus dari Inventory aktif. Riwayat transaksi tetap tersimpan.`,
        archivedLotIds: lotIds,
      });
    }

    if (action === "transfer-stock") {
      const lotId = toInt(body?.lotId || body?.id, 0);
      const targetCompanyName = clean(body?.targetCompanyName);
      const targetSessionId = toInt(body?.targetSessionId, 0);
      const targetServiceMode = normalizeServiceMode(body?.targetServiceMode || body?.serviceMode);

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
      if (!canonicalCompany) return fail("Session tujuan belum memiliki perusahaan.", 409);
      if (normalizeCompanyName(targetCompanyName) !== normalizeCompanyName(canonicalCompany)) {
        return fail(`Session yang dipilih milik ${canonicalCompany}, bukan ${targetCompanyName}.`, 409);
      }
      if (clean(targetSession.status).toUpperCase() === "CANCELLED") {
        return fail("Session tujuan sudah dibatalkan.", 409);
      }

      const lot = lotResult.data as any;
      if (sanitizeStockScope(lot.stock_scope) === "SESSION" && Number(lot.stock_session_id || 0) === targetSessionId) {
        return fail("Lot ini sudah dimiliki oleh Session tujuan tersebut.", 409);
      }

      const activeRecordCount = (recordsResult.data || []).filter((row: any) =>
        !["CANCELLED", "CANCELED", "VOID", "VOIDED", "BATAL"].includes(clean(row?.status).toUpperCase()),
      ).length;
      const adjustmentOutTypes = new Set(["STOCK_OUT_ADJUSTMENT", "ADJUSTMENT_OUT", "MANUAL_STOCK_OUT", "STOCK_REDUCTION"]);
      const adjustmentOut = (movementsResult.data || []).reduce((sum: number, movement: any) => {
        const type = clean(movement?.movement_type).toUpperCase();
        return adjustmentOutTypes.has(type) ? sum + Math.abs(Number(movement?.qty || 0)) : sum;
      }, 0);
      const used = Math.max(Number(lot.stock_used || 0), activeRecordCount);
      const remaining = Number(lot.stock_initial || 0) + Number(lot.stock_added || 0) - used - adjustmentOut;
      if (remaining <= 0) return fail("Tidak ada sisa stok yang dapat ditransfer.", 409);

      const previousOwnership = {
        stock_scope: sanitizeStockScope(lot.stock_scope),
        stock_company_name: lot.stock_company_name ?? null,
        stock_session_id: lot.stock_session_id ?? null,
      };
      const previousAllocationResult = await supabase
        .from("vaccination_session_stock_allocations")
        .select("*")
        .eq("lot_id", lotId)
        .eq("active", true)
        .limit(100);
      if (previousAllocationResult.error) return fail(previousAllocationResult.error.message, 500);

      const targetLabel = [
        clean(targetSession.session_name),
        clean(targetSession.location),
        clean(targetSession.session_date),
      ].filter(Boolean).join(" · ");
      const sourceOwner = previousOwnership.stock_scope === "SESSION"
        ? `${clean(previousOwnership.stock_company_name) || "Perusahaan"} · Session ${previousOwnership.stock_session_id || "-"}`
        : previousOwnership.stock_scope === "COMPANY"
          ? clean(previousOwnership.stock_company_name) || "Perusahaan"
          : "Global";

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

      const deactivateResult = await supabase
        .from("vaccination_session_stock_allocations")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("lot_id", lotId)
        .eq("active", true);
      if (deactivateResult.error) {
        await supabase.from("vaccination_vaccine_lots").update({ ...previousOwnership, updated_at: new Date().toISOString() }).eq("id", lotId);
        return fail(deactivateResult.error.message, 500);
      }

      const targetAllocationResult = await supabase
        .from("vaccination_session_stock_allocations")
        .upsert({
          session_id: Number(targetSession.id),
          vaccine_id: Number(lot.vaccine_id),
          lot_id: lotId,
          allocated_qty: remaining,
          low_stock_threshold: Math.min(5, remaining),
          dedicated: true,
          active: true,
          service_mode: targetServiceMode,
          notes: `[Portal Inventory] Transfer sisa stok ke ${targetServiceMode === "BAZAR" ? "Bazar" : "Healthday"}`,
          created_by: createdBy,
          updated_at: new Date().toISOString(),
        }, { onConflict: "session_id,lot_id,service_mode" })
        .select("*")
        .single();

      if (targetAllocationResult.error) {
        await supabase.from("vaccination_vaccine_lots").update({ ...previousOwnership, updated_at: new Date().toISOString() }).eq("id", lotId);
        if ((previousAllocationResult.data || []).length) {
          await supabase.from("vaccination_session_stock_allocations").upsert(previousAllocationResult.data, { onConflict: "session_id,lot_id,service_mode" });
        }
        return fail(targetAllocationResult.error.message, 500);
      }

      const note = `[Portal Inventory] Transfer sisa stok ${remaining} · ${sourceOwner} -> ${canonicalCompany} · ${targetLabel || `Session ${targetSession.id}`} · ${targetServiceMode}`;
      const movementResult = await supabase.from("vaccination_inventory_movements").insert({
        vaccine_id: lot.vaccine_id,
        lot_id: lotId,
        movement_type: "stock_transfer",
        qty: remaining,
        reference_type: "public_inventory_transfer_session",
        reference_id: Number(targetSession.id),
        notes: note,
        created_by: createdBy,
      });

      if (movementResult.error) {
        await supabase.from("vaccination_vaccine_lots").update({ ...previousOwnership, updated_at: new Date().toISOString() }).eq("id", lotId);
        await supabase.from("vaccination_session_stock_allocations").update({ active: false, updated_at: new Date().toISOString() }).eq("lot_id", lotId);
        if ((previousAllocationResult.data || []).length) {
          await supabase.from("vaccination_session_stock_allocations").upsert(previousAllocationResult.data, { onConflict: "session_id,lot_id,service_mode" });
        }
        return fail(movementResult.error.message, 500);
      }

      return ok({
        message: `Sisa stok ${remaining} Lot ${lot.lot_number} berhasil ditransfer ke ${canonicalCompany} · ${clean(targetSession.location) || clean(targetSession.session_name) || `Session ${targetSession.id}`} · ${targetServiceMode === "BAZAR" ? "Bazar" : "Healthday"}.`,
        transferredQty: remaining,
      });
    }

    return fail("Action Portal Inventory tidak dikenali.", 400);
  } catch (error: any) {
    return fail(error?.message || "Aksi Portal Inventory gagal.", 500);
  }
}
