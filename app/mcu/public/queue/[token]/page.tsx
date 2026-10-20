"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function McuPublicQueuePage({ params }: { params: { token: string } }) {
  const token = String(params?.token || "");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  async function load() {
    if (!token) return;
    try {
      const res = await fetch(`/api/mcu/public-queue?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal memuat antrian.");
      setData(json);
      setError("");
    } catch (err: any) {
      setError(err?.message || "Gagal memuat antrian.");
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 4000);
    return () => window.clearInterval(timer);
  }, [token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    QRCode.toDataURL(window.location.href, { margin: 1, width: 360 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [token]);

  if (error) {
    return <main className="min-h-screen bg-slate-950 p-6 text-white"><div className="mx-auto max-w-3xl rounded-3xl border border-red-300/20 bg-red-950/30 p-6 font-bold text-red-100">{error}</div></main>;
  }

  const session = data?.session || {};
  const a = data?.queues?.A || {};
  const b = data?.queues?.B || {};
  const aName = session?.track_a_name || "Lab Darah";
  const bName = session?.track_b_name || "Rontgen";

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white">
      <div className="mx-auto w-full max-w-[1600px] rounded-3xl border border-white/20 bg-slate-900 p-6 shadow-2xl">
        <div className="grid items-center gap-5 lg:grid-cols-[1fr_220px]">
          <div className="text-center lg:pl-12">
            <div className="text-sm font-black uppercase tracking-[0.3em] text-slate-300">Antrian MCU Corporate</div>
            <h1 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">{session?.package_name || "Paket MCU"}</h1>
            <div className="mt-3 text-base font-bold text-slate-200">{session?.company_name || "MCU Corporate"}</div>
          </div>

          <aside className="rounded-3xl bg-white p-3 text-center text-slate-950 shadow-xl">
            {qrDataUrl ? <img src={qrDataUrl} alt="QR Public Queue MCU" className="mx-auto h-40 w-40 rounded-xl" /> : <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-500">Membuat QR...</div>}
            <div className="mt-2 text-xs font-black uppercase tracking-wide text-blue-700">Scan Monitor</div>
            <div className="mt-1 text-[11px] font-semibold leading-snug text-slate-600">Buka tampilan antrian MCU ini di perangkat lain.</div>
          </aside>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <QueueCard track="A" name={aName} data={a} accent="blue" />
          <QueueCard track="B" name={bName} data={b} accent="violet" />
        </div>

        <div className="mt-6 text-center text-sm font-semibold text-slate-300">Halaman diperbarui otomatis setiap beberapa detik.</div>
      </div>
    </main>
  );
}

function QueueCard({ track, name, data, accent }: { track: "A" | "B"; name: string; data: any; accent: "blue" | "violet" }) {
  const textClass = accent === "blue" ? "text-blue-700" : "text-violet-700";
  return (
    <section className="rounded-3xl bg-white p-7 text-slate-950 shadow-xl">
      <div className={`text-center text-sm font-black uppercase tracking-[0.2em] ${textClass}`}>{track} · {name}</div>
      <div className="mt-3 text-center text-sm font-bold uppercase tracking-wide text-slate-500">Sedang Dipanggil</div>
      <div className={`mt-3 text-center text-7xl font-black leading-none sm:text-8xl ${textClass}`}>{data?.current?.queue_number || "-"}</div>
      <div className="mt-3 min-h-7 text-center text-xl font-black text-slate-900">{data?.current?.participant_name || "-"}</div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-slate-100 p-4 text-center"><div className="text-xs font-bold uppercase text-slate-500">Berikutnya</div><div className="mt-1 text-3xl font-black text-slate-950">{data?.next?.queue_number || "-"}</div><div className="mt-1 truncate text-xs font-bold text-slate-600">{data?.next?.participant_name || "-"}</div></div>
        <div className="rounded-2xl bg-slate-100 p-4 text-center"><div className="text-xs font-bold uppercase text-slate-500">Menunggu</div><div className="mt-1 text-3xl font-black text-slate-950">{data?.summary?.waiting ?? 0}</div></div>
        <div className="rounded-2xl bg-emerald-50 p-4 text-center"><div className="text-xs font-bold uppercase text-emerald-700">Selesai</div><div className="mt-1 text-3xl font-black text-emerald-700">{data?.summary?.done ?? 0}</div></div>
      </div>
    </section>
  );
}
