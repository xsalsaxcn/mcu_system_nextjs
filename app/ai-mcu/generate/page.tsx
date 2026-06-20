"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type GeneratedFile = {
  name: string;
  url: string;
  size?: number;
};

type GenerateResult = {
  ok: boolean;
  status?: "queued" | "running" | "done" | "error" | "not_found";
  message?: string;
  jobId?: string;
  progress?: number;
  current?: number;
  total?: number;
  currentName?: string;
  engineMode?: string;
  count?: number;
  fileName?: string;
  pdfUrl?: string;
  mergedPdfUrl?: string;
  pdfFiles?: GeneratedFile[];
  mergedFiles?: GeneratedFile[];
  zipFile?: GeneratedFile | null;
  errors?: { name: string; message: string }[];
};

type StoredJob = {
  jobId: string;
  startedAt: string;
  selectedCount?: number;
  sourceId?: string;
  sourceName?: string;
  programType?: string;
};

const ACTIVE_JOB_KEY = "ai_mcu_pdf_active_job_v1";

const PROGRAM_OPTIONS = [
  { value: "all", label: "Semua Program" },
  { value: "capaska", label: "CAPASKA" },
  { value: "corporate", label: "Corporate" },
];

const menuItems = [
  ["Dashboard", "/dashboard"],
  ["AI MCU Analyzer", "/ai-mcu"],
  ["Corporate MCU AI", "/ai-mcu/corporate"],
  ["Analisis MCU", "/ai-mcu/analyze"],
  ["Preview Data", "/ai-mcu/preview"],
  ["Edit Data", "/ai-mcu/edit"],
  ["Generate PDF", "/ai-mcu/generate"],
  ["Google Drive", "/ai-mcu/drive"],
  ["Riwayat", "/ai-mcu/history"],
];

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readStoredJob(): StoredJob | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_JOB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.jobId) return null;
    return parsed as StoredJob;
  } catch {
    return null;
  }
}

function saveStoredJob(job: StoredJob) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(job));
}

function clearStoredJob() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVE_JOB_KEY);
}

export default function AiMcuGeneratePage() {
  // CAPASKA_GENERATE_PDF_MENU_V332_QUERY_DEFAULT
  const [programType, setProgramType] = useState(() => {
    if (typeof window === "undefined") return "all";
    const queryProgram = new URLSearchParams(window.location.search).get("program");
    return queryProgram === "capaska" || queryProgram === "corporate" || queryProgram === "all" ? queryProgram : "all";
  });
  const [mode, setMode] = useState("single");
  const [uploadDrive, setUploadDrive] = useState(false);
  const [mergePdf, setMergePdf] = useState(false);

  const [sources, setSources] = useState<SourceItem[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [backgroundNotice, setBackgroundNotice] = useState("");

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedSource = useMemo(
    () => sources.find((source) => String(source.id) === sourceId),
    [sources, sourceId]
  );

  // CAPASKA_GENERATE_PDF_SINGLE_FAST_V335
  const canMergePdfV335 = selectedIds.size > 1;

  useEffect(() => {
    if (selectedIds.size <= 1 && mergePdf) {
      setMergePdf(false);
    }
  }, [selectedIds.size, mergePdf]);

  const allLoadedSelected =
    participants.length > 0 && participants.every((p) => selectedIds.has(p.id));

  function clearPollTimer() {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  async function loadSources(nextProgram = programType) {
    setLoadingSources(true);
    setError("");
    setSources([]);
    setSourceId("");
    setParticipants([]);
    setSelectedIds(new Set());

    try {
      const params = new URLSearchParams();
      params.set("program", nextProgram);

      const res = await fetch(`/api/sources?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message || "Gagal mengambil daftar database.");
        return;
      }

      const list = json.sources || [];
      setSources(list);

      if (list[0]?.id) {
        setSourceId(String(list[0].id));
      }
    } catch (err: any) {
      setError(err?.message || "Gagal mengambil daftar database.");
    } finally {
      setLoadingSources(false);
    }
  }

  async function loadParticipants(nextSourceId = sourceId, nextProgram = programType) {
    if (!nextSourceId) {
      setParticipants([]);
      setSelectedIds(new Set());
      return;
    }

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
        setError(json.message || "Gagal mengambil data peserta.");
        return;
      }

      setParticipants(json.participants || []);
    } catch (err: any) {
      setError(err?.message || "Gagal mengambil data peserta.");
    } finally {
      setLoadingParticipants(false);
    }
  }

  async function pollJob(jobId: string, options?: { silent?: boolean }) {
    try {
      const res = await fetch(`/api/ai-mcu/generate-pdf/status/${encodeURIComponent(jobId)}`, {
        method: "GET",
        cache: "no-store",
      });

      const json: GenerateResult = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message || "Gagal membaca status job PDF.");
        setPolling(false);
        setLoading(false);
        clearPollTimer();
        return;
      }

      setResult(json);

      if (json.status === "done") {
        setPolling(false);
        setLoading(false);
        setBackgroundNotice("");
        clearPollTimer();
        clearStoredJob();
        return;
      }

      if (json.status === "error") {
        setError(json.message || "Generate PDF gagal di engine.");
        setPolling(false);
        setLoading(false);
        clearPollTimer();
        clearStoredJob();
        return;
      }

      if (!options?.silent) {
        setPolling(true);
        setLoading(true);
      }

      pollTimerRef.current = setTimeout(() => pollJob(jobId), 3000);
    } catch (err: any) {
      setError(err?.message || "Gagal membaca status job PDF.");
      setPolling(false);
      setLoading(false);
      clearPollTimer();
    }
  }

  function resumeStoredJob() {
    const stored = readStoredJob();
    if (!stored?.jobId) return;

    setResult({
      ok: true,
      status: "running",
      jobId: stored.jobId,
      message: "Melanjutkan pemantauan job PDF yang sedang berjalan...",
      progress: 0,
      current: 0,
      total: stored.selectedCount || 0,
      engineMode: "python-engine-async",
    });

    setBackgroundNotice(
      `Ada job PDF yang masih berjalan di background sejak ${new Date(stored.startedAt).toLocaleString("id-ID")}.`
    );

    setPolling(true);
    setLoading(true);
    pollJob(stored.jobId);
  }

  useEffect(() => {
    loadSources(programType);
    resumeStoredJob();
    return () => clearPollTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function sendToBackground() {
    clearPollTimer();
    setPolling(false);
    setLoading(false);
    setBackgroundNotice(
      "Job PDF tetap berjalan di engine. Kamu bisa pindah menu lain. Saat kembali ke halaman ini, status job akan dicek ulang otomatis."
    );
  }

  async function generatePdf() {
    clearPollTimer();
    setError("");
    setResult(null);
    setBackgroundNotice("");

    const ids = Array.from(selectedIds);

    if (!sourceId) {
      setError("Pilih program dan database/source MCU terlebih dahulu.");
      return;
    }

    if (!ids.length) {
      setError("Pilih minimal 1 peserta untuk generate PDF.");
      return;
    }

    setLoading(true);
    setPolling(false);

    try {
      const effectiveMode = ids.length > 1 ? "batch" : mode;

      const res = await fetch("/api/ai-mcu/generate-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          programType,
          sourceId,
          mode: effectiveMode,
          uploadDrive,
          // CAPASKA_GENERATE_PDF_SINGLE_FAST_V335
          mergePdf: mergePdf && ids.length > 1,
          participantIds: ids
        })
      });

      const json: GenerateResult = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message || "Generate PDF gagal.");
        setLoading(false);
        return;
      }

      setResult(json);

      if (!json.jobId) {
        setError("Job ID tidak diterima dari engine.");
        setLoading(false);
        return;
      }

      saveStoredJob({
        jobId: json.jobId,
        startedAt: new Date().toISOString(),
        selectedCount: ids.length,
        sourceId,
        sourceName: selectedSource?.name || "",
        programType,
      });

      setPolling(true);
      pollTimerRef.current = setTimeout(() => pollJob(json.jobId as string), 1500);
    } catch (err: any) {
      setError(err?.message || "Generate PDF gagal.");
      setLoading(false);
      setPolling(false);
      clearPollTimer();
    }
  }
  const progress = Math.max(0, Math.min(100, Number(result?.progress || 0)));
  const done = result?.status === "done";
  const hasFiles =
    Boolean(result?.pdfUrl) ||
    Boolean(result?.mergedPdfUrl) ||
    Boolean(result?.zipFile?.url) ||
    Boolean(result?.pdfFiles?.length) ||
    Boolean(result?.mergedFiles?.length);
  // CAPASKA_GENERATE_PDF_DOWNLOAD_BUTTON_V336
  // CAPASKA_GENERATE_PDF_GENERATE_PAGE_SYNTAX_REPAIR_V338
  const fallbackDownloadUrlV336 = result?.jobId
    ? `/api/ai-mcu/generate-pdf/download/${encodeURIComponent(result.jobId)}`
    : "";

  return (
    <main className="relative p-6">
      {menuOpen ? (
        <button
          type="button"
          aria-label="Close menu overlay"
          className="fixed inset-0 z-30 bg-black/10"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Generate PDF AI MCU</h1>
              {/* CAPASKA_GENERATE_PDF_MENU_V332_NOTICE */}
              {programType === "capaska" ? (
                <div className="mt-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Mode CAPASKA aktif</div>
              ) : null}
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Pilih jenis program, database MCU, retrieve peserta, pilih single/multiple/select all,
              lalu generate PDF memakai async job.
            </p>
          </div>

          <div className="relative flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              ☰ Menu
            </button>

            <a
              href="/ai-mcu"
              className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Kembali
            </a>

            {menuOpen ? (
              <div className="absolute right-0 top-12 z-40 w-[320px] overflow-hidden rounded-2xl border bg-white shadow-xl">
                <div className="border-b bg-slate-50 px-4 py-3">
                  <div className="text-sm font-black text-slate-900">Navigasi MCU System</div>
                  {result?.jobId && result?.status !== "done" ? (
                    <div className="mt-1 text-xs text-emerald-700">
                      Job PDF sedang berjalan: {result.jobId}
                    </div>
                  ) : null}
                </div>

                <div className="grid max-h-[460px] gap-2 overflow-auto p-3">
                  {menuItems.map(([label, href]) => (
                    <a
                      key={href}
                      href={href}
                      onClick={() => setMenuOpen(false)}
                      className={`rounded-xl border px-3 py-2 text-sm font-bold hover:bg-slate-50 ${
                        href === "/ai-mcu/generate"
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {backgroundNotice ? (
          <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800">
            {backgroundNotice}
          </div>
        ) : null}

        <div className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-5">
            <div className="rounded-2xl border bg-slate-50 p-5">
              <h2 className="text-lg font-bold">1. Pilih Program & Database MCU</h2>

              <div className="mt-4 grid gap-3 md:grid-cols-[0.55fr_1fr_auto]">
                <select
                  value={programType}
                  onChange={(e) => setProgramType(e.target.value)}
                  disabled={loadingSources}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm disabled:opacity-60"
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
                  disabled={loadingSources}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm disabled:opacity-60"
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
                  disabled={!sourceId || loadingParticipants}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
                  disabled={!sourceId || loadingParticipants}
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingParticipants ? "Loading..." : "Search"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-bold">2. Pilih Peserta</h2>
                  <div className="mt-1 text-sm text-slate-500">
                    Loaded: <b>{participants.length}</b> · Selected: <b>{selectedIds.size}</b>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={selectAllLoaded}
                    disabled={!participants.length}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Select All Loaded
                  </button>

                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={!selectedIds.size}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border">
                <div className="grid grid-cols-[48px_1.3fr_0.9fr_0.9fr_0.9fr] bg-slate-100 px-3 py-3 text-xs font-black uppercase text-slate-600">
                  <div>
                    <input
                      type="checkbox"
                      checked={allLoadedSelected}
                      onChange={(e) => e.target.checked ? selectAllLoaded() : clearSelection()}
                      disabled={!participants.length}
                    />
                  </div>
                  <div>Nama</div>
                  <div>No MCU</div>
                  <div>NIK / ID</div>
                  <div>Paket</div>
                </div>

                <div className="max-h-[440px] divide-y overflow-auto bg-white">
                  {participants.length ? (
                    participants.map((p) => (
                      <label
                        key={p.id}
                        className="grid cursor-pointer grid-cols-[48px_1.3fr_0.9fr_0.9fr_0.9fr] items-center px-3 py-3 text-sm hover:bg-slate-50"
                      >
                        <div>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
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
                        <div className="text-slate-700">{p.package_name || "-"}</div>
                      </label>
                    ))
                  ) : (
                    <div className="p-5 text-sm text-slate-500">
                      Belum ada peserta. Pilih program dan database lalu klik Retrieve Data.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-5">
              <h2 className="text-lg font-bold">3. Pengaturan Generate</h2>

              <div className="mt-4">
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Mode Generate
                </label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  disabled={loading || polling || selectedIds.size > 1}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm disabled:opacity-60"
                >
                  <option value="single">Single PDF per peserta</option>
                  <option value="batch">Batch PDF semua peserta terpilih</option>
                </select>
                {selectedIds.size > 1 ? (
                  <div className="mt-2 text-xs text-slate-500">
                    Karena peserta terpilih lebih dari 1, mode otomatis menjadi batch.
                  </div>
                ) : null}
              </div>

              {/* CAPASKA_GENERATE_PDF_SINGLE_FAST_V335 */}
              <label className="mt-4 flex items-center gap-3 rounded-xl border bg-white p-4 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={mergePdf && canMergePdfV335}
                  disabled={loading || polling || !canMergePdfV335}
                  onChange={(e) => setMergePdf(e.target.checked)}
                />
                Merge PDF untuk print
              </label>
              {!canMergePdfV335 ? (
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
                  Mode cepat aktif: untuk 1 peserta, merge PDF dimatikan otomatis agar generate lebih ringan.
                </div>
              ) : null}

              <label className="mt-3 flex items-center gap-3 rounded-xl border bg-white p-4 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={uploadDrive}
                  disabled={loading || polling}
                  onChange={(e) => setUploadDrive(e.target.checked)}
                />
                Upload hasil ke Google Drive
              </label>

              <button
                type="button"
                onClick={generatePdf}
                disabled={loading || polling || !selectedIds.size}
                className="mt-5 w-full rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading || polling
                  ? "Generating PDF..."
                  : `Generate PDF (${selectedIds.size} peserta)`}
              </button>

              {result?.jobId && result.status !== "done" && result.status !== "error" ? (
                <button
                  type="button"
                  onClick={sendToBackground}
                  className="mt-3 w-full rounded-xl border border-blue-300 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-700 hover:bg-blue-100"
                >
                  Jalankan di Background & Tetap Bisa Pindah Menu
                </button>
              ) : null}

              {error ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  {error}
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-bold">Status & Hasil Generate</h2>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              PDF final dibuat oleh Python AI MCU Engine. Kamu bisa klik menu hamburger
              dan membuka fitur lain; job di engine tetap berjalan.
            </div>

            {(loading || polling || result) ? (
              <div className="mt-5 rounded-2xl border bg-white p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      Status: {result?.status || "starting"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Job ID: {result?.jobId || "-"}
                    </div>
                  </div>

                  <div className="text-right text-sm font-black text-slate-700">
                    {progress}%
                  </div>
                </div>

                <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="mt-3 text-sm text-slate-700">
                  {result?.message || "Menyiapkan job..."}
                </div>

                {result?.total ? (
                  <div className="mt-1 text-xs text-slate-500">
                    Progress peserta: {result.current || 0}/{result.total}
                    {result.currentName ? ` · ${result.currentName}` : ""}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">
                Belum ada hasil generate.
              </div>
            )}

            {done ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <div className="font-bold">{result?.message}</div>
                  {result?.count ? (
                    <div className="mt-2">
                      Jumlah PDF: <b>{result.count}</b>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-3">
                  {result?.pdfUrl ? (
                    <a
                      href={result.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
                    >
                      Buka PDF Pertama
                    </a>
                  ) : null}

                  {result?.mergedPdfUrl ? (
                    <a
                      href={result.mergedPdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
                    >
                      Buka PDF Gabungan
                    </a>
                  ) : null}

                  {result?.zipFile?.url ? (
                    <a
                      href={result.zipFile.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Download ZIP
                    </a>
                  ) : null}
                {fallbackDownloadUrlV336 ? (
                  <a
                    href={fallbackDownloadUrlV336}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800"
                  >
                    Download / Buka Hasil PDF
                  </a>
                ) : null}
                </div>

                {!hasFiles ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                    Engine sudah selesai, tetapi daftar file belum dikirim di status job. Gunakan tombol <b>Download / Buka Hasil PDF</b> untuk mengambil hasil langsung dari engine.
                  </div>
                ) : null}

                {result?.pdfFiles?.length ? (
                  <div className="rounded-2xl border">
                    <div className="border-b bg-slate-50 px-4 py-3 font-bold">
                      File PDF
                    </div>
                    <div className="max-h-80 divide-y overflow-auto">
                      {result.pdfFiles.map((file) => (
                        <a
                          key={file.url}
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-slate-50"
                        >
                          <span className="font-semibold text-slate-800">
                            {file.name}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatBytes(file.size)}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                {result?.errors?.length ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <div className="font-bold">Sebagian data gagal:</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {result.errors.map((err, index) => (
                        <li key={`${err.name}-${index}`}>
                          <b>{err.name}</b>: {err.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
