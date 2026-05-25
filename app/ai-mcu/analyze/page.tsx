''"use client";

import { useEffect, useMemo, useState } from "react";

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
  "Rekap",
  "Abnormal",
  "Prioritas",
  "Perbandingan",
  "Interpretasi Penyakit",
  "Download",
];

function valueText(value: any) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function tableColumns(rows: any[], preferred: string[] = []) {
  const set = new Set<string>();
  for (const key of preferred) set.add(key);
  for (const row of rows || []) {
    for (const key of Object.keys(row || {})) {
      if (key.startsWith("_AI_MCU")) continue;
      set.add(key);
    }
  }
  return Array.from(set).filter((key) => rows.some((row) => row?.[key] !== undefined));
}

function downloadJson(filename: string, payload: any) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(filename: string, rows: any[]) {
  const cols = tableColumns(rows);
  const escape = (v: any) => {
    const text = valueText(v).replace(/"/g, '""');
    return `"${text}"`;
  };
  const csv = [cols.map(escape).join(","), ...(rows || []).map((row) => cols.map((col) => escape(row?.[col])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DataTable({ rows, preferred = [], title }: { rows: any[]; preferred?: string[]; title?: string }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(100);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows || [];
    return (rows || []).filter((row) => JSON.stringify(row || {}).toLowerCase().includes(q));
  }, [rows, query]);

  const visibleRows = filtered.slice(0, limit);
  const cols = tableColumns(visibleRows.length ? visibleRows : filtered, preferred);

  if (!rows?.length) {
    return <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-500">Belum ada data.</div>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="text-sm font-bold text-slate-700">
          {title || "Tabel"}: {filtered.length.toLocaleString("id-ID")} row
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari semua kolom..."
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            {[50, 100, 250, 500, 1000].map((n) => (
              <option key={n} value={n}>Tampilkan {n}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="max-h-[620px] overflow-auto rounded-2xl border">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase text-slate-600">
            <tr>
              {cols.map((col) => (
                <th key={col} className="whitespace-nowrap p-2 text-left font-black">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y bg-white">
            {visibleRows.map((row, index) => (
              <tr key={index} className="hover:bg-slate-50">
                {cols.map((col) => (
                  <td key={`${index}-${col}`} className="max-w-[360px] truncate whitespace-nowrap p-2" title={valueText(row?.[col])}>
                    {valueText(row?.[col]) || "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > visibleRows.length ? (
        <div className="mt-2 text-xs text-slate-500">
          Menampilkan {visibleRows.length.toLocaleString("id-ID")} dari {filtered.length.toLocaleString("id-ID")} row. Ubah limit untuk melihat lebih banyak.
        </div>
      ) : null}
    </div>
  );
}

export default function AiMcuAnalyzePage() {
  const [programType, setProgramType] = useState("all");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [thresholdPct, setThresholdPct] = useState(10);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [loadingSources, setLoadingSources] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

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
      if (fromUrl && list.some((s: SourceItem) => String(s.id) === String(fromUrl))) {
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

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/ai-mcu/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: Number(sourceId), thresholdPct }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.message || "Analisis gagal.");
        setResult(json);
        return;
      }
      setResult(json);
      setActiveTab("Dashboard");
    } catch (err: any) {
      setError(err?.message || "Analisis gagal.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSources(programType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programType]);

  const summary = result?.summary || {};
  const currentRows = result?.currentRows || [];
  const previousRows = result?.previousRows || [];
  const changedRows = result?.changedRows || [];
  const comparisonRows = result?.comparisonRows || [];
  const diseaseRows = result?.diseaseRows || [];
  const abnormalRows = result?.abnormalRows || [];
  const priorityRows = result?.priorityRows || [];

  const detectedDiseaseRows = useMemo(() => {
    return (diseaseRows || []).filter((row: any) => String(row.Status || row.status || "").toLowerCase().includes("terdeteksi"));
  }, [diseaseRows]);

  const selectedSource = sources.find((source) => String(source.id) === sourceId);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Analisis MCU AI</h1>
            <p className="mt-2 max-w-4xl text-sm text-slate-600">
              Tampilan dibuat seperti AI MCU Analyzer Streamlit: Dashboard, Rekap, Abnormal,
              Prioritas, Perbandingan, Interpretasi Penyakit, dan Download. Semua field hasil analisis ditampilkan,
              tidak hanya ringkasan pendek.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a href="/ai-mcu" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              ☰ Menu AI MCU
            </a>
            <a href="/ai-mcu/generate" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
              Generate PDF
            </a>
          </div>
        </div>

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <h2 className="text-lg font-bold">Pilih Database MCU</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-[0.45fr_1fr_0.35fr_auto]">
            <select
              value={programType}
              onChange={(e) => setProgramType(e.target.value)}
              disabled={loadingSources || loading}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            >
              {PROGRAM_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>

            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              disabled={loadingSources || loading}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            >
              <option value="">{loadingSources ? "Mengambil database..." : "Pilih database/source"}</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}{source.institution_name ? ` · ${source.institution_name}` : ""}{source.program_type ? ` · ${source.program_type}` : ""}
                </option>
              ))}
            </select>

            <input
              type="number"
              min={1}
              max={100}
              value={thresholdPct}
              onChange={(e) => setThresholdPct(Number(e.target.value || 10))}
              disabled={loading}
              title="Threshold perubahan signifikan (%)"
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            />

            <button
              type="button"
              onClick={runAnalysis}
              disabled={loading || !sourceId}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Menganalisis..." : "Run Analisis"}
            </button>
          </div>

          <div className="mt-3 rounded-xl border bg-white p-3 text-xs text-slate-500">
            Database aktif: <b>{selectedSource?.name || "-"}</b>. Gunakan halaman Upload untuk memasukkan MCU lama dan MCU baru.
          </div>
        </section>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {result?.ok ? (
          <>
            <div className="mt-5 flex flex-wrap gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-xl border px-4 py-2 text-sm font-bold ${
                    activeTab === tab
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <section className="mt-5 rounded-2xl border bg-white p-5">
              {activeTab === "Dashboard" ? (
                <div>
                  <h2 className="text-lg font-bold">Dashboard</h2>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <div className="rounded-xl border bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">Total MCU Baru</div>
                      <div className="mt-1 text-2xl font-black">{Number(summary.totalCurrent || 0).toLocaleString("id-ID")}</div>
                    </div>
                    <div className="rounded-xl border bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">Total MCU Lama</div>
                      <div className="mt-1 text-2xl font-black">{Number(summary.totalPrevious || 0).toLocaleString("id-ID")}</div>
                    </div>
                    <div className="rounded-xl border bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">Parameter Berubah</div>
                      <div className="mt-1 text-2xl font-black">{Number(summary.changedParameters || 0).toLocaleString("id-ID")}</div>
                    </div>
                    <div className="rounded-xl border bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">Penyakit Terdeteksi</div>
                      <div className="mt-1 text-2xl font-black">{detectedDiseaseRows.length.toLocaleString("id-ID")}</div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border bg-slate-50 p-4">
                      <h3 className="font-bold">Top Perubahan Parameter</h3>
                      <DataTable rows={changedRows.slice(0, 25)} preferred={["Nama", "MCU_ID", "Parameter", "NilaiLama", "NilaiBaru", "Delta", "PercentDelta", "Signifikan", "Status"]} />
                    </div>
                    <div className="rounded-2xl border bg-slate-50 p-4">
                      <h3 className="font-bold">Interpretasi Penyakit Terdeteksi</h3>
                      <DataTable rows={detectedDiseaseRows.slice(0, 25)} preferred={["Nama", "MCU_ID", "Condition", "condition", "Status", "status", "Severity", "severity", "Score", "score", "Evidence", "evidence", "NextStep", "next_step"]} />
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === "Rekap" ? (
                <div>
                  <h2 className="text-lg font-bold">Rekap Semua Field MCU Baru</h2>
                  <p className="mt-1 text-sm text-slate-500">Semua kolom raw + canonical ditampilkan agar tidak ada field analisis yang tersembunyi.</p>
                  <div className="mt-4">
                    <DataTable rows={currentRows} preferred={["NAMA", "NOMCU", "NIK", "JK", "USIA", "DEPARTEMEN", "PAKET"]} title="Rekap" />
                  </div>
                </div>
              ) : null}

              {activeTab === "Abnormal" ? (
                <div>
                  <h2 className="text-lg font-bold">Abnormal</h2>
                  <p className="mt-1 text-sm text-slate-500">Mengikuti output Python engine jika tersedia.</p>
                  <div className="mt-4">
                    <DataTable rows={abnormalRows} preferred={["Nama", "MCU_ID", "Pemeriksaan", "Hasil", "Normal Range", "Interpretasi", "Sheet"]} title="Abnormal" />
                  </div>
                </div>
              ) : null}

              {activeTab === "Prioritas" ? (
                <div>
                  <h2 className="text-lg font-bold">Prioritas Tindak Lanjut</h2>
                  <div className="mt-4">
                    <DataTable rows={priorityRows} preferred={["Nama", "Pemeriksaan", "Hasil", "Interpretasi", "PriorityScore", "Prioritas", "Reasons", "Domain", "NextStep"]} title="Prioritas" />
                  </div>
                </div>
              ) : null}

              {activeTab === "Perbandingan" ? (
                <div>
                  <h2 className="text-lg font-bold">Perbandingan MCU Lama vs Baru</h2>
                  <p className="mt-1 text-sm text-slate-500">Menampilkan peserta yang berubah dan detail semua parameter yang berubah.</p>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
                    <div>
                      <h3 className="mb-2 font-bold">Ringkasan per Peserta</h3>
                      <DataTable rows={comparisonRows} preferred={["Nama", "MCU_ID", "changedCount", "significantCount"]} title="Summary" />
                    </div>
                    <div>
                      <h3 className="mb-2 font-bold">Detail Parameter Berubah</h3>
                      <DataTable rows={changedRows} preferred={["Nama", "MCU_ID", "Parameter", "NilaiLama", "NilaiBaru", "Delta", "PercentDelta", "Signifikan", "Status"]} title="Changed" />
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === "Interpretasi Penyakit" ? (
                <div>
                  <h2 className="text-lg font-bold">Interpretasi Penyakit</h2>
                  <p className="mt-1 text-sm text-slate-500">Tabel ini menampilkan semua kondisi dari engine: terdeteksi, tidak terdeteksi, atau data tidak ada.</p>
                  <div className="mt-4">
                    <DataTable rows={diseaseRows} preferred={["Nama", "MCU_ID", "Condition", "condition", "Status", "status", "Severity", "severity", "Score", "score", "Evidence", "evidence", "NextStep", "next_step"]} title="Interpretasi Penyakit" />
                  </div>
                </div>
              ) : null}

              {activeTab === "Download" ? (
                <div>
                  <h2 className="text-lg font-bold">Download Hasil Analisis</h2>
                  <p className="mt-1 text-sm text-slate-500">Download CSV per tabel atau JSON lengkap untuk audit/debug.</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    <button onClick={() => downloadCsv("rekap_mcu_baru.csv", currentRows)} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:bg-slate-50">Download Rekap CSV</button>
                    <button onClick={() => downloadCsv("perubahan_parameter.csv", changedRows)} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:bg-slate-50">Download Perubahan CSV</button>
                    <button onClick={() => downloadCsv("interpretasi_penyakit.csv", diseaseRows)} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:bg-slate-50">Download Penyakit CSV</button>
                    <button onClick={() => downloadCsv("abnormal.csv", abnormalRows)} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:bg-slate-50">Download Abnormal CSV</button>
                    <button onClick={() => downloadCsv("prioritas.csv", priorityRows)} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:bg-slate-50">Download Prioritas CSV</button>
                    <button onClick={() => downloadJson("hasil_analisis_mcu.json", result)} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">Download JSON Lengkap</button>
                  </div>
                </div>
              ) : null}
            </section>
          </>
        ) : (
          <div className="mt-5 rounded-xl border bg-slate-50 p-4 text-sm text-slate-500">
            Pilih database lalu klik <b>Run Analisis</b>.
          </div>
        )}
      </div>
    </main>
  );
}
