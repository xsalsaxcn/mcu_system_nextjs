"use client";

import { useState } from "react";
import AuthGate from "@/components/AuthGate";

export default function WellnessStravaApprovalPage() {
  return <AuthGate>{() => <StravaApproval />}</AuthGate>;
}

function StravaApproval() {
  const [approved, setApproved] = useState(false);
  const [message, setMessage] = useState("Baca persetujuan sebelum menghubungkan Strava.");
  const [loading, setLoading] = useState(false);

  async function connect() {
    if (!approved) {
      setMessage("Centang persetujuan terlebih dahulu.");
      return;
    }
    setLoading(true);
    setMessage("Menyimpan persetujuan...");
    const json = await fetch("/api/wellness/strava/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved: true }),
    }).then((r) => r.json()).catch(() => ({ ok: false, message: "Gagal menghubungi server." }));
    setLoading(false);
    if (!json.ok) {
      setMessage(json.message || "Gagal menyimpan persetujuan.");
      return;
    }
    window.location.href = json.redirect || "/api/wellness/strava/connect";
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-orange-500 via-rose-600 to-fuchsia-600 shadow-sm">
        <div className="p-7 text-white">
          <div className="text-3xl font-black">Persetujuan Koneksi Strava</div>
          <div className="mt-2 max-w-2xl text-sm font-medium text-orange-50">Smartwatch peserta dapat sinkron ke Strava, lalu Harmony Health App mengambil ringkasan aktivitas untuk dashboard Wellness.</div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-3 text-sm font-semibold leading-7 text-slate-700">
          <p>Dengan menekan tombol Connect Strava, peserta menyetujui Harmony Health App membaca data aktivitas dari Strava yang diperlukan untuk program Wellness.</p>
          <p>Data yang dipakai untuk dashboard adalah ringkasan aktivitas seperti jenis aktivitas, durasi, jarak, tanggal, dan estimasi kalori. Data ini dipakai untuk pemantauan program Wellness.</p>
          <p>Koneksi Strava bersifat opsional. Peserta tetap bisa input aktivitas manual tanpa Strava.</p>
        </div>

        <label className="mt-6 flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm font-bold leading-6 text-orange-900">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
          Saya setuju menghubungkan akun Strava untuk sinkronisasi aktivitas Wellness.
        </label>

        <div className="mt-5 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">{message}</div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <button type="button" disabled={loading} onClick={connect} className="rounded-2xl bg-orange-500 px-5 py-4 text-sm font-black text-white shadow-sm disabled:opacity-60">{loading ? "Memproses..." : "Setuju & Connect Strava"}</button>
          <a href="/wellness/profile" className="rounded-2xl border border-slate-300 px-5 py-4 text-center text-sm font-black text-slate-700">Nanti Saja</a>
        </div>
      </section>
    </div>
  );
}
