"use client";

import { useState } from "react";
import AuthGate from "@/components/AuthGate";

export default function CapaskaFinishedExportPage() {
  return (
    <AuthGate>
      {(user) => <ExportForm user={user} />}
    </AuthGate>
  );
}

function ExportForm({ user }: { user: any }) {
  const [sourceId, setSourceId] = useState("");
  const [includeAll, setIncludeAll] = useState(false);

  if (user.role !== "admin") {
    return <div className="card p-5 text-red-700">Hanya admin yang dapat export rekap peserta.</div>;
  }

  const exportUrl = sourceId
    ? `/api/export/capaska/finished-report?source_id=${encodeURIComponent(sourceId)}${includeAll ? "&all=1" : ""}`
    : "";

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="text-2xl font-black">Export Rekap Peserta Selesai</div>
        <div className="mt-1 text-sm text-slate-500">
          Export CAPASKA dibuat dalam 1 sheet agar mudah difilter. Status Normal berarti skor maksimal dan tidak ada temuan. Status Dengan Catatan langsung menampilkan daftar catatannya, termasuk TB/BB.
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <label className="label">Source ID / Database ID</label>
          <input
            className="input"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            placeholder="Contoh: 21"
            inputMode="numeric"
          />
          <div className="mt-2 text-xs text-slate-500">
            Gunakan Source ID yang muncul di daftar database peserta.
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold">
          <input
            type="checkbox"
            checked={includeAll}
            onChange={(e) => setIncludeAll(e.target.checked)}
          />
          Export semua peserta di database ini, bukan hanya yang terdeteksi selesai.
        </label>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
          Output berisi status dan catatan per stage: TB/BB, Mata, THT, Gigi, Penyakit Dalam, Jantung, Ortopedi, dan Radiologi.
        </div>

        <a
          className={`btn-primary inline-flex justify-center ${!sourceId ? "pointer-events-none opacity-50" : ""}`}
          href={exportUrl || "#"}
          target="_blank"
          rel="noreferrer"
        >
          Export Rekap Peserta Selesai
        </a>
      </section>
    </div>
  );
}
