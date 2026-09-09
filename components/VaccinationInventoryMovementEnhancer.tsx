"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// VACCINATION_INVENTORY_FILTER_EXPORT_V150
// Extends V149 without changing Inventory edit/update behavior.
// - multi product filter
// - date range
// - filtered card totals
// - IN/OUT company/source columns
// - card drill-down
// - CSV export

type DetailRow = {
  date?: string | null;
  direction: string;
  movement_type: string;
  company: string;
  participant: string;
  employee_id: string;
  mcu_id: string;
  session: string;
  location: string;
  vaccine_id: number;
  vaccine: string;
  brand: string;
  lot: string;
  dose: any;
  doctor: string;
  qty: number;
  print_status: string;
  validation_status: string;
  reference: string;
  note: string;
};

type LotSummary = {
  lot_id: number;
  vaccine_id: number;
  vaccine_name: string;
  brand: string;
  lot_number: string;
  initial: number;
  added: number;
  used: number;
  remaining: number;
  physical: number | null;
  diff: number | null;
  unattributed_used?: number;
  in_sources: string[];
  out_companies: string[];
};

type Product = { id: number; name: string; brand?: string; active?: boolean };

type Report = {
  ok?: boolean;
  message?: string;
  products?: Product[];
  summary?: { initial: number; added: number; used: number; remaining: number; diff: number };
  lotSummaries?: LotSummary[];
  details?: DetailRow[];
};

const CARD_BUCKETS: Record<string, string> = {
  "JUMLAH AWAL": "initial",
  "TAMBAHAN STOK": "added",
  TERPAKAI: "used",
  "SISA SISTEM": "remaining",
  "TOTAL SELISIH": "diff",
};

const BUCKET_TITLES: Record<string, string> = {
  initial: "Detail Jumlah Awal / IN",
  added: "Detail Tambahan Stok / IN",
  used: "Detail Terpakai / OUT",
  remaining: "Detail Sisa Sistem",
  diff: "Detail Selisih Stock Opname",
};

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function norm(value: any) {
  return clean(value).toLowerCase().replace(/\s*-\s*dose\s*\d+\s*$/i, "").replace(/\s+/g, " ");
}

function formatDate(value: any) {
  const raw = clean(value);
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
}

export default function VaccinationInventoryMovementEnhancer() {
  const [report, setReport] = useState<Report>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeBucket, setActiveBucket] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedProducts.length) params.set("vaccine_ids", selectedProducts.join(","));
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    return params.toString();
  }, [selectedProducts, dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const url = `/api/vaccination/inventory/report${queryString ? `?${queryString}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.message || "Gagal mengambil report inventory.");
      setReport(json);
    } catch (err: any) {
      setError(err?.message || "Gagal mengambil report inventory.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const handleInventoryUpdated = () => { load(); };
    window.addEventListener("vaccination-inventory-updated", handleInventoryUpdated);
    return () => window.removeEventListener("vaccination-inventory-updated", handleInventoryUpdated);
  }, [load]);

  const products = report.products || [];
  const summaries = report.lotSummaries || [];
  const details = report.details || [];

  const activeRows = useMemo(() => {
    if (activeBucket === "initial") return details.filter((row) => row.movement_type === "Jumlah Awal");
    if (activeBucket === "added") return details.filter((row) => row.movement_type === "Tambahan Stok");
    if (activeBucket === "used") return details.filter((row) => row.direction === "OUT");
    if (activeBucket === "remaining") {
      return summaries.map((row) => ({
        date: null,
        direction: "BALANCE",
        movement_type: "Sisa Sistem",
        company: [
          row.in_sources?.length ? `IN: ${row.in_sources.join(", ")}` : "IN: -",
          row.out_companies?.length ? `OUT: ${row.out_companies.join(", ")}` : "OUT: -",
        ].join(" | "),
        participant: "",
        employee_id: "",
        mcu_id: "",
        session: "",
        location: "",
        vaccine_id: row.vaccine_id,
        vaccine: row.vaccine_name,
        brand: row.brand,
        lot: row.lot_number,
        dose: "",
        doctor: "",
        qty: row.remaining,
        print_status: "",
        validation_status: "",
        reference: "Saldo lot",
        note: `Awal ${row.initial} + Tambahan ${row.added} - Terpakai ${row.used}`,
      } as DetailRow));
    }
    if (activeBucket === "diff") {
      return summaries.filter((row) => row.diff != null).map((row) => ({
        date: null,
        direction: "AUDIT",
        movement_type: "Selisih",
        company: row.out_companies?.join(", ") || "-",
        participant: "",
        employee_id: "",
        mcu_id: "",
        session: "",
        location: "",
        vaccine_id: row.vaccine_id,
        vaccine: row.vaccine_name,
        brand: row.brand,
        lot: row.lot_number,
        dose: "",
        doctor: "",
        qty: Number(row.diff || 0),
        print_status: "",
        validation_status: "",
        reference: "Stock opname",
        note: `Sisa fisik ${row.physical} - Sisa sistem ${row.remaining}`,
      } as DetailRow));
    }
    return [];
  }, [activeBucket, details, summaries]);

  const summaryMap = useMemo(() => report.summary || { initial: 0, added: 0, used: 0, remaining: 0, diff: 0 }, [report.summary]);
  const hasReportFilter = selectedProducts.length > 0 || Boolean(dateFrom || dateTo);

  const findLotSummary = useCallback((vaccineName: string, lotNumber: string) => {
    const v = norm(vaccineName);
    const lot = norm(lotNumber);
    return summaries.find((row) => {
      if (norm(row.lot_number) !== lot) return false;
      const rv = norm(row.vaccine_name);
      return rv === v || rv.includes(v) || v.includes(rv);
    });
  }, [summaries]);

  useEffect(() => {
    function enhance() {
      const allDivs = Array.from(document.querySelectorAll<HTMLDivElement>("div"));
      for (const node of allDivs) {
        const label = clean(node.firstElementChild?.textContent).toUpperCase();
        const bucket = CARD_BUCKETS[label];
        if (!bucket) continue;
        node.dataset.inventoryCardV150 = bucket;
        node.setAttribute("role", "button");
        node.setAttribute("tabindex", "0");
        node.style.cursor = "pointer";
        // Unfiltered Inventory numbers belong to the canonical /api/vaccination/inventory
        // response. The report enhancer may replace numbers only when its own product/date
        // filter is active. This prevents a stale report snapshot from reverting stock.
        const valueNode = node.children?.[1] as HTMLElement | undefined;
        if (hasReportFilter && valueNode) valueNode.textContent = String((summaryMap as any)[bucket] ?? 0);
      }

      // V150.14: the main Inventory table structure is now owned 100% by React.
      // Never insert/remove TH/TD nodes from this table. Structural DOM injection can
      // desynchronise React's child indexes and make canonical stock values appear stale.
      const table = document.querySelector<HTMLTableElement>('table[data-inventory-canonical-table="1"]');
      if (!table) return;

      const headerRow = table.querySelector("thead tr");
      if (!headerRow) return;

      for (const row of Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))) {
        const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
        if (cells.length < 2) continue;
        const vaccineName = clean(cells[0]?.textContent);
        const lotNumber = clean(cells[1]?.textContent);
        if (!vaccineName || !lotNumber) continue;

        const selectedIds = new Set(selectedProducts.map(Number));
        const lotSummary = findLotSummary(vaccineName, lotNumber);
        if (selectedIds.size && lotSummary && !selectedIds.has(Number(lotSummary.vaccine_id))) {
          row.style.display = "none";
          continue;
        }
        if (selectedIds.size && !lotSummary) {
          row.style.display = "none";
          continue;
        }
        row.style.display = "";

        const inCell = row.querySelector<HTMLTableCellElement>('td[data-inventory-in-v150="1"]');
        const outCell = row.querySelector<HTMLTableCellElement>('td[data-inventory-out-v150="1"]');
        if (inCell) inCell.textContent = lotSummary?.in_sources?.join(", ") || "-";
        if (outCell) outCell.textContent = lotSummary?.out_companies?.join(", ") || "-";

        // Numeric columns are owned by the canonical Inventory API in the normal
        // (unfiltered) view. The report may replace them only for an active report filter.
        if (hasReportFilter && lotSummary) {
          const currentHeaders = Array.from(headerRow.querySelectorAll("th")).map((th) => clean(th.textContent).toUpperCase());
          const currentCells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
          const setByHeader = (label: string, value: any) => {
            const index = currentHeaders.indexOf(label);
            if (index >= 0 && currentCells[index]) currentCells[index].textContent = String(value ?? "-");
          };
          setByHeader("JUMLAH AWAL", lotSummary.initial);
          setByHeader("TAMBAHAN STOK", lotSummary.added);
          setByHeader("TERPAKAI", lotSummary.used);
          setByHeader("SISA SISTEM", lotSummary.remaining);
          if (lotSummary.physical != null) setByHeader("SISA FISIK", lotSummary.physical);
          if (lotSummary.diff != null) setByHeader("SELISIH", lotSummary.diff);
        }
      }
    }

    enhance();
    const timer = window.setInterval(enhance, 1000);

    function click(event: MouseEvent) {
      const card = (event.target as HTMLElement)?.closest<HTMLElement>("[data-inventory-card-v150]");
      if (card?.dataset.inventoryCardV150) setActiveBucket(card.dataset.inventoryCardV150);
    }
    function key(event: KeyboardEvent) {
      if (!["Enter", " "].includes(event.key)) return;
      const card = (event.target as HTMLElement)?.closest<HTMLElement>("[data-inventory-card-v150]");
      if (card?.dataset.inventoryCardV150) {
        event.preventDefault();
        setActiveBucket(card.dataset.inventoryCardV150);
      }
    }
    document.addEventListener("click", click);
    document.addEventListener("keydown", key);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", key);
    };
  }, [findLotSummary, selectedProducts, summaryMap, hasReportFilter]);

  function toggleProduct(id: number) {
    const key = String(id);
    setSelectedProducts((prev) => prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]);
  }

  function exportCsv() {
    const params = new URLSearchParams();
    if (selectedProducts.length) params.set("vaccine_ids", selectedProducts.join(","));
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    window.location.href = `/api/vaccination/inventory/export${params.toString() ? `?${params.toString()}` : ""}`;
  }

  return (
    <>
      <section className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-[250px] flex-1">
            <div className="text-xs font-black uppercase text-slate-500">Filter Produk - bisa multiple</div>
            <div className="mt-2 max-h-36 overflow-auto rounded-xl border bg-slate-50 p-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold hover:bg-white">
                <input type="checkbox" checked={!selectedProducts.length} onChange={() => setSelectedProducts([])} /> Semua produk
              </label>
              {products.filter((p) => p.active !== false).map((product) => (
                <label key={product.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold hover:bg-white">
                  <input type="checkbox" checked={selectedProducts.includes(String(product.id))} onChange={() => toggleProduct(product.id)} />
                  {product.name}{product.brand ? ` - ${product.brand}` : ""}
                </label>
              ))}
            </div>
          </div>

          <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Tanggal Mulai<input type="date" className="rounded-xl border px-3 py-2.5 text-sm font-semibold normal-case text-slate-900" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
          <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Tanggal Akhir<input type="date" className="rounded-xl border px-3 py-2.5 text-sm font-semibold normal-case text-slate-900" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
          <button type="button" onClick={load} disabled={loading} className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{loading ? "Memuat..." : "Terapkan Filter"}</button>
          <button type="button" onClick={() => { setSelectedProducts([]); setDateFrom(""); setDateTo(""); }} className="rounded-xl border px-4 py-3 text-sm font-black">Reset</button>
          <button type="button" onClick={exportCsv} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">Export Filter</button>
        </div>
        <div className="mt-3 text-xs text-slate-500">Card dan angka tabel mengikuti filter yang sama. Tanpa date range, Terpakai memakai saldo kumulatif canonical Inventory (termasuk rekonsiliasi legacy bila ada). Dengan date range, Terpakai memakai record bertanggal yang dapat ditelusuri. Export mengikuti filter yang sama.</div>
        {error ? <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</div> : null}
      </section>

      {activeBucket ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveBucket(""); }}>
          <div className="max-h-[88vh] w-full max-w-7xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div><div className="text-lg font-black">{BUCKET_TITLES[activeBucket] || "Detail Inventory"}</div><div className="text-xs text-slate-500">{activeRows.length} baris sesuai filter aktif</div></div>
              <button type="button" onClick={() => setActiveBucket("")} className="rounded-xl border px-4 py-2 text-sm font-black">Tutup</button>
            </div>
            <div className="max-h-[72vh] overflow-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-[11px] uppercase text-slate-600"><tr><th className="p-3">Tanggal</th><th className="p-3">Arah</th><th className="p-3">Vaksin</th><th className="p-3">Lot</th><th className="p-3 text-right">Qty</th><th className="p-3">Perusahaan / Sumber</th><th className="p-3">Peserta</th><th className="p-3">Session / Lokasi</th><th className="p-3">Dokter</th><th className="p-3">Status</th></tr></thead>
                <tbody className="divide-y">
                  {activeRows.map((row, index) => <tr key={`${row.direction}-${row.vaccine}-${row.lot}-${row.date}-${index}`} className="align-top"><td className="p-3 whitespace-nowrap">{formatDate(row.date)}</td><td className="p-3 font-black">{row.direction}</td><td className="p-3 font-bold">{row.vaccine}{row.brand ? ` - ${row.brand}` : ""}</td><td className="p-3">{row.lot || "-"}</td><td className="p-3 text-right font-black">{row.qty}</td><td className="p-3 font-bold">{row.company || "-"}</td><td className="p-3">{row.participant || "-"}</td><td className="p-3">{[row.session, row.location].filter(Boolean).join(" - ") || "-"}</td><td className="p-3">{row.doctor || "-"}</td><td className="p-3">{[row.print_status, row.validation_status].filter(Boolean).join(" / ") || "-"}</td></tr>)}
                  {!activeRows.length ? <tr><td colSpan={10} className="p-8 text-center text-slate-500">Belum ada detail pada filter ini.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
