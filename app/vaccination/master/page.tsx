"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

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
  const [mappingReady, setMappingReady] = useState(true);
  const [mappingMessage, setMappingMessage] = useState("");
  const [message, setMessage] = useState("Buat master vaksin, harga produk, dan lot number.");
  const [error, setError] = useState("");
  const [importRows, setImportRows] = useState<StockImportRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importMappingSelections, setImportMappingSelections] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [vaccineForm, setVaccineForm] = useState({
    name: "",
    brand: "",
    description: "",
    priceCategory: "Harga Perusahaan",
    price: "",
    doseCount: 1,
    defaultNextDoseDays: "",
  });
  const [lotForm, setLotForm] = useState({ vaccineId: "", lotNumber: "", expiryDate: "", stockInitial: 0, stockAdded: 0, stockPhysicalCount: "", inventoryNotes: "" });

  async function loadData() {
    const json = await fetch("/api/vaccination/master", { cache: "no-store" }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Gagal mengambil data."); return; }
    setVaccines(json.vaccines || []);
    setLots(json.lots || []);
    setProductMappings(json.productMappings || []);
    setMappingReady(json.mappingReady !== false);
    setMappingMessage(json.mappingMessage || "");
    if (!lotForm.vaccineId && json.vaccines?.[0]?.id) setLotForm((s) => ({ ...s, vaccineId: String(json.vaccines[0].id) }));
  }

  async function submitVaccine() {
    setError("");
    const json = await fetch("/api/vaccination/master", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-vaccine", ...vaccineForm }) }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Gagal menyimpan vaksin."); return; }
    setMessage(json.message); setVaccineForm({ name: "", brand: "", description: "", priceCategory: "Harga Perusahaan", price: "", doseCount: 1, defaultNextDoseDays: "" }); loadData();
  }

  async function submitLot() {
    setError("");
    const json = await fetch("/api/vaccination/master", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-lot", ...lotForm }) }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Gagal menyimpan lot."); return; }
    setMessage(json.message); setLotForm((s) => ({ ...s, lotNumber: "", expiryDate: "", stockInitial: 0, stockAdded: 0, stockPhysicalCount: "", inventoryNotes: "" })); loadData();
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

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Master Vaksin & Lot Number</h1>
            <p className="mt-2 text-sm text-slate-600">Tambahkan harga produk, kategori harga, stok awal, tambahan stok, dan lot number khusus modul vaksinasi.</p>
          </div>
          <a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a>
        </div>
        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}
        {!mappingReady ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {mappingMessage || "Mapping produk import belum aktif. Jalankan SQL V153.18 terlebih dahulu."}
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
              <div className="mt-4 overflow-hidden rounded-xl border bg-white">
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
                        <td className="p-3 font-bold">{product.label}</td>
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

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <section className="rounded-2xl border bg-slate-50 p-5">
            <h2 className="text-lg font-bold">Tambah Vaksin / Produk</h2>
            <div className="mt-4 grid gap-3">
              <input className="rounded-xl border px-3 py-2" placeholder="Nama vaksin / produk" value={vaccineForm.name} onChange={(e) => setVaccineForm({ ...vaccineForm, name: e.target.value })} />
              <input className="rounded-xl border px-3 py-2" placeholder="Brand / Produsen" value={vaccineForm.brand} onChange={(e) => setVaccineForm({ ...vaccineForm, brand: e.target.value })} />
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-xl border px-3 py-2" placeholder="Kategori harga, contoh: Harga Perusahaan" value={vaccineForm.priceCategory} onChange={(e) => setVaccineForm({ ...vaccineForm, priceCategory: e.target.value })} />
                <input type="number" className="rounded-xl border px-3 py-2" placeholder="Harga produk" value={vaccineForm.price} onChange={(e) => setVaccineForm({ ...vaccineForm, price: e.target.value })} />
              </div>
              <textarea className="rounded-xl border px-3 py-2" placeholder="Deskripsi / keterangan produk" value={vaccineForm.description} onChange={(e) => setVaccineForm({ ...vaccineForm, description: e.target.value })} />
              <div className="grid gap-3 md:grid-cols-2">
                <input type="number" className="rounded-xl border px-3 py-2" placeholder="Jumlah dosis" value={vaccineForm.doseCount} onChange={(e) => setVaccineForm({ ...vaccineForm, doseCount: Number(e.target.value || 1) })} />
                <input type="number" className="rounded-xl border px-3 py-2" placeholder="Next dose hari" value={vaccineForm.defaultNextDoseDays} onChange={(e) => setVaccineForm({ ...vaccineForm, defaultNextDoseDays: e.target.value })} />
              </div>
              <button onClick={submitVaccine} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">Simpan Vaksin</button>
            </div>
          </section>

          <section className="rounded-2xl border bg-slate-50 p-5">
            <h2 className="text-lg font-bold">Tambah Lot Number & Stok</h2>
            <div className="mt-4 grid gap-3">
              <select className="rounded-xl border px-3 py-2" value={lotForm.vaccineId} onChange={(e) => setLotForm({ ...lotForm, vaccineId: e.target.value })}>
                <option value="">Pilih vaksin</option>
                {activeVaccines.map((v) => <option key={v.id} value={v.id}>{v.name}{v.brand ? ` · ${v.brand}` : ""}</option>)}
              </select>
              <input className="rounded-xl border px-3 py-2" placeholder="Lot Number / Batch" value={lotForm.lotNumber} onChange={(e) => setLotForm({ ...lotForm, lotNumber: e.target.value })} />
              <div className="grid gap-3 md:grid-cols-3">
                <input type="date" className="rounded-xl border px-3 py-2" value={lotForm.expiryDate} onChange={(e) => setLotForm({ ...lotForm, expiryDate: e.target.value })} />
                <input type="number" className="rounded-xl border px-3 py-2" placeholder="Jumlah awal" value={lotForm.stockInitial} onChange={(e) => setLotForm({ ...lotForm, stockInitial: Number(e.target.value || 0) })} />
                <input type="number" className="rounded-xl border px-3 py-2" placeholder="Tambahan stok" value={lotForm.stockAdded} onChange={(e) => setLotForm({ ...lotForm, stockAdded: Number(e.target.value || 0) })} />
              </div>
              <textarea className="rounded-xl border px-3 py-2" placeholder="Keterangan inventory / stok" value={lotForm.inventoryNotes} onChange={(e) => setLotForm({ ...lotForm, inventoryNotes: e.target.value })} />
              <button onClick={submitLot} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">Simpan Lot Number</button>
            </div>
          </section>
        </div>

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
                </tr>
              </thead>
              <tbody className="divide-y">
                {productMappings.map((mapping) => (
                  <tr key={mapping.id}>
                    <td className="p-3 font-bold">{mapping.external_product_label || mapping.external_product_name || "-"}</td>
                    <td className="p-3">{mapping.external_product_code || "-"}</td>
                    <td className="p-3">{mapping.vaccine?.name || "-"}</td>
                    <td className="p-3">{mapping.source_location || "-"}</td>
                    <td className="p-3">{mapping.last_imported_at ? new Date(mapping.last_imported_at).toLocaleString("id-ID") : "-"}</td>
                  </tr>
                ))}
                {!productMappings.length ? (
                  <tr><td colSpan={5} className="p-5 text-center text-slate-500">Belum ada mapping produk import.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border">
          <div className="border-b bg-slate-50 p-4 font-bold">Daftar Produk</div>
          <div className="max-h-[260px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3 text-left">Produk</th><th className="p-3 text-left">Brand</th><th className="p-3 text-left">Kategori Harga</th><th className="p-3 text-left">Harga</th><th className="p-3 text-left">Status</th></tr></thead>
              <tbody className="divide-y">{vaccines.map((v) => <tr key={v.id}><td className="p-3 font-bold">{v.name}</td><td className="p-3">{v.brand || "-"}</td><td className="p-3">{v.price_category || "-"}</td><td className="p-3 font-bold">{money(v.price)}</td><td className="p-3">{v.active ? "Aktif" : "Nonaktif"}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border">
          <div className="border-b bg-slate-50 p-4 font-bold">Daftar Lot Aktif</div>
          <div className="max-h-[420px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3 text-left">Vaksin</th><th className="p-3 text-left">Lot</th><th className="p-3 text-left">Expired</th><th className="p-3 text-left">Awal</th><th className="p-3 text-left">Tambahan</th><th className="p-3 text-left">Terpakai</th><th className="p-3 text-left">Stok Import</th><th className="p-3 text-left">Sisa Sistem</th><th className="p-3 text-left">Status</th></tr></thead>
              <tbody className="divide-y">{lots.map((lot) => {
                const awal = Number(lot.stock_initial || 0);
                const tambah = Number(lot.stock_added || 0);
                const used = Number(lot.stock_used || 0);
                const physical = lot.stock_physical_count == null ? "-" : Number(lot.stock_physical_count);
                return <tr key={lot.id}><td className="p-3">{lot.vaccine?.name || "-"}</td><td className="p-3 font-bold">{lot.lot_number}</td><td className="p-3">{lot.expiry_date || "-"}</td><td className="p-3">{awal}</td><td className="p-3">{tambah}</td><td className="p-3">{used}</td><td className="p-3 font-bold">{physical}</td><td className="p-3 font-bold">{awal + tambah - used}</td><td className="p-3">{lot.active ? "Aktif" : "Nonaktif"}</td></tr>;
              })}</tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
