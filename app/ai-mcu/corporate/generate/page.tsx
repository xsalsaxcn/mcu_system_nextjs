"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CORPORATE_ASSET_TYPES,
  CORPORATE_SIGNATORY_FIELDS,
  isRequiredParameter,
} from "@/lib/shared/corporatePdf";

type SourceItem = { id: number; name: string; institution_name?: string | null; program_type?: string | null };
type Participant = { id: number; name: string; mcu_id?: string | null; external_id?: string | null; nik?: string | null; barcode_value?: string | null; package_name?: string | null; company_name?: string | null; source_name?: string | null };
type SectionOption = { code: string; label: string; group: string; required?: boolean; defaultEnabled?: boolean; available: number; total: number };
type ParameterOption = { key: string; count: number; category: string };
type UploadResult = { ok: boolean; status?: string; message?: string; fileName?: string; participant?: { id: number; name: string; mcuId: string }; driveUrl?: string; driveFileId?: string; folderPath?: string; storage?: string };
type PdfFileItemV416 = { name?: string; url?: string; size?: number };
type JobResult = { ok: boolean; status?: string; message?: string; jobId?: string; progress?: number; current?: number; total?: number; currentName?: string; pdfUrl?: string; mergedPdfUrl?: string; pdfFiles?: PdfFileItemV416[]; mergedFiles?: PdfFileItemV416[] };
type CorporatePdfHistoryV416 = { sourceId: string; participantIds: number[]; jobId: string; sourceUrl: string; generatedAt: string; selectedSections: string[]; totalPages?: number };
type QuickPdfResultV416 = { pdfUrl?: string; fileName?: string; selectedPages?: number[]; totalPages?: number };

const ACTIVE_JOB_KEY = "corporate_mcu_pdf_active_job_v1";
const SIGNATORY_KEY_PREFIX = "corporate_mcu_pdf_signatories_v1_";
const CORPORATE_HISTORY_KEY_PREFIX_V416 = "corporate_mcu_pdf_history_v416_";
const CATEGORY_LABEL: Record<string, string> = {
  identity: "Identitas Peserta",
  summary: "Kesimpulan MCU",
  physical: "Pemeriksaan Fisik",
  lab: "Laboratorium",
  support: "Pemeriksaan Penunjang",
  attachment: "Lampiran",
  other: "Parameter Lain",
};

function badgeClass(available: number, total: number) {
  if (!total || !available) return "border-red-200 bg-red-50 text-red-700";
  if (available === total) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

// CORPORATE_HISTORY_PAGE_PICKER_V416
function historyKeyV416(sourceId: string, participantIds: number[]) {
  const ids = [...participantIds].sort((a, b) => a - b).join("-");
  return `${CORPORATE_HISTORY_KEY_PREFIX_V416}${sourceId}_${ids}`;
}

function pdfUrlFromJobV416(value: JobResult) {
  const direct = String(value.pdfUrl || "").trim();
  if (direct) return direct;
  const first = (value.pdfFiles || []).find((item) => String(item?.url || "").trim());
  return String(first?.url || "").trim();
}

export default function CorporateGeneratePage() {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [keyword, setKeyword] = useState("");
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());
  const [parameters, setParameters] = useState<ParameterOption[]>([]);
  const [selectedParameters, setSelectedParameters] = useState<Set<string>>(new Set());
  const [signatories, setSignatories] = useState<Record<string, string>>({});
  // CORPORATE_SETUP_PERSISTENCE_V411
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupSavedAt, setSetupSavedAt] = useState("");
  const [assetType, setAssetType] = useState("PROFILE_PHOTO");
  const [assetFiles, setAssetFiles] = useState<File[]>([]);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [mergePdf, setMergePdf] = useState(false);
  const [uploadDrive, setUploadDrive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [job, setJob] = useState<JobResult | null>(null);
  const [historyPdfV416, setHistoryPdfV416] = useState<CorporatePdfHistoryV416 | null>(null);
  const [historyPagesV416, setHistoryPagesV416] = useState<Set<number>>(new Set());
  const [historyLoadingV416, setHistoryLoadingV416] = useState(false);
  const [historyErrorV416, setHistoryErrorV416] = useState("");
  const [quickPdfLoadingV416, setQuickPdfLoadingV416] = useState(false);
  const [quickPdfResultV416, setQuickPdfResultV416] = useState<QuickPdfResultV416 | null>(null);
  // CORPORATE_SELECTED_PAGES_UI_V414
  const [printSourceUrl, setPrintSourceUrl] = useState("");
  const [printPages, setPrintPages] = useState("");
  const [printLoading, setPrintLoading] = useState(false);
  const [printError, setPrintError] = useState("");
  const [printResult, setPrintResult] = useState<{ pdfUrl: string; fileName?: string; selectedPages?: number[]; totalPages?: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedSource = sources.find((item) => String(item.id) === sourceId);
  const allSelected = participants.length > 0 && participants.every((item) => selectedIds.has(item.id));
  const groupedParameters = useMemo(() => {
    const groups = new Map<string, ParameterOption[]>();
    for (const item of parameters) {
      const list = groups.get(item.category) || [];
      list.push(item);
      groups.set(item.category, list);
    }
    return Array.from(groups.entries());
  }, [parameters]);
  const selectedParticipantKeyV416 = useMemo(() => Array.from(selectedIds).sort((a, b) => a - b).join(","), [selectedIds]);

  function clearPoll() {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = null;
  }

  async function loadSources() {
    setError("");
    const res = await fetch("/api/sources?program=corporate", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json.ok) return setError(json.message || "Gagal mengambil database Corporate.");
    const list = (json.sources || []).filter((item: SourceItem) => String(item.program_type || "").toLowerCase() === "corporate");
    setSources(list);
    const querySource = new URLSearchParams(window.location.search).get("source_id");
    setSourceId(querySource && list.some((item: SourceItem) => String(item.id) === querySource) ? querySource : String(list[0]?.id || ""));
  }

  async function loadParticipants() {
    if (!sourceId) return;
    setLoadingParticipants(true);
    setError("");
    const params = new URLSearchParams({ source_id: sourceId, program: "corporate", limit: "2000" });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    try {
      const res = await fetch(`/api/ai-mcu/participants?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) return setError(json.message || "Gagal mengambil peserta.");
      setParticipants(json.participants || []);
      setSelectedIds(new Set());
      setSections([]);
      setParameters([]);
    } finally {
      setLoadingParticipants(false);
    }
  }

  async function loadOptions(ids = Array.from(selectedIds)) {
    if (!sourceId || !ids.length) {
      setSections([]);
      setParameters([]);
      return;
    }
    setLoadingOptions(true);
    setError("");
    try {
      const res = await fetch("/api/ai-mcu/corporate/pdf-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId, participantIds: ids }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) return setError(json.message || "Gagal membaca parameter PDF.");
      setSections(json.sections || []);
      setParameters(json.parameters || []);
      setSelectedSections(new Set((json.sections || []).filter((item: SectionOption) => item.required || (item.defaultEnabled && item.available > 0)).map((item: SectionOption) => item.code)));
      setSelectedParameters(new Set((json.parameters || []).map((item: ParameterOption) => item.key)));
    } finally {
      setLoadingOptions(false);
    }
  }

  async function hydrateHistoryPdfV416(entry: CorporatePdfHistoryV416) {
    setHistoryLoadingV416(true);
    setHistoryErrorV416("");
    setQuickPdfResultV416(null);
    try {
      const res = await fetch("/api/ai-mcu/corporate/pdf-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: entry.sourceUrl }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.message || "PDF riwayat tidak dapat dibaca.");
      const totalPages = Number(json.totalPages || 0);
      const hydrated = { ...entry, totalPages };
      setHistoryPdfV416(hydrated);
      setHistoryPagesV416(new Set(Array.from({ length: totalPages }, (_, index) => index + 1)));
    } catch (error: unknown) {
      setHistoryPdfV416(null);
      setHistoryPagesV416(new Set());
      setHistoryErrorV416(error instanceof Error ? error.message : "PDF riwayat tidak dapat dibaca.");
    } finally {
      setHistoryLoadingV416(false);
    }
  }

  async function loadHistoryPdfV416() {
    setHistoryPdfV416(null);
    setHistoryPagesV416(new Set());
    setHistoryErrorV416("");
    setQuickPdfResultV416(null);
    if (!sourceId || selectedIds.size !== 1 || !sections.length) return;
    const ids = Array.from(selectedIds);
    const raw = localStorage.getItem(historyKeyV416(sourceId, ids));
    if (!raw) return;
    try {
      const entry = JSON.parse(raw) as CorporatePdfHistoryV416;
      if (!entry?.sourceUrl || !entry?.jobId) return;
      await hydrateHistoryPdfV416(entry);
    } catch {
      setHistoryErrorV416("Riwayat PDF lokal tidak valid.");
    }
  }

  function persistCompletedHistoryV416(completedJob: JobResult) {
    if (!sourceId || selectedIds.size !== 1) return;
    const sourceUrl = pdfUrlFromJobV416(completedJob);
    if (!sourceUrl || !completedJob.jobId) return;
    const participantIds = Array.from(selectedIds);
    const entry: CorporatePdfHistoryV416 = {
      sourceId,
      participantIds,
      jobId: completedJob.jobId,
      sourceUrl,
      generatedAt: new Date().toISOString(),
      selectedSections: Array.from(selectedSections),
    };
    localStorage.setItem(historyKeyV416(sourceId, participantIds), JSON.stringify(entry));
    void hydrateHistoryPdfV416(entry);
  }

  async function pollJob(jobId: string) {
    const res = await fetch(`/api/ai-mcu/generate-pdf/status/${encodeURIComponent(jobId)}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setError(json.message || "Gagal membaca status job.");
      setLoading(false);
      return;
    }
    setJob(json);
    if (json.status === "done" || json.status === "error") {
      setLoading(false);
      localStorage.removeItem(ACTIVE_JOB_KEY);
      if (json.status === "done") persistCompletedHistoryV416(json);
      return;
    }
    pollRef.current = setTimeout(() => pollJob(jobId), 1600);
  }

  useEffect(() => { loadSources(); return clearPoll; }, []);
  useEffect(() => { if (sourceId) loadParticipants(); }, [sourceId]);
  useEffect(() => {
    if (!sourceId) {
      setSignatories({});
      setSetupSavedAt("");
      return;
    }
    void loadSignatories(sourceId);
  }, [sourceId]);
  useEffect(() => {
    const stored = localStorage.getItem(ACTIVE_JOB_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (parsed.jobId) { setLoading(true); pollJob(parsed.jobId); }
    } catch {}
  }, []);
  useEffect(() => { if (selectedIds.size <= 1) setMergePdf(false); }, [selectedIds.size]);
  useEffect(() => {
    void loadHistoryPdfV416();
  }, [sourceId, selectedParticipantKeyV416, sections.length]);

  function toggleParticipant(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function readLocalSignatories(id: string): Record<string, string> {
    try {
      const raw = localStorage.getItem(`${SIGNATORY_KEY_PREFIX}${id}`);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  async function loadSignatories(id: string) {
    setSetupLoading(true);
    setSetupSavedAt("");
    const localSetup = readLocalSignatories(id);

    try {
      const res = await fetch(`/api/ai-mcu/corporate/setup?sourceId=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.message || "Gagal memuat setup dari server.");

      const remoteSetup = json.signatories && typeof json.signatories === "object"
        ? (json.signatories as Record<string, string>)
        : {};
      const hasRemoteSetup = Object.values(remoteSetup).some((value) => String(value || "").trim());
      const resolvedSetup = hasRemoteSetup ? remoteSetup : localSetup;

      setSignatories(resolvedSetup);
      setSetupSavedAt(String(json.updatedAt || ""));
      if (hasRemoteSetup) {
        localStorage.setItem(`${SIGNATORY_KEY_PREFIX}${id}`, JSON.stringify(remoteSetup));
      }
    } catch {
      setSignatories(localSetup);
      if (Object.keys(localSetup).length) {
        setNotice("Setup lokal browser dimuat. Simpan kembali setelah koneksi database tersedia.");
      }
    } finally {
      setSetupLoading(false);
    }
  }

  async function saveSignatories() {
    if (!sourceId) {
      setError("Pilih database MCU Corporate sebelum menyimpan setup.");
      return;
    }

    const cleaned = Object.fromEntries(
      Object.entries(signatories).map(([key, value]) => [key, String(value || "").trim()])
    );

    setSetupSaving(true);
    setError("");
    setNotice("");
    localStorage.setItem(`${SIGNATORY_KEY_PREFIX}${sourceId}`, JSON.stringify(cleaned));

    try {
      const res = await fetch("/api/ai-mcu/corporate/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId, signatories: cleaned }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.message || "Gagal menyimpan setup ke database.");

      const savedSetup = json.signatories && typeof json.signatories === "object"
        ? (json.signatories as Record<string, string>)
        : cleaned;
      setSignatories(savedSetup);
      setSetupSavedAt(String(json.updatedAt || new Date().toISOString()));
      localStorage.setItem(`${SIGNATORY_KEY_PREFIX}${sourceId}`, JSON.stringify(savedSetup));
      setNotice("Setup penanggung jawab berhasil disimpan untuk database Corporate ini.");
    } catch (err: any) {
      setError(`${err?.message || "Gagal menyimpan setup ke database."} Data tetap disimpan lokal pada browser ini.`);
    } finally {
      setSetupSaving(false);
    }
  }

  async function uploadAssets() {
    if (!sourceId || !assetFiles.length) return;
    setUploading(true);
    setUploadResults([]);
    setUploadProgress(0);
    const results: UploadResult[] = [];
    for (let index = 0; index < assetFiles.length; index += 1) {
      const form = new FormData();
      form.append("sourceId", sourceId);
      form.append("assetType", assetType);
      form.append("file", assetFiles[index]);
      try {
        const res = await fetch("/api/ai-mcu/corporate/assets/upload", { method: "POST", body: form });
        const json = await res.json();
        results.push(json);
      } catch (err: any) {
        results.push({ ok: false, fileName: assetFiles[index].name, message: err?.message || "Upload gagal." });
      }
      setUploadResults([...results]);
      setUploadProgress(Math.round(((index + 1) / assetFiles.length) * 100));
    }
    setUploading(false);
    setAssetFiles([]);
    await loadOptions();
  }

  async function generatePdf() {
    if (!sourceId || !selectedIds.size) return setError("Pilih database dan peserta.");
    setLoading(true);
    setError("");
    setNotice("");
    setJob(null);
    clearPoll();
    const res = await fetch("/api/ai-mcu/corporate/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId,
        participantIds: Array.from(selectedIds),
        selectedSections: Array.from(selectedSections),
        selectedParameters: Array.from(selectedParameters),
        signatories,
        mergePdf,
        uploadDrive,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setLoading(false);
      return setError(json.message || "Generate PDF Corporate gagal.");
    }
    setJob(json);
    localStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify({ jobId: json.jobId, sourceId, startedAt: new Date().toISOString() }));
    pollRef.current = setTimeout(() => pollJob(json.jobId), 1200);
  }
  async function createQuickPdfFromHistoryV416() {
    if (!historyPdfV416?.sourceUrl) return setHistoryErrorV416("PDF riwayat tidak tersedia.");
    const pages = Array.from(historyPagesV416).sort((a, b) => a - b);
    if (!pages.length) return setHistoryErrorV416("Pilih minimal satu nomor halaman.");

    setQuickPdfLoadingV416(true);
    setHistoryErrorV416("");
    setQuickPdfResultV416(null);
    try {
      const res = await fetch("/api/ai-mcu/corporate/print-selected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: historyPdfV416.sourceUrl, pages: pages.join(",") }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.message || "Gagal membuat PDF halaman riwayat.");
      setQuickPdfResultV416(json);
    } catch (error: unknown) {
      setHistoryErrorV416(error instanceof Error ? error.message : "Gagal membuat PDF halaman riwayat.");
    } finally {
      setQuickPdfLoadingV416(false);
    }
  }

  const downloadUrl = job?.jobId ? `/api/ai-mcu/generate-pdf/download/${encodeURIComponent(job.jobId)}` : "";

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Generate PDF MCU Corporate</h1>
            <p className="mt-2 text-sm text-slate-600">Khusus MCU Corporate. CAPASKA, Vaksinasi, dan Wellness tidak menggunakan halaman maupun API ini.</p>
          </div>
          <div className="flex gap-2"><a href="/ai-mcu" className="rounded-xl border px-4 py-2 text-sm font-bold">☰ Menu AI MCU</a><a href="/ai-mcu/generate?program=capaska" className="rounded-xl border px-4 py-2 text-sm font-bold">Generate PDF CAPASKA</a></div>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
        {notice ? <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-700">{notice}</div> : null}

        <div className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-5">
            <div className="rounded-2xl border bg-slate-50 p-5">
              <h2 className="text-lg font-bold">1. Pilih Database MCU Corporate</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="rounded-xl border bg-white px-4 py-3 text-sm">
                  <option value="">Pilih database Corporate</option>
                  {sources.map((item) => <option key={item.id} value={item.id}>{item.name}{item.institution_name ? ` · ${item.institution_name}` : ""}</option>)}
                </select>
                <button onClick={loadParticipants} disabled={!sourceId || loadingParticipants} className="rounded-xl border bg-white px-5 py-3 text-sm font-bold disabled:opacity-50">Retrieve Data</button>
              </div>
              <div className="mt-3 flex gap-3"><input value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadParticipants()} placeholder="Cari nama / NIK / No MCU..." className="min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm"/><button onClick={loadParticipants} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">Search</button></div>
            </div>

            <div className="rounded-2xl border p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">2. Pilih Peserta</h2><div className="text-sm text-slate-500">Loaded: <b>{participants.length}</b> · Selected: <b>{selectedIds.size}</b></div></div><div className="flex gap-2"><button onClick={() => setSelectedIds(new Set(participants.map((item) => item.id)))} className="rounded-xl border px-4 py-2 text-sm font-bold">Select All Loaded</button><button onClick={() => setSelectedIds(new Set())} className="rounded-xl border px-4 py-2 text-sm font-bold">Clear</button><button onClick={() => loadOptions()} disabled={!selectedIds.size || loadingOptions} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{loadingOptions ? "Membaca..." : "Baca Parameter"}</button></div></div>
              <div className="mt-4 max-h-[420px] overflow-auto rounded-xl border"><div className="grid grid-cols-[44px_1.4fr_0.8fr_0.8fr] bg-slate-100 px-3 py-3 text-xs font-black uppercase"><input type="checkbox" checked={allSelected} onChange={(e) => setSelectedIds(e.target.checked ? new Set(participants.map((item) => item.id)) : new Set())}/><div>Nama</div><div>No MCU</div><div>Paket</div></div>{participants.map((item) => <label key={item.id} className="grid cursor-pointer grid-cols-[44px_1.4fr_0.8fr_0.8fr] items-center border-t px-3 py-3 text-sm hover:bg-slate-50"><input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleParticipant(item.id)}/><div><b>{item.name}</b><div className="text-xs text-slate-500">{item.company_name || item.source_name || "-"}</div></div><div>{item.mcu_id || item.barcode_value || item.external_id || "-"}</div><div>{item.package_name || "-"}</div></label>)}</div>
            </div>

            <div className="rounded-2xl border p-5">
              <h2 className="text-lg font-bold">3. Pilih Halaman Pemeriksaan yang Akan Dibuat</h2>
              <p className="mt-1 text-sm text-slate-500">Daftar halaman muncul otomatis setelah <b>Baca Parameter</b>. Centang halaman yang ingin dimasukkan, lalu generate PDF. Halaman penunjang hanya dibuat bila data peserta tersedia.</p>
              {/* CORPORATE_PRE_GENERATE_PAGE_SELECTION_V415 */}
              {sections.length ? <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={() => setSelectedSections(new Set(sections.filter((item) => item.required || item.available > 0).map((item) => item.code)))} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold">Pilih Semua Halaman Tersedia</button><button type="button" onClick={() => setSelectedSections(new Set(sections.filter((item) => item.required).map((item) => item.code)))} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold">Hanya Halaman Wajib</button><span className="text-xs font-semibold text-slate-500">{selectedSections.size}/{sections.length} halaman dipilih</span></div> : null}
              {!sections.length ? <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Pilih peserta lalu klik <b>Baca Parameter</b>.</div> : <div className="mt-4 grid gap-3 md:grid-cols-2">{sections.map((item) => <label key={item.code} className="flex items-start gap-3 rounded-xl border p-3"><input type="checkbox" className="mt-1" checked={item.required || selectedSections.has(item.code)} disabled={item.required} onChange={(e) => setSelectedSections((current) => { const next = new Set(current); e.target.checked ? next.add(item.code) : next.delete(item.code); return next; })}/><div className="min-w-0 flex-1"><div className="font-bold">{item.label}{item.required ? " · Wajib" : ""}</div><div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${badgeClass(item.available, item.total)}`}>{item.available}/{item.total} peserta</div></div></label>)}</div>}

              {parameters.length ? <details className="mt-5 rounded-xl border bg-slate-50 p-4"><summary className="cursor-pointer font-bold">Parameter detail dari Excel ({selectedParameters.size}/{parameters.length} dipilih)</summary><div className="mt-3 flex gap-2"><button onClick={() => setSelectedParameters(new Set(parameters.map((item) => item.key)))} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold">Pilih Semua</button><button onClick={() => setSelectedParameters(new Set(parameters.filter((item) => isRequiredParameter(item.key)).map((item) => item.key)))} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold">Hanya Parameter Wajib</button></div><div className="mt-4 space-y-4">{groupedParameters.map(([category, items]) => <div key={category}><div className="text-sm font-black text-slate-700">{CATEGORY_LABEL[category] || category}</div><div className="mt-2 grid gap-2 md:grid-cols-2">{items.map((item) => { const required = isRequiredParameter(item.key); return <label key={item.key} className="flex items-start gap-2 rounded-lg border bg-white p-2 text-xs"><input type="checkbox" checked={required || selectedParameters.has(item.key)} disabled={required} onChange={(e) => setSelectedParameters((current) => { const next = new Set(current); e.target.checked ? next.add(item.key) : next.delete(item.key); return next; })}/><span className="min-w-0 flex-1 break-all"><b>{item.key}</b><br/><span className="text-slate-500">{item.count}/{selectedIds.size} peserta</span></span></label>})}</div></div>)}</div></details> : null}
            </div>

            {/* CORPORATE_HISTORY_PAGE_PICKER_V416 */}
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5">
              <h2 className="text-lg font-bold text-cyan-950">3B. Nomor Halaman dari Riwayat PDF</h2>
              <p className="mt-1 text-sm text-cyan-900">Nomor halaman aktual dibaca dari PDF terakhir peserta. Halaman terpilih dibuat sebagai salinan cepat tanpa merender ulang seluruh pemeriksaan.</p>
              {selectedIds.size !== 1 ? (
                <div className="mt-4 rounded-xl border border-cyan-200 bg-white p-3 text-sm text-cyan-900">Pilih tepat <b>1 peserta</b> lalu klik <b>Baca Parameter</b>.</div>
              ) : historyLoadingV416 ? (
                <div className="mt-4 rounded-xl border bg-white p-3 text-sm">Membaca riwayat PDF...</div>
              ) : historyPdfV416?.totalPages ? (
                <div className="mt-4">
                  <div className="rounded-xl border border-cyan-200 bg-white p-3 text-sm">
                    <b>PDF terakhir:</b> {historyPdfV416.totalPages} halaman · {new Date(historyPdfV416.generatedAt).toLocaleString("id-ID")}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a href={historyPdfV416.sourceUrl} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-xs font-bold text-blue-700">Buka PDF Riwayat</a>
                      <button type="button" onClick={() => setHistoryPagesV416(new Set(Array.from({ length: Number(historyPdfV416.totalPages || 0) }, (_, index) => index + 1)))} className="rounded-lg border px-3 py-2 text-xs font-bold">Pilih Semua Halaman</button>
                      <button type="button" onClick={() => setHistoryPagesV416(new Set())} className="rounded-lg border px-3 py-2 text-xs font-bold">Kosongkan</button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                    {Array.from({ length: Number(historyPdfV416.totalPages || 0) }, (_, index) => index + 1).map((pageNo) => (
                      <label key={pageNo} className="flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-bold">
                        <input type="checkbox" checked={historyPagesV416.has(pageNo)} onChange={(e) => setHistoryPagesV416((current) => { const next = new Set(current); e.target.checked ? next.add(pageNo) : next.delete(pageNo); return next; })} />
                        <span>Hal. {pageNo}</span>
                      </label>
                    ))}
                  </div>
                  <button type="button" onClick={createQuickPdfFromHistoryV416} disabled={quickPdfLoadingV416 || !historyPagesV416.size} className="mt-3 w-full rounded-xl bg-cyan-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
                    {quickPdfLoadingV416 ? "Membuat salinan..." : `Buat PDF dari ${historyPagesV416.size} Halaman Riwayat (Cepat)`}
                  </button>
                  {quickPdfResultV416?.pdfUrl ? (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-3 text-sm">
                      <div className="font-bold text-emerald-800">PDF halaman terpilih selesai tanpa render ulang.</div>
                      <a href={quickPdfResultV416.pdfUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white">Buka / Print PDF Cepat</a>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Belum ada PDF riwayat untuk peserta ini pada browser ini. Generate satu kali secara normal; setelah selesai nomor halaman aktual akan tersimpan otomatis.</div>
              )}
              {historyErrorV416 ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{historyErrorV416}</div> : null}
            </div>

            <div className="rounded-2xl border p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">4. Nama Petugas / Penanggung Jawab</h2>
                  <p className="text-sm text-slate-500">Nama muncul pada halaman dan footer pemeriksaan terkait.</p>
                  {setupLoading ? <p className="mt-1 text-xs font-semibold text-blue-600">Memuat setup tersimpan...</p> : null}
                  {!setupLoading && setupSavedAt ? (
                    <p className="mt-1 text-xs font-semibold text-emerald-700">
                      Setup database aktif · terakhir disimpan {new Date(setupSavedAt).toLocaleString("id-ID")}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={saveSignatories}
                  disabled={!sourceId || setupLoading || setupSaving}
                  className="rounded-xl border bg-white px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {setupSaving ? "Menyimpan..." : "Simpan Setup"}
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">{CORPORATE_SIGNATORY_FIELDS.map((item) => <label key={item.key} className="text-sm font-bold text-slate-700">{item.label}<input value={signatories[item.key] || ""} onChange={(e) => setSignatories((current) => ({ ...current, [item.key]: e.target.value }))} placeholder="Free text: dr. Nama, Sp..." className="mt-2 w-full rounded-xl border px-4 py-3 text-sm font-normal"/></label>)}</div>
            </div>

            <div className="rounded-2xl border p-5">
              <h2 className="text-lg font-bold">5. Bulk Upload Foto dan Lampiran ke Google Drive</h2>
              <p className="mt-1 text-sm text-slate-500">Pilih jenis upload terlebih dahulu. File disimpan langsung ke folder Google Drive MCU yang sudah dikonfigurasi. Sistem hanya memasang file bila <b>No MCU dan nama peserta sama persis</b>. File mismatch tidak akan dikirim ke Drive.</p>
              <div className="mt-4 grid items-end gap-3 md:grid-cols-[0.6fr_1fr_auto]"><label className="text-sm font-bold text-slate-700">Apa yang mau di-upload?<select value={assetType} onChange={(e) => { setAssetType(e.target.value); setAssetFiles([]); setUploadResults([]); }} className="mt-2 w-full rounded-xl border px-4 py-3 text-sm font-normal">{CORPORATE_ASSET_TYPES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label className="text-sm font-bold text-slate-700">Pilih file untuk {CORPORATE_ASSET_TYPES.find((item) => item.code === assetType)?.label || "dokumen"}<input key={`${assetType}-${assetFiles.length}`} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => setAssetFiles(Array.from(e.target.files || []))} className="mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm font-normal"/></label><button onClick={uploadAssets} disabled={!sourceId || !assetFiles.length || uploading} className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{uploading ? `Uploading ${uploadProgress}%` : `Upload Files (${assetFiles.length})`}</button></div>
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><b>Format aman:</b> kode MCU harus di awal dan nama lengkap harus ada, misalnya <code>019_EDI HARYARDI1.2.156....jpg</code> atau <code>047-AGUS NUGROHO-THORAX.jpg</code>. UID DICOM, tanggal, dan nomor alat setelah nama diperbolehkan. Sistem tetap menolak bila pasangan kode dan nama tidak unik. <b>File tidak disimpan di Supabase Storage</b>; Supabase hanya menyimpan referensi Google Drive yang kecil agar gambar peserta dapat dipanggil saat PDF dibuat.</div>
              {uploadResults.length ? <div className="mt-4 max-h-72 overflow-auto rounded-xl border"><div className="grid grid-cols-[1.2fr_1fr_0.7fr] bg-slate-100 px-3 py-2 text-xs font-black"><div>File</div><div>Peserta</div><div>Status</div></div>{uploadResults.map((item, index) => <div key={`${item.fileName}-${index}`} className="grid grid-cols-[1.2fr_1fr_0.7fr] border-t px-3 py-2 text-xs"><div className="break-all">{item.fileName || "-"}<div className="text-slate-500">{item.message}</div></div><div>{item.participant ? <><div>{`${item.participant.mcuId} · ${item.participant.name}`}</div>{item.folderPath ? <div className="mt-1 text-[11px] text-slate-500">Drive: {item.folderPath}</div> : null}{item.driveUrl ? <a href={item.driveUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex font-bold text-blue-700 underline">Buka di Google Drive</a> : null}</> : "Tidak dipasang"}</div><div className={item.ok ? "font-bold text-emerald-700" : "font-bold text-red-700"}>{item.ok ? "Cocok & tersimpan di Drive" : "Ditolak"}</div></div>)}</div> : null}
            </div>

            <div className="rounded-2xl border bg-slate-50 p-5">
              <h2 className="text-lg font-bold">6. Generate PDF dari Halaman Terpilih</h2>
              <label className="mt-4 flex items-center gap-3 rounded-xl border bg-white p-4 text-sm"><input type="checkbox" checked={mergePdf} disabled={selectedIds.size <= 1} onChange={(e) => setMergePdf(e.target.checked)}/> Merge PDF untuk print</label>
              <label className="mt-3 flex items-center gap-3 rounded-xl border bg-white p-4 text-sm"><input type="checkbox" checked={uploadDrive} onChange={(e) => setUploadDrive(e.target.checked)}/> Upload hasil ke Google Drive</label>
              <button onClick={generatePdf} disabled={loading || !selectedIds.size || !sections.length || !selectedSections.size} className="mt-4 w-full rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{loading ? "Generating PDF..." : `Generate PDF Halaman Terpilih (${selectedIds.size} peserta)`}</button>
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-2xl border p-5"><h2 className="text-lg font-bold">Status & Hasil Generate</h2><div className="mt-4 rounded-xl border bg-amber-50 p-3 text-sm text-amber-800">PDF final tetap dibuat oleh Python MCU Engine. Format Corporate existing dipertahankan.</div>{job ? <div className="mt-4 rounded-xl border p-4 text-sm"><div><b>Status:</b> {job.status || "queued"}</div><div className="mt-1 text-xs text-slate-500">Job ID: {job.jobId}</div><div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, Number(job.progress || 0)))}%` }}/></div><div className="mt-2">{job.message || job.currentName || "Memproses..."}</div>{job.status === "done" && downloadUrl ? <a href={downloadUrl} target="_blank" className="mt-4 inline-flex rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white">Download / Buka Hasil PDF</a> : null}</div> : <div className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Belum ada job Corporate.</div>}</div>
            <div className="rounded-2xl border bg-blue-50 p-5 text-sm text-blue-900"><div className="font-black">Pengamanan modul</div><ul className="mt-2 list-disc space-y-1 pl-5"><li>Database dibatasi program Corporate.</li><li>Peserta harus berasal dari database yang sama.</li><li>Foto wajib cocok No MCU + nama.</li><li>File mismatch tidak pernah dipasang otomatis.</li><li>Route CAPASKA tetap terpisah.</li></ul></div>
          </aside>
        </div>
      </div>
    </main>
  );
}
