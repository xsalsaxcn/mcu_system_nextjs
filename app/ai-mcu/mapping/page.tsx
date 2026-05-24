"use client";

import { useEffect, useMemo, useState } from "react";

type SourceItem = {
  id: number;
  name: string;
  institution_name?: string | null;
  program_type?: string | null;
};

type MappingField = {
  key: string;
  label: string;
  aliases: string[];
  required?: boolean;
  group: "Identitas" | "Fisik" | "Laboratorium" | "Penunjang" | "Output PDF";
};

const PROGRAM_OPTIONS = [
  { value: "all", label: "Semua Program" },
  { value: "corporate", label: "Corporate" },
  { value: "capaska", label: "CAPASKA" },
];

const GROUP_OPTIONS = ["Semua", "Identitas", "Fisik", "Laboratorium", "Penunjang", "Output PDF"] as const;

const MAPPING_FIELDS: MappingField[] = [
  { key: "NAMA", label: "Nama Peserta", required: true, group: "Identitas", aliases: ["nama", "nama peserta", "nama karyawan", "nama lengkap", "name", "patient name", "employee name"] },
  { key: "NOMCU", label: "No MCU", required: true, group: "Identitas", aliases: ["nomcu", "no mcu", "no.mcu", "nomor mcu", "mcu id", "barcode", "no peserta", "no urut"] },
  { key: "NIK", label: "NIK / NRP / ID", group: "Identitas", aliases: ["nik", "ktp", "nik/nrp/id", "nrp", "id karyawan", "employee id"] },
  { key: "JK", label: "Jenis Kelamin", group: "Identitas", aliases: ["jk", "jenis kelamin", "gender", "sex"] },
  { key: "TGLLAHIR", label: "Tanggal Lahir", group: "Identitas", aliases: ["tgllahir", "tanggal lahir", "tgl lahir", "birth date", "dob"] },
  { key: "USIA", label: "Usia", group: "Identitas", aliases: ["usia", "umur", "age"] },
  { key: "DEPARTEMEN", label: "Departemen / Unit", group: "Identitas", aliases: ["departemen", "department", "bagian", "unit", "divisi"] },
  { key: "PAKET", label: "Paket MCU", group: "Identitas", aliases: ["paket", "package", "paket pemeriksaan"] },

  { key: "FS:TB", label: "Tinggi Badan", group: "Fisik", aliases: ["tb", "tinggi badan", "height", "fs:tb"] },
  { key: "FS:BB", label: "Berat Badan", group: "Fisik", aliases: ["bb", "berat badan", "weight", "fs:bb"] },
  { key: "FS:BMI", label: "BMI / IMT", group: "Fisik", aliases: ["bmi", "imt", "fs:bmi"] },
  { key: "FS:Tensi", label: "Tekanan Darah / Tensi", group: "Fisik", aliases: ["tensi", "td", "tekanan darah", "blood pressure", "fs:tensi"] },
  { key: "FS:Nadi", label: "Nadi", group: "Fisik", aliases: ["nadi", "pulse", "fs:nadi"] },
  { key: "FS:Nafas", label: "Nafas", group: "Fisik", aliases: ["nafas", "respirasi", "respiration", "fs:nafas"] },
  { key: "FS:ButaWarna", label: "Buta Warna", group: "Fisik", aliases: ["buta warna", "color blind", "fs:butawarna"] },

  { key: "DL:Hb", label: "Hemoglobin / Hb", group: "Laboratorium", aliases: ["hb", "hemoglobin", "dl:hb"] },
  { key: "DL:Leu", label: "Leukosit", group: "Laboratorium", aliases: ["leukosit", "leukocyte", "leu", "wbc", "dl:leu"] },
  { key: "DL:Ht", label: "Hematokrit", group: "Laboratorium", aliases: ["hematokrit", "ht", "hct", "dl:ht"] },
  { key: "DL:Trom", label: "Trombosit", group: "Laboratorium", aliases: ["trombosit", "platelet", "trom", "plt", "dl:trom"] },
  { key: "DL:Eri", label: "Eritrosit", group: "Laboratorium", aliases: ["eritrosit", "erythrocyte", "eri", "rbc", "dl:eri"] },

  { key: "GD:GDP", label: "Gula Darah Puasa / GDP", group: "Laboratorium", aliases: ["gdp", "gula darah puasa", "glukosa puasa", "gd:gdp"] },
  { key: "GD:Sewaktu", label: "Gula Darah Sewaktu / GDS", group: "Laboratorium", aliases: ["gds", "gula darah sewaktu", "glukosa sewaktu", "gd:sewaktu"] },
  { key: "LD:Chol", label: "Kolesterol Total", group: "Laboratorium", aliases: ["chol", "kolesterol", "kolesterol total", "ld:chol"] },
  { key: "LD:HDL", label: "HDL", group: "Laboratorium", aliases: ["hdl", "ld:hdl"] },
  { key: "LD:LDL", label: "LDL", group: "Laboratorium", aliases: ["ldl", "ld:ldl"] },
  { key: "LD:Trig", label: "Trigliserida", group: "Laboratorium", aliases: ["trigliserida", "trig", "ld:trig"] },
  { key: "FK:Ureum", label: "Ureum", group: "Laboratorium", aliases: ["ureum", "fk:ureum"] },
  { key: "FK:Kreatinin", label: "Kreatinin", group: "Laboratorium", aliases: ["kreatinin", "creatinine", "creat", "fk:kreatinin"] },
  { key: "FK:AsamUrat", label: "Asam Urat", group: "Laboratorium", aliases: ["asam urat", "uric acid", "fk:asamurat"] },
  { key: "FH:SGOT", label: "SGOT / AST", group: "Laboratorium", aliases: ["sgot", "ast", "fh:sgot"] },
  { key: "FH:SGPT", label: "SGPT / ALT", group: "Laboratorium", aliases: ["sgpt", "alt", "fh:sgpt"] },
  { key: "HP:HBsAg", label: "HBsAg", group: "Laboratorium", aliases: ["hbsag", "hp:hbsag"] },

  { key: "UR:Warna", label: "Urine - Warna", group: "Laboratorium", aliases: ["urine warna", "warna urine", "ur:warna"] },
  { key: "UR:Prot", label: "Urine - Protein", group: "Laboratorium", aliases: ["protein urine", "ur:prot"] },
  { key: "UR:Glu", label: "Urine - Glukosa", group: "Laboratorium", aliases: ["glukosa urine", "ur:glu"] },
  { key: "UR:Bakteri", label: "Urine - Bakteri", group: "Laboratorium", aliases: ["bakteri urine", "ur:bakteri"] },

  { key: "Thorax Foto", label: "Thorax Foto", group: "Penunjang", aliases: ["thorax", "rontgen", "thorax foto", "foto thorax"] },
  { key: "Hasilthorax", label: "Hasil Thorax", group: "Penunjang", aliases: ["hasil thorax", "hasilthorax", "kesan thorax"] },

  { key: "KESIMPULAN", label: "Kesimpulan", group: "Output PDF", aliases: ["kesimpulan", "conclusion"] },
  { key: "SARAN", label: "Saran", group: "Output PDF", aliases: ["saran", "recommendation", "rekomendasi"] },
  { key: "FIT_STATUS", label: "Status Fit", group: "Output PDF", aliases: ["fit status", "fit_status", "status fit", "status"] },
];

function norm(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function autoDetect(headers: string[]) {
  const mapping: Record<string, string> = {};

  for (const field of MAPPING_FIELDS) {
    const aliases = field.aliases.map(norm);
    let found = "";

    for (const header of headers) {
      const headerNorm = norm(header);
      if (aliases.includes(headerNorm)) {
        found = header;
        break;
      }
    }

    if (!found) {
      for (const header of headers) {
        const headerNorm = norm(header);
        if (aliases.some((alias) => alias && (headerNorm.includes(alias) || alias.includes(headerNorm)))) {
          found = header;
          break;
        }
      }
    }

    if (found) mapping[field.key] = found;
  }

  return mapping;
}

function firstValue(sampleRows: any[], header?: string) {
  if (!header) return "";

  for (const item of sampleRows || []) {
    const row = item?.row_data || item || {};
    const value = row?.[header];
    const text = String(value ?? "").trim();

    if (text && !["null", "undefined", "nan", "-"].includes(text.toLowerCase())) {
      return text;
    }
  }

  return "";
}

export default function AiMcuMappingPage() {
  const [programType, setProgramType] = useState("all");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [sourceId, setSourceId] = useState("");

  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [groupFilter, setGroupFilter] = useState<(typeof GROUP_OPTIONS)[number]>("Identitas");

  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const filteredFields = useMemo(() => {
    if (groupFilter === "Semua") return MAPPING_FIELDS;
    return MAPPING_FIELDS.filter((field) => field.group === groupFilter);
  }, [groupFilter]);

  const mappedCount = useMemo(() => {
    return MAPPING_FIELDS.filter((field) => Boolean(fieldMapping[field.key])).length;
  }, [fieldMapping]);

  const missingRequired = useMemo(() => {
    return MAPPING_FIELDS
      .filter((field) => field.required)
      .filter((field) => !fieldMapping[field.key]);
  }, [fieldMapping]);

  async function loadSources(nextProgram = programType) {
    setLoadingSources(true);
    setError("");
    setMessage("");
    setSources([]);
    setSourceId("");
    setHeaders([]);
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

      if (list[0]?.id) setSourceId(String(list[0].id));
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
    setHeaders([]);
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

      const nextHeaders = json.headers || [];
      const savedMapping = json.fieldMapping || {};
      const detected = Object.keys(savedMapping).length ? savedMapping : autoDetect(nextHeaders);

      setHeaders(nextHeaders);
      setSampleRows(json.sampleRows || []);
      setFieldMapping(detected);

      setMessage(
        `Header database terbaca: ${nextHeaders.length}. Row contoh: ${json.totalSampleRows || 0}. Mapping aktif: ${Object.keys(detected).length}.`
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

    if (missingRequired.length) {
      setError(`Mapping wajib belum lengkap: ${missingRequired.map((field) => field.label).join(", ")}.`);
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
    setFieldMapping(autoDetect(headers));
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
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Pilih database hasil upload Excel, lalu atur header Excel ke parameter standar.
              Mapping yang disimpan akan dipakai oleh Analisis MCU dan Generate PDF.
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
              href="/ai-mcu"
              className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Kembali
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

          <div className="mt-3 rounded-xl border bg-white p-3 text-xs text-slate-500">
            Database hasil upload Excel akan muncul di daftar ini karena tersimpan di tabel participant_sources.
            Header diambil dari tabel ai_mcu_import_rows.
          </div>
        </section>

        <section className="mt-5 rounded-2xl border bg-white p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-bold">2. Mapping Header ke Parameter</h2>
              <p className="mt-1 text-sm text-slate-600">
                Database aktif: <b>{selectedSource?.name || "-"}</b>
                {selectedSource?.institution_name ? ` · ${selectedSource.institution_name}` : ""}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
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
                onClick={resetAutoMapping}
                disabled={!headers.length || saving}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Auto Detect Ulang
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

          {!headers.length ? (
            <div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm text-slate-500">
              Pilih database hasil upload Excel untuk menampilkan header dan mapping.
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border bg-slate-50 p-4 text-sm">
                  Header terbaca: <b>{headers.length}</b>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4 text-sm">
                  Field mapped: <b>{mappedCount}</b>/{MAPPING_FIELDS.length}
                </div>
                <div className="rounded-xl border bg-slate-50 p-4 text-sm">
                  Row contoh: <b>{sampleRows.length}</b>
                </div>
              </div>

              {missingRequired.length ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  Mapping wajib belum lengkap: {missingRequired.map((field) => field.label).join(", ")}.
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                  Mapping wajib sudah lengkap. Data siap dipakai untuk Analisis MCU dan Generate PDF.
                </div>
              )}

              <div className="mt-4 overflow-hidden rounded-2xl border">
                <div className="grid grid-cols-[0.85fr_1.2fr_1fr_120px] bg-slate-100 px-3 py-3 text-xs font-black uppercase text-slate-600">
                  <div>Parameter AI MCU</div>
                  <div>Header Excel</div>
                  <div>Contoh Isi</div>
                  <div>Grup</div>
                </div>

                <div className="max-h-[560px] divide-y overflow-auto bg-white">
                  {filteredFields.map((field) => {
                    const selectedHeader = fieldMapping[field.key] || "";
                    const preview = firstValue(sampleRows, selectedHeader);

                    return (
                      <div
                        key={field.key}
                        className="grid grid-cols-[0.85fr_1.2fr_1fr_120px] items-center gap-3 px-3 py-3 text-sm"
                      >
                        <div>
                          <div className="font-bold text-slate-900">
                            {field.label}
                            {field.required ? <span className="text-red-600"> *</span> : null}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">{field.key}</div>
                        </div>

                        <select
                          value={selectedHeader}
                          onChange={(e) => updateMapping(field.key, e.target.value)}
                          disabled={saving}
                          className={`w-full rounded-xl border bg-white px-3 py-2 text-sm ${
                            field.required && !selectedHeader ? "border-red-300" : "border-slate-300"
                          }`}
                        >
                          <option value="">-- Tidak dipakai --</option>
                          {headers.map((header) => (
                            <option key={`${field.key}-${header}`} value={header}>
                              {header}
                            </option>
                          ))}
                        </select>

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
                        {headers.slice(0, 12).map((header) => (
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
                            {headers.slice(0, 12).map((header) => (
                              <td key={`${index}-${header}`} className="whitespace-nowrap p-2">
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
                disabled={saving || !!missingRequired.length}
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
