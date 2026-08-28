"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AuthGate from "@/components/AuthGate";

type DataRow = {
  id: number;
  source: "import" | "manual";
  values: Record<string, string>;
};

type TextAlign = "left" | "center" | "right";

const MAX_DETAIL_FIELDS = 7;
const TABLE_PAGE_SIZE = 50;
const DEFAULT_MANUAL_FIELDS = ["Nama", "Institusi", "Kode"];

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: unknown) {
  return clean(value).replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[char] || char;
  });
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

function nextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export default function ManualPrintLabelPage() {
  return <AuthGate>{() => <ManualPrintLabel />}</AuthGate>;
}

function ManualPrintLabel() {
  const workbookRef = useRef<any>(null);
  const manualIdRef = useRef(1000000);
  const [fileName, setFileName] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<Record<number, boolean>>({});
  const [titleColumn, setTitleColumn] = useState("");
  const [qrColumn, setQrColumn] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [includedColumns, setIncludedColumns] = useState<Record<string, boolean>>({});
  const [copies, setCopies] = useState(6);
  const [qrSize, setQrSize] = useState(54);
  const [titleFontSize, setTitleFontSize] = useState(15);
  const [detailFontSize, setDetailFontSize] = useState(9);
  const [textAlign, setTextAlign] = useState<TextAlign>("left");
  const [lineGap, setLineGap] = useState(0.8);
  const [showBorder, setShowBorder] = useState(false);
  const [search, setSearch] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [newParameterName, setNewParameterName] = useState("");
  const [printReady, setPrintReady] = useState(false);
  const [preparingPrint, setPreparingPrint] = useState(false);
  const [qrCache, setQrCache] = useState<Record<string, string>>({});
  const [previewQrSrc, setPreviewQrSrc] = useState("");
  const [message, setMessage] = useState(
    "Pilih salah satu cara: import Excel/CSV atau tambah data manual. Data hanya dipakai di browser dan tidak masuk database."
  );

  const selectedDataRows = useMemo(
    () => rows.filter((row) => selectedRows[row.id]),
    [rows, selectedRows]
  );

  const detailColumns = useMemo(
    () =>
      headers
        .filter((header) => includedColumns[header] && header !== titleColumn)
        .slice(0, MAX_DETAIL_FIELDS),
    [headers, includedColumns, titleColumn]
  );

  const detailCount = useMemo(
    () => headers.filter((header) => includedColumns[header] && header !== titleColumn).length,
    [headers, includedColumns, titleColumn]
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

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / TABLE_PAGE_SIZE));
  const safePage = Math.min(pageNumber, totalPages);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * TABLE_PAGE_SIZE;
    return filteredRows.slice(start, start + TABLE_PAGE_SIZE);
  }, [filteredRows, safePage]);

  const manualRows = useMemo(() => rows.filter((row) => row.source === "manual"), [rows]);
  const previewRow = selectedDataRows[0] || rows[0] || null;
  const labelCount = selectedDataRows.length * Math.max(1, copies);

  const previewQrValue = useMemo(() => {
    if (!previewRow || !showQr || !qrColumn) return "";
    return clean(previewRow.values[qrColumn]);
  }, [previewRow, showQr, qrColumn]);

  useEffect(() => {
    let cancelled = false;

    if (!previewQrValue) {
      setPreviewQrSrc("");
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const mod = await import("qrcode");
        const src = await mod.default.toDataURL(previewQrValue, {
          width: 256,
          margin: 3,
          errorCorrectionLevel: "M",
          color: { dark: "#000000", light: "#FFFFFF" },
        });
        if (!cancelled) setPreviewQrSrc(src);
      } catch {
        if (!cancelled) setPreviewQrSrc("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewQrValue]);

  useEffect(() => {
    function cleanupAfterPrint() {
      setPrintReady(false);
      setPreparingPrint(false);
    }

    window.addEventListener("afterprint", cleanupAfterPrint);
    return () => window.removeEventListener("afterprint", cleanupAfterPrint);
  }, []);

  function invalidatePreparedPrint() {
    if (printReady) setPrintReady(false);
  }

  function applyColumnDefaults(nextHeaders: string[], preserveExisting = false) {
    const autoTitle = detectColumn(nextHeaders, [
      "nama",
      "nama peserta",
      "nama lengkap",
      "name",
      "patient name",
      "participant name",
    ]);
    const autoQr = detectColumn(nextHeaders, [
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

    if (!preserveExisting || !titleColumn || !nextHeaders.includes(titleColumn)) {
      setTitleColumn(autoTitle || nextHeaders[0] || "");
    }
    if (!preserveExisting || (qrColumn && !nextHeaders.includes(qrColumn))) {
      setQrColumn(autoQr || "");
      setShowQr(Boolean(autoQr));
    }

    setIncludedColumns((prev) => {
      const next: Record<string, boolean> = {};
      let autoDetails = 0;
      nextHeaders.forEach((header) => {
        if (preserveExisting && Object.prototype.hasOwnProperty.call(prev, header)) {
          next[header] = prev[header];
          return;
        }
        const isTitle = header === (autoTitle || nextHeaders[0] || "");
        next[header] = !isTitle && autoDetails < 3;
        if (next[header]) autoDetails += 1;
      });
      return next;
    });
  }

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
    setShowQr(false);
    setIncludedColumns({});
    setSearch("");
    setPageNumber(1);
    setQrCache({});
    setPrintReady(false);
    setMessage("Data dibersihkan. Silakan import file atau tambah data manual.");
  }

  function parseSheet(nextSheetName: string, nextHeaderRow?: number) {
    const workbook = workbookRef.current;
    if (!workbook) return;

    const sheet = workbook.Sheets[nextSheetName];
    if (!sheet) {
      setMessage(`Sheet ${nextSheetName} tidak ditemukan.`);
      return;
    }

    const XLSX = workbook.__xlsxModule;
    if (!XLSX) {
      setMessage("Reader Excel belum siap. Import ulang file.");
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
    const importedRows = matrix
      .slice(detectedIndex + 1)
      .map((cells, rowIndex) => {
        const values: Record<string, string> = {};
        uniqueHeaders.forEach((header, colIndex) => {
          values[header] = clean(cells?.[colIndex]);
        });
        return { id: rowIndex + 1, source: "import" as const, values };
      })
      .filter((row) => uniqueHeaders.some((header) => clean(row.values[header])));

    const allSelected: Record<number, boolean> = {};
    importedRows.forEach((row) => {
      allSelected[row.id] = true;
    });

    setSheetName(nextSheetName);
    setHeaderRow(detectedIndex + 1);
    setHeaders(uniqueHeaders);
    setRows(importedRows);
    setSelectedRows(allSelected);
    applyColumnDefaults(uniqueHeaders, false);
    setSearch("");
    setPageNumber(1);
    setQrCache({});
    setPrintReady(false);
    setMessage(
      `Berhasil membaca ${importedRows.length} baris dan ${uniqueHeaders.length} kolom dari sheet ${nextSheetName}. Tabel hanya merender ${TABLE_PAGE_SIZE} baris per halaman agar tetap ringan.`
    );
  }

  async function handleFile(file: File | null) {
    if (!file) return;

    try {
      setMessage("Membaca file... library Excel baru dimuat saat file dipilih agar halaman awal lebih ringan.");
      const [xlsxModule, buffer] = await Promise.all([
        import("xlsx"),
        file.arrayBuffer(),
      ]);
      const XLSX: any = (xlsxModule as any).default?.read
        ? (xlsxModule as any).default
        : xlsxModule;
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const firstSheet = workbook.SheetNames[0] || "";
      workbook.__xlsxModule = XLSX;

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

  function ensureManualHeaders() {
    if (headers.length) return headers;
    const next = [...DEFAULT_MANUAL_FIELDS];
    setHeaders(next);
    applyColumnDefaults(next, false);
    return next;
  }

  function addManualRow() {
    const currentHeaders = ensureManualHeaders();
    const values: Record<string, string> = {};
    currentHeaders.forEach((header) => {
      values[header] = "";
    });

    const id = manualIdRef.current;
    manualIdRef.current += 1;
    const newRow: DataRow = { id, source: "manual", values };
    setRows((prev) => [...prev, newRow]);
    setSelectedRows((prev) => ({ ...prev, [id]: true }));
    setPageNumber(1);
    invalidatePreparedPrint();
    setMessage("Baris manual ditambahkan. Isi nilainya pada editor Data Manual.");
  }

  function addManualParameter() {
    const name = clean(newParameterName);
    if (!name) {
      setMessage("Isi nama parameter baru terlebih dahulu, misalnya Departemen, Nomor Kamar, atau Kode.");
      return;
    }
    if (headers.some((header) => norm(header) === norm(name))) {
      setMessage(`Parameter ${name} sudah ada.`);
      return;
    }

    const nextHeaders = [...headers, name];
    setHeaders(nextHeaders);
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        values: { ...row.values, [name]: "" },
      }))
    );
    setIncludedColumns((prev) => ({
      ...prev,
      [name]: detailCount < MAX_DETAIL_FIELDS,
    }));
    if (!titleColumn) setTitleColumn(name);
    setNewParameterName("");
    invalidatePreparedPrint();
    setMessage(`Parameter ${name} ditambahkan dan bisa langsung diisi pada baris manual.`);
  }

  function removeManualParameter(header: string) {
    if (!headers.includes(header)) return;
    const nextHeaders = headers.filter((item) => item !== header);
    setHeaders(nextHeaders);
    setRows((prev) =>
      prev.map((row) => {
        const values = { ...row.values };
        delete values[header];
        return { ...row, values };
      })
    );
    setIncludedColumns((prev) => {
      const next = { ...prev };
      delete next[header];
      return next;
    });
    if (titleColumn === header) setTitleColumn(nextHeaders[0] || "");
    if (qrColumn === header) {
      setQrColumn("");
      setShowQr(false);
    }
    invalidatePreparedPrint();
  }

  function updateManualValue(rowId: number, header: string, value: string) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, values: { ...row.values, [header]: value } }
          : row
      )
    );
    invalidatePreparedPrint();
  }

  function duplicateManualRow(rowId: number) {
    const source = rows.find((row) => row.id === rowId);
    if (!source) return;
    const id = manualIdRef.current;
    manualIdRef.current += 1;
    setRows((prev) => [
      ...prev,
      { id, source: "manual", values: { ...source.values } },
    ]);
    setSelectedRows((prev) => ({ ...prev, [id]: true }));
    invalidatePreparedPrint();
  }

  function deleteManualRow(rowId: number) {
    setRows((prev) => prev.filter((row) => row.id !== rowId));
    setSelectedRows((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    invalidatePreparedPrint();
  }

  function setAllRows(checked: boolean) {
    const next = { ...selectedRows };
    filteredRows.forEach((row) => {
      next[row.id] = checked;
    });
    setSelectedRows(next);
    invalidatePreparedPrint();
  }

  function toggleDetail(header: string, checked: boolean) {
    if (header === titleColumn && checked) return;

    if (checked) {
      const currentCount = headers.filter(
        (item) => includedColumns[item] && item !== titleColumn && item !== header
      ).length;
      if (currentCount >= MAX_DETAIL_FIELDS) {
        setMessage(
          `Maksimal ${MAX_DETAIL_FIELDS} baris detail agar layout CAPASKA landscape 50 mm x 30 mm tetap aman. Nonaktifkan salah satu field dulu.`
        );
        return;
      }
    }

    setIncludedColumns((prev) => ({ ...prev, [header]: checked }));
    invalidatePreparedPrint();
  }

  async function buildQrCache() {
    if (!showQr || !qrColumn) return {} as Record<string, string>;

    const values = Array.from(
      new Set(selectedDataRows.map((row) => clean(row.values[qrColumn])).filter(Boolean))
    );
    if (!values.length) return {} as Record<string, string>;

    const mod = await import("qrcode");
    const QRCode = mod.default;
    const next: Record<string, string> = {};
    const chunkSize = 30;

    for (let start = 0; start < values.length; start += chunkSize) {
      const chunk = values.slice(start, start + chunkSize);
      const generated = await Promise.all(
        chunk.map(async (value) => {
          const src = await QRCode.toDataURL(value, {
            width: 320,
            margin: 3,
            errorCorrectionLevel: "M",
            color: { dark: "#000000", light: "#FFFFFF" },
          });
          return [value, src] as const;
        })
      );
      generated.forEach(([value, src]) => {
        next[value] = src;
      });
      setMessage(`Menyiapkan QR ${Math.min(start + chunk.length, values.length)} / ${values.length}...`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return next;
  }

  async function printLabels() {
    if (!selectedDataRows.length) {
      setMessage("Pilih minimal 1 baris data yang akan dicetak.");
      return;
    }

    if (!titleColumn && !detailColumns.length && !(showQr && qrColumn)) {
      setMessage("Pilih minimal satu isi label sebelum print.");
      return;
    }

    // Last-known-good strategy: buka print-only window SEBELUM pekerjaan async.
    // Ini mengikuti pola print vaksin yang stabil dan mengisolasi layout dari AppShell/page utama.
    const printWindow = window.open("about:blank", "_blank", "width=900,height=600");
    if (!printWindow) {
      setMessage("Popup print diblokir browser. Izinkan popup untuk situs ini lalu klik Print Label lagi.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(
      '<!doctype html><html><head><meta charset="utf-8"><title>Menyiapkan Print Label</title></head>' +
      '<body style="font-family:Arial,sans-serif;padding:18px">Menyiapkan label landscape 50 mm x 30 mm...</body></html>'
    );
    printWindow.document.close();

    try {
      setPreparingPrint(true);
      setPrintReady(false);
      setMessage(`Menyiapkan ${selectedDataRows.length} data x ${Math.max(1, copies)} copy = ${labelCount} label...`);

      const nextQrCache = await buildQrCache();
      const safeCopies = Math.max(1, Math.min(50, Number(copies || 1)));
      const safeTitleFont = Math.max(7, Math.min(28, Number(titleFontSize || 15)));
      const safeDetailFont = Math.max(6, Math.min(20, Number(detailFontSize || 9)));
      const safeLineGap = Math.max(0, Math.min(4, Number(lineGap || 0)));
      const safeQrPx = Math.min(80, Math.max(38, Number(qrSize || 54)));
      const align = textAlign === "center" ? "center" : textAlign === "right" ? "right" : "left";

      const labelsHtml: string[] = [];

      for (const row of selectedDataRows) {
        const title = clean(row.values[titleColumn]);
        const qrValue = qrColumn ? clean(row.values[qrColumn]) : "";
        const qrSrc = qrValue ? nextQrCache[qrValue] || "" : "";
        const showQrEffective = Boolean(showQr && qrColumn && qrValue && qrSrc);
        const details = detailColumns
          .map((header) => clean(row.values[header]))
          .filter(Boolean)
          .slice(0, MAX_DETAIL_FIELDS);

        const textRight = showQrEffective ? `calc(${safeQrPx}px + 4mm)` : "2.4mm";
        const titleHtml = title
          ? `<div class="label-title" style="right:${textRight};font-size:${safeTitleFont}px;text-align:${align}">${escapeHtml(title)}</div>`
          : "";
        const detailHtml = details.length
          ? `<div class="label-details" style="top:${title ? "12.3mm" : "2.2mm"};right:${textRight};font-size:${safeDetailFont}px;text-align:${align};max-height:${title ? "15.2mm" : "25.2mm"}">${details
              .map(
                (value, index) =>
                  `<div style="${index ? `margin-top:${Math.max(0.55, safeLineGap)}mm;` : ""}">${escapeHtml(value)}</div>`
              )
              .join("")}</div>`
          : "";
        const qrHtml = showQrEffective
          ? `<div class="label-qr" style="width:${safeQrPx}px;height:${safeQrPx}px"><img src="${qrSrc}" alt="QR" style="width:${safeQrPx}px;height:${safeQrPx}px"></div>`
          : "";

        const borderStyle = showBorder ? "border:1px solid #d4d4d8;border-radius:1.4mm;" : "";
        const oneLabel = `<section class="label-page" style="${borderStyle}">${titleHtml}${detailHtml}${qrHtml}</section>`;

        for (let copyIndex = 0; copyIndex < safeCopies; copyIndex += 1) {
          labelsHtml.push(oneLabel);
        }
      }

      const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Print Label Manual</title>
<style>
  @page {
    size: 50mm 30mm;
    margin: 0;
  }

  html,
  body {
    width: 50mm !important;
    min-width: 50mm !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    color: #000 !important;
    font-family: Arial, Helvetica, sans-serif;
  }

  body {
    overflow: visible !important;
  }

  .label-page {
    position: relative;
    width: 50mm !important;
    min-width: 50mm !important;
    max-width: 50mm !important;
    height: 30mm !important;
    min-height: 30mm !important;
    max-height: 30mm !important;
    box-sizing: border-box;
    overflow: hidden;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    color: #000 !important;
    page-break-after: always;
    break-after: page;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .label-page:last-child {
    page-break-after: auto;
    break-after: auto;
  }

  .label-page * {
    box-sizing: border-box;
  }

  .label-title {
    position: absolute;
    left: 2.4mm;
    top: 2.2mm;
    z-index: 2;
    line-height: .94;
    font-weight: 900;
    color: #000;
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
    letter-spacing: -.04em;
    max-height: 9.2mm;
    overflow: hidden;
  }

  .label-details {
    position: absolute;
    left: 2.4mm;
    z-index: 2;
    line-height: 1.02;
    font-weight: 700;
    color: #111827;
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
    overflow: hidden;
  }

  .label-qr {
    position: absolute;
    right: .5mm;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    z-index: 1;
  }

  .label-qr img {
    display: block;
    background: #fff;
    image-rendering: pixelated;
  }

  @media print {
    html,
    body {
      width: 50mm !important;
      min-width: 50mm !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    .label-page {
      width: 50mm !important;
      height: 30mm !important;
      margin: 0 !important;
    }
  }
</style>
</head>
<body>
${labelsHtml.join("\n")}
<script>
(function () {
  function waitForImages() {
    var images = Array.prototype.slice.call(document.images || []);
    return Promise.all(images.map(function (img) {
      if (img.complete) return Promise.resolve();
      return new Promise(function (resolve) {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }));
  }

  window.addEventListener('load', function () {
    waitForImages().then(function () {
      setTimeout(function () { window.print(); }, 350);
    });
  });
})();
</script>
</body>
</html>`;

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();

      setMessage(
        `Print-only window dibuka dengan engine last-known-good 50 mm x 30 mm. Total ${labelsHtml.length} label.`
      );
      setPreparingPrint(false);
    } catch (error) {
      try {
        printWindow.close();
      } catch {}
      const errorText = error instanceof Error ? error.message : String(error);
      setPreparingPrint(false);
      setPrintReady(false);
      setMessage(`Gagal menyiapkan print: ${errorText}`);
    }
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
            color: black !important;
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
            color: black !important;
            border-radius: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .label-page * {
            box-sizing: border-box;
          }
        }
      `}</style>

      <section className="card p-5 no-print">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-2xl font-black">Print Label Manual</div>
            <div className="mt-1 max-w-3xl text-sm text-slate-500">
              Dua cara input: import Excel/CSV atau tambah data manual. Isi label dicetak langsung sebagai nilai per baris tanpa awalan nama field.
            </div>
          </div>
          <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
            Performance V70 - LAST KNOWN GOOD POPUP 50 mm x 30 mm
          </div>
        </div>
      </section>

      <section className="card p-5 no-print">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 font-black text-white">1</div>
          <div>
            <div className="font-black">Sumber Data</div>
            <div className="text-xs text-slate-500">Import file atau tambahkan baris serta parameter secara manual.</div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border bg-slate-50 p-4">
          <div className="mb-3 text-xs font-black uppercase text-slate-500">A. Import Excel / CSV</div>
          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_180px_auto]">
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
                disabled={!sheetName}
                onChange={(event) => setHeaderRow(Math.max(1, Number(event.target.value) || 1))}
              />
            </div>

            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={!sheetName} onClick={reReadHeader}>
                Baca Ulang
              </button>
              <button type="button" className="btn-secondary" disabled={!rows.length && !fileName} onClick={resetData}>
                Reset
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border bg-white p-4">
          <div className="mb-3 text-xs font-black uppercase text-slate-500">B. Tambah Data Manual</div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <button type="button" className="btn-primary" onClick={addManualRow}>
              + Tambah Baris Manual
            </button>
            <div className="flex min-w-0 flex-1 gap-2">
              <input
                className="input min-w-0 flex-1"
                value={newParameterName}
                onChange={(event) => setNewParameterName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addManualParameter();
                  }
                }}
                placeholder="Parameter baru, contoh: Departemen / Kode / Nomor Kamar"
              />
              <button type="button" className="btn-secondary" onClick={addManualParameter}>
                + Parameter
              </button>
            </div>
          </div>

          {manualRows.length ? (
            <div className="mt-4 overflow-auto rounded-xl border">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="sticky left-0 z-10 min-w-20 bg-slate-100 px-3 py-3">Aksi</th>
                    {headers.map((header) => (
                      <th key={header} className="min-w-48 px-3 py-3">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {manualRows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="sticky left-0 bg-white px-3 py-2">
                        <div className="flex gap-1">
                          <button type="button" className="rounded-lg border px-2 py-1 font-bold" onClick={() => duplicateManualRow(row.id)}>Copy</button>
                          <button type="button" className="rounded-lg border border-red-200 px-2 py-1 font-bold text-red-600" onClick={() => deleteManualRow(row.id)}>Hapus</button>
                        </div>
                      </td>
                      {headers.map((header) => (
                        <td key={header} className="px-2 py-2">
                          <input
                            className="input w-full"
                            value={row.values[header] || ""}
                            onChange={(event) => updateManualValue(row.id, header, event.target.value)}
                            placeholder={header}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-3 text-xs font-semibold text-slate-500">
              Belum ada baris manual. Tombol Tambah Baris Manual otomatis membuat parameter Nama, Institusi, dan Kode bila belum ada data.
            </div>
          )}
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
              <div className="text-xs text-slate-500">Nama utama menjadi baris pertama. Field yang dicentang dicetak sebagai nilai saja, tanpa teks seperti Asal Institusi:.</div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 rounded-2xl border bg-slate-50 p-4 lg:grid-cols-2">
            <label className="text-sm font-bold text-slate-700">
              Nama utama / baris pertama
              <select
                className="input mt-2 w-full"
                value={titleColumn}
                onChange={(event) => {
                  const value = event.target.value;
                  setTitleColumn(value);
                  if (value) setIncludedColumns((prev) => ({ ...prev, [value]: false }));
                  invalidatePreparedPrint();
                }}
              >
                <option value="">Tidak dipakai</option>
                {headers.map((header) => <option key={header} value={header}>{header}</option>)}
              </select>
            </label>

            <label className="text-sm font-bold text-slate-700">
              Sumber QR / kode opsional
              <div className="mt-2 flex gap-2">
                <select
                  className="input min-w-0 flex-1"
                  value={qrColumn}
                  onChange={(event) => {
                    setQrColumn(event.target.value);
                    invalidatePreparedPrint();
                  }}
                >
                  <option value="">Tidak ada QR</option>
                  {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
                <label className="flex items-center gap-2 rounded-xl border bg-white px-3 text-xs font-bold">
                  <input
                    type="checkbox"
                    checked={showQr}
                    disabled={!qrColumn}
                    onChange={(event) => {
                      setShowQr(event.target.checked);
                      invalidatePreparedPrint();
                    }}
                  />
                  Tampilkan QR
                </label>
              </div>
            </label>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border">
            <div className="grid grid-cols-[120px_1fr_auto] gap-3 bg-slate-100 px-4 py-3 text-xs font-black uppercase text-slate-500">
              <div>Tampil Teks</div>
              <div>Parameter / Kolom</div>
              <div>Aksi</div>
            </div>
            {headers.map((header) => {
              const isTitle = header === titleColumn;
              return (
                <div key={header} className="grid grid-cols-[120px_1fr_auto] items-center gap-3 border-t px-4 py-3">
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={isTitle ? true : Boolean(includedColumns[header])}
                      disabled={isTitle}
                      onChange={(event) => toggleDetail(header, event.target.checked)}
                    />
                    {isTitle ? <span className="text-[10px] text-blue-700">NAMA</span> : null}
                  </label>
                  <div className="truncate text-sm font-bold text-slate-800">
                    {header}
                    {header === qrColumn ? <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700">QR SOURCE</span> : null}
                  </div>
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 px-2 py-1 text-xs font-bold text-red-600"
                    onClick={() => removeManualParameter(header)}
                    title="Hapus parameter dari dataset aktif"
                  >
                    Hapus
                  </button>
                </div>
              );
            })}
          </div>

          <div className={`mt-3 rounded-xl p-3 text-xs font-bold ${detailCount > MAX_DETAIL_FIELDS ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
            Baris detail aktif: {Math.min(detailCount, MAX_DETAIL_FIELDS)}/{MAX_DETAIL_FIELDS}. QR source boleh sekaligus dicentang sebagai teks sehingga kode dapat tampil sebagai baris biasa dan QR.
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
                <div className="text-xs text-slate-500">Tabel dipaginasi 50 baris supaya data ratusan tidak membuat page freeze.</div>
              </div>
            </div>
            <input
              className="input lg:w-80"
              placeholder="Cari data..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPageNumber(1);
              }}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary" onClick={() => setAllRows(true)}>Pilih Semua Hasil</button>
            <button type="button" className="btn-secondary" onClick={() => setAllRows(false)}>Lepas Semua Hasil</button>
            <div className="ml-auto rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
              Terpilih {selectedDataRows.length} / {rows.length}
            </div>
          </div>

          <div className="mt-4 overflow-auto rounded-2xl border">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-3 py-3">Print</th>
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Sumber</th>
                  {headers.slice(0, 6).map((header) => <th key={header} className="min-w-40 px-3 py-3">{header}</th>)}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row, index) => (
                  <tr key={row.id} className="border-t align-top">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedRows[row.id])}
                        onChange={(event) => {
                          setSelectedRows((prev) => ({ ...prev, [row.id]: event.target.checked }));
                          invalidatePreparedPrint();
                        }}
                      />
                    </td>
                    <td className="px-3 py-3 font-bold text-slate-500">{(safePage - 1) * TABLE_PAGE_SIZE + index + 1}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-black ${row.source === "manual" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"}`}>
                        {row.source === "manual" ? "MANUAL" : "IMPORT"}
                      </span>
                    </td>
                    {headers.slice(0, 6).map((header) => (
                      <td key={header} className="max-w-64 px-3 py-3 text-slate-700">{row.values[header] || "-"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-600">
            <div>
              Menampilkan {pagedRows.length} dari {filteredRows.length} hasil - halaman {safePage}/{totalPages}
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={safePage <= 1} onClick={() => setPageNumber((prev) => Math.max(1, prev - 1))}>Sebelumnya</button>
              <button type="button" className="btn-secondary" disabled={safePage >= totalPages} onClick={() => setPageNumber((prev) => Math.min(totalPages, prev + 1))}>Berikutnya</button>
            </div>
          </div>
        </section>
      ) : null}

      {rows.length ? (
        <section className="card p-5 no-print">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 font-black text-white">4</div>
            <div>
              <div className="font-black">Setup Print & Preview</div>
              <div className="text-xs text-slate-500">Layout printer mengikuti persis modul Cetak Label CAPASKA: landscape 50 mm x 30 mm, margin 0.</div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs font-black text-slate-600">
                  Jumlah copy / data
                  <input type="number" min={1} max={50} className="input mt-2 w-full" value={copies} onChange={(event) => { setCopies(Math.max(1, Number(event.target.value) || 1)); invalidatePreparedPrint(); }} />
                </label>
                <label className="text-xs font-black text-slate-600">
                  Ukuran font nama
                  <input type="number" min={7} max={28} step={0.5} className="input mt-2 w-full" value={titleFontSize} onChange={(event) => { setTitleFontSize(Number(event.target.value) || 15); invalidatePreparedPrint(); }} />
                </label>
                <label className="text-xs font-black text-slate-600">
                  Ukuran font detail
                  <input type="number" min={6} max={20} step={0.5} className="input mt-2 w-full" value={detailFontSize} onChange={(event) => { setDetailFontSize(Number(event.target.value) || 9); invalidatePreparedPrint(); }} />
                </label>
                <label className="text-xs font-black text-slate-600">
                  Jarak antar baris (mm)
                  <input type="number" min={0} max={4} step={0.1} className="input mt-2 w-full" value={lineGap} onChange={(event) => { setLineGap(Math.max(0, Number(event.target.value) || 0)); invalidatePreparedPrint(); }} />
                </label>
                <label className="text-xs font-black text-slate-600">
                  Ukuran QR
                  <input type="number" min={38} max={80} className="input mt-2 w-full" value={qrSize} disabled={!showQr || !qrColumn} onChange={(event) => { setQrSize(Number(event.target.value) || 54); invalidatePreparedPrint(); }} />
                </label>
                <label className="flex items-center gap-2 rounded-xl border px-3 py-3 text-xs font-black text-slate-700 sm:mt-6">
                  <input type="checkbox" checked={showBorder} onChange={(event) => { setShowBorder(event.target.checked); invalidatePreparedPrint(); }} />
                  Border label
                </label>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-xs font-black text-slate-600">Rata teks</div>
                <div className="grid grid-cols-3 gap-2">
                  {(["left", "center", "right"] as TextAlign[]).map((align) => (
                    <button
                      key={align}
                      type="button"
                      className={`rounded-xl border px-3 py-2 text-xs font-black ${textAlign === align ? "border-blue-600 bg-blue-50 text-blue-700" : "bg-white text-slate-600"}`}
                      onClick={() => { setTextAlign(align); invalidatePreparedPrint(); }}
                    >
                      {align === "left" ? "Rata Kiri" : align === "center" ? "Rata Tengah" : "Rata Kanan"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border bg-slate-50 p-4 text-sm font-bold text-slate-700">
                {selectedDataRows.length} data x {Math.max(1, copies)} copy = <span className="text-blue-700">{labelCount} label</span>
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  Label printable tidak dibuat saat page load. Saat Print ditekan, sistem membuka print-only window dengan geometry last-known-good 50 mm x 30 mm.
                </div>
              </div>

              <button type="button" className="btn-primary mt-4 w-full" onClick={printLabels} disabled={!selectedDataRows.length || preparingPrint}>
                {preparingPrint ? "Menyiapkan Print..." : "Print Label"}
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
                    qrSize={qrSize}
                    titleFontSize={titleFontSize}
                    detailFontSize={detailFontSize}
                    textAlign={textAlign}
                    lineGap={lineGap}
                    showBorder={showBorder}
                    qrSrc={previewQrSrc}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="print-area hidden">
        {printReady
          ? selectedDataRows.map((row) =>
              Array.from({ length: Math.max(1, copies) }, (_, copyIndex) => {
                const qrValue = qrColumn ? clean(row.values[qrColumn]) : "";
                return (
                  <ManualLabelCard
                    key={`${row.id}-print-${copyIndex}`}
                    row={row}
                    titleColumn={titleColumn}
                    qrColumn={qrColumn}
                    showQr={showQr}
                    detailColumns={detailColumns}
                    qrSize={qrSize}
                    titleFontSize={titleFontSize}
                    detailFontSize={detailFontSize}
                    textAlign={textAlign}
                    lineGap={lineGap}
                    showBorder={showBorder}
                    qrSrc={qrValue ? qrCache[qrValue] || "" : ""}
                    printMode
                  />
                );
              })
            )
          : null}
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
  qrSize,
  titleFontSize,
  detailFontSize,
  textAlign,
  lineGap,
  showBorder,
  qrSrc,
  printMode = false,
}: {
  row: DataRow;
  titleColumn: string;
  qrColumn: string;
  showQr: boolean;
  detailColumns: string[];
  qrSize: number;
  titleFontSize: number;
  detailFontSize: number;
  textAlign: TextAlign;
  lineGap: number;
  showBorder: boolean;
  qrSrc: string;
  printMode?: boolean;
}) {
  const title = clean(row.values[titleColumn]);
  const qrValue = clean(row.values[qrColumn]);
  const qrPx = Math.min(80, Math.max(38, Number(qrSize || 54)));
  const showQrEffective = Boolean(showQr && qrColumn && qrValue && qrSrc);
  const safeTitleFont = Math.max(7, Math.min(28, Number(titleFontSize || 15)));
  const safeDetailFont = Math.max(6, Math.min(20, Number(detailFontSize || 9)));
  const safeLineGap = Math.max(0, Math.min(4, Number(lineGap || 0)));

  const details = detailColumns
    .map((header) => clean(row.values[header]))
    .filter(Boolean)
    .slice(0, MAX_DETAIL_FIELDS);

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
            right: showQrEffective ? `calc(${qrPx}px + 4mm)` : "2.4mm",
            zIndex: 2,
            fontSize: `${safeTitleFont}px`,
            lineHeight: 0.94,
            fontWeight: 900,
            color: "#000000",
            whiteSpace: "normal",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            letterSpacing: "-0.04em",
            maxHeight: "9.2mm",
            overflow: "hidden",
            textAlign,
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
            top: title ? "12.3mm" : "2.2mm",
            right: showQrEffective ? `calc(${qrPx}px + 4mm)` : "2.4mm",
            zIndex: 2,
            fontSize: `${safeDetailFont}px`,
            lineHeight: 1.02,
            fontWeight: 700,
            color: "#111827",
            whiteSpace: "normal",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            maxHeight: title ? "15.2mm" : "25.2mm",
            overflow: "hidden",
            textAlign,
          }}
        >
          {details.map((value, index) => (
            <div
              key={`${value}-${index}`}
              style={{ marginTop: index ? `${Math.max(0.55, safeLineGap)}mm` : undefined }}
            >
              {value}
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
          <img
            src={qrSrc}
            alt={`QR ${qrValue}`}
            draggable={false}
            style={{
              width: qrPx,
              height: qrPx,
              display: "block",
              background: "#ffffff",
              imageRendering: "pixelated",
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
