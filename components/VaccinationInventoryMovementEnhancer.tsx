"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// VACCINATION_INVENTORY_MOVEMENT_ENHANCER_V149
// Keeps the existing Inventory page/edit flow intact.
// Adds read-only card drill-down and IN/OUT company/source attribution.

type DetailRow = {
  id: string;
  direction: string;
  type: string;
  date?: string | null;
  vaccine_name: string;
  lot_number: string;
  qty: number;
  company_or_source: string;
  reference?: string;
  notes?: string;
};

type LotSummary = {
  lot_id: number;
  vaccine_name: string;
  lot_number: string;
  key: string;
  in_sources: string[];
  out_companies: string[];
  initial: number;
  added: number;
  used: number;
  remaining: number;
  physical: number | null;
  diff: number | null;
};

type Payload = {
  ok?: boolean;
  message?: string;
  note?: string;
  buckets?: Record<string, DetailRow[]>;
  lotCompanySummary?: LotSummary[];
};

const CARD_BUCKETS: Record<string, string> = {
  "JUMLAH AWAL": "initial",
  "TAMBAHAN STOK": "stock_in",
  TERPAKAI: "used",
  "SISA SISTEM": "remaining",
  "TOTAL SELISIH": "diff",
};

const BUCKET_TITLES: Record<string, string> = {
  initial: "Detail Jumlah Awal",
  stock_in: "Detail Tambahan Stok / IN",
  used: "Detail Terpakai / OUT",
  remaining: "Detail Sisa Sistem",
  diff: "Detail Selisih Stock Opname",
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function norm(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/\s*-\s*dose\s*\d+\s*$/i, "")
    .replace(/\s+/g, " ");
}

function formatDate(value: any) {
  const raw = clean(value);
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VaccinationInventoryMovementEnhancer() {
  const [payload, setPayload] = useState<Payload>({});
  const [loading, setLoading] = useState(false);
  const [activeBucket, setActiveBucket] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/vaccination/inventory/movements", {
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.ok === false) {
        throw new Error(json.message || "Gagal mengambil detail inventory.");
      }
      setPayload(json);
    } catch (err: any) {
      setError(err?.message || "Gagal mengambil detail inventory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summaries = useMemo(
    () => payload.lotCompanySummary || [],
    [payload.lotCompanySummary],
  );

  const findLotSummary = useCallback(
    (vaccineName: string, lotNumber: string) => {
      const vaccineKey = norm(vaccineName);
      const lotKey = norm(lotNumber);

      const exact = summaries.find(
        (row) =>
          norm(row.lot_number) === lotKey &&
          norm(row.vaccine_name) === vaccineKey,
      );
      if (exact) return exact;

      return summaries.find((row) => {
        if (norm(row.lot_number) !== lotKey) return false;
        const rowVaccine = norm(row.vaccine_name);
        return (
          rowVaccine === vaccineKey ||
          rowVaccine.includes(vaccineKey) ||
          vaccineKey.includes(rowVaccine)
        );
      });
    },
    [summaries],
  );

  useEffect(() => {
    function markCards() {
      const allDivs = Array.from(document.querySelectorAll<HTMLDivElement>("div"));
      for (const node of allDivs) {
        if (node.dataset.inventoryCardV149) continue;
        const firstChildText = clean(node.firstElementChild?.textContent).toUpperCase();
        const bucket = CARD_BUCKETS[firstChildText];
        if (!bucket) continue;

        node.dataset.inventoryCardV149 = bucket;
        node.setAttribute("role", "button");
        node.setAttribute("tabindex", "0");
        node.title = "Klik untuk retrieve detail data inventory";
        node.style.cursor = "pointer";
        node.style.transition = "box-shadow 150ms ease, transform 150ms ease";
      }
    }

    function augmentInventoryTable() {
      const tables = Array.from(document.querySelectorAll<HTMLTableElement>("table"));
      const table = tables.find((candidate) => {
        const header = clean(
          Array.from(candidate.querySelectorAll("th"))
            .map((item) => item.textContent)
            .join(" | "),
        ).toUpperCase();
        return (
          header.includes("NAMA VAKSIN / PRODUK") &&
          header.includes("LOT NUMBER") &&
          header.includes("TERPAKAI") &&
          header.includes("SISA SISTEM")
        );
      });
      if (!table) return;

      const headerRow = table.querySelector("thead tr");
      if (!headerRow) return;

      const originalHeaders = Array.from(headerRow.querySelectorAll("th"));
      const usedIndex = originalHeaders.findIndex(
        (item) => clean(item.textContent).toUpperCase() === "TERPAKAI",
      );
      if (usedIndex < 0) return;

      if (!headerRow.querySelector('[data-inventory-in-v149="1"]')) {
        const sample = originalHeaders[usedIndex];
        const inHeader = document.createElement("th");
        inHeader.dataset.inventoryInV149 = "1";
        inHeader.className = sample.className;
        inHeader.textContent = "IN DARI / SUMBER";
        inHeader.style.minWidth = "170px";

        const outHeader = document.createElement("th");
        outHeader.dataset.inventoryOutV149 = "1";
        outHeader.className = sample.className;
        outHeader.textContent = "OUT KE / PERUSAHAAN";
        outHeader.style.minWidth = "190px";

        const target = originalHeaders[usedIndex + 1] || null;
        headerRow.insertBefore(inHeader, target);
        headerRow.insertBefore(outHeader, target);
      }

      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"));
      for (const row of rows) {
        const existingIn = row.querySelector<HTMLTableCellElement>(
          'td[data-inventory-in-v149="1"]',
        );
        const existingOut = row.querySelector<HTMLTableCellElement>(
          'td[data-inventory-out-v149="1"]',
        );

        const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
        if (cells.length < 2) continue;

        const vaccineName = clean(cells[0]?.textContent);
        const lotNumber = clean(cells[1]?.textContent);
        if (!vaccineName || !lotNumber) continue;

        const summary = findLotSummary(vaccineName, lotNumber);
        const inText = summary?.in_sources?.length
          ? summary.in_sources.join(", ")
          : "-";
        const outText = summary?.out_companies?.length
          ? summary.out_companies.join(", ")
          : "-";

        if (existingIn && existingOut) {
          if (existingIn.textContent !== inText) existingIn.textContent = inText;
          if (existingOut.textContent !== outText) existingOut.textContent = outText;
          continue;
        }

        const currentCells = Array.from(
          row.querySelectorAll<HTMLTableCellElement>("td"),
        );
        const insertBefore = currentCells[usedIndex + 1] || null;
        const sampleCell = currentCells[usedIndex] || currentCells[0];

        const inCell = document.createElement("td");
        inCell.dataset.inventoryInV149 = "1";
        inCell.className = sampleCell.className;
        inCell.textContent = inText;
        inCell.style.maxWidth = "190px";
        inCell.style.whiteSpace = "normal";

        const outCell = document.createElement("td");
        outCell.dataset.inventoryOutV149 = "1";
        outCell.className = sampleCell.className;
        outCell.textContent = outText;
        outCell.style.maxWidth = "210px";
        outCell.style.whiteSpace = "normal";

        row.insertBefore(inCell, insertBefore);
        row.insertBefore(outCell, insertBefore);
      }
    }

    function applyEnhancements() {
      markCards();
      augmentInventoryTable();
    }

    applyEnhancements();
    const interval = window.setInterval(applyEnhancements, 1200);

    function openFromNode(node: HTMLElement | null) {
      const card = node?.closest<HTMLElement>("[data-inventory-card-v149]");
      if (!card) return false;
      const bucket = clean(card.dataset.inventoryCardV149);
      if (!bucket) return false;
      setActiveBucket(bucket);
      return true;
    }

    function handleClick(event: MouseEvent) {
      openFromNode(event.target as HTMLElement);
    }

    function handleKey(event: KeyboardEvent) {
      if (!["Enter", " "].includes(event.key)) return;
      if (openFromNode(event.target as HTMLElement)) {
        event.preventDefault();
      }
    }

    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [findLotSummary]);

  const activeRows = activeBucket
    ? payload.buckets?.[activeBucket] || []
    : [];

  return (
    <>
      {/* VACCINATION_INVENTORY_MOVEMENT_AUDIT_V149 */}
      <section className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-slate-900">
              Audit IN / OUT Inventory
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Klik card Jumlah Awal, Tambahan Stok, Terpakai, Sisa Sistem, atau
              Total Selisih untuk retrieve detail. Kolom IN/OUT perusahaan
              ditambahkan otomatis ke tabel lot.
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
          >
            {loading ? "Memuat..." : "Refresh Detail IN/OUT"}
          </button>
        </div>

        {error ? (
          <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
            {error}
          </div>
        ) : null}

        {payload.note ? (
          <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {payload.note}
          </div>
        ) : null}
      </section>

      {activeBucket ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActiveBucket("");
          }}
        >
          <div className="max-h-[85vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <div className="text-lg font-black text-slate-950">
                  {BUCKET_TITLES[activeBucket] || "Detail Inventory"}
                </div>
                <div className="text-xs text-slate-500">
                  {activeRows.length} baris data
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveBucket("")}
                className="rounded-xl border px-4 py-2 text-sm font-black"
              >
                Tutup
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-[11px] uppercase text-slate-600">
                  <tr>
                    <th className="p-3">Tanggal</th>
                    <th className="p-3">Arah</th>
                    <th className="p-3">Vaksin</th>
                    <th className="p-3">Lot</th>
                    <th className="p-3 text-right">Qty</th>
                    <th className="p-3">Perusahaan / Sumber</th>
                    <th className="p-3">Referensi</th>
                    <th className="p-3">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {activeRows.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="p-3 whitespace-nowrap">
                        {formatDate(row.date)}
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-1 font-black ${
                            row.direction === "OUT"
                              ? "bg-red-50 text-red-700"
                              : row.direction === "IN"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {row.direction}
                        </span>
                      </td>
                      <td className="p-3 font-bold">{row.vaccine_name}</td>
                      <td className="p-3">{row.lot_number}</td>
                      <td className="p-3 text-right font-black">{row.qty}</td>
                      <td className="p-3 font-bold">
                        {row.company_or_source || "-"}
                      </td>
                      <td className="p-3">{row.reference || "-"}</td>
                      <td className="p-3">{row.notes || "-"}</td>
                    </tr>
                  ))}
                  {!activeRows.length ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="p-8 text-center text-slate-500"
                      >
                        Belum ada detail untuk card ini.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
