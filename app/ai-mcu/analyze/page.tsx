"use client";

import { useEffect, useState } from "react";

type SourceItem = {
  id: number;
  name: string;
  institution_name?: string | null;
  program_type?: string | null;
};

type Participant = {
  id: number;
  name: string;
  mcu_id?: string | null;
  external_id?: string | null;
  nik?: string | null;
  barcode_value?: string | null;
  source_name?: string | null;
  institution_name?: string | null;
  company_name?: string | null;
  package_name?: string | null;
};

type AnalysisItem = {
  participantId?: string;
  name: string;
  conditions?: any[];
  detectedConditions?: any[];
  abnormalValues?: any[];
  comparison?: any[];
  conclusion?: string;
  suggestion?: string;
  fitStatus?: string;
};

const PROGRAM_OPTIONS = [
  { value: "all", label: "Semua Program" },
  { value: "capaska", label: "CAPASKA" },
  { value: "corporate", label: "Corporate" },
];

export default function AiMcuAnalyzePage() {
  const [programType, setProgramType] = useState("all");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const allLoadedSelected =
    participants.length > 0 && participants.every((p) => selectedIds.has(p.id));

  const selectedCount = selectedIds.size;

  async function loadSources(nextProgram = programType) {
    setLoadingSources(true);
    setError("");
    setSources([]);
    setSourceId("");
    setParticipants([]);
    setSelectedIds(new Set());
    setResult(null);

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

      if (list[0]?.id) {
        setSourceId(String(list[0].id));
      }
    } catch (err: any) {
      setError(err?.message || "Gagal mengambil database.");
    } finally {
      setLoadingSources(false);
    }
  }

  async function loadParticipants(nextSourceId = sourceId, nextProgram = programType) {
    if (!nextSourceId) return;

    setLoadingParticipants(true);
    setError("");
    setResult(null);
    setParticipants([]);
    setSelectedIds(new Set());

    try {
      const params = new URLSearchParams();
      params.set("source_id", nextSourceId);
      params.set("program", nextProgram);
      params.set("limit", "1000");
      if (keyword.trim()) params.set("keyword", keyword.trim());

      const res = await fetch(`/api/ai-mcu/participants?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message || "Gagal mengambil peserta.");
        return;
      }

      setParticipants(json.participants || []);
    } catch (err: any) {
      setError(err?.message || "Gagal mengambil peserta.");
    } finally {
      setLoadingParticipants(false);
    }
  }

  useEffect(() => {
    loadSources(programType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programType]);

  useEffect(() => {
    if (sourceId) loadParticipants(sourceId, programType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  function toggleParticipant(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllLoaded() {
    setSelectedIds(new Set(participants.map((p) => p.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function analyzeMcu() {
    setError("");
    setResult(null);

    const ids = Array.from(selectedIds);
    if (!ids.length) {
      setError("Pilih minimal 1 peserta untuk analisis.");
      return;
    }

    setAnalyzing(true);

    try {
      const res = await fetch("/api/ai-mcu/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          programType,
          sourceId,
          participantIds: ids,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message || "Analisis MCU gagal.");
        return;
      }

      setResult(json);
    } catch (err: any) {
      setError(err?.message || "Analisis MCU gagal.");
    } finally {
      setAnalyzing(false);
    }
  }

  const analyses: AnalysisItem[] = result?.analyses || [];

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Analisis MCU AI</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Pilih jenis program, pilih database MCU, retrieve peserta, lalu jalankan
              analisis abnormal, interpretasi penyakit, kesimpulan, saran, dan status FIT.
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
              href="/ai-mcu/generate"
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100"
            >
              Generate PDF
            </a>
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_1fr]">
          <section className="space-y-5">
            <div className="rounded-2xl border bg-slate-50 p-5">
              <h2 className="text-lg font-bold">1. Pilih Program & Database MCU</h2>

              <div className="mt-4 grid gap-3 md:grid-cols-[0.55fr_1fr_auto]">
                <select
                  value={programType}
                  onChange={(e) => setProgramType(e.target.value)}
                  disabled={loadingSources || analyzing}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
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
                  disabled={loadingSources || analyzing}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                >
                  <option value="">
                    {loadingSources ? "Mengambil database..." : "Pilih database/source"}
                  </option>
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                      {source.institution_name ? ` · ${source.institution_name}` : ""}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => loadParticipants()}
                  disabled={!sourceId || loadingParticipants || analyzing}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Retrieve Data
                </button>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") loadParticipants();
                  }}
                  placeholder="Cari nama / NIK / No MCU / barcode..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                />

                <button
                  type="button"
                  onClick={() => loadParticipants()}
                  disabled={!sourceId || loadingParticipants || analyzing}
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {loadingParticipants ? "Loading..." : "Search"}
                </button>
              </div>

              <div className="mt-3 rounded-xl border bg-white p-3 text-xs text-slate-500">
                Database yang tampil mengikuti pilihan program:{" "}
                <b>{PROGRAM_OPTIONS.find((x) => x.value === programType)?.label}</b>.
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-bold">2. Pilih Peserta</h2>
                  <div className="mt-1 text-sm text-slate-500">
                    Loaded: <b>{participants.length}</b> · Selected: <b>{selectedCount}</b>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={selectAllLoaded}
                    disabled={!participants.length || analyzing}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Select All Loaded
                  </button>

                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={!selectedCount || analyzing}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border">
                <div className="grid grid-cols-[48px_1.3fr_0.9fr_0.9fr] bg-slate-100 px-3 py-3 text-xs font-black uppercase text-slate-600">
                  <div>
                    <input
                      type="checkbox"
                      checked={allLoadedSelected}
                      onChange={(e) => e.target.checked ? selectAllLoaded() : clearSelection()}
                      disabled={!participants.length || analyzing}
                    />
                  </div>
                  <div>Nama</div>
                  <div>No MCU</div>
                  <div>NIK / ID</div>
                </div>

                <div className="max-h-[520px] divide-y overflow-auto bg-white">
                  {participants.length ? (
                    participants.map((p) => (
                      <label
                        key={p.id}
                        className="grid cursor-pointer grid-cols-[48px_1.3fr_0.9fr_0.9fr] items-center px-3 py-3 text-sm hover:bg-slate-50"
                      >
                        <div>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
                            disabled={analyzing}
                            onChange={() => toggleParticipant(p.id)}
                          />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">{p.name || "-"}</div>
                          <div className="text-xs text-slate-500">
                            {p.company_name || p.institution_name || p.source_name || "-"}
                          </div>
                        </div>
                        <div className="text-slate-700">{p.mcu_id || p.barcode_value || "-"}</div>
                        <div className="text-slate-700">{p.nik || p.external_id || "-"}</div>
                      </label>
                    ))
                  ) : (
                    <div className="p-5 text-sm text-slate-500">
                      Belum ada peserta. Pilih program dan database lalu klik Retrieve Data.
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={analyzeMcu}
                disabled={analyzing || !selectedCount}
                className="mt-5 w-full rounded-xl bg-purple-600 px-5 py-3 text-sm font-bold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {analyzing ? "Menganalisis..." : `Analisis MCU (${selectedCount} peserta)`}
              </button>

              {error ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  {error}
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-bold">Hasil Analisis</h2>

            {result ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="font-bold">{result.message}</div>
                <div className="mt-1">
                  Engine: <b>{result.engineMode}</b>
                </div>
                <div>
                  Peserta dianalisis: <b>{result.total}</b> · Kondisi terdeteksi:{" "}
                  <b>{result.detectedCount}</b> · Nilai abnormal: <b>{result.abnormalCount}</b>
                </div>
                <div>
                  Baris hasil medis ditemukan di database: <b>{result.medicalRowsFound ?? 0}</b>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">
                Belum ada hasil analisis.
              </div>
            )}

            <div className="mt-5 space-y-5">
              {analyses.map((item, index) => (
                <div key={`${item.participantId || item.name}-${index}`} className="rounded-2xl border">
                  <div className="border-b bg-slate-50 px-4 py-3">
                    <div className="font-black text-slate-900">{item.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Status: <b>{item.fitStatus || "-"}</b> · ID: {item.participantId || "-"}
                    </div>
                  </div>

                  <div className="space-y-4 p-4">
                    <div>
                      <div className="text-sm font-bold text-slate-900">Kesimpulan</div>
                      <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                        {item.conclusion || "-"}
                      </pre>
                    </div>

                    <div>
                      <div className="text-sm font-bold text-slate-900">Saran</div>
                      <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                        {item.suggestion || "-"}
                      </pre>
                    </div>

                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        Kondisi Terdeteksi ({item.detectedConditions?.length || 0})
                      </div>
                      <div className="mt-2 overflow-hidden rounded-xl border">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                            <tr>
                              <th className="p-2 text-left">Condition</th>
                              <th className="p-2 text-left">Severity</th>
                              <th className="p-2 text-left">Evidence</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {item.detectedConditions?.length ? (
                              item.detectedConditions.map((c: any, i: number) => (
                                <tr key={i}>
                                  <td className="p-2 font-semibold">{c.condition}</td>
                                  <td className="p-2">{c.severity}</td>
                                  <td className="p-2">{c.evidence}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={3} className="p-3 text-slate-500">
                                  Tidak ada kondisi terdeteksi.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        Data Abnormal ({item.abnormalValues?.length || 0})
                      </div>
                      <div className="mt-2 overflow-hidden rounded-xl border">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                            <tr>
                              <th className="p-2 text-left">Parameter</th>
                              <th className="p-2 text-left">Hasil</th>
                              <th className="p-2 text-left">Normal</th>
                              <th className="p-2 text-left">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {item.abnormalValues?.length ? (
                              item.abnormalValues.map((a: any, i: number) => (
                                <tr key={i}>
                                  <td className="p-2 font-semibold">{a.parameter}</td>
                                  <td className="p-2">{a.value} {a.unit || ""}</td>
                                  <td className="p-2">{a.normal}</td>
                                  <td className="p-2">{a.status}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={4} className="p-3 text-slate-500">
                                  Tidak ada nilai abnormal dari parameter yang terbaca.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {item.comparison?.length ? (
                      <div>
                        <div className="text-sm font-bold text-slate-900">
                          Perbandingan Data Lama vs Baru
                        </div>
                        <div className="mt-2 overflow-hidden rounded-xl border">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                              <tr>
                                <th className="p-2 text-left">Parameter</th>
                                <th className="p-2 text-left">Lama</th>
                                <th className="p-2 text-left">Baru</th>
                                <th className="p-2 text-left">Delta</th>
                                <th className="p-2 text-left">Arah</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {item.comparison.map((c: any, i: number) => (
                                <tr key={i}>
                                  <td className="p-2 font-semibold">{c.parameter}</td>
                                  <td className="p-2">{c.old}</td>
                                  <td className="p-2">{c.new}</td>
                                  <td className="p-2">{c.delta}</td>
                                  <td className="p-2">{c.direction}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
