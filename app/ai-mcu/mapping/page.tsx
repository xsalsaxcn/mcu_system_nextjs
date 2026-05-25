"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AI_MCU_MAPPING_FIELDS,
  AI_MCU_MAPPING_GROUPS,
  buildAiMcuAutoMapping,
  isAiMcuClinicalField,
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

function clean(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || ["null", "undefined", "nan", "-", "—"].includes(raw.toLowerCase())) return "";
  return raw;
}

function normalize(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\-./]+/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = clean(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function firstValue(sampleRows: any[], header?: string) {
  if (!header) return "";

  for (const item of sampleRows || []) {
    const row = item?.row_data || item || {};
    const value = clean(row?.[header]);
    if (value) return value;
  }

  return "";
}

function matchesSearch(value: unknown, query: string) {
  return String(value || "").toLowerCase().includes(query.trim().toLowerCase());
}

function masterHeadersFromLibrary() {
  const values: string[] = [];
  for (const field of AI_MCU_MAPPING_FIELDS) {
    values.push(field.key, field.label);
    values.push(...(field.aliases || []));
  }
  return unique(values);
}

function findBestActualHeaderForField(field: any, actualHeaders: string[]) {
  const aliases = [field.key, field.label, ...(field.aliases || [])].map(normalize).filter(Boolean);

  const normalizedHeaders = actualHeaders.map((header) => ({
    raw: header,
    norm: normalize(header),
  }));

  for (const header of normalizedHeaders) {
    if (aliases.includes(header.norm)) return header.raw;
  }

  for (const header of normalizedHeaders) {
    for (const alias of aliases) {
      if (
        alias.length >= 3 &&
        header.norm.length >= 3 &&
        (header.norm.includes(alias) || alias.includes(header.norm))
      ) {
        return header.raw;
      }
    }
  }

  return "";
}

function buildForcedMapping(actualHeaders: string[], savedMapping: Record<string, string>) {
  const autoFromUpload = buildAiMcuAutoMapping(actualHeaders);
  const mapping: Record<string, string> = {};

  let fromUpload = 0;
  let fromSaved = 0;
  let fromMaster = 0;
  let clinicalFromUpload = 0;

  for (const field of AI_MCU_MAPPING_FIELDS) {
    const saved = clean(savedMapping?.[field.key]);
    const auto = clean(autoFromUpload?.[field.key]) || clean(findBestActualHeaderForField(field, actualHeaders));

    if (saved) {
      mapping[field.key] = saved;
      fromSaved += 1;
    } else if (auto) {
      mapping[field.key] = auto;
      fromUpload += 1;
      if (isAiMcuClinicalField(field)) clinicalFromUpload += 1;
    } else {
      mapping[field.key] = field.key;
      fromMaster += 1;
    }
  }

  return { mapping, fromUpload, fromSaved, fromMaster, clinicalFromUpload };
}

export default function AiMcuMappingPage() {
  const [programType, setProgramType] = useState("all");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [sourceId, setSourceId] = useState("");

  const [actualHeaders, setActualHeaders] = useState<string[]>([]);
  const [masterHeaders, setMasterHeaders] = useState<string[]>(masterHeadersFromLibrary());
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  const [groupFilter, setGroupFilter] = useState<(typeof GROUP_OPTIONS)[number]>("Laboratorium");
  const [search, setSearch] = useState("");

  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("Mapping otomatis akan berjalan saat database dipilih.");
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("Belum disimpan.");
  const [lastSaveJson, setLastSaveJson] = useState<any>(null);

  const actualSet = useMemo(() => new Set(actualHeaders), [actualHeaders]);

  const masterOnlyHeaders = useMemo(
    () => masterHeaders.filter((header) => header && !actualSet.has(header)),
    [masterHeaders, actualSet]
  );

  const filteredFields = useMemo(() => {
    return AI_MCU_MAPPING_FIELDS.filter((field) => {
      if (groupFilter !== "Semua" && field.group !== groupFilter) return false;

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
  }, [groupFilter, search, fieldMapping]);

  const mappedCount = useMemo(() => {
    return AI_MCU_MAPPING_FIELDS.filter((field) => Boolean(fieldMapping[field.key])).length;
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
    setMessage("Mengambil daftar database...");

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
      } else {
        setMessage("Belum ada database/source.");
      }
    } catch (err: any) {
      setError(err?.message || "Gagal mengambil daftar database.");
    } finally {
      setLoadingSources(false);
    }
  }

  async function loadHeadersAndAutoMap(nextSourceId = sourceId) {
    if (!nextSourceId) {
      setError("Pilih database terlebih dahulu.");
      return;
    }

    setLoadingHeaders(true);
    setError("");
    setMessage("Load header + Auto Mapping berjalan otomatis...");

    try {
      const params = new URLSearchParams();
      params.set("source_id", nextSourceId);

      const res = await fetch(`/api/ai-mcu/mapping/headers?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message || "Gagal mengambil header.");
        return;
      }

      const nextActualHeaders = unique(json.actualHeaders || json.headers || []);
      const nextMasterHeaders = unique([
        ...(json.masterHeaders || []),
        ...masterHeadersFromLibrary(),
      ]);
      const savedMapping = json.savedFieldMapping || json.fieldMapping || {};

      const forced = buildForcedMapping(nextActualHeaders, savedMapping);

      setActualHeaders(nextActualHeaders);
      setMasterHeaders(nextMasterHeaders);
      setSampleRows(json.sampleRows || []);
      setFieldMapping(forced.mapping);

      setMessage(
        `Auto Mapping selesai otomatis. Header upload: ${nextActualHeaders.length}. Field dari upload: ${forced.fromUpload}. Field dari saved mapping: ${forced.fromSaved}. Field dari master: ${forced.fromMaster}. Field klinis yang benar-benar cocok dari upload: ${forced.clinicalFromUpload}.`
      );
    } catch (err: any) {
      setError(err?.message || "Load header + Auto Mapping gagal.");
    } finally {
      setLoadingHeaders(false);
    }
  }

  function forceAutoMapNow() {
    setError("");
    setMessage("Force Auto Mapping manual dijalankan...");

    const forced = buildForcedMapping(actualHeaders, fieldMapping);
    setFieldMapping(forced.mapping);

    setMessage(
      `Force Auto Mapping selesai. Field dari upload: ${forced.fromUpload}. Field dari saved mapping: ${forced.fromSaved}. Field dari master: ${forced.fromMaster}. Field klinis yang benar-benar cocok dari upload: ${forced.clinicalFromUpload}.`
    );
  }

  function useMasterForCurrentGroup() {
    setError("");

    const next: Record<string, string> = {};
    for (const field of AI_MCU_MAPPING_FIELDS) {
      if (groupFilter !== "Semua" && field.group !== groupFilter) continue;
      next[field.key] = findBestActualHeaderForField(field, actualHeaders) || field.key;
    }

    setFieldMapping((current) => ({ ...current, ...next }));
    setMessage(`Master mapping untuk grup ${groupFilter} sudah diisi. Cek kolom Header Excel / Master.`);
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
    setMessage(`Mapping grup ${groupFilter} dibersihkan.`);
  }

  async function saveMapping() {
    setError("");
    setLastSaveJson(null);

    if (!sourceId) {
      setError("Pilih database terlebih dahulu.");
      setSaveStatus("Gagal: database belum dipilih.");
      return;
    }

    if (!fieldMapping.NAMA || !fieldMapping.NOMCU) {
      setError("Mapping wajib belum lengkap: Nama Peserta dan No MCU.");
      setSaveStatus("Gagal: mapping wajib belum lengkap.");
      return;
    }

    const mappedKeys = Object.keys(fieldMapping).filter((key) => clean(fieldMapping[key]));
    setSaving(true);
    setSaveStatus(`Menyimpan mapping... (${mappedKeys.length} field)`);

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

      const json = await res.json().catch(() => ({
        ok: false,
        message: "Response server bukan JSON.",
      }));

      setLastSaveJson(json);

      if (!res.ok || !json.ok) {
        const msg = json.message || `Gagal menyimpan mapping. HTTP ${res.status}`;
        setError(msg);
        setSaveStatus(`GAGAL SAVE: ${msg}`);
        return;
      }

      const msg = json.message || `Mapping berhasil disimpan. Rows updated: ${json.updatedRows ?? "-"}.`;
      setMessage(msg);
      setSaveStatus(`SAVED ✅ ${msg}`);
    } catch (err: any) {
      const msg = err?.message || "Gagal menyimpan mapping.";
      setError(msg);
      setSaveStatus(`GAGAL SAVE: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  function updateMapping(key: string, value: string) {
    setFieldMapping((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    loadSources(programType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programType]);

  useEffect(() => {
    if (sourceId) loadHeadersAndAutoMap(sourceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  const selectedSource = sources.find((source) => String(source.id) === sourceId);

  return (
    <main className="p-6 pb-32">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Mapping Header AI MCU</h1>
            <p className="mt-2 max-w-4xl text-sm text-slate-600">
              Save status sekarang tampil di bagian bawah dan di dekat tombol agar jelas apakah mapping tersimpan atau gagal.
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
              disabled={loadingSources || saving}
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
              disabled={loadingSources || saving}
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
              onClick={() => loadHeadersAndAutoMap()}
              disabled={!sourceId || saving}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingHeaders ? "Loading..." : "Reload + Auto Map"}
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
                onClick={forceAutoMapNow}
                disabled={saving}
                className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-60"
              >
                Force Auto Map
              </button>

              <button
                type="button"
                onClick={useMasterForCurrentGroup}
                disabled={saving}
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
              >
                Pakai Master Grup Ini
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

          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">
            Status Save: {saveStatus}
          </div>

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
              Header asli dari upload hanya {actualHeaders.length}. Kalau contoh isi tetap "-", berarti data klinis belum tersimpan
              di row upload. Mapping master tetap bisa disimpan, tapi analisis abnormal butuh nilai klinis asli.
            </div>
          ) : null}

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
                        {selectedHeader ? <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">mapped</span> : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">{field.key}</div>
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
                          Master header. Jika contoh isi "-", nilai klinis belum ada di upload.
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

          {lastSaveJson ? (
            <details className="mt-4 rounded-2xl border bg-slate-50">
              <summary className="cursor-pointer px-4 py-3 text-sm font-black text-slate-800">
                Debug Response Save
              </summary>
              <pre className="max-h-[260px] overflow-auto border-t bg-white p-4 text-xs">
                {JSON.stringify(lastSaveJson, null, 2)}
              </pre>
            </details>
          ) : null}

          <button
            type="button"
            onClick={saveMapping}
            disabled={saving || !fieldMapping.NAMA || !fieldMapping.NOMCU}
            className="mt-5 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Menyimpan Mapping..." : "Simpan Mapping ke Database"}
          </button>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-sm">
            <b>Status Save:</b> {saveStatus}
          </div>
          <button
            type="button"
            onClick={saveMapping}
            disabled={saving || !fieldMapping.NAMA || !fieldMapping.NOMCU}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Menyimpan Mapping..." : "Simpan Mapping ke Database"}
          </button>
        </div>
      </div>
    </main>
  );
}
