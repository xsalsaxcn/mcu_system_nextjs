"use client";

import { useMemo, useState } from "react";

type MappingField = {
  key: string;
  label: string;
  aliases: string[];
  required?: boolean;
  group: "Identitas" | "Fisik" | "Laboratorium" | "Penunjang" | "Output PDF";
};

const PROGRAM_OPTIONS = [
  { value: "corporate", label: "Corporate" },
  { value: "capaska", label: "CAPASKA" },
];

const MAPPING_FIELDS: MappingField[] = [
  { key: "NAMA", label: "Nama Peserta", required: true, group: "Identitas", aliases: ["nama", "nama peserta", "nama karyawan", "name", "patient name"] },
  { key: "NOMCU", label: "No MCU", required: true, group: "Identitas", aliases: ["nomcu", "no mcu", "no.mcu", "nomor mcu", "mcu id", "barcode", "no peserta"] },
  { key: "NIK", label: "NIK / NRP / ID", group: "Identitas", aliases: ["nik", "ktp", "nik/nrp/id", "nrp", "id karyawan", "employee id"] },
  { key: "JK", label: "Jenis Kelamin", group: "Identitas", aliases: ["jk", "jenis kelamin", "gender", "sex"] },
  { key: "TGLLAHIR", label: "Tanggal Lahir", group: "Identitas", aliases: ["tgllahir", "tanggal lahir", "tgl lahir", "birth date", "dob"] },
  { key: "USIA", label: "Usia", group: "Identitas", aliases: ["usia", "umur", "age"] },
  { key: "DEPARTEMEN", label: "Departemen / Unit", group: "Identitas", aliases: ["departemen", "department", "bagian", "unit", "divisi"] },
  { key: "PAKET", label: "Paket MCU", group: "Identitas", aliases: ["paket", "package", "paket pemeriksaan"] },

  { key: "FS:TB", label: "Tinggi Badan", group: "Fisik", aliases: ["tb", "tinggi badan", "height", "fs:tb"] },
  { key: "FS:BB", label: "Berat Badan", group: "Fisik", aliases: ["bb", "berat badan", "weight", "fs:bb"] },
  { key: "FS:BMI", label: "BMI", group: "Fisik", aliases: ["bmi", "imt", "fs:bmi"] },
  { key: "FS:Tensi", label: "Tekanan Darah / Tensi", group: "Fisik", aliases: ["tensi", "td", "tekanan darah", "blood pressure", "fs:tensi"] },
  { key: "FS:Nadi", label: "Nadi", group: "Fisik", aliases: ["nadi", "pulse", "fs:nadi"] },
  { key: "FS:Nafas", label: "Nafas", group: "Fisik", aliases: ["nafas", "respirasi", "respiration", "fs:nafas"] },
  { key: "FS:ButaWarna", label: "Buta Warna", group: "Fisik", aliases: ["buta warna", "buta warna", "color blind", "fs:butawarna"] },

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

function groupFields() {
  return MAPPING_FIELDS.reduce<Record<string, MappingField[]>>((acc, field) => {
    if (!acc[field.group]) acc[field.group] = [];
    acc[field.group].push(field);
    return acc;
  }, {});
}

export default function AiMcuUploadPage() {
  const [programType, setProgramType] = useState("corporate");
  const [companyName, setCompanyName] = useState("");
  const [databaseName, setDatabaseName] = useState("");
  const [presetMapping, setPresetMapping] = useState("auto");
  const [file, setFile] = useState<File | null>(null);

  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, any>[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [mappingReady, setMappingReady] = useState(false);

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);

  const fieldsByGroup = useMemo(() => groupFields(), []);

  async function parseExcel(nextFile: File | null) {
    setFile(nextFile);
    setHeaders([]);
    setSampleRows([]);
    setFieldMapping({});
    setMappingReady(false);
    setMessage("");
    setResult(null);

    if (!nextFile) return;

    setLoadingPreview(true);

    try {
      const XLSX = await import("xlsx");
      const buffer = await nextFile.arrayBuffer();
      const workbook = XLSX.read(buffer, {
        type: "array",
        cellDates: true,
        raw: false,
      });

      const firstSheetName = workbook.SheetNames?.[0];
      if (!firstSheetName) {
        setMessage("Sheet Excel tidak ditemukan.");
        return;
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
        defval: "",
        raw: false,
      });

      if (!rows.length) {
        setMessage("Excel kosong atau header tidak terbaca.");
        return;
      }

      const detectedHeaders = Object.keys(rows[0] || {});
      const detectedMapping = autoDetect(detectedHeaders);

      setHeaders(detectedHeaders);
      setSampleRows(rows.slice(0, 5));
      setFieldMapping(detectedMapping);
      setMappingReady(true);
      setMessage(`Header terbaca: ${detectedHeaders.length}. Mapping otomatis berhasil: ${Object.keys(detectedMapping).length} field.`);
    } catch (err: any) {
      setMessage(err?.message || "Gagal membaca Excel.");
    } finally {
      setLoadingPreview(false);
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

  function missingRequiredFields() {
    return MAPPING_FIELDS
      .filter((field) => field.required)
      .filter((field) => !fieldMapping[field.key]);
  }

  async function uploadExcel() {
    setMessage("");
    setResult(null);

    if (!companyName.trim()) {
      setMessage("Nama perusahaan / instansi wajib diisi.");
      return;
    }

    if (!databaseName.trim()) {
      setMessage("Nama database wajib diisi.");
      return;
    }

    if (!file) {
      setMessage("Pilih file Excel terlebih dahulu.");
      return;
    }

    const missing = missingRequiredFields();
    if (missing.length) {
      setMessage(`Mapping wajib belum lengkap: ${missing.map((x) => x.label).join(", ")}.`);
      return;
    }

    const form = new FormData();
    form.append("programType", programType);
    form.append("companyName", companyName.trim());
    form.append("databaseName", databaseName.trim());
    form.append("presetMapping", presetMapping);
    form.append("fieldMapping", JSON.stringify(fieldMapping));
    form.append("file", file);

    setLoading(true);
    setMessage("Mengupload, menyimpan mapping, dan membaca Excel...");

    try {
      const res = await fetch("/api/ai-mcu/upload", {
        method: "POST",
        body: form,
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setMessage(json.message || "Upload Excel gagal.");
        setResult(json);
        return;
      }

      setResult(json);
      setMessage(json.message || "Excel berhasil diupload.");
    } catch (err: any) {
      setMessage(err?.message || "Upload Excel gagal.");
    } finally {
      setLoading(false);
    }
  }

  const requiredMissing = missingRequiredFields();

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Upload Excel AI MCU</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Upload Excel, isi nama perusahaan dan nama database, lalu mapping header ke parameter.
              Mapping ini dipakai langsung untuk Analisis MCU dan Generate PDF.
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

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border bg-slate-50 p-5">
            <h2 className="text-lg font-bold">1. Informasi Database</h2>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Jenis Program
              </label>
              <select
                value={programType}
                onChange={(e) => setProgramType(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              >
                {PROGRAM_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Nama Perusahaan / Instansi
              </label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={loading}
                placeholder="Contoh: PT Sehat Sentosa / BPIP"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              />
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Nama Database
              </label>
              <input
                value={databaseName}
                onChange={(e) => setDatabaseName(e.target.value)}
                disabled={loading}
                placeholder="Contoh: MCU PT Sehat Mei 2026"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              />
              <div className="mt-2 text-xs text-slate-500">
                Nama ini akan muncul di dropdown database pada Analisis MCU dan Generate PDF.
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-bold">2. File Excel</h2>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-bold text-slate-700">
                File Excel
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={loading || loadingPreview}
                onChange={(e) => parseExcel(e.target.files?.[0] || null)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              />
              <div className="mt-2 text-xs text-slate-500">
                Setelah file dipilih, header akan langsung dibaca dan mapping muncul di bawah.
              </div>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Preset Mapping
              </label>
              <select
                value={presetMapping}
                onChange={(e) => setPresetMapping(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              >
                <option value="auto">Auto Detect</option>
                <option value="manual">Manual Mapping</option>
              </select>
            </div>

            {message ? (
              <div
                className={`mt-4 rounded-xl border p-4 text-sm font-semibold ${
                  result?.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                {message}
              </div>
            ) : null}
          </section>
        </div>

        <section className="mt-5 rounded-2xl border bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-bold">3. Mapping Header ke Parameter</h2>
              <p className="mt-1 text-sm text-slate-600">
                Cocokkan header Excel dengan parameter standar AI MCU. Field wajib: Nama Peserta dan No MCU.
              </p>
            </div>

            <button
              type="button"
              onClick={resetAutoMapping}
              disabled={!headers.length || loading}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Auto Detect Ulang
            </button>
          </div>

          {!mappingReady ? (
            <div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm text-slate-500">
              Pilih file Excel terlebih dahulu untuk menampilkan mapping header.
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {requiredMissing.length ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  Mapping wajib belum lengkap: {requiredMissing.map((x) => x.label).join(", ")}.
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                  Mapping wajib sudah lengkap. Data siap diupload ke database AI MCU.
                </div>
              )}

              {Object.entries(fieldsByGroup).map(([group, fields]) => (
                <div key={group} className="rounded-2xl border">
                  <div className="border-b bg-slate-50 px-4 py-3 font-black text-slate-900">
                    {group}
                  </div>

                  <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                    {fields.map((field) => (
                      <div key={field.key}>
                        <label className="mb-2 block text-xs font-black uppercase text-slate-600">
                          {field.label}
                          {field.required ? <span className="text-red-600"> *</span> : null}
                        </label>
                        <select
                          value={fieldMapping[field.key] || ""}
                          onChange={(e) => updateMapping(field.key, e.target.value)}
                          disabled={loading}
                          className={`w-full rounded-xl border bg-white px-3 py-2 text-sm ${
                            field.required && !fieldMapping[field.key]
                              ? "border-red-300"
                              : "border-slate-300"
                          }`}
                        >
                          <option value="">-- Tidak dipakai --</option>
                          {headers.map((header) => (
                            <option key={`${field.key}-${header}`} value={header}>
                              {header}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {sampleRows.length ? (
          <section className="mt-5 rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-bold">Preview 5 Baris Pertama</h2>

            <div className="mt-4 overflow-auto rounded-xl border">
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
                  {sampleRows.map((row, index) => (
                    <tr key={index}>
                      {headers.slice(0, 12).map((header) => (
                        <td key={`${index}-${header}`} className="whitespace-nowrap p-2">
                          {String(row[header] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {headers.length > 12 ? (
              <div className="mt-2 text-xs text-slate-500">
                Preview hanya menampilkan 12 kolom pertama dari total {headers.length} kolom.
              </div>
            ) : null}
          </section>
        ) : null}

        <button
          type="button"
          onClick={uploadExcel}
          disabled={loading || loadingPreview || !mappingReady || !!requiredMissing.length}
          className="mt-6 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Uploading..." : "Upload Excel & Simpan Mapping"}
        </button>

        {result?.ok ? (
          <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <h2 className="text-lg font-bold text-emerald-900">Upload Berhasil</h2>

            <div className="mt-3 grid gap-2 text-sm text-emerald-800 md:grid-cols-2">
              <div>
                Database: <b>{result.source?.name}</b>
              </div>
              <div>
                Program: <b>{result.source?.program_type}</b>
              </div>
              <div>
                Perusahaan/Instansi: <b>{result.source?.institution_name}</b>
              </div>
              <div>
                Peserta tersimpan: <b>{result.totalParticipants}</b>
              </div>
              <div>
                Row Excel terbaca: <b>{result.totalExcelRows}</b>
              </div>
              <div>
                Row data MCU tersimpan: <b>{result.totalStoredRows}</b>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="/ai-mcu/analyze"
                className="rounded-xl bg-purple-600 px-5 py-3 text-sm font-bold text-white hover:bg-purple-700"
              >
                Lanjut Analisis MCU
              </a>

              <a
                href="/ai-mcu/generate"
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
              >
                Lanjut Generate PDF
              </a>

              <a
                href="/ai-mcu/preview"
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Preview Data
              </a>
            </div>
          </section>
        ) : null}

        {result && !result.ok ? (
          <pre className="mt-5 max-h-72 overflow-auto rounded-xl border bg-slate-50 p-4 text-xs text-slate-700">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : null}
      </div>
    </main>
  );
}
