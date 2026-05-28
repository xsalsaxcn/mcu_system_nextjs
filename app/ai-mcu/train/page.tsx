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

const TARGET_OPTIONS = [
  {
    value: "FIT_STATUS_AUTO",
    label: "FIT_STATUS_AUTO - rekomendasi",
    model: "fit_status_auto",
    desc: "Menormalkan narasi KESIMPULAN/SARAN menjadi FIT, FIT WITH NOTE, atau UNFIT.",
  },
  {
    value: "SEVERITY_AUTO",
    label: "SEVERITY_AUTO",
    model: "severity_auto",
    desc: "Menormalkan temuan menjadi NORMAL, RINGAN, SEDANG, atau BERAT.",
  },
  {
    value: "CONDITION_LABELS_AUTO",
    label: "CONDITION_LABELS_AUTO",
    model: "condition_labels_auto",
    desc: "Membuat label kondisi standar seperti HIPERTENSI, DISLIPIDEMIA, ANEMIA, dan lain-lain.",
  },
  {
    value: "KATEGORI",
    label: "KATEGORI raw - tidak disarankan",
    model: "kategori_raw",
    desc: "Hanya dipakai jika kolom KATEGORI memang berisi FIT / FIT WITH NOTE / UNFIT.",
  },
];

function percent(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${Math.round(number * 100)}%`;
}

function labelQuality(labelCounts: Record<string, number>) {
  const labels = Object.keys(labelCounts || {});
  const total = Object.values(labelCounts || {}).reduce((a, b) => a + Number(b || 0), 0);
  const singleton = Object.values(labelCounts || {}).filter((v) => Number(v) <= 1).length;

  if (!labels.length) return "Belum ada label.";
  if (labels.length > 20 || singleton > labels.length * 0.4) {
    return `Label terlalu banyak/acak: ${labels.length} label untuk ${total} row. Gunakan FIT_STATUS_AUTO atau SEVERITY_AUTO.`;
  }

  return `Label terlihat cukup standar: ${labels.length} kelas untuk ${total} row.`;
}

export default function AiMcuTrainPage() {
  const [programType, setProgramType] = useState("all");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [sourceId, setSourceId] = useState("");

  const [targetKey, setTargetKey] = useState("FIT_STATUS_AUTO");
  const [modelName, setModelName] = useState("fit_status_auto");
  const [minRows, setMinRows] = useState(20);

  const [loadingSources, setLoadingSources] = useState(false);
  const [training, setTraining] = useState(false);
  const [predicting, setPredicting] = useState(false);

  const [message, setMessage] = useState("Pilih database lalu klik Latih Model.");
  const [error, setError] = useState("");
  const [trainResult, setTrainResult] = useState<any>(null);
  const [predictions, setPredictions] = useState<any[]>([]);

  const selectedSource = sources.find((item) => String(item.id) === String(sourceId));
  const selectedTarget = TARGET_OPTIONS.find((item) => item.value === targetKey) || TARGET_OPTIONS[0];

  async function loadSources(nextProgram = programType) {
    setLoadingSources(true);
    setError("");
    setSources([]);
    setSourceId("");

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
      if (list[0]?.id) setSourceId(String(list[0].id));
    } catch (err: any) {
      setError(err?.message || "Gagal mengambil database.");
    } finally {
      setLoadingSources(false);
    }
  }

  async function trainModel() {
    if (!sourceId) {
      setError("Pilih database terlebih dahulu.");
      return;
    }

    setTraining(true);
    setError("");
    setMessage("Training model scikit-learn sedang berjalan dengan label normalisasi...");
    setTrainResult(null);

    try {
      const res = await fetch("/api/ai-mcu/ml/train", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceId: Number(sourceId),
          targetKey,
          modelName,
          minRows,
        }),
      });

      const json = await res.json();
      setTrainResult(json);

      if (!res.ok || !json.ok) {
        setError(json.message || "Training gagal.");
        setMessage("Training gagal.");
        return;
      }

      setMessage(json.message || "Training berhasil.");
    } catch (err: any) {
      setError(err?.message || "Training gagal.");
      setMessage("Training gagal.");
    } finally {
      setTraining(false);
    }
  }

  async function predictModel() {
    if (!sourceId) {
      setError("Pilih database terlebih dahulu.");
      return;
    }

    setPredicting(true);
    setError("");
    setMessage("Predict model sedang berjalan...");
    setPredictions([]);

    try {
      const res = await fetch("/api/ai-mcu/ml/predict", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceId: Number(sourceId),
          modelName,
          limit: 500,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message || "Predict gagal.");
        setMessage("Predict gagal.");
        return;
      }

      setPredictions(json.predictions || []);
      setMessage(`Predict selesai. ${json.predictions?.length || 0} row.`);
    } catch (err: any) {
      setError(err?.message || "Predict gagal.");
      setMessage("Predict gagal.");
    } finally {
      setPredicting(false);
    }
  }

  useEffect(() => {
    loadSources(programType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programType]);

  const labelCounts = trainResult?.engine?.labelCounts || {};
  const labelQualityMessage = labelQuality(labelCounts);
  const topPredictions = useMemo(() => predictions.slice(0, 100), [predictions]);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Latih AI MCU</h1>
            <p className="mt-2 max-w-4xl text-sm text-slate-600">
              Phase 2 memakai label normalisasi. Narasi kesimpulan MCU tidak langsung dijadikan label panjang, tetapi diubah dulu menjadi label standar.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a href="/ai-mcu" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              ☰ Menu AI MCU
            </a>
            <a href="/ai-mcu/analyze" className="rounded-xl border border-purple-300 bg-purple-50 px-4 py-2 text-sm font-bold text-purple-700 hover:bg-purple-100">
              Analisis MCU
            </a>
          </div>
        </div>

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <h2 className="text-lg font-bold">1. Data Training</h2>

          <div className="mt-4 grid gap-3 xl:grid-cols-[0.45fr_1fr_0.55fr_0.45fr_0.25fr]">
            <select
              value={programType}
              onChange={(event) => setProgramType(event.target.value)}
              disabled={loadingSources || training || predicting}
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
              disabled={loadingSources || training || predicting}
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

            <select
              value={targetKey}
              onChange={(event) => {
                const target = TARGET_OPTIONS.find((item) => item.value === event.target.value);
                setTargetKey(event.target.value);
                if (target) setModelName(target.model);
              }}
              disabled={training || predicting}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            >
              {TARGET_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <input
              value={modelName}
              onChange={(event) => setModelName(event.target.value)}
              disabled={training || predicting}
              placeholder="fit_status_auto"
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            />

            <input
              type="number"
              value={minRows}
              onChange={(event) => setMinRows(Number(event.target.value || 20))}
              disabled={training || predicting}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              min={5}
            />
          </div>

          <div className="mt-3 rounded-xl border bg-white p-3 text-sm text-slate-600">
            Database aktif: <b>{selectedSource?.name || "-"}</b>. Target label: <b>{targetKey}</b>. Model: <b>{modelName}</b>.
            <div className="mt-1 text-xs text-slate-500">{selectedTarget.desc}</div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={trainModel}
              disabled={!sourceId || training || predicting}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {training ? "Training..." : "Latih Model"}
            </button>

            <button
              type="button"
              onClick={predictModel}
              disabled={!sourceId || training || predicting}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
            >
              {predicting ? "Predicting..." : "Test Predict"}
            </button>
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

        {trainResult?.ok ? (
          <section className="mt-5 rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-bold">Hasil Training</h2>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-sm text-slate-500">Accuracy</div>
                <div className="mt-1 text-2xl font-bold">{percent(trainResult.engine?.metrics?.accuracy)}</div>
              </div>
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-sm text-slate-500">Train rows</div>
                <div className="mt-1 text-2xl font-bold">{trainResult.engine?.metrics?.trainRows ?? "-"}</div>
              </div>
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-sm text-slate-500">Test rows</div>
                <div className="mt-1 text-2xl font-bold">{trainResult.engine?.metrics?.testRows ?? "-"}</div>
              </div>
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="text-sm text-slate-500">Labeled rows</div>
                <div className="mt-1 text-2xl font-bold">{trainResult.labeledRows ?? "-"}</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border bg-blue-50 p-4 text-sm font-semibold text-blue-900">
              {labelQualityMessage}
            </div>

            <div className="mt-4 rounded-xl border bg-slate-50 p-4">
              <h3 className="font-bold">Distribusi Label</h3>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                {Object.entries(labelCounts).map(([label, count]) => (
                  <div key={label} className="rounded-lg border bg-white p-3 text-sm">
                    <b>{label}</b>: {String(count)}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {topPredictions.length ? (
          <section className="mt-5 rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-bold">Hasil Test Predict</h2>

            <div className="mt-4 max-h-[520px] overflow-auto rounded-2xl border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="p-3 text-left">Nama</th>
                    <th className="p-3 text-left">MCU ID</th>
                    <th className="p-3 text-left">Prediction</th>
                    <th className="p-3 text-left">Confidence</th>
                    <th className="p-3 text-left">Auto Fit</th>
                    <th className="p-3 text-left">Auto Severity</th>
                    <th className="p-3 text-left">Auto Conditions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {topPredictions.map((row, index) => (
                    <tr key={index}>
                      <td className="p-3">{row.NAMA || "-"}</td>
                      <td className="p-3">{row.MCU_ID || "-"}</td>
                      <td className="p-3 font-bold">{row.prediction || "-"}</td>
                      <td className="p-3">{row.confidence == null ? "-" : percent(row.confidence)}</td>
                      <td className="p-3">{row.autoFitStatus || "-"}</td>
                      <td className="p-3">{row.autoSeverity || "-"}</td>
                      <td className="max-w-[360px] truncate p-3" title={row.autoConditionLabels || ""}>{row.autoConditionLabels || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {trainResult ? (
          <details className="mt-5 rounded-2xl border bg-slate-50">
            <summary className="cursor-pointer px-4 py-3 text-sm font-black text-slate-800">
              Debug Training Response
            </summary>
            <pre className="max-h-[380px] overflow-auto border-t bg-white p-4 text-xs">
              {JSON.stringify(trainResult, null, 2)}
            </pre>
          </details>
        ) : null}
      </div>
    </main>
  );
}
