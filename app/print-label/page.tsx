"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import AuthGate from "@/components/AuthGate";
import QRCodeImage from "@/components/QRCodeImage";

type ImportRow = {
  id: number;
  values: Record<string, string>;
};

const MAX_DETAIL_FIELDS = 5;

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function norm(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeUniqueHeaders(rawHeaders: unknown[]) {
  const used = new Map<string, number>();

  return rawHeaders.map((value, index) => {
    const base = clean(value) || `Column ${index + 1}`;
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function detectHeaderRow(rows: unknown[][]) {
  let bestIndex = 0;
  let bestScore = -1;

  rows.slice(0, 20).forEach((row, index) => {
    const nonEmpty = row.filter((cell) => clean(cell)).length;
    const textCells = row.filter((cell) => {
      const value = clean(cell);
      return value && Number.isNaN(Number(value));
    }).length;
    const score = nonEmpty * 2 + textCells;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function detectColumn(headers: string[], aliases: string[]) {
  const normalized = headers.map(norm);

  for (const alias of aliases.map(norm)) {
    const exact = normalized.findIndex((header) => header === alias);
    if (exact >= 0) return headers[exact];
  }

  for (const alias of aliases.map(norm)) {
    const fuzzy = normalized.findIndex(
      (header) => header.includes(alias) || alias.includes(header)
    );
    if (fuzzy >= 0) return headers[fuzzy];
  }

  return "";
}

export default function ManualPrintLabelPage() {
  return <AuthGate>{() => <ManualPrintLabel />}</AuthGate>;
}

function ManualPrintLabel() {
  const workbookRef = useRef<XLSX.WorkBook | null>(null);
  const [fileName, setFileName] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<Record<number, boolean>>({});
  const [titleColumn, setTitleColumn] = useState("");
  const [qrColumn, setQrColumn] = useState("");
  const [showQr, setShowQr] = useState(true);
  const [includedColumns, setIncludedColumns] = useState<Record<string, boolean>>({});
  const [displayLabels, setDisplayLabels] = useState<Record<string, string>>({});
  const [copies, setCopies] = useState(6);
  const [qrSize, setQrSize] = useState(46);
  const [fontSize, setFontSize] = useState(7);
  const [showBorder, setShowBorder] = useState(true);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState(
    "Import Excel/CSV, mapping kolom, pilih isi label, lalu print. Data hanya dipakai di browser dan tidak masuk database."
  );

  const selectedDataRows = useMemo(
    () => rows.filter((row) => selectedRows[row.id]),
    [rows, selectedRows]
  );

  const detailColumns = useMemo(
    () =>
      headers
        .filter(
          (header) =>
            includedColumns[header] &&
            header !== titleColumn &&
            header !== qrColumn
        )
        .slice(0, MAX_DETAIL_FIELDS),
    [headers, includedColumns, titleColumn, qrColumn]
  );

  const detailCount = useMemo(
    () =>
      headers.filter(
        (header) =>
          includedColumns[header] &&
          header !== titleColumn &&
          header !== qrColumn
      ).length,
    [headers, includedColumns, titleColumn, qrColumn]
  );

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;

    return rows.filter((row) =>
      headers.some((header) =>
        clean(row.values[header]).toLowerCase().includes(keyword)
      )
    );
  }, [rows, headers, search]);

  const printRows = useMemo(() => {
    const output: ImportRow[] = [];
    selectedDataRows.forEach((row) => {
      for (let copy = 0; copy < Math.max(1, copies); copy += 1) {
        output.push(row);
      }
    });
    return output;
  }, [selectedDataRows, copies]);

  const previewRow = selectedDataRows[0] || rows[0] || null;

  function resetData() {
    workbookRef.current = null;
    setFileName("");
    setSheetNames([]);
    setSheetName("");
    setHeaderRow(1);
    setHeaders([]);
    setRows([]);
    setSelectedRows({});
    setTitleColumn("");
    setQrColumn("");
    setShowQr(true);
    setIncludedColumns({});
    setDisplayLabels({});
    setSearch("");
    setMessage("Data import dibersihkan. Silakan pilih file Excel/CSV baru.");
  }

  function parseSheet(nextSheetName: string, nextHeaderRow?: number) {
    const workbook = workbookRef.current;
    if (!workbook) return;

    const sheet = workbook.Sheets[nextSheetName];
    if (!sheet) {
      setMessage(`Sheet ${nextSheetName} tidak ditemukan.`);
      return;
    }

    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    }) as unknown[][];

    if (!matrix.length) {
      setHeaders([]);
      setRows([]);
      setSelectedRows({});
      setMessage("Sheet kosong.");
      return;
    }

    const detectedIndex =
      typeof nextHeaderRow === "number"
        ? Math.max(0, Math.min(matrix.length - 1, nextHeaderRow - 1))
        : detectHeaderRow(matrix);
    const uniqueHeaders = makeUniqueHeaders(matrix[detectedIndex] || []);
    const dataRows = matrix
      .slice(detectedIndex + 1)
      .map((cells, rowIndex) => {
        const values: Record<string, string> = {};
        uniqueHeaders.forEach((header, colIndex) => {
          values[header] = clean(cells?.[colIndex]);
        });
        return { id: rowIndex + 1, values };
      })
      .filter((row) => uniqueHeaders.some((header) => clean(row.values[header])));

    const autoTitle = detectColumn(uniqueHeaders, [
      "nama",
      "nama peserta",
      "nama lengkap",
      "name",
      "patient name",
      "participant name",
    ]);
    const autoQr = detectColumn(uniqueHeaders, [
      "mcu id",
      "nomor mcu",
      "barcode",
      "qr",
      "kode",
      "employee id",
      "no karyawan",
      "nik",
      "id",
    ]);

    const nextIncluded: Record<string, boolean> = {};
    const nextLabels: Record<string, string> = {};
    let detailAdded = 0;
    uniqueHeaders.forEach((header) => {
      const isSpecial = header === autoTitle || header === autoQr;
      const canDetail = !isSpecial && detailAdded < 3;
      nextIncluded[header] = canDetail;
      nextLabels[header] = header;
      if (canDetail) detailAdded += 1;
    });

    const allSelected: Record<number, boolean> = {};
    dataRows.forEach((row) => {
      allSelected[row.id] = true;
    });

    setSheetName(nextSheetName);
    setHeaderRow(detectedIndex + 1);
    setHeaders(uniqueHeaders);
    setRows(dataRows);
    setSelectedRows(allSelected);
    setTitleColumn(autoTitle || uniqueHeaders[0] || "");
    setQrColumn(autoQr || "");
    setShowQr(Boolean(autoQr));
    setIncludedColumns(nextIncluded);
    setDisplayLabels(nextLabels);
    setSearch("");
    setMessage(
      `Berhasil membaca ${dataRows.length} baris dan ${uniqueHeaders.length} kolom dari sheet ${nextSheetName}. Silakan cek mapping sebelum print.`
    );
  }

  async function handleFile(file: File | null) {
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const firstSheet = workbook.SheetNames[0] || "";

      workbookRef.current = workbook;
      setFileName(file.name);
      setSheetNames(workbook.SheetNames);

      if (!firstSheet) {
        setMessage("File tidak memiliki sheet yang bisa dibaca.");
        return;
      }

      parseSheet(firstSheet);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(`Gagal membaca file: ${text}`);
    }
  }

  function changeSheet(value: string) {
    if (!value) return;
    parseSheet(value);
  }

  function reReadHeader() {
    if (!sheetName) return;
    parseSheet(sheetName, headerRow);
  }

  function setAllRows(checked: boolean) {
    const next = { ...selectedRows };
    filteredRows.forEach((row) => {
      next[row.id] = checked;
    });
    setSelectedRows(next);
  }

  function toggleDetail(header: string, checked: boolean) {
    if (checked) {
      const currentCount = headers.filter(
        (item) =>
          includedColumns[item] &&
          item !== titleColumn &&
          item !== qrColumn &&
          item !== header
      ).length;

      if (
        header !== titleColumn &&
        header !== qrColumn &&
        currentCount >= MAX_DETAIL_FIELDS
      ) {
        setMessage(
          `Maksimal ${MAX_DETAIL_FIELDS} field detail agar layout 50 mm x 30 mm tetap aman. Nonaktifkan salah satu field detail dulu.`
        );
        return;
      }
    }

    setIncludedColumns((prev) => ({ ...prev, [header]: checked }));
  }

  function printLabels() {
    if (!selectedDataRows.length) {
      setMessage("Pilih minimal 1 baris data yang akan dicetak.");
      return;
    }

    if (!titleColumn && !detailColumns.length && !(showQr && qrColumn)) {
      setMessage("Pilih minimal satu isi label sebelum print.");
      return;
    }

    setMessage(
      `Menyiapkan ${selectedDataRows.length} data x ${Math.max(1, copies)} copy = ${printRows.length} label.`
    );
    setTimeout(() => window.print(), 350);
  }

  return (
    <div className="space-y-5">
      <style jsx global>{`
        @page {
          size: 50mm 30mm;
          margin: 0;
        }

        @media print {
          html,
          body {
            width: 50mm;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          header,
          nav,
          .no-print {
            display: none !important;
          }

          main {
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .print-area {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .label-page {
            width: 50mm !important;
            height: 30mm !important;
            page-break-after: always;
            break-after: page;
            box-sizing: border-box;
            overflow: hidden;
            margin: 0 !important;
            background: white !important;
          }

          .label-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>

      <section className="card p-5 no-print">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-2xl font-black">Print Label - Import & Mapping</div>
            <div className="mt-1 max-w-3xl text-sm text-slate-500">
              Page khusus cetak label. Import XLSX/XLS/CSV, mapping isi data, pilih field dan baris yang ingin dicetak, lalu print dengan ukuran printer label yang sama seperti fitur Cetak Label existing.
            </div>
          </div>
          <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
            Local only - tidak simpan database
          </div>
        </div>
      </section>

      <section className="card p-5 no-print">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 font-black text-white">1</div>
          <div>
            <div className="font-black">Import Data</div>
            <div className="text-xs text-slate-500">Excel XLSX/XLS atau CSV. File hanya dibaca di browser.</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr_180px_auto]">
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
            <span>{fileName || "Pilih file Excel / CSV"}</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(event) => handleFile(event.target.files?.[0] || null)}
            />
          </label>

          <select
            className="input"
            value={sheetName}
            disabled={!sheetNames.length}
            onChange={(event) => changeSheet(event.target.value)}
          >
            {!sheetNames.length ? <option>Belum ada sheet</option> : null}
            {sheetNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Header baris</span>
            <input
              type="number"
              min={1}
              className="input min-w-0"
              value={headerRow}
              disabled={!rows.length && !sheetName}
              onChange={(event) => setHeaderRow(Math.max(1, Number(event.target.value) || 1))}
            />
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn-secondary" disabled={!sheetName} onClick={reReadHeader}>
              Baca Ulang
            </button>
            <button type="button" className="btn-secondary" disabled={!fileName} onClick={resetData}>
              Reset
            </button>
          </div>
        </div>

        {message ? (
          <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>
        ) : null}
      </section>

      {headers.length ? (
        <section className="card p-5 no-print">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 font-black text-white">2</div>
            <div>
              <div className="font-black">Mapping & Pilih Isi Label</div>
              <div className="text-xs text-slate-500">Tentukan nama utama, sumber QR/kode, lalu centang field detail yang ingin masuk.</div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 rounded-2xl border bg-slate-50 p-4 lg:grid-cols-2">
            <label className="text-sm font-bold text-slate-700">
              Nama utama / headline
              <select className="input mt-2 w-full" value={titleColumn} onChange={(event) => setTitleColumn(event.target.value)}>
                <option value="">Tidak dipakai</option>
                {headers.map((header) => <option key={header} value={header}>{header}</option>)}
              </select>
            </label>

            <label className="text-sm font-bold text-slate-700">
              Sumber QR / kode
              <div className="mt-2 flex gap-2">
                <select className="input min-w-0 flex-1" value={qrColumn} onChange={(event) => setQrColumn(event.target.value)}>
                  <option value="">Tidak ada QR</option>
                  {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
                <label className="flex items-center gap-2 rounded-xl border bg-white px-3 text-xs font-bold">
                  <input type="checkbox" checked={showQr} disabled={!qrColumn} onChange={(event) => setShowQr(event.target.checked)} />
                  Tampilkan QR
                </label>
              </div>
            </label>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border">
            <div className="grid grid-cols-[90px_1fr_1fr] gap-3 bg-slate-100 px-4 py-3 text-xs font-black uppercase text-slate-500">
              <div>Masuk</div>
              <div>Kolom File</div>
              <div>Nama di Label</div>
            </div>
            {headers.map((header) => {
              const special = header === titleColumn || header === qrColumn;
              return (
                <div key={header} className="grid grid-cols-[90px_1fr_1fr] items-center gap-3 border-t px-4 py-3">
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={Boolean(includedColumns[header])}
                      disabled={special}
                      onChange={(event) => toggleDetail(header, event.target.checked)}
                    />
                    {special ? <span className="text-[10px] text-blue-700">SPECIAL</span> : null}
                  </label>
                  <div className="truncate text-sm font-bold text-slate-800">{header}</div>
                  <input
                    className="input"
                    value={displayLabels[header] || ""}
                    onChange={(event) => setDisplayLabels((prev) => ({ ...prev, [header]: event.target.value }))}
                    placeholder={header}
                  />
                </div>
              );
            })}
          </div>

          <div className={`mt-3 rounded-xl p-3 text-xs font-bold ${detailCount > MAX_DETAIL_FIELDS ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
            Field detail aktif: {Math.min(detailCount, MAX_DETAIL_FIELDS)}/{MAX_DETAIL_FIELDS}. Nama utama dan QR tidak dihitung sebagai field detail.
          </div>
        </section>
      ) : null}

      {rows.length ? (
        <section className="card p-5 no-print">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 font-black text-white">3</div>
              <div>
                <div className="font-black">Pilih Baris yang Dicetak</div>
                <div className="text-xs text-slate-500">Semua baris otomatis terpilih setelah import. Bisa uncheck sesuai kebutuhan.</div>
              </div>
            </div>
            <input className="input lg:w-80" placeholder="Cari data..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary" onClick={() => setAllRows(true)}>Pilih Semua Hasil</button>
            <button type="button" className="btn-secondary" onClick={() => setAllRows(false)}>Lepas Semua Hasil</button>
            <div className="ml-auto rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
              Terpilih {selectedDataRows.length} / {rows.length}
            </div>
          </div>

          <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl border">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr>
                  <th className="px-3 py-3">Print</th>
                  <th className="px-3 py-3">#</th>
                  {headers.slice(0, 6).map((header) => <th key={header} className="min-w-40 px-3 py-3">{header}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className="border-t align-top">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedRows[row.id])}
                        onChange={(event) => setSelectedRows((prev) => ({ ...prev, [row.id]: event.target.checked }))}
                      />
                    </td>
                    <td className="px-3 py-3 font-bold text-slate-500">{row.id}</td>
                    {headers.slice(0, 6).map((header) => (
                      <td key={header} className="max-w-64 px-3 py-3 text-slate-700">{row.values[header] || "-"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {rows.length ? (
        <section className="card p-5 no-print">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 font-black text-white">4</div>
            <div>
              <div className="font-black">Setup Print & Preview</div>
              <div className="text-xs text-slate-500">Ukuran kertas dan print CSS sama dengan fitur label existing: 50 mm x 30 mm, margin 0.</div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs font-black text-slate-600">
                  Jumlah copy / data
                  <input type="number" min={1} max={50} className="input mt-2 w-full" value={copies} onChange={(event) => setCopies(Math.max(1, Number(event.target.value) || 1))} />
                </label>
                <label className="text-xs font-black text-slate-600">
                  Ukuran font
                  <input type="number" min={6} max={14} step={0.5} className="input mt-2 w-full" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value) || 7)} />
                </label>
                <label className="text-xs font-black text-slate-600">
                  Ukuran QR
                  <input type="number" min={38} max={160} className="input mt-2 w-full" value={qrSize} disabled={!showQr || !qrColumn} onChange={(event) => setQrSize(Number(event.target.value) || 46)} />
                </label>
                <label className="flex items-center gap-2 rounded-xl border px-3 py-3 text-xs font-black text-slate-700 sm:mt-6">
                  <input type="checkbox" checked={showBorder} onChange={(event) => setShowBorder(event.target.checked)} />
                  Border label
                </label>
              </div>

              <div className="mt-4 rounded-2xl border bg-slate-50 p-4 text-sm font-bold text-slate-700">
                {selectedDataRows.length} data x {Math.max(1, copies)} copy = <span className="text-blue-700">{printRows.length} label</span>
              </div>

              <button type="button" className="btn-primary mt-4 w-full" onClick={printLabels} disabled={!selectedDataRows.length}>
                Print Label
              </button>
            </div>

            <div className="rounded-2xl border bg-slate-100 p-4">
              <div className="mb-3 text-xs font-black uppercase text-slate-500">Preview label pertama</div>
              {previewRow ? (
                <div className="overflow-auto rounded-xl bg-white p-4">
                  <ManualLabelCard
                    row={previewRow}
                    titleColumn={titleColumn}
                    qrColumn={qrColumn}
                    showQr={showQr}
                    detailColumns={detailColumns}
                    displayLabels={displayLabels}
                    qrSize={qrSize}
                    fontSize={fontSize}
                    showBorder={showBorder}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="print-area hidden">
        {printRows.map((row, index) => (
          <ManualLabelCard
            key={`${row.id}-print-${index}`}
            row={row}
            titleColumn={titleColumn}
            qrColumn={qrColumn}
            showQr={showQr}
            detailColumns={detailColumns}
            displayLabels={displayLabels}
            qrSize={qrSize}
            fontSize={fontSize}
            showBorder={showBorder}
            printMode
          />
        ))}
      </section>
    </div>
  );
}

function ManualLabelCard({
  row,
  titleColumn,
  qrColumn,
  showQr,
  detailColumns,
  displayLabels,
  qrSize,
  fontSize,
  showBorder,
  printMode = false,
}: {
  row: ImportRow;
  titleColumn: string;
  qrColumn: string;
  showQr: boolean;
  detailColumns: string[];
  displayLabels: Record<string, string>;
  qrSize: number;
  fontSize: number;
  showBorder: boolean;
  printMode?: boolean;
}) {
  const title = clean(row.values[titleColumn]).toUpperCase();
  const qrValue = clean(row.values[qrColumn]);
  const safeFont = Number(fontSize || 7);
  const qrPx = Math.min(160, Math.max(38, Number(qrSize || 46)));
  const showQrEffective = Boolean(showQr && qrColumn && qrValue);
  const textRight = showQrEffective ? `calc(${qrPx}px + 4mm)` : "2.4mm";
  const detailTop = title ? "11.7mm" : "2.6mm";
  const detailFont = Math.max(6, Math.min(9.5, safeFont + 0.7));
  const titleFont = title.length > 34
    ? Math.max(9.5, safeFont + 2)
    : title.length > 24
      ? Math.max(10.5, safeFont + 3)
      : Math.max(12, safeFont + 5);

  const details = detailColumns
    .map((header) => {
      const value = clean(row.values[header]);
      if (!value) return null;
      const label = clean(displayLabels[header] || header);
      return label ? `${label}: ${value}` : value;
    })
    .filter(Boolean) as string[];

  return (
    <section
      className={`${printMode ? "label-page" : ""} bg-white`}
      style={{
        position: "relative",
        width: "50mm",
        height: "30mm",
        overflow: "hidden",
        border: showBorder ? "1px solid #d4d4d8" : undefined,
        borderRadius: showBorder ? "1.4mm" : undefined,
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
        background: "#ffffff",
        boxSizing: "border-box",
      }}
    >
      {title ? (
        <div
          style={{
            position: "absolute",
            left: "2.4mm",
            top: "2.2mm",
            right: textRight,
            zIndex: 2,
            fontSize: `${titleFont}px`,
            lineHeight: 0.94,
            fontWeight: 950,
            color: "#000000",
            whiteSpace: "normal",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            letterSpacing: "-0.04em",
            maxHeight: "8.7mm",
            overflow: "hidden",
          }}
        >
          {title}
        </div>
      ) : null}

      {details.length ? (
        <div
          style={{
            position: "absolute",
            left: "2.4mm",
            top: detailTop,
            right: textRight,
            bottom: "2.2mm",
            zIndex: 2,
            fontSize: `${detailFont}px`,
            lineHeight: 1.02,
            fontWeight: 850,
            color: "#111827",
            whiteSpace: "normal",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            overflow: "hidden",
          }}
        >
          {details.slice(0, MAX_DETAIL_FIELDS).map((line, index) => (
            <div key={`${line}-${index}`} style={{ marginTop: index ? "0.7mm" : undefined }}>
              {line}
            </div>
          ))}
        </div>
      ) : null}

      {showQrEffective ? (
        <div
          style={{
            position: "absolute",
            right: "0.5mm",
            top: "50%",
            transform: "translateY(-50%)",
            width: `${qrPx}px`,
            height: `${qrPx}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#ffffff",
            zIndex: 1,
          }}
        >
          <QRCodeImage value={qrValue} size={qrPx} />
        </div>
      ) : null}
    </section>
  );
}
