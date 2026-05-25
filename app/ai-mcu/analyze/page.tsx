"use client";

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
  "Rekap_Analisis",
  "Abnormal_Summary",
  "Perbandingan_All",
  "Perbandingan_Changed",
  "Perbandingan_Signif",
  "Interpretasi Penyakit",
  "Download",
];

const RULE_STATUS_OPTIONS = ["Terdeteksi", "Tidak terdeteksi", "Data tidak ada"];

function safeText(value: any) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function columns(rows: any[], preferred: string[] = []) {
  const set = new Set<string>();
  for (const key of preferred) set.add(key);

  for (const row of rows || []) {
    for (const key of Object.keys(row || {})) {
      if (key === "_raw" || key.startsWith("_AI_MCU")) continue;
      set.add(key);
    }
  }

  return Array.from(set).filter((key) => rows.some((row) => row?.[key] !== undefined));
}

function uniqueValues(rows: any[], key: string) {
  return Array.from(
    new Set(
      (rows || [])
        .map((row) => safeText(row?.[key]).trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function csvDownload(filename: string, rows: any[]) {
  const cols = columns(rows);
  const esc = (value: any) => `"${safeText(value).replace(/"/g, '""')}"`;
  const csv = [
    cols.map(esc).join(","),
    ...(rows || []).map((row) => cols.map((col) => esc(row?.[col])).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function jsonDownload(filename: string, payload: any) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DataTable({
  rows,
  preferred = [],
  title,
  wide = false,
}: {
  rows: any[];
  preferred?: string[];
  title?: string;
  wide?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(100);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows || [];
    return (rows || []).filter((row) => JSON.stringify(row || {}).toLowerCase().includes(q));
  }, [rows, query]);

  const visible = filtered.slice(0, limit);
  const cols = columns(visible.length ? visible : filtered, preferred);

  if (!rows?.length) {
    return <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-500">Belum ada data.</div>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-sm font-bold text-slate-700">
          {title || "Data"}: {filtered.length.toLocaleString("id-ID")} row · {cols.length.toLocaleString("id-ID")} kolom
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

      <div className={`overflow-auto rounded-2xl border ${wide ? "max-h-[680px]" : "max-h-[620px]"}`}>
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
            {visible.map((row, index) => (
              <tr key={index} className="hover:bg-slate-50">
                {cols.map((col) => {
                  const value = safeText(row?.[col]);
                  const isChanged = col.endsWith("Status") && ["Berubah", "Naik", "Turun"].includes(value);
                  const isSignif = col.endsWith("Signifikan") && value === "YES";
                  return (
                    <td
                      key={`${index}-${col}`}
                      className={`max-w-[360px] truncate whitespace-nowrap p-2 ${
                        isSignif
                          ? "bg-red-50 font-bold text-red-700"
                          : isChanged
                            ? "bg-amber-50 font-semibold text-amber-800"
                            : ""
                      }`}
                      title={value}
                    >
                      {value || "-"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > visible.length ? (
        <div className="mt-2 text-xs text-slate-500">
          Menampilkan {visible.length.toLocaleString("id-ID")} dari {filtered.length.toLocaleString("id-ID")} row.
        </div>
      ) : null}
    </div>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const allSelected = options.length > 0 && selected.length === options.length;

  function toggle(value: string) {
    if (selected.includes(value)) onChange(selected.filter((item) => item !== value));
    else onChange([...selected, value]);
  }

  function selectAll() {
    onChange(options);
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div>
      <div className="mb-2 text-sm text-slate-600">{label}</div>
      <details className="group relative">
        <summary className="min-h-[54px] list-none rounded-xl bg-slate-100 px-3 py-2 text-sm cursor-pointer">
          {selected.length ? (
            <div className="flex flex-wrap gap-2">
              {selected.slice(0, 3).map((item) => (
                <span key={item} className="rounded-lg bg-red-500 px-2 py-1 font-semibold text-white">
                  {item} ×
                </span>
              ))}
              {selected.length > 3 ? (
                <span className="rounded-lg bg-slate-300 px-2 py-1 font-semibold text-slate-700">
                  +{selected.length - 3}
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-slate-500">Choose options</span>
          )}
        </summary>

        <div className="absolute z-30 mt-2 max-h-80 w-full overflow-auto rounded-xl border bg-white p-2 shadow-xl">
          <button
            type="button"
            onClick={allSelected ? clearAll : selectAll}
            className="mb-2 w-full rounded-lg bg-slate-100 px-3 py-2 text-left text-sm font-semibold hover:bg-slate-200"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>

          {options.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => toggle(option)}
              />
              {option}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

function RuleBasedInterpretation({ rows }: { rows: any[] }) {
  const [nameQuery, setNameQuery] = useState("");
  const [conditionFilter, setConditionFilter] = useState<string[]>([]);
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>(RULE_STATUS_OPTIONS);
  const [page, setPage] = useState(1);

  const conditionOptions = useMemo(() => uniqueValues(rows, "Condition"), [rows]);
  const severityOptions = useMemo(() => uniqueValues(rows, "Severity"), [rows]);

  useEffect(() => {
    setConditionFilter([]);
    setSeverityFilter([]);
    setStatusFilter(RULE_STATUS_OPTIONS);
    setPage(1);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();

    return (rows || []).filter((row) => {
      const name = safeText(row.Nama).toLowerCase();
      const mcuId = safeText(row.MCU_ID).toLowerCase();
      const condition = safeText(row.Condition);
      const severity = safeText(row.Severity);
      const status = safeText(row.Status);

      if (q && !name.includes(q) && !mcuId.includes(q)) return false;
      if (conditionFilter.length && !conditionFilter.includes(condition)) return false;
      if (severityFilter.length && !severityFilter.includes(severity)) return false;
      if (statusFilter.length && !statusFilter.includes(status)) return false;

      return true;
    });
  }, [rows, nameQuery, conditionFilter, severityFilter, statusFilter]);

  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const totalParticipants = useMemo(() => {
    return new Set((rows || []).map((row) => row.MCU_ID || row.Nama).filter(Boolean)).size;
  }, [rows]);

  const totalDetected = useMemo(() => {
    return (rows || []).filter((row) => row.Status === "Terdeteksi").length;
  }, [rows]);

  return (
    <div>
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
        <span className="text-blue-600">⌘</span> Interpretasi Penyakit (Rule-based)
      </h2>

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <div className="text-sm text-slate-600">Total peserta</div>
          <div className="mt-2 text-4xl font-light text-slate-700">
            {totalParticipants.toLocaleString("id-ID")}
          </div>
        </div>

        <div>
          <div className="text-sm text-slate-600">Total temuan (terdeteksi)</div>
          <div className="mt-2 text-4xl font-light text-slate-700">
            {totalDetected.toLocaleString("id-ID")}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-5 xl:grid-cols-4">
        <div>
          <label className="mb-2 block text-sm text-slate-600">Cari Nama</label>
          <input
            value={nameQuery}
            onChange={(e) => {
              setNameQuery(e.target.value);
              setPage(1);
            }}
            placeholder="ketik sebagian nama..."
            className="h-[54px] w-full rounded-xl border-0 bg-slate-100 px-4 text-sm outline-none"
          />
        </div>

        <MultiSelect
          label="Filter Condition"
          options={conditionOptions}
          selected={conditionFilter}
          onChange={(values) => {
            setConditionFilter(values);
            setPage(1);
          }}
        />

        <MultiSelect
          label="Filter Severity"
          options={severityOptions}
          selected={severityFilter}
          onChange={(values) => {
            setSeverityFilter(values);
            setPage(1);
          }}
        />

        <MultiSelect
          label="Filter Status"
          options={RULE_STATUS_OPTIONS}
          selected={statusFilter}
          onChange={(values) => {
            setStatusFilter(values);
            setPage(1);
          }}
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
        <div>
          <label className="mb-2 block text-sm text-slate-600">Halaman</label>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={safePage}
            onChange={(e) => setPage(Number(e.target.value || 1))}
            className="h-[54px] w-full rounded-xl border-0 bg-slate-100 px-4 text-sm outline-none"
          />
        </div>

        <div className="flex items-end justify-end gap-2">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, safePage - 1))}
            className="h-[54px] rounded-xl bg-slate-100 px-5 text-xl font-bold text-slate-600"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => setPage(Math.min(totalPages, safePage + 1))}
            className="h-[54px] rounded-xl bg-slate-100 px-5 text-xl font-bold text-slate-600"
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-5 overflow-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="w-16 p-3 text-right font-normal"> </th>
              <th className="p-3 text-left font-normal">Nama</th>
              <th className="p-3 text-left font-normal">MCU_ID</th>
              <th className="p-3 text-left font-normal">Condition</th>
              <th className="p-3 text-left font-normal">Status</th>
              <th className="p-3 text-left font-normal">Severity</th>
              <th className="p-3 text-right font-normal">Score</th>
              <th className="p-3 text-left font-normal">Evidence</th>
              <th className="p-3 text-left font-normal">NextStep</th>
            </tr>
          </thead>
          <tbody className="divide-y bg-white">
            {visible.length ? (
              visible.map((row, index) => (
                <tr key={`${safePage}-${index}`} className="hover:bg-slate-50">
                  <td className="p-3 text-right text-slate-400">{(safePage - 1) * pageSize + index}</td>
                  <td className="whitespace-nowrap p-3">{row.Nama || "-"}</td>
                  <td className="whitespace-nowrap p-3">{row.MCU_ID || "-"}</td>
                  <td className="whitespace-nowrap p-3">{row.Condition || "-"}</td>
                  <td className="whitespace-nowrap p-3">{row.Status || "-"}</td>
                  <td className="whitespace-nowrap p-3">{row.Severity || "-"}</td>
                  <td className="whitespace-nowrap p-3 text-right">{row.Score || "-"}</td>
                  <td className="min-w-[220px] p-3">{row.Evidence || "-"}</td>
                  <td className="min-w-[360px] p-3">{row.NextStep || "-"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="p-6 text-center text-slate-500">
                  Belum ada data interpretasi rule-based. Pastikan Python engine /analyze-mcu mengembalikan kondisi rule-based.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-col gap-2 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
        <div>
          Menampilkan {visible.length.toLocaleString("id-ID")} dari {filtered.length.toLocaleString("id-ID")} baris.
        </div>
        <button
          type="button"
          onClick={() => csvDownload("Interpretasi_Penyakit_Rule_Based.csv", filtered)}
          className="rounded-lg border px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Download hasil filter
        </button>
      </div>
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
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceId: Number(sourceId),
          thresholdPct,
        }),
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
  const rekap = result?.Rekap_Analisis || [];
  const abnormal = result?.Abnormal_Summary || [];
  const all = result?.Perbandingan_All || [];
  const changed = result?.Perbandingan_Changed || [];
  const signif = result?.Perbandingan_Signif || [];
  const changedLong = result?.Perbandingan_Long || [];
  const diseases = result?.Interpretasi_Penyakit || [];
  const selectedSource = sources.find((source) => String(source.id) === sourceId);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">AI MCU Analyzer</h1>
            <p className="mt-2 max-w-4xl text-sm text-slate-600">
              Tampilan mengikuti format workbook Perbandingan dan interpretasi penyakit rule-based dari Python engine.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/ai-mcu"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              ☰ Menu AI MCU
            </a>
            <a
              href="/ai-mcu/upload"
              className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
            >
              Upload MCU
            </a>
            <a
              href="/ai-mcu/generate"
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
            >
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
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              disabled={loadingSources || loading}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            >
              <option value="">
                {loadingSources ? "Mengambil database..." : "Pilih database/source"}
              </option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                  {source.institution_name ? ` · ${source.institution_name}` : ""}
                  {source.program_type ? ` · ${source.program_type}` : ""}
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
            Database aktif: <b>{selectedSource?.name || "-"}</b>.
            Threshold signifikan: <b>{thresholdPct}%</b>.
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

                  <div className="mt-4 grid gap-3 md:grid-cols-5">
                    <div className="rounded-xl border bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">Rekap_Analisis</div>
                      <div className="mt-1 text-2xl font-black">{Number(summary.totalCurrent || 0).toLocaleString("id-ID")}</div>
                    </div>
                    <div className="rounded-xl border bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">MCU Lama</div>
                      <div className="mt-1 text-2xl font-black">{Number(summary.totalPrevious || 0).toLocaleString("id-ID")}</div>
                    </div>
                    <div className="rounded-xl border bg-slate-50 p-4">
                      <div className="text-xs text-slate-500">Parameter</div>
                      <div className="mt-1 text-2xl font-black">{Number(summary.parameterCount || 0).toLocaleString("id-ID")}</div>
                    </div>
                    <div className="rounded-xl border bg-amber-50 p-4">
                      <div className="text-xs text-amber-700">Changed</div>
                      <div className="mt-1 text-2xl font-black text-amber-800">{Number(summary.comparisonChanged || 0).toLocaleString("id-ID")}</div>
                    </div>
                    <div className="rounded-xl border bg-red-50 p-4">
                      <div className="text-xs text-red-700">Rule terdeteksi</div>
                      <div className="mt-1 text-2xl font-black text-red-700">{Number(summary.diseaseDetected || 0).toLocaleString("id-ID")}</div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <div className="rounded-2xl border bg-slate-50 p-4">
                      <h3 className="font-bold">Perubahan Parameter</h3>
                      <div className="mt-3">
                        <DataTable rows={changedLong.slice(0, 50)} preferred={["Nama", "MCU_ID", "Parameter", "Nilai Lalu", "Nilai Ini", "Δ", "%Δ", "Status", "Signifikan"]} />
                      </div>
                    </div>

                    <div className="rounded-2xl border bg-slate-50 p-4">
                      <h3 className="font-bold">Interpretasi Penyakit Ringkas</h3>
                      <div className="mt-3">
                        <DataTable rows={diseases.slice(0, 50)} preferred={["Nama", "MCU_ID", "Condition", "Status", "Severity", "Score", "Evidence", "NextStep"]} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === "Rekap_Analisis" ? (
                <div>
                  <h2 className="text-lg font-bold">Rekap_Analisis</h2>
                  <div className="mt-4">
                    <DataTable rows={rekap} preferred={["MCU_ID", "Nama", "NOMCU", "NAMA", "JK", "TGLLAHIR", "USIA", "DEPT", "PAKET", "KATEGORI", "KESIMPULAN", "SARAN"]} wide />
                  </div>
                </div>
              ) : null}

              {activeTab === "Abnormal_Summary" ? (
                <div>
                  <h2 className="text-lg font-bold">Abnormal_Summary</h2>
                  <div className="mt-4">
                    <DataTable rows={abnormal} preferred={["Nama", "MCU_ID", "Sheet", "Pemeriksaan", "Hasil", "Normal Range", "Interpretasi"]} />
                  </div>
                </div>
              ) : null}

              {activeTab === "Perbandingan_All" ? (
                <div>
                  <h2 className="text-lg font-bold">Perbandingan_All</h2>
                  <div className="mt-4">
                    <DataTable rows={all} preferred={["Nama", "MCU_ID"]} wide />
                  </div>
                </div>
              ) : null}

              {activeTab === "Perbandingan_Changed" ? (
                <div>
                  <h2 className="text-lg font-bold">Perbandingan_Changed</h2>
                  <div className="mt-4">
                    <DataTable rows={changed} preferred={["Nama", "MCU_ID"]} wide />
                  </div>
                </div>
              ) : null}

              {activeTab === "Perbandingan_Signif" ? (
                <div>
                  <h2 className="text-lg font-bold">Perbandingan_Signif</h2>
                  <div className="mt-4">
                    <DataTable rows={signif} preferred={["Nama", "MCU_ID"]} wide />
                  </div>
                </div>
              ) : null}

              {activeTab === "Interpretasi Penyakit" ? (
                <RuleBasedInterpretation rows={diseases} />
              ) : null}

              {activeTab === "Download" ? (
                <div>
                  <h2 className="text-lg font-bold">Download</h2>
                  <p className="mt-1 text-sm text-slate-500">Download hasil seperti sheet workbook.</p>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    <button onClick={() => csvDownload("Rekap_Analisis.csv", rekap)} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:bg-slate-50">Download Rekap_Analisis</button>
                    <button onClick={() => csvDownload("Abnormal_Summary.csv", abnormal)} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:bg-slate-50">Download Abnormal_Summary</button>
                    <button onClick={() => csvDownload("Perbandingan_All.csv", all)} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:bg-slate-50">Download Perbandingan_All</button>
                    <button onClick={() => csvDownload("Perbandingan_Changed.csv", changed)} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:bg-slate-50">Download Perbandingan_Changed</button>
                    <button onClick={() => csvDownload("Perbandingan_Signif.csv", signif)} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:bg-slate-50">Download Perbandingan_Signif</button>
                    <button onClick={() => csvDownload("Interpretasi_Penyakit.csv", diseases)} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:bg-slate-50">Download Interpretasi Penyakit</button>
                    <button onClick={() => jsonDownload("ai_mcu_analyzer_result.json", result)} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">Download JSON Lengkap</button>
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
