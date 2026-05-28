"use client";

import { useEffect, useMemo, useState } from "react";

export default function PublicVaccinationQueuePage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  async function load() {
    const json = await fetch(`/api/vaccination/public-queue?token=${params.token}`, { cache: "no-store" }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Antrian tidak ditemukan."); return; }
    setData(json);
  }

  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [params.token]);

  const nextWaiting = useMemo(() => (data?.registrations || []).find((r: any) => ["WAITING", "REGISTERED"].includes(r.queue_status)), [data]);

  if (error) return <main className="p-6 text-red-700">{error}</main>;

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white">
      <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur">
        <div className="text-center"><div className="text-sm uppercase tracking-[0.25em] text-slate-300">Antrian Vaksinasi</div><h1 className="mt-2 text-2xl font-black">{data?.session?.session_name || "Loading..."}</h1><p className="mt-1 text-sm text-slate-300">{data?.session?.company_name || ""} · {data?.session?.location || ""}</p></div>
        <section className="mt-8 rounded-3xl bg-white p-8 text-center text-slate-950"><div className="text-sm font-bold uppercase text-slate-500">Sedang Dipanggil</div><div className="mt-3 text-7xl font-black text-blue-700">{data?.session?.current_queue_number || "-"}</div></section>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/10 p-4 text-center"><div className="text-xs text-slate-300">Total</div><div className="text-3xl font-black">{data?.summary?.total ?? "-"}</div></div>
          <div className="rounded-2xl bg-white/10 p-4 text-center"><div className="text-xs text-slate-300">Menunggu</div><div className="text-3xl font-black">{data?.summary?.waiting ?? "-"}</div></div>
          <div className="rounded-2xl bg-white/10 p-4 text-center"><div className="text-xs text-slate-300">Berikutnya</div><div className="text-3xl font-black">{nextWaiting?.queue_number || "-"}</div></div>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">Halaman ini update otomatis setiap beberapa detik.</p>
      </div>
    </main>
  );
}
