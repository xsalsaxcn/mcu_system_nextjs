"use client";

import { useMemo, useState } from "react";

type MappingResult = {
  ok: boolean;
  message?: string;
  detected?: Record<string, string>;
  unmapped?: string[];
};

const TARGET_FIELDS = [
  { key: "name", label: "Nama Peserta" },
  { key: "nomcu", label: "No MCU" },
  { key: "nik", label: "NIK / ID" },
  { key: "gender", label: "Jenis Kelamin" },
  { key: "dob", label: "Tanggal Lahir" },
  { key: "age", label: "Usia" },
  { key: "company", label: "Perusahaan" },
  { key: "department", label: "Departemen" },
  { key: "mcuDate", label: "Tanggal MCU" },
  { key: "bb", label: "Berat Badan" },
  { key: "tb", label: "Tinggi Badan" },
  { key: "bmi", label: "BMI" },
  { key: "tensi", label: "Tekanan Darah" },
  { key: "butaWarna", label: "Buta Warna" },
  { key: "mata", label: "Mata / Visus" },
  { key: "fisik", label: "Pemeriksaan Fisik" },
  { key: "sgot", label: "SGOT" },
  { key: "sgpt", label: "SGPT" },
  { key: "chol", label: "Kolesterol" },
  { key: "hdl", label: "HDL" },
  { key: "ldl", label: "LDL" },
  { key: "trig", label: "Trigliserida" },
  { key: "gds", label: "Gula Darah Sewaktu" },
  { key: "gdp", label: "GDP" },
  { key: "ureum", label: "Ureum" },
  { key: "kreatinin", label: "Kreatinin" },
  { key: "asamUrat", label: "Asam Urat" },
  { key: "conclusion", label: "Kesimpulan" },
  { key: "suggestion", label: "Saran" },
];

const SAMPLE_HEADERS = [
  "NAMA",
  "NOMCU",
  "NIK",
  "JK",
  "TGLLAHIR",
  "USIA",
  "Nama PT",
  "DEPARTEMEN",
  "Tanggal MCU",
  "FS:BB",
  "FS:TB",
  "FS:BMI",
  "FS:Tensi",
  "FS:ButaWarna",
  "FS:TnpKcMata",
  "FH:SGOT",
  "FH:SGPT",
  "LD:Chol",
  "LD:HDL",
  "LD:LDL",
  "LD:Trig",
  "GD:Sewaktu",
  "GD:GDP",
  "FK:Ureum",
  "FK:Kreatinin",
  "FK:AsamUrat",
  "KESIMPULAN",
  "SARAN",
];

export default function AiMcuMappingPage() {
  const [preset, setPreset] = useState("autodetect");
  const [headersText, setHeadersText] = useState(SAMPLE_HEADERS.join("\n"));
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<MappingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const headers = useMemo(() => {
    return headersText
      .split(/\r?\n|,/)
      .map((x) => x.trim())
      .filter(Boolean);
  }, [headersText]);

  function updateManualMapping(key: string, value: string) {
    setMapping((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function runAutoDetect() {
    setLoading(true);
    setMessage("");
    setResult(null);

    try {
      const res = await fetch("/api/ai-mcu/mapping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          preset,
          headers,
          manualMapping: mapping,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setMessage(json.message || "Mapping gagal.");
        return;
      }

      setResult(json);
      setMapping(json.detected || {});
      setMessage(json.message || "Mapping berhasil.");
    } catch (error: any) {
      setMessage(error?.message || "Mapping gagal.");
    } finally {
      setLoading(false);
    }
  }

  function resetSample() {
    setHeadersText(SAMPLE_HEADERS.join("\n"));
    setMapping({});
    setResult(null);
    setMessage("");
  }

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Mapping Header AI MCU</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Mapping header digunakan agar format Excel yang berbeda tetap bisa
              dibaca oleh AI MCU Analyzer. Mode Auto Detect akan mencocokkan
              header otomatis, sedangkan Manual Mapping bisa dipilih sendiri.
            </p>
          </div>

          <a
            href="/ai-mcu"
            className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Kembali
          </a>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border bg-slate-50 p-5">
            <h2 className="text-lg font-bold">1. Header Excel</h2>
            <p className="mt-1 text-sm text-slate-600">
              Untuk tahap awal, paste daftar header Excel di sini. Nanti bagian
              ini akan otomatis mengambil header dari file upload.
            </p>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Preset
              </label>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              >
                <option value="autodetect">Auto Detect</option>
                <option value="manual">Manual Mapping</option>
              </select>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Daftar Header
              </label>
              <textarea
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
                className="min-h-80 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm"
                placeholder="Paste header Excel di sini, satu header per baris."
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={runAutoDetect}
                disabled={loading}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Memproses..." : "Generate Mapping"}
              </button>

              <button
                type="button"
                onClick={resetSample}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Reset Sample
              </button>
            </div>

            {message ? (
              <div className="mt-4 rounded-xl border bg-white p-4 text-sm font-semibold text-slate-700">
                {message}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-bold">2. Manual / Auto Mapping</h2>
            <p className="mt-1 text-sm text-slate-600">
              Pilih header sumber untuk setiap field target. Hasil ini nanti
              dipakai untuk membaca data peserta, hasil lab, fisik, penunjang,
              kesimpulan, dan saran.
            </p>

            <div className="mt-4 max-h-[620px] space-y-3 overflow-y-auto pr-2">
              {TARGET_FIELDS.map((field) => (
                <div
                  key={field.key}
                  className="grid gap-2 rounded-xl border bg-slate-50 p-3 md:grid-cols-[180px_1fr]"
                >
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {field.label}
                    </div>
                    <div className="text-xs text-slate-500">{field.key}</div>
                  </div>

                  <select
                    value={mapping[field.key] || ""}
                    onChange={(e) =>
                      updateManualMapping(field.key, e.target.value)
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">- Tidak Dimapping -</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>
        </div>

        {result?.ok ? (
          <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <h2 className="font-bold text-emerald-900">Mapping Result</h2>
            <p className="mt-1 text-sm text-emerald-800">
              Field berhasil dimapping:{" "}
              <b>{Object.values(result.detected || {}).filter(Boolean).length}</b>
            </p>

            {result.unmapped?.length ? (
              <div className="mt-3 text-sm text-amber-800">
                Belum termapping: {result.unmapped.join(", ")}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href="/ai-mcu/preview"
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
              >
                Lanjut Preview Data
              </a>

              <a
                href="/ai-mcu/upload"
                className="rounded-xl border border-emerald-300 bg-white px-5 py-3 text-sm font-bold text-emerald-700 hover:bg-emerald-50"
              >
                Kembali Upload
              </a>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}