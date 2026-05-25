"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AI_MCU_MAPPING_FIELDS,
  AI_MCU_MAPPING_GROUPS,
  buildAiMcuAutoMapping,
  isAiMcuClinicalField,
  type AiMcuMappingGroup,
} from "@/lib/ai-mcu/headerLibrary";

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

const GROUP_OPTIONS = ["Semua", ...AI_MCU_MAPPING_GROUPS] as const;

function text(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || ["null", "undefined", "nan", "-", "—"].includes(raw.toLowerCase())) return "";
  return raw;
}

function firstValue(sampleRows: any[], header?: string) {
  if (!header) return "";

  for (const item of sampleRows || []) {
    const row = item?.row_data || item || {};
    const value = text(row?.[header]);
    if (value) return value;
  }

  return "";
}

function matchesSearch(value: unknown, query: string) {
  return String(value || "").toLowerCase().includes(query.trim().toLowerCase());
}

export default function AiMcuMappingPage() {
  const [programType, setProgramType] = useState("all");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [sourceId, setSourceId] = useState("");

  const [actualHeaders, setActualHeaders] = useState<string[]>([]);
  const [masterHeaders, setMasterHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [groupFilter, setGroupFilter] = useState<(typeof GROUP_OPTIONS)[number]>("Fisik");
  const [search, setSearch] = useState("");
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);

  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const actualSet = useMemo(() => new Set(actualHeaders), [actualHeaders]);
  const masterOnlyHeaders = useMemo(
    () => masterHeaders.filter((header) => header && !actualSet.has(header)),
    [masterHeaders, actualSet]
  );

  const allHeaders = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const header of [...actualHeaders, ...masterOnlyHeaders]) {
      if (!seen.has(header)) {
        seen.add(header);
        out.push(header);
      }
    }
    return out;
  }, [actualHeaders, masterOnlyHeaders]);

  const filteredFields = useMemo(() => {
    return AI_MCU_MAPPING_FIELDS.filter((field) => {
      if (groupFilter !== "Semua" && field.group !== groupFilter) return false;
      if (onlyUnmapped && fieldMapping[field.key]) return false;
      if (search.trim()) {
        const haystack = [
          field.key,
          field.label,
          field.group,
          ...field.aliases,
          fieldMapping[field.key] || "",
        ].join(" ");
        if (!matchesSearch(haystack, search)) return false;
      }
      return true;
    });
  }, [groupFilter, onlyUnmapped, search, fieldMapping]);

  const mappedCount = useMemo(() => {
    return AI_MCU_MAPPING_FIELDS.filter((field) => Boolean(fieldMapping[field.key])).length;
  }, [fieldMapping]);

  const requiredMissing = useMemo(() => {
    return AI_MCU_MAPPING_FIELDS.filter((field) => field.required).filter((field) => !fieldMapping[field.key]);
  }, [fieldMapping]);

  const clinicalMappedCount = useMemo(() => {
    return AI_MCU_MAPPING_FIELDS.filter((field) => isAiMcuClinicalField(field)).filter((field) => Boolean(fieldMapping[field.key])).length;
  }, [fieldMapping]);

  const clinicalFieldCount = useMemo(() => {
    return AI_MCU_MAPPING_FIELDS.filter((field) => isAiMcuClinicalField(field)).length;
  }, []);

  async function loadSources(nextProgram = programType) {
    setLoadingSources(true);
    setError("");
    setMessage("");
    setSources([]);
    setSourceId("");
    setActualHeaders([]);
    setMasterHeaders([]);
    setSampleRows([]);
    setFieldMapping({});

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

      const urlParams = new URLSearchParams(window.location.search);
      const fromUrl = urlParams.get("source_id");

      if (fromUrl && list.some((source: SourceItem) => String(source.id) === String(fromUrl))) {
        setSourceId(String(fromUrl));
      } else if (list[0]?.id) {
        setSourceId(String(list[0].id));
      }
    } catch (err: any) {
      setError(err?.message || "Gagal mengambil daftar database.");
    } finally {
      setLoadingSources(false);
    }
  }

  async function loadHeaders(nextSourceId = sourceId) {
    if (!nextSourceId) return;

    setLoadingHeaders(true);
    setError("");
    setMessage("");
    setActualHeaders([]);
    setMasterHeaders([]);
    setSampleRows([]);
    setFieldMapping({});

    try {
      const params = new URLSearchParams();
      params.set("source_id", nextSourceId);

      const res = await fetch(`/api/ai-mcu/mapping/headers?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message || "Gagal mengambil header dari database upload.");
        return;
      }

      const nextActualHeaders = json.actualHeaders || [];
      const nextMasterHeaders = json.masterHeaders || [];
      const nextMapping = json.fieldMapping || buildAiMcuAutoMapping(nextActualHeaders);

      setActualHeaders(nextActualHeaders);
      setMasterHeaders(nextMasterHeaders);
      setSampleRows(json.sampleRows || []);
      setFieldMapping(nextMapping);

      const masterNote = json.masterHeaderError ? ` Master table belum aktif, pakai fallback library.` : "";
      setMessage(
        `Header upload terbaca: ${nextActualHeaders.length}. Header master: ${nextMasterHeaders.length}. Field mapped: ${Object.keys(nextMapping).filter((key) => nextMapping[key]).length}.${masterNote}`
      );
    } catch (err: any) {
      setError(err?.message || "Gagal mengambil header dari database upload.");
    } finally {
      setLoadingHeaders(false);
    }
  }

  async function saveMapping() {
    setError("");
    setMessage("");

    if (!sourceId) {
      setError("Pilih database terlebih dahulu.");
      return;
    }

    if (requiredMissing.length) {
      setError(`Mapping wajib belum lengkap: ${requiredMissing.map((field) => field.label).join(", ")}.`);
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/ai-mcu/mapping/headers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceId: Number(sourceId),
          fieldMapping,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message || "Gagal menyimpan mapping.");
        return;
      }

      setMessage(json.message || "Mapping berhasil disimpan.");
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan mapping.");
    } finally {
      setSaving(false);
    }
  }

  function updateMapping(key: string, value: string) {
    setFieldMapping((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetAutoMapping() {
    const auto = buildAiMcuAutoMapping(actualHeaders);
    setFieldMapping((current) => ({
      ...current,
      ...auto,
    }));
    setMessage(`Auto detect ulang dari header upload selesai. Field terdeteksi: ${Object.keys(auto).length}.`);
  }

  function clearGroupMapping() {
    setFieldMapping((current) => {
      const next = { ...current };
      for (const field of AI_MCU_MAPPING_FIELDS) {
        if (groupFilter === "Semua" || field.group === groupFilter) {
          delete next[field.key];
        }
      }
      return next;
    });
  }

  useEffect(() => {
    loadSources(programType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programType]);

  useEffect(() => {
    if (sourceId) loadHeaders(sourceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  const selectedSource = sources.find((source) => String(source.id) === sourceId);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Mapping Header AI MCU</h1>
            <p className="mt-2 max-w-4xl text-sm text-slate-600">
              Dropdown sekarang memuat dua sumber: header asli dari upload Excel dan Master Header Library.
              Untuk nilai analisis, header asli dari upload tetap yang paling akurat.
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
              href="/ai-mcu/analyze"
              className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-700"
            >
              Analisis MCU
            </a>
          </div>
        </div>

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <h2 className="text-lg font-bold">1. Pilih Program & Database Upload</h2>

          <div className="mt-4 grid gap-3 lg:grid-cols-[0.55fr_1fr_auto]">
            <select
              value={programType}
              onChange={(e) => setProgramType(e.target.value)}
              disabled={loadingSources || loadingHeaders || saving}
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
              disabled={loadingSources || loadingHeaders || saving}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
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

            <button
              type="button"
              onClick={() => loadHeaders()}
              disabled={!sourceId || loadingHeaders || saving}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingHeaders ? "Loading..." : "Load Header"}
            </button>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border bg-white p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-lg font-bold">2. Mapping Header ke Parameter</h2>
              <p className="mt-1 text-sm text-slate-600">
                Database aktif: <b>{selectedSource?.name || "-"}</b>
                {selectedSource?.institution_name ? ` · ${selectedSource.institution_name}` : ""}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari parameter/header..."
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              />

              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value as any)}
                disabled={saving}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700"
              >
                {GROUP_OPTIONS.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setOnlyUnmapped((v) => !v)}
                className={`rounded-xl border px-4 py-2 text-sm font-bold ${
                  onlyUnmapped ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                Belum mapped
              </button>

              <button
                type="button"
                onClick={resetAutoMapping}
                disabled={!actualHeaders.length || saving}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Auto Detect Ulang
              </button>

              <button
                type="button"
                onClick={clearGroupMapping}
                disabled={saving}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100"
              >
                Clear Grup
              </button>
            </div>
          </div>

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

          {!allHeaders.length ? (
            <div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm text-slate-500">
              Pilih database hasil upload Excel untuk menampilkan header dan mapping.
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-5">
                <div className="rounded-xl border bg-slate-50 p-4 text-sm">
                  Header upload: <b>{actualHeaders.length}</b>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4 text-sm">
                  Header master: <b>{masterHeaders.length}</b>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4 text-sm">
                  Field mapped: <b>{mappedCount}</b>/{AI_MCU_MAPPING_FIELDS.length}
                </div>
                <div className="rounded-xl border bg-slate-50 p-4 text-sm">
                  Klinis mapped: <b>{clinicalMappedCount}</b>/{clinicalFieldCount}
                </div>
                <div className="rounded-xl border bg-slate-50 p-4 text-sm">
                  Row contoh: <b>{sampleRows.length}</b>
                </div>
              </div>

              {actualHeaders.length < 30 ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                  Header asli dari upload hanya {actualHeaders.length}. Master Header akan muncul di dropdown,
                  tapi kalau dipilih dan contoh isi tetap "-", berarti data klinis memang belum tersimpan di database upload.
                  Solusinya upload ulang file MCU raw yang memiliki kolom Fisik/Lab/Urine/Penunjang.
                </div>
              ) : null}

              {requiredMissing.length ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  Mapping wajib belum lengkap: {requiredMissing.map((field) => field.label).join(", ")}.
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                  Mapping wajib sudah lengkap. Data siap dipakai untuk Analisis MCU dan Generate PDF.
                </div>
              )}

              <div className="mt-4 overflow-hidden rounded-2xl border">
                <div className="grid grid-cols-[0.75fr_1fr_0.8fr_0.45fr] bg-slate-100 px-3 py-3 text-xs font-black uppercase text-slate-600">
                  <div>Parameter AI MCU</div>
                  <div>Header Excel / Master</div>
                  <div>Contoh Isi</div>
                  <div>Grup</div>
                </div>

                <div className="max-h-[620px] divide-y overflow-auto bg-white">
                  {filteredFields.map((field) => {
                    const selectedHeader = fieldMapping[field.key] || "";
                    const preview = firstValue(sampleRows, selectedHeader);
                    const isMapped = Boolean(selectedHeader);
                    const isMasterOnly = selectedHeader && !actualSet.has(selectedHeader);

                    return (
                      <div
                        key={field.key}
                        className="grid grid-cols-[0.75fr_1fr_0.8fr_0.45fr] items-center gap-3 px-3 py-3 text-sm"
                      >
                        <div>
                          <div className="font-bold text-slate-900">
                            {field.label}
                            {field.required ? <span className="text-red-600"> *</span> : null}
                            {isMapped ? <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">mapped</span> : null}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">{field.key}</div>
                          <div className="mt-1 truncate text-[11px] text-slate-400" title={field.aliases.join(", ")}>
                            alias: {field.aliases.slice(0, 5).join(", ")}
                          </div>
                        </div>

                        <div>
                          <select
                            value={selectedHeader}
                            onChange={(e) => updateMapping(field.key, e.target.value)}
                            disabled={saving}
                            className={`w-full rounded-xl border bg-white px-3 py-2 text-sm ${
                              field.required && !selectedHeader ? "border-red-300" : isMasterOnly ? "border-amber-300" : "border-slate-300"
                            }`}
                          >
                            <option value="">-- Tidak dipakai --</option>
                            <optgroup label="Header dari upload Excel">
                              {actualHeaders.map((header) => (
                                <option key={`${field.key}-actual-${header}`} value={header}>
                                  {header}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Master Header Library">
                              {masterOnlyHeaders.map((header) => (
                                <option key={`${field.key}-master-${header}`} value={header}>
                                  {header}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                          {isMasterOnly ? (
                            <div className="mt-1 text-[11px] font-semibold text-amber-700">
                              Master header. Pastikan ada kolom asli yang setara di file upload.
                            </div>
                          ) : null}
                        </div>

                        <div className="truncate rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600" title={preview}>
                          {preview || "-"}
                        </div>

                        <div className="text-xs font-bold text-slate-500">{field.group}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <details className="mt-4 rounded-2xl border bg-slate-50">
                <summary className="cursor-pointer px-4 py-3 text-sm font-black text-slate-800">
                  Preview Row Upload
                </summary>

                <div className="overflow-auto border-t bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                      <tr>
                        {actualHeaders.slice(0, 40).map((header) => (
                          <th key={header} className="whitespace-nowrap p-2 text-left">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sampleRows.slice(0, 5).map((item, index) => {
                        const row = item.row_data || {};
                        return (
                          <tr key={index}>
                            {actualHeaders.slice(0, 40).map((header) => (
                              <td key={`${index}-${header}`} className="max-w-[240px] truncate whitespace-nowrap p-2" title={String(row[header] ?? "")}>
                                {String(row[header] ?? "")}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>

              <button
                type="button"
                onClick={saveMapping}
                disabled={saving || !!requiredMissing.length}
                className="mt-5 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Menyimpan Mapping..." : "Simpan Mapping ke Database"}
              </button>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
