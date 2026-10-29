"use client";

// V504_EDIT_LOT_PRODUCT_FIELDS_ACTIVE_SAFE_DETACH
// V507_PRICING_LINK
// V503_MASTER_SAVE_RESET_AND_EDIT_ISOLATION

// V498_PRODUCT_LIST_FILTER
// V499_SESSION_PRODUCT_ASSIGNMENT_WITHOUT_LOT
// V501_PLANNED_INITIAL_STOCK_AND_SERVICE_FILTER
// V502_ISERVE_BATCH_EXPORT_AND_STOCK_TRANSACTION_AUDIT

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

// V153_21_MASTER_ROW_EDIT_DELETE_SAFE
// V496_MASTER_LOT_STOCK_TRANSFER_SAFE
// V497_SESSION_SERVICE_STOCK_SPLIT_SAFE
// V497_R3_SELECTOR_BASED_SERVICE_STOCK_UI
// VACCINATION_SESSION_STOCK_OWNERSHIP_V2
// VACCINATION_COMPANY_STOCK_OWNERSHIP_V1
// V153_18_PRODUCT_LOT_IMPORT_MAPPING_SAFE
type StockImportRow = {
  externalProductKey: string;
  externalProductCode: string;
  externalProductName: string;
  externalProductLabel: string;
  sourceLocation: string;
  lotNumber: string;
  availableQuantity: number;
};

function money(value: any) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function cleanText(value: any) {
  return String(value ?? "").trim();
}

function normalizeName(value: any) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeCompany(value: any) {
  return cleanText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function lotScope(lot: any) {
  const scope = cleanText(lot?.stock_scope).toUpperCase();
  if (scope === "SESSION") return "SESSION";
  if (scope === "COMPANY") return "COMPANY";
  return "GENERAL";
}

function sessionLabel(session: any) {
  if (!session) return "-";
  const parts = [
    cleanText(session.session_name),
    cleanText(session.location),
    cleanText(session.session_date),
  ].filter(Boolean);
  return parts.join(" · ") || `Session ${session.id || ""}`;
}

function parseQuantity(value: any) {
  const text = cleanText(value).replace(/,/g, "");
  const number = Number(text);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function parseProductLabel(value: string) {
  const text = cleanText(value);
  const match = text.match(/^\[([^\]]+)\]\s*(.+)$/);
  const code = cleanText(match?.[1]);
  const name = cleanText(match?.[2]) || text;
  const key = code ? code.toLowerCase() : normalizeName(text);
  return { code, name, key, label: text };
}

export default function VaccinationMasterPage() {
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [productMappings, setProductMappings] = useState<any[]>([]);
  const [companySources, setCompanySources] = useState<any[]>([]);
  const [stockSessions, setStockSessions] = useState<any[]>([]);
  const [serviceStockAllocations, setServiceStockAllocations] = useState<any[]>([]);
  const [sessionProductAssignments, setSessionProductAssignments] = useState<any[]>([]);
  const [sessionProductAssignmentReady, setSessionProductAssignmentReady] = useState(true);
  const [sessionProductAssignmentMessage, setSessionProductAssignmentMessage] = useState("");
  const [serviceStockReady, setServiceStockReady] = useState(true);
  const [serviceStockMessage, setServiceStockMessage] = useState("");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [stockSessionFilter, setStockSessionFilter] = useState("ALL");
  const [productSearch, setProductSearch] = useState("");
  const [productStatusFilter, setProductStatusFilter] = useState("ALL");
  const [productServiceFilter, setProductServiceFilter] = useState("ALL");
  const [companyStockReady, setCompanyStockReady] = useState(true);
  const [companyStockMessage, setCompanyStockMessage] = useState("");
  const [mappingReady, setMappingReady] = useState(true);
  const [mappingMessage, setMappingMessage] = useState("");
  const [message, setMessage] = useState("Buat master vaksin, harga produk, dan lot number.");
  const [error, setError] = useState("");
  const [importRows, setImportRows] = useState<StockImportRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importMappingSelections, setImportMappingSelections] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [selectedImportProductKey, setSelectedImportProductKey] = useState("");
  const [selectedMasterVaccineId, setSelectedMasterVaccineId] = useState("");
  const [masterEditMode, setMasterEditMode] = useState<"CREATE" | "PRODUCT" | "LOT">("CREATE");
  const [editingLotId, setEditingLotId] = useState("");
  const [editingMappingId, setEditingMappingId] = useState("");
  const [editingMappingVaccineId, setEditingMappingVaccineId] = useState("");
  const [transferLot, setTransferLot] = useState<any | null>(null);
  const [transferCompanyName, setTransferCompanyName] = useState("");
  const [transferSessionId, setTransferSessionId] = useState("");
  const [transferServiceMode, setTransferServiceMode] = useState<"HEALTHDAY" | "BAZAR">("HEALTHDAY");
  const [transferringStock, setTransferringStock] = useState(false);
  const [serviceStockEditorMode, setServiceStockEditorMode] = useState<"HEALTHDAY" | "BAZAR">("HEALTHDAY");
  const [serviceStockEditorLotId, setServiceStockEditorLotId] = useState("");
  const [serviceStockEditorQty, setServiceStockEditorQty] = useState(0);
  const [savingServiceStock, setSavingServiceStock] = useState(false);
  const [transactionProduct, setTransactionProduct] = useState<any | null>(null);
  const [stockTransactionLoading, setStockTransactionLoading] = useState(false);
  const [stockTransactionError, setStockTransactionError] = useState("");
  const [stockTransactionData, setStockTransactionData] = useState<{
    usage: any[];
    movements: any[];
    summary?: any;
  }>({ usage: [], movements: [] });
  const [vaccineForm, setVaccineForm] = useState({
    name: "",
    brand: "",
    description: "",
    priceCategory: "Harga Perusahaan",
    price: "",
    doseCount: 1,
    defaultNextDoseDays: "",
  });
  const [lotForm, setLotForm] = useState({
    vaccineId: "",
    lotNumber: "",
    expiryDate: "",
    stockInitial: 0,
    stockAdded: 0,
    stockPhysicalCount: "",
    inventoryNotes: "",
    stockScope: "GENERAL",
    stockCompanyName: "",
    stockSessionId: "",
    healthdayStockQty: 0,
    bazarStockQty: 0,
  });

  function resetProductLotEditor() {
    setSelectedImportProductKey("");
    setSelectedMasterVaccineId("");
    setMasterEditMode("CREATE");
    setEditingLotId("");
    setVaccineForm({
      name: "",
      brand: "",
      description: "",
      priceCategory: "Harga Perusahaan",
      price: "",
      doseCount: 1,
      defaultNextDoseDays: "",
    });
    setLotForm({
      vaccineId: "",
      lotNumber: "",
      expiryDate: "",
      stockInitial: 0,
      stockAdded: 0,
      stockPhysicalCount: "",
      inventoryNotes: "",
      stockScope: "GENERAL",
      stockCompanyName: "",
      stockSessionId: "",
      healthdayStockQty: 0,
      bazarStockQty: 0,
    });
    setServiceStockEditorMode("HEALTHDAY");
    setServiceStockEditorLotId("");
    setServiceStockEditorQty(0);
  }

  async function loadData() {
    const [masterJson, sourcesJson] = await Promise.all([
      fetch("/api/vaccination/master", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/sources?program=vaccination", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false, sources: [] })),
    ]);
    if (!masterJson.ok) {
      setError(masterJson.message || "Gagal mengambil data.");
      return;
    }
    setVaccines(masterJson.vaccines || []);
    setLots(masterJson.lots || []);
    setProductMappings(masterJson.productMappings || []);
    setCompanySources(sourcesJson.ok ? sourcesJson.sources || [] : []);
    setStockSessions(masterJson.stockSessions || []);
    setServiceStockAllocations(masterJson.serviceStockAllocations || []);
    setSessionProductAssignments(masterJson.sessionProductAssignments || []);
    setSessionProductAssignmentReady(masterJson.sessionProductAssignmentReady !== false);
    setSessionProductAssignmentMessage(masterJson.sessionProductAssignmentMessage || "");
    setServiceStockReady(masterJson.serviceStockReady !== false);
    setServiceStockMessage(masterJson.serviceStockMessage || "");
    setMappingReady(masterJson.mappingReady !== false);
    setMappingMessage(masterJson.mappingMessage || "");
    setCompanyStockReady(masterJson.companyStockReady !== false);
    setCompanyStockMessage(masterJson.companyStockMessage || "");
    // V503: form kosong harus tetap kosong; jangan auto-select produk pertama.
  }

  async function openStockTransactions(vaccine: any) {
    setTransactionProduct(vaccine);
    setStockTransactionLoading(true);
    setStockTransactionError("");
    setStockTransactionData({ usage: [], movements: [] });

    try {
      const params = new URLSearchParams();
      params.set("action", "stock-transactions");
      params.set("vaccine_id", String(vaccine?.id || ""));
      if (stockSessionFilter !== "ALL") {
        params.set("session_id", String(stockSessionFilter));
      } else if (stockFilter !== "ALL" && stockFilter !== "GENERAL") {
        params.set("company_name", stockFilter);
      }
      if (productServiceFilter !== "ALL") {
        params.set("service_mode", productServiceFilter);
      }

      const response = await fetch(`/api/vaccination/master?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) {
        throw new Error(json.message || "Gagal mengambil transaksi stok.");
      }

      setStockTransactionData({
        usage: json.usage || [],
        movements: json.movements || [],
        summary: json.summary || {},
      });
    } catch (e: any) {
      setStockTransactionError(e?.message || "Gagal mengambil transaksi stok.");
    } finally {
      setStockTransactionLoading(false);
    }
  }

  function closeStockTransactions() {
    setTransactionProduct(null);
    setStockTransactionLoading(false);
    setStockTransactionError("");
    setStockTransactionData({ usage: [], movements: [] });
  }

  function findMappedVaccineId(productKey: string, productName: string) {
    const mapped = importMappingSelections[productKey];
    if (mapped) return String(mapped);
    const existingMapping = productMappings.find(
      (item) => cleanText(item.external_product_key).toLowerCase() === productKey.toLowerCase() && item.active !== false,
    );
    if (existingMapping?.vaccine_id) return String(existingMapping.vaccine_id);
    const exact = vaccines.find((v) => normalizeName(v.name) === normalizeName(productName));
    return exact?.id ? String(exact.id) : "";
  }

  function serviceAllocationQty(lotId: any, sessionId: any, serviceMode: "HEALTHDAY" | "BAZAR") {
    const row = serviceStockAllocations.find(
      (item) =>
        item.active !== false &&
        Number(item.lot_id || 0) === Number(lotId || 0) &&
        Number(item.session_id || 0) === Number(sessionId || 0) &&
        String(item.service_mode || "HEALTHDAY").toUpperCase() === serviceMode,
    );
    return Math.max(0, Number(row?.allocated_qty || 0));
  }

  function applyImportLot(productKey: string, lotNumber: string, vaccineId?: string) {
    const matchingRows = importRows.filter(
      (item) => item.externalProductKey === productKey && item.lotNumber === lotNumber,
    );
    const row = matchingRows[0];
    if (!row) return;

    const importedAvailable = matchingRows.reduce(
      (sum, item) => sum + Number(item.availableQuantity || 0),
      0,
    );
    const importedLocations = Array.from(
      new Set(matchingRows.map((item) => item.sourceLocation).filter(Boolean)),
    );

    const masterId = vaccineId || selectedMasterVaccineId || findMappedVaccineId(productKey, row.externalProductName);
    const existingLot = lots.find(
      (lot) => String(lot.vaccine_id || lot.vaccine?.id || "") === String(masterId || "") && cleanText(lot.lot_number) === row.lotNumber,
    );

    setLotForm({
      vaccineId: masterId || "",
      lotNumber: row.lotNumber,
      expiryDate: cleanText(existingLot?.expiry_date),
      stockInitial: existingLot ? Number(existingLot.stock_initial || 0) : importedAvailable,
      stockAdded: existingLot ? Number(existingLot.stock_added || 0) : 0,
      stockPhysicalCount: String(importedAvailable),
      inventoryNotes: cleanText(existingLot?.inventory_notes) || `Import stock.quant · ${importedLocations.join(", ")}`,
      stockScope: lotScope(existingLot),
      stockCompanyName: lotScope(existingLot) === "GENERAL" ? "" : cleanText(existingLot?.stock_company_name),
      stockSessionId: lotScope(existingLot) === "SESSION" ? String(existingLot?.stock_session_id || "") : "",
      healthdayStockQty:
        existingLot && lotScope(existingLot) === "SESSION"
          ? serviceAllocationQty(existingLot.id, existingLot.stock_session_id, "HEALTHDAY") ||
            Math.max(
              0,
              Number(existingLot.stock_initial || 0) +
                Number(existingLot.stock_added || 0) -
                Number(existingLot.stock_used || 0),
            )
          : 0,
      bazarStockQty:
        existingLot && lotScope(existingLot) === "SESSION"
          ? serviceAllocationQty(existingLot.id, existingLot.stock_session_id, "BAZAR")
          : 0,
    });
  }

  function chooseImportProductForMaster(product: { key: string; name: string; label: string }) {
    const masterId = findMappedVaccineId(product.key, product.name);
    const existingVaccine = vaccines.find((v) => String(v.id) === masterId);
    const rows = importRows.filter((row) => row.externalProductKey === product.key);
    const firstRow = rows[0];

    setSelectedImportProductKey(product.key);
    setSelectedMasterVaccineId(masterId);

    setVaccineForm({
      name: cleanText(existingVaccine?.name) || product.name,
      brand: cleanText(existingVaccine?.brand),
      description: cleanText(existingVaccine?.description),
      priceCategory: cleanText(existingVaccine?.price_category) || "Harga Perusahaan",
      price: existingVaccine?.price == null ? "" : String(existingVaccine.price),
      doseCount: Math.max(1, Number(existingVaccine?.dose_count || 1)),
      defaultNextDoseDays: existingVaccine?.default_next_dose_days == null ? "" : String(existingVaccine.default_next_dose_days),
    });

    if (firstRow) applyImportLot(product.key, firstRow.lotNumber, masterId);

    setMessage(
      `${product.label} dipilih. Nama produk dan lot dari file import sudah diambil. Lengkapi produsen, harga, dosis/next dose lalu simpan dalam satu form.`,
    );
    window.setTimeout(() => {
      document.getElementById("vaccination-master-product-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  async function postMaster(payload: Record<string, any>) {
    const res = await fetch("/api/vaccination/master", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.message || "Proses Master Vaksin gagal.");
    return json;
  }


  function productFormMatchesVaccine(vaccine: any) {
    if (!vaccine) return false;
    const comparablePrice = (value: any) =>
      value === "" || value == null || Number.isNaN(Number(value))
        ? ""
        : String(Number(value));
    const comparableDays = (value: any) =>
      value === "" || value == null || Number.isNaN(Number(value))
        ? ""
        : String(Number(value));

    return (
      cleanText(vaccineForm.name) === cleanText(vaccine.name) &&
      cleanText(vaccineForm.brand) === cleanText(vaccine.brand) &&
      cleanText(vaccineForm.description) === cleanText(vaccine.description) &&
      cleanText(vaccineForm.priceCategory) === cleanText(vaccine.price_category) &&
      comparablePrice(vaccineForm.price) === comparablePrice(vaccine.price) &&
      Math.max(1, Number(vaccineForm.doseCount || 1)) ===
        Math.max(1, Number(vaccine.dose_count || 1)) &&
      comparableDays(vaccineForm.defaultNextDoseDays) ===
        comparableDays(vaccine.default_next_dose_days)
    );
  }

  function applyLotParentProduct(productId: string) {
    const target = vaccines.find(
      (vaccine) => String(vaccine.id || "") === String(productId || ""),
    );
    setLotForm((current) => ({ ...current, vaccineId: productId }));
    if (!target) return;
    setVaccineForm({
      name: cleanText(target.name),
      brand: cleanText(target.brand),
      description: cleanText(target.description),
      priceCategory: cleanText(target.price_category) || "Harga Perusahaan",
      price: target.price == null ? "" : String(target.price),
      doseCount: Math.max(1, Number(target.dose_count || 1)),
      defaultNextDoseDays:
        target.default_next_dose_days == null
          ? ""
          : String(target.default_next_dose_days),
    });
  }

  async function submitProductAndLot() {
    setError("");
    const name = cleanText(vaccineForm.name);
    if (!name) {
      setError("Nama vaksin / produk wajib diisi.");
      return;
    }
    if (
      lotForm.stockScope !== "GENERAL" &&
      !cleanText(lotForm.stockCompanyName)
    ) {
      setError("Pilih perusahaan untuk Produk/Lot yang diarahkan ke Perusahaan/Session.");
      return;
    }
    if (
      lotForm.stockScope === "SESSION" &&
      !cleanText(lotForm.stockSessionId)
    ) {
      setError("Pilih Session/Lokasi untuk assignment Produk/Stock Session.");
      return;
    }
    if (
      lotForm.stockScope === "SESSION" &&
      !sessionProductAssignmentReady
    ) {
      setError(sessionProductAssignmentMessage || "Assignment produk ke Session belum aktif.");
      return;
    }
    if (
      cleanText(lotForm.lotNumber) &&
      lotForm.stockScope === "SESSION" &&
      !serviceStockReady
    ) {
      setError(serviceStockMessage || "Aktifkan pembagian stok Healthday/Bazar terlebih dahulu.");
      return;
    }

    try {
      let vaccineId = "";

      if (masterEditMode === "LOT") {
        const originalVaccineId = String(selectedMasterVaccineId || "");
        const originalVaccine = vaccines.find(
          (item) => String(item.id || "") === originalVaccineId,
        );
        let targetVaccineId = String(
          lotForm.vaccineId || originalVaccineId || "",
        );

        if (!originalVaccineId || !editingLotId) {
          throw new Error(
            "Lot atau Produk induk Lot tidak ditemukan. Batalkan Edit Lot lalu pilih ulang.",
          );
        }

        const parentSelectedExplicitly =
          targetVaccineId && targetVaccineId !== originalVaccineId;
        const productFieldsChanged =
          !parentSelectedExplicitly &&
          !productFormMatchesVaccine(originalVaccine);

        if (productFieldsChanged) {
          const matchingProduct = vaccines.find(
            (candidate) =>
              candidate.active !== false &&
              String(candidate.id || "") !== originalVaccineId &&
              productFormMatchesVaccine(candidate),
          );

          if (matchingProduct?.id) {
            targetVaccineId = String(matchingProduct.id);
          } else {
            const createJson = await postMaster({
              action: "create-vaccine",
              ...vaccineForm,
            });
            targetVaccineId = String(createJson.vaccine?.id || "");
          }
        }

        if (!targetVaccineId) {
          throw new Error(
            "Produk tujuan Lot tidak ditemukan. Pilih Produk Induk atau isi Data Produk.",
          );
        }

        vaccineId = targetVaccineId;
      } else if (masterEditMode === "PRODUCT") {
        vaccineId = String(selectedMasterVaccineId || "");
        if (!vaccineId) {
          throw new Error("Master produk yang akan diedit tidak ditemukan.");
        }
        const json = await postMaster({
          action: "update-vaccine",
          editIntent: "PRODUCT_MASTER",
          id: vaccineId,
          ...vaccineForm,
        });
        vaccineId = String(json.vaccine?.id || vaccineId);
      } else {
        const json = await postMaster({
          action: "create-vaccine",
          ...vaccineForm,
        });
        vaccineId = String(json.vaccine?.id || "");
      }

      if (!vaccineId) throw new Error("Master vaksin tersimpan tetapi ID vaksin tidak ditemukan.");

      if (
        lotForm.stockScope === "SESSION" &&
        cleanText(lotForm.stockSessionId)
      ) {
        await postMaster({
          action: "assign-product-session",
          vaccineId,
          sessionId: lotForm.stockSessionId,
          companyName: lotForm.stockCompanyName,
          serviceMode: serviceStockEditorMode,
          plannedStockInitial: Math.max(0, Number(lotForm.stockInitial || 0)),
        });
      }

      if (selectedImportProductKey) {
        setImportMappingSelections((prev) => ({
          ...prev,
          [selectedImportProductKey]: vaccineId,
        }));
      }

      const lotNumber = cleanText(lotForm.lotNumber);
      let lotSaved = false;
      let savedLotId = "";

      if (lotNumber) {
        const existingLot =
          masterEditMode === "LOT" && editingLotId
            ? lots.find((lot) => String(lot.id || "") === String(editingLotId))
            : lots.find(
                (lot) =>
                  String(lot.vaccine_id || lot.vaccine?.id || "") === vaccineId &&
                  cleanText(lot.lot_number) === lotNumber,
              );

        if (existingLot?.id) {
          if (
            masterEditMode === "LOT" &&
            String(vaccineId) !== String(selectedMasterVaccineId || "")
          ) {
            await postMaster({
              action: "reassign-lot-vaccine",
              lotId: existingLot.id,
              targetVaccineId: vaccineId,
            });
          }

          const lotJson = await postMaster({
            action: "update-lot-details",
            lotId: existingLot.id,
            lotNumber,
            expiryDate: lotForm.expiryDate,
            stockAdded: lotForm.stockAdded,
            stockPhysicalCount: lotForm.stockPhysicalCount,
            inventoryNotes: lotForm.inventoryNotes,
            stockScope: lotForm.stockScope,
            stockCompanyName: lotForm.stockCompanyName,
            stockSessionId: lotForm.stockSessionId,
          });
          savedLotId = String(lotJson.lot?.id || existingLot.id || "");
        } else {
          const lotJson = await postMaster({
            action: "create-lot",
            ...lotForm,
            vaccineId,
            lotNumber,
          });
          savedLotId = String(lotJson.lot?.id || "");
        }

        if (
          savedLotId &&
          lotForm.stockScope === "SESSION" &&
          cleanText(lotForm.stockSessionId)
        ) {
          await postMaster({
            action: "assign-product-session",
            vaccineId,
            sessionId: lotForm.stockSessionId,
            companyName: lotForm.stockCompanyName,
            serviceMode: serviceStockEditorMode,
            plannedStockInitial: 0,
          });

          setMessage(
            "Lot Session tersimpan. Jumlah Awal rencana sudah dipindahkan ke Lot. Pilih Jenis Stok Session dan Lot Number pada panel Pembagian Stok Session untuk mengalokasikan Healthday/Bazar.",
          );
        }

        lotSaved = true;
      }

      setMessage(
        masterEditMode === "LOT"
          ? "Perubahan Lot berhasil disimpan. Jika Data Produk diubah, hanya Lot ini yang dipindahkan ke produk tujuan; lot lain tidak ikut berubah. Form sudah dikosongkan."
          : lotSaved
            ? lotForm.stockScope === "SESSION"
              ? "Master vaksin/produk dan lot berhasil disimpan. Form sudah dikosongkan; pilih data baru untuk input berikutnya."
              : "Master vaksin/produk dan lot berhasil disimpan. Form sudah dikosongkan."
            : lotForm.stockScope === "SESSION"
              ? `Produk berhasil disimpan dan di-assign ke Session ${serviceModeLabel(serviceStockEditorMode)}. Form sudah dikosongkan.`
              : "Master vaksin/produk berhasil disimpan. Form sudah dikosongkan.",
      );
      await loadData();
      resetProductLotEditor();
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan produk & lot.");
    }
  }

  function editProduct(vaccine: any) {
    setError("");
    setSelectedImportProductKey("");
    setSelectedMasterVaccineId(String(vaccine.id || ""));
    setMasterEditMode("PRODUCT");
    setEditingLotId("");

    const filteredSessionId =
      stockSessionFilter !== "ALL" ? String(stockSessionFilter) : "";
    const preferredAssignment =
      sessionProductAssignments.find(
        (assignment) =>
          assignment.active !== false &&
          String(assignment.vaccine_id || "") === String(vaccine.id || "") &&
          (!filteredSessionId ||
            String(assignment.session_id || "") === filteredSessionId) &&
          (productServiceFilter === "ALL" ||
            String(assignment.service_mode || "HEALTHDAY").toUpperCase() ===
              productServiceFilter),
      ) ||
      sessionProductAssignments.find(
        (assignment) =>
          assignment.active !== false &&
          String(assignment.vaccine_id || "") === String(vaccine.id || ""),
      );
    const assignedSession = preferredAssignment
      ? sessionMap.get(Number(preferredAssignment.session_id || 0))
      : null;
    const assignedServiceMode =
      String(preferredAssignment?.service_mode || "HEALTHDAY").toUpperCase() ===
      "BAZAR"
        ? "BAZAR"
        : "HEALTHDAY";

    if (preferredAssignment) {
      setServiceStockEditorMode(assignedServiceMode);
    }

    setVaccineForm({
      name: cleanText(vaccine.name),
      brand: cleanText(vaccine.brand),
      description: cleanText(vaccine.description),
      priceCategory: cleanText(vaccine.price_category) || "Harga Perusahaan",
      price: vaccine.price == null ? "" : String(vaccine.price),
      doseCount: Math.max(1, Number(vaccine.dose_count || 1)),
      defaultNextDoseDays: vaccine.default_next_dose_days == null ? "" : String(vaccine.default_next_dose_days),
    });
    setLotForm({
      vaccineId: String(vaccine.id || ""),
      lotNumber: "",
      expiryDate: "",
      stockInitial: preferredAssignment
        ? Math.max(0, Number(preferredAssignment.planned_stock_initial || 0))
        : 0,
      stockAdded: 0,
      stockPhysicalCount: "",
      inventoryNotes: "",
      stockScope: preferredAssignment ? "SESSION" : "GENERAL",
      stockCompanyName: preferredAssignment
        ? cleanText(assignedSession?.company_name)
        : "",
      stockSessionId: preferredAssignment
        ? String(preferredAssignment.session_id || "")
        : "",
      healthdayStockQty: 0,
      bazarStockQty: 0,
    });
    setMessage(`Edit produk ${vaccine.name}. Ubah field yang diperlukan lalu klik Simpan Perubahan Produk & Lot.`);
    window.setTimeout(() => {
      document.getElementById("vaccination-master-product-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  function editLot(lot: any) {
    setError("");
    const vaccineId = String(lot.vaccine_id || lot.vaccine?.id || "");
    const vaccine = vaccines.find((item) => String(item.id) === vaccineId) || lot.vaccine || {};
    setSelectedImportProductKey("");
    setSelectedMasterVaccineId(vaccineId);
    setMasterEditMode("LOT");
    setEditingLotId(String(lot.id || ""));
    setVaccineForm({
      name: cleanText(vaccine.name),
      brand: cleanText(vaccine.brand),
      description: cleanText(vaccine.description),
      priceCategory: cleanText(vaccine.price_category) || "Harga Perusahaan",
      price: vaccine.price == null ? "" : String(vaccine.price),
      doseCount: Math.max(1, Number(vaccine.dose_count || 1)),
      defaultNextDoseDays: vaccine.default_next_dose_days == null ? "" : String(vaccine.default_next_dose_days),
    });
    setLotForm({
      vaccineId,
      lotNumber: cleanText(lot.lot_number),
      expiryDate: cleanText(lot.expiry_date),
      stockInitial: Number(lot.stock_initial || 0),
      stockAdded: Number(lot.stock_added || 0),
      stockPhysicalCount: lot.stock_physical_count == null ? "" : String(lot.stock_physical_count),
      inventoryNotes: cleanText(lot.inventory_notes),
      stockScope: lotScope(lot),
      stockCompanyName: lotScope(lot) === "GENERAL" ? "" : cleanText(lot.stock_company_name),
      stockSessionId: lotScope(lot) === "SESSION" ? String(lot.stock_session_id || "") : "",
      healthdayStockQty:
        lotScope(lot) === "SESSION"
          ? serviceAllocationQty(lot.id, lot.stock_session_id, "HEALTHDAY") ||
            Math.max(
              0,
              Number(lot.stock_initial || 0) +
                Number(lot.stock_added || 0) -
                Number(lot.stock_used || 0),
            )
          : 0,
      bazarStockQty:
        lotScope(lot) === "SESSION"
          ? serviceAllocationQty(lot.id, lot.stock_session_id, "BAZAR")
          : 0,
    });
    setMessage(`Mode Edit Lot ${lot.lot_number} · ${vaccine.name || "Vaksin"}. Data Produk aktif. Jika nama/brand diubah, perubahan hanya berlaku untuk Lot ini; produk/lot lain tidak ikut diganti.`);
    window.setTimeout(() => {
      document.getElementById("vaccination-master-product-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  async function deleteVaccine(vaccine: any) {
    setError("");
    if (!window.confirm(`Hapus produk ${vaccine.name}? Produk hanya bisa dihapus jika belum pernah dipakai pada registrasi/session/administrasi.`)) return;
    try {
      const json = await postMaster({ action: "delete-vaccine", id: vaccine.id });
      setMessage(json.message || `Produk ${vaccine.name} dihapus.`);
      if (String(selectedMasterVaccineId) === String(vaccine.id)) {
        setSelectedMasterVaccineId("");
        setVaccineForm({ name: "", brand: "", description: "", priceCategory: "Harga Perusahaan", price: "", doseCount: 1, defaultNextDoseDays: "" });
        setLotForm({ vaccineId: "", lotNumber: "", expiryDate: "", stockInitial: 0, stockAdded: 0, stockPhysicalCount: "", inventoryNotes: "", stockScope: "GENERAL", stockCompanyName: "", stockSessionId: "", healthdayStockQty: 0, bazarStockQty: 0 });
      }
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Gagal menghapus produk.");
    }
  }

  async function deleteLot(lot: any) {
    setError("");
    if (!window.confirm(`Hapus lot ${lot.lot_number} dari ${lot.vaccine?.name || "produk"}? Lot hanya bisa dihapus jika belum pernah dipakai.`)) return;
    try {
      const json = await postMaster({ action: "delete-lot", id: lot.id });
      setMessage(json.message || `Lot ${lot.lot_number} dihapus.`);
      if (cleanText(lotForm.lotNumber) === cleanText(lot.lot_number) && String(lotForm.vaccineId) === String(lot.vaccine_id || lot.vaccine?.id || "")) {
        setLotForm((current) => ({ ...current, lotNumber: "", expiryDate: "", stockInitial: 0, stockAdded: 0, stockPhysicalCount: "", inventoryNotes: "" }));
      }
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Gagal menghapus lot.");
    }
  }

  function selectServiceStockMode(mode: "HEALTHDAY" | "BAZAR") {
    setServiceStockEditorMode(mode);
    if (!selectedServiceStockLot) {
      setServiceStockEditorQty(0);
      return;
    }
    setServiceStockEditorQty(
      serviceAllocationQty(
        selectedServiceStockLot.id,
        lotForm.stockSessionId,
        mode,
      ),
    );
  }

  function selectServiceStockLot(lotId: string) {
    setServiceStockEditorLotId(lotId);
    const lot = serviceStockEditorLots.find(
      (item) => String(item.id) === String(lotId),
    );
    if (!lot) {
      setServiceStockEditorQty(0);
      return;
    }
    setServiceStockEditorQty(
      serviceAllocationQty(
        lot.id,
        lotForm.stockSessionId,
        serviceStockEditorMode,
      ),
    );
  }

  async function saveSelectedServiceStock() {
    setError("");
    if (!serviceStockReady) {
      setError(serviceStockMessage || "Pembagian stok Healthday/Bazar belum aktif.");
      return;
    }
    if (!cleanText(lotForm.stockCompanyName)) {
      setError("Pilih Perusahaan terlebih dahulu.");
      return;
    }
    if (!cleanText(lotForm.stockSessionId)) {
      setError("Pilih Session / Lokasi terlebih dahulu.");
      return;
    }
    if (!selectedServiceStockLot) {
      setError("Pilih Lot Number yang akan dialokasikan.");
      return;
    }

    const qty = Math.max(0, Math.min(selectedServiceStockMaxQty, Number(serviceStockEditorQty || 0)));
    const healthdayQty =
      serviceStockEditorMode === "HEALTHDAY" ? qty : selectedServiceStockHealthday;
    const bazarQty =
      serviceStockEditorMode === "BAZAR" ? qty : selectedServiceStockBazar;

    setSavingServiceStock(true);
    try {
      const json = await postMaster({
        action: "save-session-service-stock",
        lotId: selectedServiceStockLot.id,
        sessionId: lotForm.stockSessionId,
        companyName: lotForm.stockCompanyName,
        healthdayQty,
        bazarQty,
      });
      setMessage(
        json.message ||
          `Alokasi ${serviceStockEditorMode === "BAZAR" ? "Bazar" : "Healthday"} untuk Lot ${selectedServiceStockLot.lot_number} berhasil disimpan.`,
      );
      await loadData();
      setServiceStockEditorQty(qty);
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan alokasi stok Session.");
    } finally {
      setSavingServiceStock(false);
    }
  }

  function openTransferStock(lot: any) {
    setError("");
    setTransferLot(lot);
    setTransferCompanyName("");
    setTransferSessionId("");
    setTransferServiceMode("HEALTHDAY");
  }

  function closeTransferStock() {
    if (transferringStock) return;
    setTransferLot(null);
    setTransferCompanyName("");
    setTransferSessionId("");
    setTransferServiceMode("HEALTHDAY");
  }

  async function transferRemainingStock() {
    if (!transferLot) return;
    setError("");

    const remaining =
      Number(transferLot.stock_initial || 0) +
      Number(transferLot.stock_added || 0) -
      Number(transferLot.stock_used || 0);

    if (remaining <= 0) {
      setError("Tidak ada sisa stok yang dapat ditransfer.");
      return;
    }
    if (!cleanText(transferCompanyName)) {
      setError("Pilih Perusahaan tujuan transfer stok.");
      return;
    }
    if (!cleanText(transferSessionId)) {
      setError("Pilih Session / Lokasi tujuan transfer stok.");
      return;
    }

    const targetSession = stockSessions.find(
      (session) => String(session.id) === String(transferSessionId),
    );
    if (!targetSession) {
      setError("Session / Lokasi tujuan tidak ditemukan.");
      return;
    }

    const confirmed = window.confirm(
      `Transfer seluruh sisa stok ${remaining} dari Lot ${transferLot.lot_number} ke ${sessionLabel(targetSession)} · ${transferServiceMode === "BAZAR" ? "Bazar (Bayar)" : "Healthday (Gratis)"}?`,
    );
    if (!confirmed) return;

    setTransferringStock(true);
    try {
      const json = await postMaster({
        action: "transfer-lot-stock",
        lotId: transferLot.id,
        targetCompanyName: transferCompanyName,
        targetSessionId: transferSessionId,
        targetServiceMode: transferServiceMode,
      });

      setMessage(
        json.message ||
          `Sisa stok Lot ${transferLot.lot_number} berhasil ditransfer.`,
      );
      setTransferLot(null);
      setTransferCompanyName("");
      setTransferSessionId("");
      setTransferServiceMode("HEALTHDAY");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Transfer stok gagal.");
    } finally {
      setTransferringStock(false);
    }
  }

  function startEditMapping(mapping: any) {
    setEditingMappingId(String(mapping.id || ""));
    setEditingMappingVaccineId(String(mapping.vaccine_id || mapping.vaccine?.id || ""));
  }

  async function saveMapping(mapping: any) {
    setError("");
    if (!editingMappingVaccineId) {
      setError("Pilih Master Vaksin untuk mapping.");
      return;
    }
    try {
      const json = await postMaster({
        action: "update-product-mapping",
        id: mapping.id,
        vaccineId: editingMappingVaccineId,
      });
      setMessage(json.message || "Mapping produk berhasil diperbarui.");
      setEditingMappingId("");
      setEditingMappingVaccineId("");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Gagal memperbarui mapping.");
    }
  }

  async function deleteMapping(mapping: any) {
    setError("");
    const label = mapping.external_product_label || mapping.external_product_name || "produk import";
    if (!window.confirm(`Hapus mapping ${label}? Data master vaksin dan lot tidak ikut dihapus.`)) return;
    try {
      const json = await postMaster({ action: "delete-product-mapping", id: mapping.id });
      setMessage(json.message || "Mapping produk dihapus.");
      if (String(editingMappingId) === String(mapping.id)) {
        setEditingMappingId("");
        setEditingMappingVaccineId("");
      }
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Gagal menghapus mapping.");
    }
  }

  async function readStockQuantFile(file: File | null) {
    setError("");
    setMessage("");
    setImportRows([]);
    setImportMappingSelections({});
    setImportFileName(file?.name || "");
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : null;
      if (!sheet) throw new Error("Worksheet tidak ditemukan.");

      const sourceRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
        defval: "",
        raw: false,
      });

      const merged = new Map<string, StockImportRow>();
      for (const row of sourceRows) {
        const productText = cleanText(row["Product"] ?? row["product"]);
        const location = cleanText(row["Location"] ?? row["location"]);
        const lotNumber = cleanText(row["Lot/Serial Number"] ?? row["Lot / Serial Number"] ?? row["lot"]);
        if (!productText || !location || !lotNumber) continue;

        const product = parseProductLabel(productText);
        if (!product.key) continue;

        const availableQuantity = parseQuantity(
          row["Available Quantity"] ?? row["available_quantity"] ?? row["Available"],
        );

        const mergeKey = `${product.key}|${lotNumber}|${location}`;
        const previous = merged.get(mergeKey);
        if (previous) {
          previous.availableQuantity += availableQuantity;
        } else {
          merged.set(mergeKey, {
            externalProductKey: product.key,
            externalProductCode: product.code,
            externalProductName: product.name,
            externalProductLabel: product.label,
            sourceLocation: location,
            lotNumber,
            availableQuantity,
          });
        }
      }

      const parsed = Array.from(merged.values());
      if (!parsed.length) {
        throw new Error("Tidak ada row detail Product + Location + Lot/Serial Number yang dapat di-import.");
      }

      const nextSelections: Record<string, string> = {};
      for (const row of parsed) {
        const exact = vaccines.find((v) => normalizeName(v.name) === normalizeName(row.externalProductName));
        if (exact?.id && !nextSelections[row.externalProductKey]) {
          nextSelections[row.externalProductKey] = String(exact.id);
        }
      }

      setImportRows(parsed);
      setImportMappingSelections(nextSelections);
      setMessage(`Preview import siap: ${new Set(parsed.map((row) => row.externalProductKey)).size} produk, ${parsed.length} kombinasi lot/lokasi.`);
    } catch (err: any) {
      setError(err?.message || "Gagal membaca file stock.quant.");
    }
  }

  async function submitStockImport() {
    setError("");
    if (!mappingReady) {
      setError(mappingMessage || "Mapping produk belum aktif. Jalankan SQL V153.18 terlebih dahulu.");
      return;
    }
    if (!importRows.length) {
      setError("Pilih file stock.quant XLSX terlebih dahulu.");
      return;
    }

    setImporting(true);
    try {
      const payloadRows = importRows.map((row) => ({
        ...row,
        vaccineId: importMappingSelections[row.externalProductKey] || "",
      }));

      const res = await fetch("/api/vaccination/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import-stock-quant", rows: payloadRows }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.message || "Import produk & lot gagal.");
        return;
      }

      setMessage(json.message || "Import produk & lot selesai.");
      setImportRows([]);
      setImportFileName("");
      setImportMappingSelections({});
      await loadData();
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => { loadData(); }, []);
  const activeVaccines = useMemo(() => vaccines.filter((v) => v.active), [vaccines]);

  const companyOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const source of companySources) {
      const label = cleanText(source.institution_name || source.name);
      const key = normalizeCompany(label);
      if (key && !byKey.has(key)) byKey.set(key, label);
    }
    for (const lot of lots) {
      if (lotScope(lot) === "GENERAL") continue;
      const label = cleanText(lot.stock_company_name);
      const key = normalizeCompany(label);
      if (key && !byKey.has(key)) byKey.set(key, label);
    }
    for (const session of stockSessions) {
      const label = cleanText(session.company_name);
      const key = normalizeCompany(label);
      if (key && !byKey.has(key)) byKey.set(key, label);
    }
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, "id"));
  }, [companySources, lots, stockSessions]);

  const lotCompanySessions = useMemo(() => {
    const companyKey = normalizeCompany(lotForm.stockCompanyName);
    if (!companyKey) return [];
    return stockSessions
      .filter(
        (session) =>
          normalizeCompany(session.company_name) === companyKey &&
          String(session.status || "").toUpperCase() !== "CANCELLED",
      )
      .sort((a, b) => {
        const dateCompare = String(b.session_date || "").localeCompare(
          String(a.session_date || ""),
        );
        return dateCompare || Number(b.id || 0) - Number(a.id || 0);
      });
  }, [stockSessions, lotForm.stockCompanyName]);

  const filterCompanySessions = useMemo(() => {
    if (stockFilter === "ALL" || stockFilter === "GENERAL") return [];
    const companyKey = normalizeCompany(stockFilter);
    return stockSessions
      .filter((session) => normalizeCompany(session.company_name) === companyKey)
      .sort((a, b) => {
        const dateCompare = String(b.session_date || "").localeCompare(
          String(a.session_date || ""),
        );
        return dateCompare || Number(b.id || 0) - Number(a.id || 0);
      });
  }, [stockSessions, stockFilter]);

  const sessionMap = useMemo(
    () =>
      new Map<number, any>(
        stockSessions.map(
          (session): [number, any] => [Number(session.id), session],
        ),
      ),
    [stockSessions],
  );

  const transferTargetSessions = useMemo(() => {
    const companyKey = normalizeCompany(transferCompanyName);
    if (!companyKey) return [];
    return stockSessions
      .filter(
        (session) =>
          normalizeCompany(session.company_name) === companyKey &&
          String(session.status || "").toUpperCase() !== "CANCELLED",
      )
      .sort((a, b) => {
        const dateCompare = String(b.session_date || "").localeCompare(
          String(a.session_date || ""),
        );
        return dateCompare || Number(b.id || 0) - Number(a.id || 0);
      });
  }, [stockSessions, transferCompanyName]);

  const serviceStockEditorLots = useMemo(() => {
    const companyKey = normalizeCompany(lotForm.stockCompanyName);
    const sessionId = Number(lotForm.stockSessionId || 0);
    if (!companyKey || !sessionId) return [];

    return lots
      .filter(
        (lot) =>
          lot.active !== false &&
          lotScope(lot) === "SESSION" &&
          Number(lot.stock_session_id || 0) === sessionId &&
          normalizeCompany(lot.stock_company_name) === companyKey,
      )
      .sort((a, b) => {
        const vaccineA = cleanText(a.vaccine?.name);
        const vaccineB = cleanText(b.vaccine?.name);
        return vaccineA.localeCompare(vaccineB) || cleanText(a.lot_number).localeCompare(cleanText(b.lot_number));
      });
  }, [lots, lotForm.stockCompanyName, lotForm.stockSessionId]);

  const selectedServiceStockLot = useMemo(
    () =>
      serviceStockEditorLots.find(
        (lot) => String(lot.id) === String(serviceStockEditorLotId),
      ) || null,
    [serviceStockEditorLots, serviceStockEditorLotId],
  );

  const selectedServiceStockRemaining = selectedServiceStockLot
    ? Math.max(
        0,
        Number(selectedServiceStockLot.stock_initial || 0) +
          Number(selectedServiceStockLot.stock_added || 0) -
          Number(selectedServiceStockLot.stock_used || 0),
      )
    : 0;

  const selectedServiceStockHealthday = selectedServiceStockLot
    ? serviceAllocationQty(
        selectedServiceStockLot.id,
        lotForm.stockSessionId,
        "HEALTHDAY",
      )
    : 0;

  const selectedServiceStockBazar = selectedServiceStockLot
    ? serviceAllocationQty(
        selectedServiceStockLot.id,
        lotForm.stockSessionId,
        "BAZAR",
      )
    : 0;

  const selectedServiceStockOtherQty =
    serviceStockEditorMode === "HEALTHDAY"
      ? selectedServiceStockBazar
      : selectedServiceStockHealthday;

  const selectedServiceStockMaxQty = Math.max(
    0,
    selectedServiceStockRemaining - selectedServiceStockOtherQty,
  );

  const transferRemaining = transferLot
    ? Math.max(
        0,
        Number(transferLot.stock_initial || 0) +
          Number(transferLot.stock_added || 0) -
          Number(transferLot.stock_used || 0),
      )
    : 0;

  // V506_SERVICE_FILTER_LOT_TABLE: lot table follows Healthday/Bazar filter too.
  const filteredMasterLots = useMemo(() => {
    let scopedLots: any[];

    if (stockFilter === "ALL") {
      scopedLots = lots;
    } else if (stockFilter === "GENERAL") {
      scopedLots = lots.filter((lot) => lotScope(lot) === "GENERAL");
    } else {
      const filterKey = normalizeCompany(stockFilter);
      const companyLots = lots.filter(
        (lot) =>
          lotScope(lot) !== "GENERAL" &&
          normalizeCompany(lot.stock_company_name) === filterKey,
      );

      if (stockSessionFilter === "ALL") {
        scopedLots = companyLots;
      } else {
        const sessionId = Number(stockSessionFilter || 0);
        scopedLots = companyLots.filter(
          (lot) =>
            lotScope(lot) === "SESSION" &&
            Number(lot.stock_session_id || 0) === sessionId,
        );
      }
    }

    if (productServiceFilter === "ALL") return scopedLots;

    const serviceMode = productServiceFilter === "BAZAR" ? "BAZAR" : "HEALTHDAY";
    return scopedLots.filter((lot) => {
      if (lotScope(lot) !== "SESSION") return false;
      const sessionId = Number(lot.stock_session_id || 0);
      if (!sessionId) return false;
      return serviceAllocationQty(lot.id, sessionId, serviceMode) > 0;
    });
  }, [
    lots,
    stockFilter,
    stockSessionFilter,
    productServiceFilter,
    serviceStockAllocations,
  ]);

  function serviceModeLabel(value: any) {
    return String(value || "HEALTHDAY").toUpperCase() === "BAZAR"
      ? "Bazar (Bayar)"
      : "Healthday (Gratis)";
  }

  function assignmentSessionIdsForCurrentFilter() {
    if (stockFilter === "ALL" || stockFilter === "GENERAL") return new Set<number>();
    if (stockSessionFilter !== "ALL") {
      const id = Number(stockSessionFilter || 0);
      return id ? new Set([id]) : new Set<number>();
    }
    const companyKey = normalizeCompany(stockFilter);
    return new Set(
      stockSessions
        .filter((session) => normalizeCompany(session.company_name) === companyKey)
        .map((session) => Number(session.id || 0))
        .filter(Boolean),
    );
  }

  const filteredVaccines = useMemo(() => {
    let visibleVaccines = vaccines;

    if (stockFilter !== "ALL") {
      const visibleIds = new Set(
        filteredMasterLots.map((lot) =>
          String(lot.vaccine_id || lot.vaccine?.id || ""),
        ),
      );

      if (stockFilter !== "GENERAL") {
        const allowedSessionIds = assignmentSessionIdsForCurrentFilter();
        for (const assignment of sessionProductAssignments) {
          if (assignment.active === false) continue;
          if (!allowedSessionIds.has(Number(assignment.session_id || 0))) continue;
          visibleIds.add(String(assignment.vaccine_id || ""));
        }
      }

      if (stockFilter === "GENERAL") {
        for (const vaccine of vaccines) {
          const vaccineLots = lots.filter(
            (lot) =>
              String(lot.vaccine_id || lot.vaccine?.id || "") ===
              String(vaccine.id),
          );
          if (!vaccineLots.length) visibleIds.add(String(vaccine.id));
        }
      }

      visibleVaccines = vaccines.filter((vaccine) =>
        visibleIds.has(String(vaccine.id)),
      );
    }

    const status = String(productStatusFilter || "ALL").toUpperCase();
    const query = cleanText(productSearch).toLowerCase();

    return visibleVaccines.filter((vaccine) => {
      if (status === "ACTIVE" && vaccine.active === false) return false;
      if (status === "INACTIVE" && vaccine.active !== false) return false;

      if (productServiceFilter !== "ALL") {
        const modes = vaccineServiceModes(vaccine.id);
        if (!modes.includes(productServiceFilter)) return false;
      }

      if (!query) return true;

      const searchText = [
        vaccine.name,
        vaccine.brand,
        vaccine.price_category,
        vaccine.price,
        ...vaccineStockTargets(vaccine.id),
      ]
        .map((value) => cleanText(value).toLowerCase())
        .join(" ");

      return searchText.includes(query);
    });
  }, [
    vaccines,
    lots,
    filteredMasterLots,
    stockFilter,
    stockSessionFilter,
    stockSessions,
    sessionProductAssignments,
    productSearch,
    productStatusFilter,
    productServiceFilter,
    sessionMap,
  ]);

  function vaccineStockTargets(vaccineId: any) {
    const ownedLots = lots.filter(
      (lot) =>
        String(lot.vaccine_id || lot.vaccine?.id || "") ===
        String(vaccineId),
    );
    const ownedAssignments = sessionProductAssignments.filter(
      (assignment) =>
        assignment.active !== false &&
        String(assignment.vaccine_id || "") === String(vaccineId),
    );

    const targets = new Set<string>();
    for (const assignment of ownedAssignments) {
      const session = sessionMap.get(Number(assignment.session_id || 0));
      const companyName = cleanText(session?.company_name) || "Perusahaan";
      targets.add(
        `${companyName} · ${sessionLabel(session)} · ${serviceModeLabel(assignment.service_mode)}`,
      );
    }

    for (const lot of ownedLots) {
      const scope = lotScope(lot);
      if (scope === "SESSION") {
        const session = sessionMap.get(Number(lot.stock_session_id || 0));
        targets.add(
          `${cleanText(lot.stock_company_name) || "Perusahaan"} · ${sessionLabel(session)}`,
        );
      } else if (scope === "COMPANY") {
        targets.add(cleanText(lot.stock_company_name) || "Perusahaan");
      } else {
        targets.add("General");
      }
    }

    if (!targets.size) targets.add("General");
    return Array.from(targets);
  }

  function vaccineServiceModes(vaccineId: any) {
    const modes = new Set<string>();
    for (const assignment of sessionProductAssignments) {
      if (
        assignment.active === false ||
        String(assignment.vaccine_id || "") !== String(vaccineId)
      ) {
        continue;
      }
      if (
        stockSessionFilter !== "ALL" &&
        String(assignment.session_id || "") !== String(stockSessionFilter)
      ) {
        continue;
      }
      if (
        stockSessionFilter === "ALL" &&
        stockFilter !== "ALL" &&
        stockFilter !== "GENERAL"
      ) {
        const assignmentSession = sessionMap.get(Number(assignment.session_id || 0));
        if (
          normalizeCompany(assignmentSession?.company_name) !==
          normalizeCompany(stockFilter)
        ) {
          continue;
        }
      }
      const mode =
        String(assignment.service_mode || "HEALTHDAY").toUpperCase() === "BAZAR"
          ? "BAZAR"
          : "HEALTHDAY";
      modes.add(mode);
    }
    return Array.from(modes);
  }

  function productDisplayedInitialStock(vaccineId: any) {
    const vaccineKey = String(vaccineId || "");

    if (stockFilter !== "ALL" && stockFilter !== "GENERAL") {
      const allowedSessionIds = assignmentSessionIdsForCurrentFilter();
      const allowedModes =
        productServiceFilter === "ALL"
          ? new Set(["HEALTHDAY", "BAZAR"])
          : new Set([productServiceFilter]);

      const planned = sessionProductAssignments
        .filter((assignment) => {
          if (assignment.active === false) return false;
          if (String(assignment.vaccine_id || "") !== vaccineKey) return false;
          if (!allowedSessionIds.has(Number(assignment.session_id || 0))) return false;
          const mode =
            String(assignment.service_mode || "HEALTHDAY").toUpperCase() === "BAZAR"
              ? "BAZAR"
              : "HEALTHDAY";
          return allowedModes.has(mode);
        })
        .reduce(
          (sum, assignment) =>
            sum + Math.max(0, Number(assignment.planned_stock_initial || 0)),
          0,
        );

      const allocated = serviceStockAllocations
        .filter((allocation) => {
          if (allocation.active === false) return false;
          if (String(allocation.vaccine_id || "") !== vaccineKey) return false;
          if (!allowedSessionIds.has(Number(allocation.session_id || 0))) return false;
          const mode =
            String(allocation.service_mode || "HEALTHDAY").toUpperCase() === "BAZAR"
              ? "BAZAR"
              : "HEALTHDAY";
          return allowedModes.has(mode);
        })
        .reduce(
          (sum, allocation) =>
            sum + Math.max(0, Number(allocation.allocated_qty || 0)),
          0,
        );

      return planned + allocated;
    }

    const lotRows =
      stockFilter === "GENERAL"
        ? lots.filter(
            (lot) =>
              String(lot.vaccine_id || lot.vaccine?.id || "") === vaccineKey &&
              lotScope(lot) === "GENERAL",
          )
        : lots.filter(
            (lot) =>
              String(lot.vaccine_id || lot.vaccine?.id || "") === vaccineKey,
          );

    const materializedInitial = lotRows.reduce(
      (sum, lot) => sum + Math.max(0, Number(lot.stock_initial || 0)),
      0,
    );

    if (stockFilter === "GENERAL") return materializedInitial;

    const plannedUnmaterialized = sessionProductAssignments
      .filter(
        (assignment) =>
          assignment.active !== false &&
          String(assignment.vaccine_id || "") === vaccineKey,
      )
      .reduce(
        (sum, assignment) =>
          sum + Math.max(0, Number(assignment.planned_stock_initial || 0)),
        0,
      );

    return materializedInitial + plannedUnmaterialized;
  }

  const stockFilterLabel = useMemo(() => {
    if (stockFilter === "ALL") return "Semua";
    if (stockFilter === "GENERAL") return "General";
    if (stockSessionFilter === "ALL") return stockFilter;
    const session = sessionMap.get(Number(stockSessionFilter || 0));
    return `${stockFilter} · ${sessionLabel(session)}`;
  }, [stockFilter, stockSessionFilter, sessionMap]);

  const importProducts = useMemo(() => {
    const grouped = new Map<string, { key: string; code: string; name: string; label: string; locations: Set<string>; lots: Set<string> }>();
    for (const row of importRows) {
      if (!grouped.has(row.externalProductKey)) {
        grouped.set(row.externalProductKey, {
          key: row.externalProductKey,
          code: row.externalProductCode,
          name: row.externalProductName,
          label: row.externalProductLabel,
          locations: new Set<string>(),
          lots: new Set<string>(),
        });
      }
      grouped.get(row.externalProductKey)!.locations.add(row.sourceLocation);
      grouped.get(row.externalProductKey)!.lots.add(row.lotNumber);
    }
    return Array.from(grouped.values());
  }, [importRows]);

  const selectedImportLots = useMemo(() => {
    if (!selectedImportProductKey) return [];
    const grouped = new Map<string, { lotNumber: string; availableQuantity: number; locations: Set<string> }>();
    for (const row of importRows) {
      if (row.externalProductKey !== selectedImportProductKey) continue;
      if (!grouped.has(row.lotNumber)) {
        grouped.set(row.lotNumber, {
          lotNumber: row.lotNumber,
          availableQuantity: 0,
          locations: new Set<string>(),
        });
      }
      const item = grouped.get(row.lotNumber)!;
      item.availableQuantity += Number(row.availableQuantity || 0);
      if (row.sourceLocation) item.locations.add(row.sourceLocation);
    }
    return Array.from(grouped.values());
  }, [importRows, selectedImportProductKey]);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Master Vaksin & Lot Number</h1>
            <p className="mt-2 text-sm text-slate-600">Tambahkan harga produk, kategori harga, stok awal, tambahan stok, dan lot number khusus modul vaksinasi.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/vaccination/iserve"
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100"
            >
              ⇩ Export iServe
            </a>
            <a
              href="/vaccination/pricing"
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100"
            >
              💰 Paket / Non Paket
            </a>
            <a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a>
          </div>
        </div>
        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}
        {!mappingReady ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {mappingMessage || "Mapping produk import belum aktif. Jalankan SQL V153.18 terlebih dahulu."}
          </div>
        ) : null}
        {!companyStockReady ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {companyStockMessage || "Scope stok perusahaan belum aktif. Jalankan SQL ownership stok perusahaan terlebih dahulu."}
          </div>
        ) : null}

        <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50/40 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-bold">Import Produk & Lot dari stock.quant</h2>
              <p className="mt-1 text-sm text-slate-600">
                Import hanya row detail yang memiliki Product, Location, dan Lot/Serial Number. Lot disimpan sebagai teks agar leading zero seperti 0000046 tidak hilang.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50">
              Pilih File XLSX
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => readStockQuantFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          {importFileName ? <div className="mt-3 text-xs font-semibold text-slate-500">File: {importFileName}</div> : null}

          {importProducts.length ? (
            <>
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
                Klik nama produk import untuk otomatis mengambil <b>Nama Produk + Lot + Stok Import</b> ke satu form Master Vaksin.
              </div>

              <div className="mt-3 overflow-hidden rounded-xl border bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                    <tr>
                      <th className="p-3 text-left">Produk Import</th>
                      <th className="p-3 text-left">Kode</th>
                      <th className="p-3 text-left">Lot</th>
                      <th className="p-3 text-left">Lokasi</th>
                      <th className="p-3 text-left">Mapping ke Master Vaksin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {importProducts.map((product) => (
                      <tr key={product.key}>
                        <td className="p-3 font-bold">
                          <button
                            type="button"
                            onClick={() => chooseImportProductForMaster(product)}
                            className={`text-left font-bold underline-offset-4 hover:text-blue-700 hover:underline ${selectedImportProductKey === product.key ? "text-blue-700 underline" : "text-slate-900"}`}
                            title="Klik untuk isi Nama vaksin / produk"
                          >
                            {product.label}
                          </button>
                          {selectedImportProductKey === product.key ? (
                            <div className="mt-1 text-xs font-semibold text-blue-600">Dipilih untuk dibuat / dilengkapi di Master Vaksin</div>
                          ) : null}
                        </td>
                        <td className="p-3">{product.code || "-"}</td>
                        <td className="p-3">{Array.from(product.lots).join(", ")}</td>
                        <td className="p-3">{Array.from(product.locations).join(", ")}</td>
                        <td className="p-3">
                          <select
                            className="w-full min-w-[240px] rounded-xl border px-3 py-2"
                            value={importMappingSelections[product.key] || ""}
                            onChange={(e) => setImportMappingSelections((prev) => ({ ...prev, [product.key]: e.target.value }))}
                          >
                            <option value="">Auto: pakai mapping lama / cocok nama / buat master baru</option>
                            {activeVaccines.map((vaccine) => (
                              <option key={vaccine.id} value={vaccine.id}>
                                {vaccine.name}{vaccine.brand ? ` · ${vaccine.brand}` : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border bg-white">
                <div className="border-b bg-slate-50 px-4 py-3 text-sm font-bold">Preview Lot yang Akan Di-import</div>
                <div className="max-h-[240px] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                      <tr>
                        <th className="p-3 text-left">Produk</th>
                        <th className="p-3 text-left">Lokasi</th>
                        <th className="p-3 text-left">Lot</th>
                        <th className="p-3 text-left">Available</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {importRows.map((row, index) => (
                        <tr key={`${row.externalProductKey}-${row.lotNumber}-${row.sourceLocation}-${index}`}>
                          <td className="p-3">{row.externalProductLabel}</td>
                          <td className="p-3">{row.sourceLocation}</td>
                          <td className="p-3 font-bold">{row.lotNumber}</td>
                          <td className="p-3">{row.availableQuantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <button
                type="button"
                disabled={importing || !mappingReady}
                onClick={submitStockImport}
                className="mt-4 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importing ? "Mengimport..." : "Import Produk, Lot & Mapping"}
              </button>
            </>
          ) : null}
        </section>

        <section id="vaccination-master-product-form" className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-bold">Master Vaksin / Produk & Lot</h2>
              <p className="mt-1 text-sm text-slate-500">
                Produk dan lot dikelola dalam satu form. Klik produk dari hasil import agar Nama Produk, Lot Number, dan stok import otomatis terisi.
              </p>
            </div>
            {selectedImportProductKey ? (
              <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                Produk import dipilih
              </span>
            ) : null}
          </div>

          {selectedImportProductKey ? (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
              Data produk + lot sudah diambil dari file import. Lanjutkan isi Produsen, Harga Perusahaan, Jumlah Dosis, Next Dose, lalu simpan.
            </div>
          ) : null}

          <div className="mt-4 grid gap-5 xl:grid-cols-2">
            <fieldset className="grid content-start gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-bold text-slate-700">Data Produk</div>
                {masterEditMode === "LOT" ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800">
                    Aktif · perubahan hanya untuk Lot ini
                  </span>
                ) : null}
              </div>
              <input
                className="rounded-xl border px-3 py-2"
                placeholder="Nama vaksin / produk"
                value={vaccineForm.name}
                onChange={(e) => setVaccineForm({ ...vaccineForm, name: e.target.value })}
              />
              <input
                className="rounded-xl border px-3 py-2"
                placeholder="Brand / Produsen"
                value={vaccineForm.brand}
                onChange={(e) => setVaccineForm({ ...vaccineForm, brand: e.target.value })}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  className="rounded-xl border px-3 py-2"
                  placeholder="Kategori harga, contoh: Harga Perusahaan"
                  value={vaccineForm.priceCategory}
                  onChange={(e) => setVaccineForm({ ...vaccineForm, priceCategory: e.target.value })}
                />
                <input
                  type="number"
                  className="rounded-xl border px-3 py-2"
                  placeholder="Harga produk"
                  value={vaccineForm.price}
                  onChange={(e) => setVaccineForm({ ...vaccineForm, price: e.target.value })}
                />
              </div>
              <textarea
                className="rounded-xl border px-3 py-2"
                placeholder="Deskripsi / keterangan produk"
                value={vaccineForm.description}
                onChange={(e) => setVaccineForm({ ...vaccineForm, description: e.target.value })}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  type="number"
                  className="rounded-xl border px-3 py-2"
                  placeholder="Jumlah dosis"
                  value={vaccineForm.doseCount}
                  onChange={(e) => setVaccineForm({ ...vaccineForm, doseCount: Number(e.target.value || 1) })}
                />
                <input
                  type="number"
                  className="rounded-xl border px-3 py-2"
                  placeholder="Next dose hari"
                  value={vaccineForm.defaultNextDoseDays}
                  onChange={(e) => setVaccineForm({ ...vaccineForm, defaultNextDoseDays: e.target.value })}
                />
              </div>
            </fieldset>

            <div className="grid content-start gap-3">
              <div className="text-sm font-bold text-slate-700">Lot & Stok</div>

              {masterEditMode === "LOT" ? (
                <label className="grid gap-1 text-xs font-semibold text-slate-600">
                  Produk Induk Lot
                  <select
                    className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-slate-900"
                    value={lotForm.vaccineId}
                    onChange={(e) => applyLotParentProduct(e.target.value)}
                  >
                    {vaccines
                      .filter((vaccine) => vaccine.active !== false)
                      .map((vaccine) => (
                        <option key={vaccine.id} value={String(vaccine.id)}>
                          {vaccine.name}{vaccine.brand ? ` · ${vaccine.brand}` : ""}
                        </option>
                      ))}
                  </select>
                  <span className="font-normal text-amber-700">
                    Pilih produk master yang sudah ada, atau langsung ubah Data Produk di kiri. Perubahan nama/brand saat Edit Lot akan memindahkan Lot ini saja; lot lain tidak ikut berubah. Sistem menolak pemindahan jika Lot sudah dipakai pada data operasional.
                  </span>
                </label>
              ) : null}

              {selectedImportLots.length > 1 ? (
                <select
                  className="rounded-xl border px-3 py-2"
                  value={lotForm.lotNumber}
                  onChange={(e) => applyImportLot(selectedImportProductKey, e.target.value)}
                >
                  {selectedImportLots.map((row) => (
                    <option key={row.lotNumber} value={row.lotNumber}>
                      {row.lotNumber} · {Array.from(row.locations).join(", ")} · stok {row.availableQuantity}
                    </option>
                  ))}
                </select>
              ) : null}

              <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Penggunaan Stok
                  <select
                    className="rounded-xl border px-3 py-2 text-sm text-slate-900"
                    value={lotForm.stockScope}
                    disabled={!companyStockReady}
                    onChange={(e) =>
                      setLotForm((current) => ({
                        ...current,
                        stockScope: e.target.value,
                        stockCompanyName:
                          e.target.value === "GENERAL"
                            ? ""
                            : current.stockCompanyName,
                        stockSessionId:
                          e.target.value === "SESSION"
                            ? current.stockSessionId
                            : "",
                        healthdayStockQty:
                          e.target.value === "SESSION" ? current.healthdayStockQty : 0,
                        bazarStockQty:
                          e.target.value === "SESSION" ? current.bazarStockQty : 0,
                      }))
                    }
                  >
                    <option value="GENERAL">Global — lintas perusahaan</option>
                    <option value="COMPANY">Semua Session Perusahaan</option>
                    <option value="SESSION">Session / Lokasi Spesifik</option>
                  </select>
                </label>

                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Perusahaan
                  <select
                    className="rounded-xl border px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
                    value={lotForm.stockCompanyName}
                    disabled={!companyStockReady || lotForm.stockScope === "GENERAL"}
                    onChange={(e) =>
                      setLotForm((current) => ({
                        ...current,
                        stockCompanyName: e.target.value,
                        stockSessionId: "",
                        healthdayStockQty: 0,
                        bazarStockQty: 0,
                      }))
                    }
                  >
                    <option value="">
                      {lotForm.stockScope === "GENERAL"
                        ? "Tidak diperlukan untuk General"
                        : "Pilih perusahaan"}
                    </option>
                    {companyOptions.map((company) => (
                      <option key={company} value={company}>
                        {company}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Session / Lokasi
                  <select
                    className="rounded-xl border px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
                    value={lotForm.stockSessionId}
                    disabled={
                      !companyStockReady ||
                      lotForm.stockScope !== "SESSION" ||
                      !lotForm.stockCompanyName
                    }
                    onChange={(e) => {
                      const nextSessionId = e.target.value;
                      setLotForm((current) => {
                        const currentLot = lots.find(
                          (lot) =>
                            String(lot.vaccine_id || lot.vaccine?.id || "") === String(current.vaccineId || "") &&
                            cleanText(lot.lot_number) === cleanText(current.lotNumber),
                        );
                        const fallbackRemaining = currentLot
                          ? Math.max(
                              0,
                              Number(currentLot.stock_initial || 0) +
                                Number(currentLot.stock_added || 0) -
                                Number(currentLot.stock_used || 0),
                            )
                          : 0;
                        const healthdayExisting = currentLot
                          ? serviceAllocationQty(currentLot.id, nextSessionId, "HEALTHDAY")
                          : 0;
                        return {
                          ...current,
                          stockSessionId: nextSessionId,
                          healthdayStockQty:
                            nextSessionId && currentLot
                              ? healthdayExisting || fallbackRemaining
                              : 0,
                          bazarStockQty:
                            nextSessionId && currentLot
                              ? serviceAllocationQty(currentLot.id, nextSessionId, "BAZAR")
                              : 0,
                        };
                      });
                    }}
                  >
                    <option value="">
                      {lotForm.stockScope === "SESSION"
                        ? "Pilih session / lokasi"
                        : "Hanya untuk Scope Session"}
                    </option>
                    {lotCompanySessions.map((session) => (
                      <option key={session.id} value={String(session.id)}>
                        {sessionLabel(session)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {lotForm.stockScope === "GENERAL" ? (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  Global dapat dipakai lintas perusahaan dan lintas session.
                </div>
              ) : lotForm.stockScope === "COMPANY" ? (
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  Semua Session Perusahaan: tidak perlu memilih Session/Lokasi. Stok ini menjadi milik perusahaan dan dapat dipakai oleh seluruh session perusahaan tersebut.
                </div>
              ) : (
                <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-700">
                  Session / Lokasi Spesifik: pilih satu Session. Lot ini hanya milik session tersebut; pemindahan sisa stok ke session lain sebaiknya dilakukan melalui transaksi transfer agar audit tetap tercatat.
                </div>
              )}

              {lotForm.stockScope === "SESSION" ? (
                <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
                  <div className="mb-3">
                    <div className="text-sm font-black text-violet-900">
                      Pembagian Stok Session
                    </div>
                    <div className="text-xs text-violet-700">
                      Pilih jenis layanan dulu, lalu pilih Lot Number. Detail stok lot akan tampil otomatis.
                    </div>
                  </div>

                  {!serviceStockReady ? (
                    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {serviceStockMessage || "Pembagian stok Healthday/Bazar belum aktif di database."}
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-xs font-bold text-slate-700">
                      Jenis Stok Session
                      <select
                        className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                        value={serviceStockEditorMode}
                        onChange={(e) =>
                          selectServiceStockMode(e.target.value === "BAZAR" ? "BAZAR" : "HEALTHDAY")
                        }
                      >
                        <option value="HEALTHDAY">Healthday (Gratis)</option>
                        <option value="BAZAR">Bazar (Bayar)</option>
                      </select>
                    </label>

                    <label className="grid gap-1 text-xs font-bold text-slate-700">
                      Lot Number
                      <select
                        className="rounded-xl border bg-white px-3 py-2 text-sm text-slate-900"
                        value={serviceStockEditorLotId}
                        onChange={(e) => selectServiceStockLot(e.target.value)}
                        disabled={!cleanText(lotForm.stockSessionId) || !serviceStockEditorLots.length}
                      >
                        <option value="">
                          {!cleanText(lotForm.stockSessionId)
                            ? "Pilih Session / Lokasi dulu"
                            : serviceStockEditorLots.length
                              ? "Pilih Lot Number"
                              : "Belum ada lot untuk Session ini"}
                        </option>
                        {serviceStockEditorLots.map((lot) => {
                          const remaining = Math.max(
                            0,
                            Number(lot.stock_initial || 0) +
                              Number(lot.stock_added || 0) -
                              Number(lot.stock_used || 0),
                          );
                          return (
                            <option key={lot.id} value={String(lot.id)}>
                              {lot.vaccine?.name || "Vaksin"} · Lot {lot.lot_number} · Sisa {remaining}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  </div>

                  {cleanText(lotForm.stockSessionId) && !serviceStockEditorLots.length ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                      Belum ada Lot Number untuk Session ini. Simpan Produk & Lot terlebih dahulu, lalu pilih lot di sini untuk membagi stok Healthday/Bazar.
                    </div>
                  ) : null}

                  {selectedServiceStockLot ? (
                    <div className="mt-3 grid gap-3">
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="rounded-lg border bg-white p-2">
                          <div className="text-[11px] font-bold uppercase text-slate-500">Produk</div>
                          <div className="mt-1 text-sm font-bold text-slate-900">{selectedServiceStockLot.vaccine?.name || "-"}</div>
                        </div>
                        <div className="rounded-lg border bg-white p-2">
                          <div className="text-[11px] font-bold uppercase text-slate-500">Lot Number</div>
                          <div className="mt-1 text-sm font-black text-slate-900">{selectedServiceStockLot.lot_number || "-"}</div>
                        </div>
                        <div className="rounded-lg border bg-white p-2">
                          <div className="text-[11px] font-bold uppercase text-slate-500">Expired</div>
                          <div className="mt-1 text-sm font-bold text-slate-900">{selectedServiceStockLot.expiry_date || "-"}</div>
                        </div>
                        <div className="rounded-lg border bg-white p-2">
                          <div className="text-[11px] font-bold uppercase text-slate-500">Stok Awal</div>
                          <div className="mt-1 text-sm font-black text-slate-900">{Number(selectedServiceStockLot.stock_initial || 0)}</div>
                        </div>
                        <div className="rounded-lg border bg-white p-2">
                          <div className="text-[11px] font-bold uppercase text-slate-500">Tambahan</div>
                          <div className="mt-1 text-sm font-black text-slate-900">{Number(selectedServiceStockLot.stock_added || 0)}</div>
                        </div>
                        <div className="rounded-lg border bg-white p-2">
                          <div className="text-[11px] font-bold uppercase text-slate-500">Terpakai</div>
                          <div className="mt-1 text-sm font-black text-slate-900">{Number(selectedServiceStockLot.stock_used || 0)}</div>
                        </div>
                        <div className="rounded-lg border bg-white p-2">
                          <div className="text-[11px] font-bold uppercase text-slate-500">Sisa Lot</div>
                          <div className="mt-1 text-sm font-black text-slate-900">{selectedServiceStockRemaining}</div>
                        </div>
                        <div className="rounded-lg border border-blue-100 bg-blue-50 p-2">
                          <div className="text-[11px] font-bold uppercase text-blue-600">Healthday</div>
                          <div className="mt-1 text-sm font-black text-blue-900">{selectedServiceStockHealthday}</div>
                        </div>
                        <div className="rounded-lg border border-violet-100 bg-violet-50 p-2">
                          <div className="text-[11px] font-bold uppercase text-violet-600">Bazar</div>
                          <div className="mt-1 text-sm font-black text-violet-900">{selectedServiceStockBazar}</div>
                        </div>
                        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2">
                          <div className="text-[11px] font-bold uppercase text-emerald-600">Belum Dialokasikan</div>
                          <div className="mt-1 text-sm font-black text-emerald-900">
                            {Math.max(0, selectedServiceStockRemaining - selectedServiceStockHealthday - selectedServiceStockBazar)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-3">
                        <div className="min-w-[220px] flex-1">
                          <div className="text-xs font-bold text-slate-600">
                            Qty Alokasi · {serviceStockEditorMode === "BAZAR" ? "Bazar (Bayar)" : "Healthday (Gratis)"}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              className="h-10 w-10 rounded-lg border bg-slate-50 text-lg font-black text-slate-700"
                              onClick={() => setServiceStockEditorQty((qty) => Math.max(0, qty - 1))}
                            >
                              −
                            </button>
                            <input
                              readOnly
                              className="h-10 w-24 rounded-lg border bg-white text-center text-base font-black text-slate-900"
                              value={Math.max(0, Math.min(selectedServiceStockMaxQty, serviceStockEditorQty))}
                            />
                            <button
                              type="button"
                              className="h-10 w-10 rounded-lg border bg-slate-50 text-lg font-black text-slate-700"
                              onClick={() =>
                                setServiceStockEditorQty((qty) => Math.min(selectedServiceStockMaxQty, qty + 1))
                              }
                            >
                              +
                            </button>
                            <button
                              type="button"
                              className="h-10 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-bold text-violet-700"
                              onClick={() => setServiceStockEditorQty(selectedServiceStockMaxQty)}
                            >
                              Max {selectedServiceStockMaxQty}
                            </button>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={savingServiceStock || !serviceStockReady}
                          onClick={saveSelectedServiceStock}
                          className="h-10 rounded-lg bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {savingServiceStock
                            ? "Menyimpan..."
                            : `Simpan Stok ${serviceStockEditorMode === "BAZAR" ? "Bazar" : "Healthday"}`}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}


              <input
                className="rounded-xl border px-3 py-2"
                placeholder="Lot Number / Batch (Opsional)"
                value={lotForm.lotNumber}
                onChange={(e) => setLotForm({ ...lotForm, lotNumber: e.target.value })}
              />

              {!cleanText(lotForm.lotNumber) ? (
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  Lot Number tidak wajib untuk menyimpan produk ke Session. Tanpa Lot, produk tetap muncul di filter Session, tetapi stok fisik belum aktif sampai Lot Number dibuat.
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Expired
                  <input
                    type="date"
                    className="rounded-xl border px-3 py-2 text-sm text-slate-900"
                    disabled={!cleanText(lotForm.lotNumber)}
                    value={lotForm.expiryDate}
                    onChange={(e) => setLotForm({ ...lotForm, expiryDate: e.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Stok fisik / hasil import
                  <input
                    type="number"
                    className="rounded-xl border px-3 py-2 text-sm text-slate-900"
                    placeholder="Stok fisik"
                    disabled={!cleanText(lotForm.lotNumber)}
                    value={lotForm.stockPhysicalCount}
                    onChange={(e) => setLotForm({ ...lotForm, stockPhysicalCount: e.target.value })}
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Jumlah awal
                  <input
                    type="number"
                    className="rounded-xl border px-3 py-2 text-sm text-slate-900"
                    value={lotForm.stockInitial}
                    onChange={(e) => setLotForm({ ...lotForm, stockInitial: Number(e.target.value || 0) })}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Tambahan stok
                  <input
                    type="number"
                    className="rounded-xl border px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
                    disabled={!cleanText(lotForm.lotNumber)}
                    value={lotForm.stockAdded}
                    onChange={(e) => setLotForm({ ...lotForm, stockAdded: Number(e.target.value || 0) })}
                  />
                </label>
              </div>

              {!cleanText(lotForm.lotNumber) && lotForm.stockScope === "SESSION" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Jumlah Awal boleh diisi sebelum Lot tersedia. Nilai ini disimpan sebagai stok rencana untuk Session + Jenis Stok ini, lalu otomatis dipakai sebagai stock initial saat Lot Number ditambahkan.
                </div>
              ) : null}

              <textarea
                className="rounded-xl border px-3 py-2"
                placeholder="Keterangan inventory / stok"
                disabled={!cleanText(lotForm.lotNumber)}
                value={lotForm.inventoryNotes}
                onChange={(e) => setLotForm({ ...lotForm, inventoryNotes: e.target.value })}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={submitProductAndLot}
            className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700"
          >
            {masterEditMode === "LOT"
              ? "Simpan Perubahan Lot & Produk Ini"
              : masterEditMode === "PRODUCT"
                ? "Simpan Perubahan Produk & Lot"
                : "Simpan Produk & Lot"}
          </button>
        </section>

        <section className="mt-6 rounded-2xl border">
          <div className="border-b bg-slate-50 p-4 font-bold">Mapping Produk Import → Master Vaksin</div>
          <div className="max-h-[300px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="p-3 text-left">Produk Import</th>
                  <th className="p-3 text-left">Kode</th>
                  <th className="p-3 text-left">Master Vaksin</th>
                  <th className="p-3 text-left">Lokasi Terakhir</th>
                  <th className="p-3 text-left">Last Import</th>
                  <th className="p-3 text-left">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {productMappings.map((mapping) => {
                  const editing = String(editingMappingId) === String(mapping.id);
                  return (
                    <tr key={mapping.id}>
                      <td className="p-3 font-bold">{mapping.external_product_label || mapping.external_product_name || "-"}</td>
                      <td className="p-3">{mapping.external_product_code || "-"}</td>
                      <td className="p-3">
                        {editing ? (
                          <select
                            className="min-w-[220px] rounded-lg border px-2 py-1.5"
                            value={editingMappingVaccineId}
                            onChange={(e) => setEditingMappingVaccineId(e.target.value)}
                          >
                            <option value="">Pilih Master Vaksin</option>
                            {activeVaccines.map((vaccine) => (
                              <option key={vaccine.id} value={String(vaccine.id)}>
                                {vaccine.name}{vaccine.brand ? ` · ${vaccine.brand}` : ""}
                              </option>
                            ))}
                          </select>
                        ) : (
                          mapping.vaccine?.name || "-"
                        )}
                      </td>
                      <td className="p-3">{mapping.source_location || "-"}</td>
                      <td className="p-3">{mapping.last_imported_at ? new Date(mapping.last_imported_at).toLocaleString("id-ID") : "-"}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {editing ? (
                            <>
                              <button type="button" onClick={() => saveMapping(mapping)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">Simpan</button>
                              <button type="button" onClick={() => { setEditingMappingId(""); setEditingMappingVaccineId(""); }} className="rounded-lg border px-3 py-1.5 text-xs font-bold">Batal</button>
                            </>
                          ) : (
                            <button type="button" onClick={() => startEditMapping(mapping)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">✏️ Edit</button>
                          )}
                          <button type="button" onClick={() => deleteMapping(mapping)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700" title="Hapus mapping">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!productMappings.length ? (
                  <tr><td colSpan={6} className="p-5 text-center text-slate-500">Belum ada mapping produk import.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border bg-slate-50 p-4">
          <div className="grid gap-3 lg:grid-cols-[220px_1fr_1fr] lg:items-center">
            <div>
              <div className="text-sm font-bold text-slate-800">Filter Tujuan Stok</div>
              <div className="text-xs text-slate-500">
                Filter per perusahaan lalu per Session/Lokasi untuk melihat stok lokasi secara terpisah.
              </div>
            </div>
            <select
              className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold"
              value={stockFilter}
              onChange={(e) => {
                setStockFilter(e.target.value);
                setStockSessionFilter("ALL");
              }}
            >
              <option value="ALL">Semua Produk & Stok</option>
              <option value="GENERAL">General</option>
              {companyOptions.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold disabled:bg-slate-100 disabled:text-slate-400"
              value={stockSessionFilter}
              disabled={stockFilter === "ALL" || stockFilter === "GENERAL"}
              onChange={(e) => setStockSessionFilter(e.target.value)}
            >
              <option value="ALL">Semua Session / Lokasi perusahaan</option>
              {filterCompanySessions.map((session) => (
                <option key={session.id} value={String(session.id)}>
                  {sessionLabel(session)}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border">
          <div className="border-b bg-slate-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="font-bold">Daftar Produk · {stockFilterLabel}</div>
                <div className="mt-1 text-xs text-slate-500">
                  Menampilkan {filteredVaccines.length} dari {vaccines.length} produk master.
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_150px_150px] lg:w-[760px]">
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Cari produk, brand, kategori, tujuan stok..."
                  className="rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                />
                <select
                  value={productStatusFilter}
                  onChange={(e) => setProductStatusFilter(e.target.value)}
                  className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="ACTIVE">Aktif</option>
                  <option value="INACTIVE">Nonaktif</option>
                </select>
                <select
                  value={productServiceFilter}
                  onChange={(e) => setProductServiceFilter(e.target.value)}
                  className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold"
                >
                  <option value="ALL">Semua Jenis Stok</option>
                  <option value="HEALTHDAY">Healthday</option>
                  <option value="BAZAR">Bazar</option>
                </select>
              </div>
            </div>
          </div>
          <div className="max-h-[320px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="p-3 text-left">Produk</th>
                  <th className="p-3 text-left">Brand</th>
                  <th className="p-3 text-left">Kategori Harga</th>
                  <th className="p-3 text-left">Harga</th>
                  <th className="p-3 text-left">Tujuan Stok</th>
                  <th className="p-3 text-left">Jenis Stok</th>
                  <th className="p-3 text-left">Stok Awal</th>
                  <th className="p-3 text-left">Transaksi</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredVaccines.map((v) => (
                  <tr key={v.id}>
                    <td className="p-3 font-bold">{v.name}</td>
                    <td className="p-3">{v.brand || "-"}</td>
                    <td className="p-3">{v.price_category || "-"}</td>
                    <td className="p-3 font-bold">{money(v.price)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {vaccineStockTargets(v.id).map((target) => (
                          <span key={target} className="rounded-full border bg-slate-50 px-2 py-1 text-xs font-semibold">
                            {target}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {vaccineServiceModes(v.id).length ? (
                          vaccineServiceModes(v.id).map((mode) => (
                            <span
                              key={mode}
                              className={`rounded-full px-2 py-1 text-xs font-bold ${
                                mode === "BAZAR"
                                  ? "bg-violet-50 text-violet-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {mode === "BAZAR" ? "Bazar" : "Healthday"}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm font-black text-slate-800">
                        {productDisplayedInitialStock(v.id)}
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => openStockTransactions(v)}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                      >
                        📋 Transaksi
                      </button>
                    </td>
                    <td className="p-3">{v.active ? "Aktif" : "Nonaktif"}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => editProduct(v)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">✏️ Edit</button>
                        <button type="button" onClick={() => deleteVaccine(v)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700" title="Hapus produk">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredVaccines.length ? (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-sm text-slate-500">
                      Tidak ada produk yang cocok dengan filter. Coba ubah pencarian, status, perusahaan, atau Session/Lokasi.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border">
          <div className="border-b bg-slate-50 p-4 font-bold">
            Daftar Lot Aktif · {stockFilterLabel}
            {productServiceFilter !== "ALL"
              ? ` · ${productServiceFilter === "BAZAR" ? "Bazar" : "Healthday"}`
              : ""}
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="p-3 text-left">Vaksin</th>
                  <th className="p-3 text-left">Lot</th>
                  <th className="p-3 text-left">Scope</th>
                  <th className="p-3 text-left">Perusahaan</th>
                  <th className="p-3 text-left">Session / Lokasi</th>
                  <th className="p-3 text-left">Expired</th>
                  <th className="p-3 text-left">Awal</th>
                  <th className="p-3 text-left">Tambahan</th>
                  <th className="p-3 text-left">Terpakai</th>
                  <th className="p-3 text-left">Stok Import</th>
                  <th className="p-3 text-left">Sisa Sistem</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredMasterLots.map((lot) => {
                  const awal = Number(lot.stock_initial || 0);
                  const tambah = Number(lot.stock_added || 0);
                  const used = Number(lot.stock_used || 0);
                  const physical = lot.stock_physical_count == null ? "-" : Number(lot.stock_physical_count);
                  return (
                    <tr key={lot.id}>
                      <td className="p-3">{lot.vaccine?.name || "-"}</td>
                      <td className="p-3 font-bold">{lot.lot_number}</td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold ${
                            lotScope(lot) === "SESSION"
                              ? "bg-violet-50 text-violet-700"
                              : lotScope(lot) === "COMPANY"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {lotScope(lot) === "SESSION"
                            ? "Session"
                            : lotScope(lot) === "COMPANY"
                              ? "Perusahaan"
                              : "General"}
                        </span>
                      </td>
                      <td className="p-3">
                        {lotScope(lot) === "GENERAL" ? "-" : lot.stock_company_name || "-"}
                      </td>
                      <td className="p-3">
                        {lotScope(lot) === "SESSION" ? (
                          <div>
                            <div>{sessionLabel(sessionMap.get(Number(lot.stock_session_id || 0)))}</div>
                            <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-bold">
                              {productServiceFilter !== "BAZAR" ? (
                                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
                                  Healthday {serviceAllocationQty(lot.id, lot.stock_session_id, "HEALTHDAY")}
                                </span>
                              ) : null}
                              {productServiceFilter !== "HEALTHDAY" ? (
                                <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">
                                  Bazar {serviceAllocationQty(lot.id, lot.stock_session_id, "BAZAR")}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="p-3">{lot.expiry_date || "-"}</td>
                      <td className="p-3">{awal}</td>
                      <td className="p-3">{tambah}</td>
                      <td className="p-3">{used}</td>
                      <td className="p-3 font-bold">{physical}</td>
                      <td className="p-3 font-bold">{awal + tambah - used}</td>
                      <td className="p-3">{lot.active ? "Aktif" : "Nonaktif"}</td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => editLot(lot)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">✏️ Edit</button>
                          <button
                            type="button"
                            onClick={() => openTransferStock(lot)}
                            disabled={awal + tambah - used <= 0}
                            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                            title={awal + tambah - used <= 0 ? "Tidak ada sisa stok" : "Transfer seluruh sisa stok ke Session lain"}
                          >
                            ⇄ Transfer Stok
                          </button>
                          <button type="button" onClick={() => deleteLot(lot)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700" title="Hapus lot">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {transactionProduct ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b p-5">
                <div>
                  <h2 className="text-xl font-black">Transaksi Stok</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {transactionProduct.name || "Produk"} · {stockFilterLabel}
                    {productServiceFilter !== "ALL"
                      ? ` · ${productServiceFilter === "BAZAR" ? "Bazar" : "Healthday"}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeStockTransactions}
                  className="rounded-lg border px-3 py-1.5 text-sm font-bold"
                >
                  ✕ Tutup
                </button>
              </div>

              <div className="max-h-[calc(90vh-90px)] overflow-auto p-5">
                {stockTransactionLoading ? (
                  <div className="rounded-xl border bg-slate-50 p-5 text-sm font-semibold text-slate-600">
                    Memuat transaksi stok...
                  </div>
                ) : stockTransactionError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                    {stockTransactionError}
                  </div>
                ) : (
                  <>
                    <div className="mb-5 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border bg-slate-50 p-4">
                        <div className="text-xs font-bold uppercase text-slate-500">Stok Awal / Alokasi</div>
                        <div className="mt-1 text-2xl font-black">{productDisplayedInitialStock(transactionProduct.id)}</div>
                      </div>
                      <div className="rounded-xl border bg-red-50 p-4">
                        <div className="text-xs font-bold uppercase text-red-600">Keluar ke Peserta</div>
                        <div className="mt-1 text-2xl font-black text-red-700">
                          {stockTransactionData.summary?.usage_count ?? stockTransactionData.usage.length}
                        </div>
                      </div>
                      <div className="rounded-xl border bg-emerald-50 p-4">
                        <div className="text-xs font-bold uppercase text-emerald-700">Peserta Unik</div>
                        <div className="mt-1 text-2xl font-black text-emerald-800">
                          {stockTransactionData.summary?.participant_count ?? new Set(stockTransactionData.usage.map((row) => row.participant_name)).size}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border">
                      <div className="border-b bg-slate-50 px-4 py-3 font-bold">Pemakaian ke Peserta</div>
                      <div className="max-h-[360px] overflow-auto">
                        <table className="min-w-full text-sm">
                          <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600">
                            <tr>
                              <th className="p-3 text-left">Tanggal</th>
                              <th className="p-3 text-left">Nama Peserta</th>
                              <th className="p-3 text-left">Jenis Stok</th>
                              <th className="p-3 text-left">Lot</th>
                              <th className="p-3 text-left">Qty</th>
                              <th className="p-3 text-left">Session / Lokasi</th>
                              <th className="p-3 text-left">Petugas</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {stockTransactionData.usage.map((row) => (
                              <tr key={`usage-${row.id}`}>
                                <td className="p-3 whitespace-nowrap">
                                  {row.administered_at
                                    ? new Date(row.administered_at).toLocaleString("id-ID")
                                    : "-"}
                                </td>
                                <td className="p-3 font-bold">{row.participant_name || "-"}</td>
                                <td className="p-3">
                                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${
                                    row.service_mode === "BAZAR"
                                      ? "bg-violet-50 text-violet-700"
                                      : "bg-blue-50 text-blue-700"
                                  }`}>
                                    {row.service_mode === "BAZAR" ? "Bazar" : "Healthday"}
                                  </span>
                                </td>
                                <td className="p-3 font-mono font-bold">{row.lot_number || "-"}</td>
                                <td className="p-3 font-black text-red-700">-1</td>
                                <td className="p-3">{row.session_label || "-"}</td>
                                <td className="p-3">{row.administered_by || "-"}</td>
                              </tr>
                            ))}
                            {!stockTransactionData.usage.length ? (
                              <tr>
                                <td colSpan={7} className="p-6 text-center text-slate-500">
                                  Belum ada stok keluar ke peserta pada filter ini.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl border">
                      <div className="border-b bg-slate-50 px-4 py-3 font-bold">Movement Inventory</div>
                      <div className="max-h-[260px] overflow-auto">
                        <table className="min-w-full text-sm">
                          <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600">
                            <tr>
                              <th className="p-3 text-left">Tanggal</th>
                              <th className="p-3 text-left">Jenis</th>
                              <th className="p-3 text-left">Lot</th>
                              <th className="p-3 text-left">Qty</th>
                              <th className="p-3 text-left">Catatan</th>
                              <th className="p-3 text-left">Oleh</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {stockTransactionData.movements.map((row) => (
                              <tr key={`movement-${row.id}`}>
                                <td className="p-3 whitespace-nowrap">
                                  {row.created_at
                                    ? new Date(row.created_at).toLocaleString("id-ID")
                                    : "-"}
                                </td>
                                <td className="p-3 font-bold">{row.movement_type || "-"}</td>
                                <td className="p-3 font-mono">{row.lot_number || "-"}</td>
                                <td className={`p-3 font-black ${Number(row.qty || 0) < 0 ? "text-red-700" : "text-emerald-700"}`}>
                                  {Number(row.qty || 0) > 0 ? "+" : ""}{Number(row.qty || 0)}
                                </td>
                                <td className="p-3">{row.notes || "-"}</td>
                                <td className="p-3">{row.created_by || "-"}</td>
                              </tr>
                            ))}
                            {!stockTransactionData.movements.length ? (
                              <tr>
                                <td colSpan={6} className="p-5 text-center text-slate-500">
                                  Belum ada movement inventory untuk produk/filter ini.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {transferLot ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b p-5">
                <div>
                  <h2 className="text-xl font-black">Transfer Stok</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {transferLot.vaccine?.name || "Vaksin"} · Lot{" "}
                    <span className="font-bold">{transferLot.lot_number}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeTransferStock}
                  disabled={transferringStock}
                  className="rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-50"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 p-5">
                <div className="grid gap-3 rounded-xl border bg-slate-50 p-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-bold uppercase text-slate-500">Stok Saat Ini</div>
                    <div className="mt-1 text-2xl font-black">{transferRemaining}</div>
                    <div className="text-xs text-slate-500">Seluruh sisa stok akan dipindahkan.</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase text-slate-500">Owner Saat Ini</div>
                    <div className="mt-1 text-sm font-bold">
                      {lotScope(transferLot) === "GENERAL"
                        ? "Global"
                        : lotScope(transferLot) === "COMPANY"
                          ? transferLot.stock_company_name || "Perusahaan"
                          : `${transferLot.stock_company_name || "Perusahaan"} · ${sessionLabel(
                              sessionMap.get(Number(transferLot.stock_session_id || 0)),
                            )}`}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">Perusahaan Tujuan</span>
                    <select
                      className="input w-full"
                      value={transferCompanyName}
                      onChange={(e) => {
                        setTransferCompanyName(e.target.value);
                        setTransferSessionId("");
                      }}
                    >
                      <option value="">Pilih perusahaan</option>
                      {companyOptions.map((company) => (
                        <option key={company} value={company}>
                          {company}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-bold">Session / Lokasi Tujuan</span>
                    <select
                      className="input w-full"
                      value={transferSessionId}
                      onChange={(e) => setTransferSessionId(e.target.value)}
                      disabled={!transferCompanyName}
                    >
                      <option value="">
                        {transferCompanyName
                          ? "Pilih Session / Lokasi"
                          : "Pilih perusahaan terlebih dahulu"}
                      </option>
                      {transferTargetSessions.map((session) => (
                        <option key={session.id} value={String(session.id)}>
                          {sessionLabel(session)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="mb-1 block text-sm font-bold">Jenis Layanan Tujuan</span>
                    <select
                      className="input w-full"
                      value={transferServiceMode}
                      onChange={(e) =>
                        setTransferServiceMode(
                          e.target.value === "BAZAR" ? "BAZAR" : "HEALTHDAY",
                        )
                      }
                      disabled={!transferSessionId}
                    >
                      <option value="HEALTHDAY">Healthday (Gratis)</option>
                      <option value="BAZAR">Bazar (Bayar)</option>
                    </select>
                    <span className="mt-1 block text-xs text-slate-500">
                      Seluruh sisa stok yang ditransfer akan masuk ke bucket layanan ini.
                    </span>
                  </label>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Transfer tidak menghapus riwayat pemakaian sebelumnya. Hanya ownership
                  <b> sisa stok</b> lot yang dipindahkan ke Session tujuan dan dicatat ke audit inventory.
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t p-5">
                <button
                  type="button"
                  onClick={closeTransferStock}
                  disabled={transferringStock}
                  className="rounded-xl border px-4 py-2 font-bold disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={transferRemainingStock}
                  disabled={
                    transferringStock ||
                    !transferCompanyName ||
                    !transferSessionId ||
                    transferRemaining <= 0
                  }
                  className="rounded-xl bg-amber-500 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {transferringStock ? "Memindahkan..." : `Transfer Sisa Stok (${transferRemaining})`}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
