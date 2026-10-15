"use client";

import { useEffect, useMemo, useState } from "react";

function queueNumberValue(value: any) {
  const text = String(value || "");
  const match = text.match(/(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export default function PublicVaccinationQueuePage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  async function load() {
    const json = await fetch(`/api/vaccination/public-queue?token=${params.token}`, { cache: "no-store" }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Antrian tidak ditemukan."); return; }
    setData(json);
  }

  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [params.token]);

  const waitingList = useMemo(() => {
    const rows = data?.registrations || [];
    return rows
      .filter((r: any) => ["WAITING", "WAITING_WITH_NOTE", "REGISTERED"].includes(String(r.queue_status || "").toUpperCase()))
      .sort((a: any, b: any) => queueNumberValue(a.queue_number) - queueNumberValue(b.queue_number) || String(a.queue_number || "").localeCompare(String(b.queue_number || "")));
  }, [data]);

  const nextWaiting = waitingList[0];
  if (error) return <main className="p-6 text-red-700">{error}</main>;

  if (data?.dualQueue) {
    const a = data?.queues?.A || {};
    const b = data?.queues?.B || {};
    return (
      <main className="min-h-screen bg-slate-950 p-4 text-white">
        <div className="mx-auto max-w-6xl rounded-3xl border border-white/15 bg-slate-900/95 p-6 shadow-2xl backdrop-blur">
          <div className="text-center">
            <div className="text-sm font-bold uppercase tracking-[0.35em] text-slate-200">Antrian Healthday + Bazar</div>
            <h1 className="mt-4 text-3xl font-black leading-tight text-white drop-shadow sm:text-4xl">{data?.session?.session_name || "Loading..."}</h1>
            <p className="mt-3 text-base font-semibold text-slate-100">{data?.session?.company_name || ""}{data?.session?.location ? ` · ${data.session.location}` : ""}</p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <section className="rounded-3xl bg-white p-7 text-slate-950 shadow-xl">
              <div className="text-center text-sm font-black uppercase tracking-[0.2em] text-blue-700">A · Healthday</div>
              <div className="mt-3 text-center text-sm font-bold uppercase tracking-wide text-slate-500">Sedang Dipanggil</div>
              <div className="mt-3 text-center text-7xl font-black leading-none text-blue-700 sm:text-8xl">{a?.current?.queue_number || "-"}</div>
              <div className="mt-3 min-h-7 text-center text-xl font-black text-slate-900">{a?.current?.participant_name || "-"}</div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-100 p-4 text-center"><div className="text-xs font-bold uppercase text-slate-500">Berikutnya</div><div className="mt-1 text-3xl font-black text-slate-950">{a?.next?.queue_number || "-"}</div><div className="mt-1 truncate text-xs font-bold text-slate-600">{a?.next?.participant_name || "-"}</div></div>
                <div className="rounded-2xl bg-slate-100 p-4 text-center"><div className="text-xs font-bold uppercase text-slate-500">Menunggu</div><div className="mt-1 text-3xl font-black text-slate-950">{a?.summary?.waiting ?? 0}</div></div>
              </div>
            </section>

            <section className="rounded-3xl bg-white p-7 text-slate-950 shadow-xl">
              <div className="text-center text-sm font-black uppercase tracking-[0.2em] text-violet-700">B · Bazar</div>
              <div className="mt-3 text-center text-sm font-bold uppercase tracking-wide text-slate-500">Sedang Dipanggil</div>
              <div className="mt-3 text-center text-7xl font-black leading-none text-violet-700 sm:text-8xl">{b?.current?.bazar_queue_number || "-"}</div>
              <div className="mt-3 min-h-7 text-center text-xl font-black text-slate-900">{b?.current?.participant_name || "-"}</div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-100 p-4 text-center"><div className="text-xs font-bold uppercase text-slate-500">Berikutnya</div><div className="mt-1 text-3xl font-black text-slate-950">{b?.next?.bazar_queue_number || "-"}</div><div className="mt-1 truncate text-xs font-bold text-slate-600">{b?.next?.participant_name || "-"}</div></div>
                <div className="rounded-2xl bg-slate-100 p-4 text-center"><div className="text-xs font-bold uppercase text-slate-500">Menunggu</div><div className="mt-1 text-3xl font-black text-slate-950">{b?.summary?.waiting ?? 0}</div></div>
              </div>
            </section>
          </div>
          <p className="mt-6 text-center text-sm text-slate-300">Halaman ini update otomatis setiap beberapa detik.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white">
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/15 bg-slate-900/95 p-6 shadow-2xl backdrop-blur">
        <div className="text-center">
          <div className="text-sm font-bold uppercase tracking-[0.35em] text-slate-200">Antrian Vaksinasi</div>
          <h1 className="mt-4 text-3xl font-black leading-tight text-white drop-shadow sm:text-4xl">{data?.session?.session_name || "Loading..."}</h1>
          <p className="mt-3 text-base font-semibold text-slate-100">{data?.session?.company_name || ""}{data?.session?.location ? ` · ${data.session.location}` : ""}</p>
        </div>
        <section className="mt-8 rounded-3xl bg-white p-8 text-center text-slate-950 shadow-xl">
          <div className="text-base font-black uppercase tracking-wide text-slate-600">Sedang Dipanggil</div>
          <div className="mt-4 text-8xl font-black leading-none text-blue-700 sm:text-9xl">{data?.session?.current_queue_number || "-"}</div>
        </section>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/15 p-4 text-center ring-1 ring-white/10"><div className="text-sm font-semibold text-slate-200">Total</div><div className="mt-1 text-4xl font-black text-white">{data?.summary?.total ?? "-"}</div></div>
          <div className="rounded-2xl bg-white/15 p-4 text-center ring-1 ring-white/10"><div className="text-sm font-semibold text-slate-200">Menunggu</div><div className="mt-1 text-4xl font-black text-white">{data?.summary?.waiting ?? "-"}</div></div>
          <div className="rounded-2xl bg-white/15 p-4 text-center ring-1 ring-white/10"><div className="text-sm font-semibold text-slate-200">Berikutnya</div><div className="mt-1 text-4xl font-black text-white">{nextWaiting?.queue_number || "-"}</div></div>
        </div>
        <p className="mt-6 text-center text-sm text-slate-300">Halaman ini update otomatis setiap beberapa detik.</p>
      </div>
    </main>
  );
}
