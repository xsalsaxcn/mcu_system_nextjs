"use client";

import { useEffect, useMemo, useState } from "react";

type PreviewRow = {
  id: string;
  name: string;
  nomcu: string;
  nik: string;
  gender: string;
  age: string;
  company: string;
  department: string;
  bb: string;
  tb: string;
  bmi: string;
  tensi: string;
  sgot: string;
  sgpt: string;
  conclusion: string;
  suggestion: string;
  fitStatus: string;
};

type PreviewResponse = {
  ok: boolean;
  message?: string;
  rows?: PreviewRow[];
};

export default function AiMcuPreviewPage() {
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [keyword, setKeyword] = useState("");

  async function loadPreview() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/ai-mcu/preview", {
        cache: "no-store",
      });

      const json: PreviewResponse = await res.json();

      if (!res.ok || !json.ok) {
        setMessage(json.message || "Gagal memuat preview.");
        return;
      }

      setRows(json.rows || []);
      setMessage(json.message || "Preview data berhasil dimuat.");
    } catch (error: any) {
      setMessage(error?.message || "Gagal memuat preview.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPreview();
  }, []);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    if (!q) return rows;

    return rows.filter((row) => {
      return [
        row.name,
        row.nomcu,
        row.nik,
        row.company,
        row.department,
        row.fitStatus,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, keyword]);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Preview Data AI MCU</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Halaman ini menampilkan preview data peserta setelah upload Excel
              dan mapping header. Tahap ini masih menggunakan sample data agar
              struktur workflow aman sebelum engine AI MCU disambungkan.
            </p>
          </div>

          <a
            href="/ai-mcu"
            className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Kembali
          </a>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto_auto_auto]">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            placeholder="Cari nama / No MCU / NIK / status..."
          />

          <button
            type="button"
            onClick={loadPreview}
            disabled={loading}
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? "Memuat..." : "Refresh"}
          </button>

          <a
            href="/ai-mcu/edit"
            className="rounded-xl border border-blue-300 bg-blue-50 px-5 py-3 text-center text-sm font-bold text-blue-700 hover:bg-blue-100"
          >
            Edit Data
          </a>

          <a
            href="/ai-mcu/corporate/generate"
            className="rounded-xl bg-emerald-600 px-5 py-3 text-center text-sm font-bold text-white hover:bg-emerald-700"
          >
            Generate PDF
          </a>
        </div>

        {message ? (
          <div className="mt-4 rounded-xl border bg-slate-50 p-4 text-sm font-semibold text-slate-700">
            {message}
          </div>
        ) : null}

        <div className="mt-6 overflow-x-auto rounded-2xl border">
          <table className="min-w-[1300px] w-full border-collapse bg-white text-sm">
            <thead className="bg-slate-100 text-left text-slate-700">
              <tr>
                <th className="border-b px-3 py-3">No</th>
                <th className="border-b px-3 py-3">Nama</th>
                <th className="border-b px-3 py-3">No MCU</th>
                <th className="border-b px-3 py-3">NIK</th>
                <th className="border-b px-3 py-3">JK</th>
                <th className="border-b px-3 py-3">Usia</th>
                <th className="border-b px-3 py-3">Perusahaan</th>
                <th className="border-b px-3 py-3">Dept</th>
                <th className="border-b px-3 py-3">BB</th>
                <th className="border-b px-3 py-3">TB</th>
                <th className="border-b px-3 py-3">BMI</th>
                <th className="border-b px-3 py-3">Tensi</th>
                <th className="border-b px-3 py-3">SGOT</th>
                <th className="border-b px-3 py-3">SGPT</th>
                <th className="border-b px-3 py-3">Status</th>
                <th className="border-b px-3 py-3">Kesimpulan</th>
                <th className="border-b px-3 py-3">Saran</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((row, index) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="border-b px-3 py-3">{index + 1}</td>
                  <td className="border-b px-3 py-3 font-bold">{row.name}</td>
                  <td className="border-b px-3 py-3">{row.nomcu}</td>
                  <td className="border-b px-3 py-3">{row.nik}</td>
                  <td className="border-b px-3 py-3">{row.gender}</td>
                  <td className="border-b px-3 py-3">{row.age}</td>
                  <td className="border-b px-3 py-3">{row.company}</td>
                  <td className="border-b px-3 py-3">{row.department}</td>
                  <td className="border-b px-3 py-3">{row.bb}</td>
                  <td className="border-b px-3 py-3">{row.tb}</td>
                  <td className="border-b px-3 py-3">{row.bmi}</td>
                  <td className="border-b px-3 py-3">{row.tensi}</td>
                  <td className="border-b px-3 py-3">{row.sgot}</td>
                  <td className="border-b px-3 py-3">{row.sgpt}</td>
                  <td className="border-b px-3 py-3">
                    <span
                      className={[
                        "rounded-full px-3 py-1 text-xs font-bold",
                        row.fitStatus === "FIT"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700",
                      ].join(" ")}
                    >
                      {row.fitStatus}
                    </span>
                  </td>
                  <td className="max-w-[260px] border-b px-3 py-3">
                    {row.conclusion}
                  </td>
                  <td className="max-w-[300px] border-b px-3 py-3">
                    {row.suggestion}
                  </td>
                </tr>
              ))}

              {!filteredRows.length ? (
                <tr>
                  <td
                    colSpan={17}
                    className="border-b px-3 py-8 text-center text-slate-500"
                  >
                    Tidak ada data preview.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          Total data: {filteredRows.length} dari {rows.length} peserta.
        </div>
      </div>
    </main>
  );
}