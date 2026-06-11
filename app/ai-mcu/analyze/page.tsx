"use client";

import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;

type SourceItem = {
  id: number;
  name: string;
  institution_name?: string | null;
  program_type?: string | null;
};

const PROGRAM_OPTIONS = [
  { value: "all", label: "Semua Program" },
  { value: "corporate", label: "Corporate" },
  { value: "capaska", label: "CAPASKA" },
];

const TABS = [
  "Dashboard",
  "Rekap_Analisis",
  "Abnormal_Summary",
  "Perbandingan_All",
  "Perbandingan_Changed",
  "Perbandingan_Signif",
  "Interpretasi Penyakit",
  "Download",
] as const;

function clean(value: any) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text || ["null", "undefined", "nan", "-", "—"].includes(text.toLowerCase())) return "";
  return text;
}

function pick(row: Row, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = clean(row?.[key]);
    if (value) return value;
  }

  const lowerMap = new Map(Object.keys(row || {}).map((key) => [key.toLowerCase(), key]));
  for (const key of keys) {
    const realKey = lowerMap.get(key.toLowerCase());
    if (realKey) {
      const value = clean(row?.[realKey]);
      if (value) return value;
    }
  }

  return fallback;
}

function asArray(value: any): Row[] {
  return Array.isArray(value) ? value : [];
}

function getByPath(obj: any, path: string) {
  return path.split(".").reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

function extractRows(json: any, paths: string[]) {
  for (const path of paths) {
    const value = getByPath(json, path);
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizeStatus(value: any) {
  const text = clean(value);
  if (!text) return "-";
  const low = text.toLowerCase();
  if (low.includes("terdeteksi") && !low.includes("tidak")) return "Terdeteksi";
  if (low.includes("tidak terdeteksi")) return "Tidak terdeteksi";
  if (low.includes("data tidak ada")) return "Data tidak ada";
  return text;
}

function normalizeInterpretation(row: Row): Row {
  return {
    NAMA: pick(row, ["NAMA", "Nama", "nama", "name", "participant_name"], "-"),
    MCU_ID: pick(row, ["MCU_ID", "mcu_id", "NOMCU", "NO MCU", "NO.MCU", "NO", "id"], "-"),
    CONDITION: pick(row, ["CONDITION", "Condition", "condition", "Penyakit", "DIAGNOSIS", "Diagnosis"], "-"),
    STATUS: normalizeStatus(pick(row, ["STATUS", "Status", "status"], "-")),
    SEVERITY: pick(row, ["SEVERITY", "Severity", "severity", "TINGKAT", "Prioritas"], "-"),
    SCORE: pick(row, ["SCORE", "Score", "score"], "-"),
    EVIDENCE: pick(row, ["EVIDENCE", "Evidence", "evidence", "Bukti", "TEMUAN", "Temuan"], "-"),
    NEXTSTEP: pick(row, ["NEXTSTEP", "NextStep", "NEXT_STEP", "nextStep", "Saran", "SARAN"], "-"),
    SOURCE: pick(row, ["SOURCE", "Source", "source"], "-"),
  };
}

function normalizeAbnormal(row: Row): Row {
  return {
    NAMA: pick(row, ["NAMA", "Nama", "nama", "name", "participant_name"], "-"),
    MCU_ID: pick(row, ["MCU_ID", "mcu_id", "NOMCU", "NO MCU", "NO.MCU", "NO", "id"], "-"),
    PARAMETER: pick(row, ["PARAMETER", "Parameter", "parameter"], "-"),
    HASIL: pick(row, ["HASIL", "Hasil", "hasil", "VALUE", "value"], "-"),
    INTERPRETASI: pick(row, ["INTERPRETASI", "Interpretasi", "interpretasi", "TEMUAN", "Temuan"], "-"),
    SEVERITY: pick(row, ["SEVERITY", "Severity", "severity", "PRIORITAS", "Prioritas"], "-"),
    SARAN: pick(row, ["SARAN", "Saran", "saran", "NEXTSTEP", "NextStep"], "-"),
    SOURCE: pick(row, ["SOURCE", "Source", "source"], "-"),
  };
}

function combinedText(row: Row) {
  return [
    pick(row, ["KATEGORI", "Kategori", "category", "status"]),
    pick(row, ["KESIMPULAN", "Kesimpulan", "conclusion", "summary"]),
    pick(row, ["SARAN", "Saran", "recommendation"]),
    pick(row, ["THORAX", "Thorax", "Hasilthorax", "Hasil Thorax"]),
    pick(row, ["EKG", "HasilEKG", "Hasil EKG"]),
  ]
    .filter(Boolean)
    .join(" | ");
}

function extractBmi(text: string) {
  const match = text.match(/(?:bmi|imt)\s*[:=]?\s*([0-9]+(?:[.,][0-9]+)?)/i);
  if (!match?.[1]) return "";
  return match[1].replace(",", ".");
}

function pushUnique(target: Row[], row: Row) {
  const key = `${row.NAMA}|${row.MCU_ID}|${row.CONDITION}|${row.EVIDENCE}`;
  if (target.some((item) => `${item.NAMA}|${item.MCU_ID}|${item.CONDITION}|${item.EVIDENCE}` === key)) return;
  target.push(row);
}

function buildInterpretationFallback(rekapRows: Row[]) {
  const rows: Row[] = [];

  for (const raw of rekapRows) {
    const nama = pick(raw, ["NAMA", "Nama", "nama", "name", "participant_name"], "-");
    const mcu = pick(raw, ["MCU_ID", "mcu_id", "NOMCU", "NO MCU", "NO.MCU", "NO", "id"], "-");
    const text = combinedText(raw);
    const low = text.toLowerCase();
    const saran = pick(raw, ["SARAN", "Saran", "saran"], "-");
    const bmi = extractBmi(text);

    const add = (condition: string, severity: string, score: number, evidence = text, nextStep = saran) => {
      pushUnique(rows, {
        NAMA: nama,
        MCU_ID: mcu,
        CONDITION: condition,
        STATUS: "Terdeteksi",
        SEVERITY: severity,
        SCORE: score,
        EVIDENCE: evidence || "-",
        NEXTSTEP: nextStep || "-",
        SOURCE: "frontend-text-fallback",
      });
    };

    if (!text) continue;

    if (low.includes("underweight") || low.includes("berat badan kurang") || low.includes("kurus")) {
      add("Underweight", "Rendah", 45, bmi ? `BMI ${bmi}; ${text}` : text, "Konsultasi gizi dan monitoring berat badan.");
    }

    if (low.includes("overweight") || low.includes("berat badan lebih")) {
      add("Overweight", "Rendah", 40, text, "Edukasi nutrisi dan aktivitas fisik.");
    }

    if (low.includes("obesitas") || low.includes("obese")) {
      add("Obesitas", "Sedang", 60, text, "Edukasi nutrisi, aktivitas fisik, dan monitoring metabolik.");
    }

    if (low.includes("hipertensi") || low.includes("tekanan darah tinggi") || low.includes("tensi tinggi")) {
      add("Hipertensi", "Sedang", 70, text, "Ulang tekanan darah dan konsultasi dokter.");
    }

    if (low.includes("diabetes") || low.includes("gula darah tinggi") || low.includes("hiperglikemi")) {
      add("Diabetes / gangguan gula darah", "Sedang", 70, text, "Konfirmasi gula darah/HbA1c dan konsultasi dokter.");
    }

    if (low.includes("dislipidemia") || low.includes("kolesterol") || low.includes("ldl") || low.includes("trigliserida")) {
      add("Dislipidemia", "Sedang", 60, text, "Diet rendah lemak, aktivitas fisik, evaluasi risiko kardiovaskular.");
    }

    if (low.includes("asam urat") || low.includes("uric acid") || low.includes("hiperurisemia")) {
      add("Hiperurisemia", "Rendah", 45, text, "Diet rendah purin dan monitoring.");
    }

    if (low.includes("sgot") || low.includes("sgpt") || low.includes("fungsi hati") || low.includes("fatty liver")) {
      add("Gangguan fungsi hati", "Sedang", 55, text, "Evaluasi dokter dan fungsi hati ulang.");
    }

    if (low.includes("kreatinin") || low.includes("ureum") || low.includes("fungsi ginjal")) {
      add("Gangguan fungsi ginjal", "Sedang", 55, text, "Evaluasi dokter dan monitoring fungsi ginjal.");
    }

    if (low.includes("anemia") || low.includes("hb rendah") || low.includes("hemoglobin rendah")) {
      add("Anemia", "Sedang", 55, text, "Evaluasi penyebab anemia.");
    }

    if (low.includes("myopia") || low.includes("miopia") || low.includes("visus") || low.includes("refraksi") || low.includes("mata kanan") || low.includes("mata kiri")) {
      add("Gangguan refraksi / visus", "Rendah", 35, text, "Konsultasi mata/optometri bila diperlukan.");
    }

    if (!rows.some((item) => item.NAMA === nama && item.MCU_ID === mcu) && text && !low.includes("tidak ditemukan kelainan") && !low.includes("dalam batas normal")) {
      add("Perlu perhatian", "Rendah", 30, text, saran || "Review oleh dokter pemeriksa.");
    }
  }

  return rows;
}

function buildAbnormalFallback(interpretationRows: Row[]) {
  return interpretationRows
    .filter((row) => row.STATUS === "Terdeteksi")
    .map((row) => ({
      NAMA: row.NAMA,
      MCU_ID: row.MCU_ID,
      PARAMETER: row.CONDITION,
      HASIL: row.EVIDENCE,
      INTERPRETASI: row.CONDITION,
      SEVERITY: row.SEVERITY,
      SARAN: row.NEXTSTEP,
      SOURCE: row.SOURCE || "frontend-text-fallback",
    }));
}

function displayColumns(rows: Row[], preferred: string[] = []) {
  const seen = new Set<string>();
  const cols: string[] = [];

  for (const col of preferred) {
    if (rows.some((row) => row[col] !== undefined) && !seen.has(col)) {
      seen.add(col);
      cols.push(col);
    }
  }

  for (const row of rows) {
    for (const col of Object.keys(row)) {
      if (!seen.has(col)) {
        seen.add(col);
        cols.push(col);
      }
    }
  }

  return cols;
}

function valueText(value: any) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function rowsToCsv(rows: Row[]) {
  if (!rows.length) return "";
  const cols = displayColumns(rows);
  const escape = (value: any) => `"${valueText(value).replace(/"/g, '""')}"`;
  return [cols.map(escape).join(","), ...rows.map((row) => cols.map((col) => escape(row[col])).join(","))].join("\n");
}

function downloadText(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function TableView({ rows, preferred = [] }: { rows: Row[]; preferred?: string[] }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(100);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => Object.values(row).some((value) => valueText(value).toLowerCase().includes(q)));
  }, [rows, query]);

  const cols = useMemo(() => displayColumns(filtered, preferred), [filtered, preferred]);

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm font-bold text-slate-700">
          Data: {filtered.length} row · {cols.length} kolom
        </div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari semua kolom..."
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            {[25, 50, 100, 200, 500].map((item) => (
              <option key={item} value={item}>
                Tampilkan {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!filtered.length ? (
        <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-500">Belum ada data.</div>
      ) : (
        <div className="max-h-[680px] overflow-auto rounded-2xl border">
          <table className="min-w-max table-auto text-sm">
            <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600">
              <tr>
                {cols.map((col) => (
                  <th key={col} className="min-w-[180px] max-w-[260px] p-3 text-left align-top font-black">
  <div className="max-w-[260px] whitespace-normal break-words leading-snug">{col}</div>
</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.slice(0, limit).map((row, index) => (
                <tr key={index} className="hover:bg-slate-50">
                  {cols.map((col) => (
                    <td key={col} className="min-w-[180px] max-w-[420px] p-3 align-top" title={valueText(row[col])}>
  <div className="max-w-[420px] whitespace-normal break-words leading-relaxed text-slate-900">
    {valueText(row[col]) || "-"}
  </div>
</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AiMcuAnalyzePage() {
  const [programType, setProgramType] = useState("all");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [thresholdPct, setThresholdPct] = useState(10);

  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Interpretasi Penyakit");
  const [loadingSources, setLoadingSources] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("Pilih database lalu klik Run Analisis.");
  const [error, setError] = useState("");

  const [rawResponse, setRawResponse] = useState<any>(null);
  const [rekapRows, setRekapRows] = useState<Row[]>([]);
  const [abnormalRows, setAbnormalRows] = useState<Row[]>([]);
  const [comparisonAll, setComparisonAll] = useState<Row[]>([]);
  const [comparisonChanged, setComparisonChanged] = useState<Row[]>([]);
  const [comparisonSignif, setComparisonSignif] = useState<Row[]>([]);
  const [interpretationRows, setInterpretationRows] = useState<Row[]>([]);

  const [nameQuery, setNameQuery] = useState("");
  const [conditionQuery, setConditionQuery] = useState("");
  const [severityQuery, setSeverityQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  async function loadSources(nextProgram = programType) {
    setLoadingSources(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("program", nextProgram);

      const res = await fetch(`/api/sources?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message || "Gagal mengambil database.");
        return;
      }

      const list = json.sources || [];
      setSources(list);

      const urlParams = new URLSearchParams(window.location.search);
      const fromUrl = urlParams.get("source_id");

      if (fromUrl && list.some((item: SourceItem) => String(item.id) === String(fromUrl))) {
        setSourceId(String(fromUrl));
      } else if (list[0]?.id) {
        setSourceId(String(list[0].id));
      }
    } catch (err: any) {
      setError(err?.message || "Gagal mengambil database.");
    } finally {
      setLoadingSources(false);
    }
  }

  async function runAnalysis() {
    if (!sourceId) {
      setError("Pilih database terlebih dahulu.");
      return;
    }

    setRunning(true);
    setError("");
    setMessage("Menjalankan analisis rule-based...");

    try {
      const res = await fetch("/api/ai-mcu/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceId: Number(sourceId),
          source_id: Number(sourceId),
          thresholdPct,
        }),
      });

      const json = await res.json().catch(() => ({ ok: false, message: "Response bukan JSON." }));
      setRawResponse(json);

      if (!res.ok || !json.ok) {
        setError(json.message || `Run analisis gagal. HTTP ${res.status}`);
        setMessage("Analisis gagal.");
        return;
      }

      const rekap = extractRows(json, [
        "Rekap_Analisis",
        "rekapAnalisis",
        "currentRows",
        "rows",
        "sheets.Rekap_Analisis",
        "data.Rekap_Analisis",
        "result.Rekap_Analisis",
      ]);

      const routeInterpretasi = extractRows(json, [
        "Interpretasi_Penyakit",
        "interpretasiPenyakit",
        "diseaseRows",
        "diseaseInterpretation",
        "interpretationRows",
        "sheets.Interpretasi_Penyakit",
        "data.Interpretasi_Penyakit",
        "result.Interpretasi_Penyakit",
      ]).map(normalizeInterpretation);

      const detectedInRoute = routeInterpretasi.filter((row) => row.STATUS === "Terdeteksi").length;
      const fallbackInterpretasi = buildInterpretationFallback(rekap);
      const finalInterpretasi = detectedInRoute > 0 ? routeInterpretasi : fallbackInterpretasi;

      const routeAbnormal = extractRows(json, [
        "Abnormal_Summary",
        "abnormalSummary",
        "abnormalRows",
        "sheets.Abnormal_Summary",
        "data.Abnormal_Summary",
        "result.Abnormal_Summary",
      ]).map(normalizeAbnormal);

      const finalAbnormal = routeAbnormal.length ? routeAbnormal : buildAbnormalFallback(finalInterpretasi);

      setRekapRows(rekap);
      setAbnormalRows(finalAbnormal);
      setComparisonAll(extractRows(json, ["Perbandingan_All", "comparisonAll", "sheets.Perbandingan_All", "data.Perbandingan_All", "result.Perbandingan_All"]));
      setComparisonChanged(extractRows(json, ["Perbandingan_Changed", "comparisonChanged", "sheets.Perbandingan_Changed", "data.Perbandingan_Changed", "result.Perbandingan_Changed"]));
      setComparisonSignif(extractRows(json, ["Perbandingan_Signif", "comparisonSignif", "sheets.Perbandingan_Signif", "data.Perbandingan_Signif", "result.Perbandingan_Signif"]));
      setInterpretationRows(finalInterpretasi);

      const finalDetected = finalInterpretasi.filter((row) => row.STATUS === "Terdeteksi").length;
      if (detectedInRoute === 0 && fallbackInterpretasi.length) {
        setMessage(
          `Analisis selesai. Interpretasi route masih kosong, jadi halaman memakai fallback dari KESIMPULAN/SARAN. Total temuan: ${finalDetected}.`
        );
      } else {
        setMessage(`Analisis selesai. Total peserta: ${rekap.length}. Total temuan: ${finalDetected}.`);
      }

      setActiveTab("Interpretasi Penyakit");
    } catch (err: any) {
      setError(err?.message || "Run analisis gagal.");
      setMessage("Analisis gagal.");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    loadSources(programType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programType]);

  const selectedSource = sources.find((item) => String(item.id) === String(sourceId));

  const filteredInterpretationRows = useMemo(() => {
    return interpretationRows.filter((row) => {
      if (nameQuery.trim() && !row.NAMA.toLowerCase().includes(nameQuery.trim().toLowerCase())) return false;
      if (conditionQuery.trim() && !row.CONDITION.toLowerCase().includes(conditionQuery.trim().toLowerCase())) return false;
      if (severityQuery.trim() && !row.SEVERITY.toLowerCase().includes(severityQuery.trim().toLowerCase())) return false;
      if (statusFilter !== "all" && row.STATUS !== statusFilter) return false;
      return true;
    });
  }, [interpretationRows, nameQuery, conditionQuery, severityQuery, statusFilter]);

  const detectedCount = interpretationRows.filter((row) => row.STATUS === "Terdeteksi").length;
  const statusOptions = Array.from(new Set(interpretationRows.map((row) => row.STATUS).filter(Boolean)));
  const severityOptions = Array.from(new Set(interpretationRows.map((row) => row.SEVERITY).filter(Boolean)));
  const conditionOptions = Array.from(new Set(interpretationRows.map((row) => row.CONDITION).filter(Boolean))).sort();

  function renderDashboard() {
    const cards = [
      ["Total peserta", rekapRows.length],
      ["Abnormal rows", abnormalRows.length],
      ["Interpretasi terdeteksi", detectedCount],
      ["Perubahan parameter", comparisonChanged.length],
      ["Perubahan signifikan", comparisonSignif.length],
      ["Database", selectedSource?.name || "-"],
    ];

    return (
      <div className="grid gap-3 md:grid-cols-3">
        {cards.map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border bg-slate-50 p-5">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-2 text-3xl font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>
    );
  }

  function renderInterpretation() {
    return (
      <div>
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm text-slate-500">Total peserta</div>
            <div className="mt-2 text-4xl font-light text-slate-900">{rekapRows.length}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500">Total temuan (terdeteksi)</div>
            <div className="mt-2 text-4xl font-light text-slate-900">{detectedCount}</div>
          </div>
        </div>

        <div className="mb-5 grid gap-3 xl:grid-cols-4">
          <div>
            <label className="text-sm text-slate-600">Cari Nama</label>
            <input
              value={nameQuery}
              onChange={(event) => setNameQuery(event.target.value)}
              placeholder="ketik sebagian nama..."
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
            />
          </div>

          <div>
            <label className="text-sm text-slate-600">Filter Condition</label>
            <select
              value={conditionQuery}
              onChange={(event) => setConditionQuery(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
            >
              <option value="">Semua condition</option>
              {conditionOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-slate-600">Filter Severity</label>
            <select
              value={severityQuery}
              onChange={(event) => setSeverityQuery(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
            >
              <option value="">Semua severity</option>
              {severityOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-slate-600">Filter Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
            >
              <option value="all">Semua status</option>
              {statusOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <TableView
          rows={filteredInterpretationRows}
          preferred={["NAMA", "MCU_ID", "CONDITION", "STATUS", "SEVERITY", "SCORE", "EVIDENCE", "NEXTSTEP", "SOURCE"]}
        />
      </div>
    );
  }

  function renderDownload() {
    const packs: [string, Row[]][] = [
      ["Rekap_Analisis.csv", rekapRows],
      ["Abnormal_Summary.csv", abnormalRows],
      ["Perbandingan_All.csv", comparisonAll],
      ["Perbandingan_Changed.csv", comparisonChanged],
      ["Perbandingan_Signif.csv", comparisonSignif],
      ["Interpretasi_Penyakit.csv", interpretationRows],
    ];

    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {packs.map(([filename, rows]) => (
          <button
            key={filename}
            type="button"
            onClick={() => downloadText(filename, rowsToCsv(rows), "text/csv")}
            disabled={!rows.length}
            className="rounded-xl border bg-slate-50 p-4 text-left font-bold hover:bg-slate-100 disabled:opacity-50"
          >
            {filename}
            <div className="mt-1 text-sm font-normal text-slate-500">{rows.length} row</div>
          </button>
        ))}

        <button
          type="button"
          onClick={() => downloadText("ai-mcu-analysis-response.json", JSON.stringify(rawResponse, null, 2), "application/json")}
          disabled={!rawResponse}
          className="rounded-xl border bg-slate-50 p-4 text-left font-bold hover:bg-slate-100 disabled:opacity-50"
        >
          Full JSON Debug
          <div className="mt-1 text-sm font-normal text-slate-500">Untuk cek response route</div>
        </button>
      </div>
    );
  }

  function renderActiveTab() {
    if (activeTab === "Dashboard") return renderDashboard();
    if (activeTab === "Rekap_Analisis") return <TableView rows={rekapRows} preferred={["NAMA", "MCU_ID", "NOMCU", "NIK", "JK", "USIA", "KATEGORI", "KESIMPULAN", "SARAN"]} />;
    if (activeTab === "Abnormal_Summary") return <TableView rows={abnormalRows} preferred={["NAMA", "MCU_ID", "PARAMETER", "HASIL", "INTERPRETASI", "SEVERITY", "SARAN", "SOURCE"]} />;
    if (activeTab === "Perbandingan_All") return <TableView rows={comparisonAll} />;
    if (activeTab === "Perbandingan_Changed") return <TableView rows={comparisonChanged} />;
    if (activeTab === "Perbandingan_Signif") return <TableView rows={comparisonSignif} />;
    if (activeTab === "Interpretasi Penyakit") return renderInterpretation();
    return renderDownload();
  }

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">AI MCU Analyzer</h1>
            <p className="mt-2 max-w-4xl text-sm text-slate-600">
              Tampilan ini membaca hasil rule-based dari route dan punya fallback dari KESIMPULAN/SARAN jika route lama belum mengirim Interpretasi_Penyakit.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a href="/ai-mcu" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              ☰ Menu AI MCU
            </a>
            <a href="/ai-mcu/upload" className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100">
              Upload MCU
            </a>
            <a href="/ai-mcu/generate" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
              Generate PDF
            </a>
          </div>
        </div>

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <h2 className="text-lg font-bold">Pilih Database MCU</h2>
          <div className="mt-4 grid gap-3 xl:grid-cols-[0.45fr_1fr_0.35fr_auto]">
            <select
              value={programType}
              onChange={(event) => setProgramType(event.target.value)}
              disabled={loadingSources || running}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            >
              {PROGRAM_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
              disabled={loadingSources || running}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            >
              <option value="">{loadingSources ? "Mengambil database..." : "Pilih database"}</option>
              {sources.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.institution_name ? ` · ${item.institution_name}` : ""}
                  {item.program_type ? ` · ${item.program_type}` : ""}
                </option>
              ))}
            </select>

            <input
              type="number"
              value={thresholdPct}
              onChange={(event) => setThresholdPct(Number(event.target.value || 10))}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              min={1}
              max={100}
            />

            <button
              type="button"
              onClick={runAnalysis}
              disabled={!sourceId || running}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {running ? "Running..." : "Run Analisis"}
            </button>
          </div>

          <div className="mt-3 rounded-xl border bg-white p-3 text-sm text-slate-600">
            Database aktif: <b>{selectedSource?.name || "-"}</b>. Threshold signifikan: <b>{thresholdPct}%</b>.
          </div>
        </section>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            {message}
          </div>
        ) : null}

        <nav className="mt-6 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl border px-4 py-2 text-sm font-bold ${
                activeTab === tab ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>

        <section className="mt-5 rounded-2xl border bg-white p-5">
          <h2 className="mb-4 text-lg font-bold">{activeTab}</h2>
          {renderActiveTab()}
        </section>
      </div>
    </main>
  );
}
