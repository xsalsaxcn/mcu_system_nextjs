"use client";

import { useEffect, useState } from "react";

export default function VaccinationMedisHomePage() {
  const [summary, setSummary] = useState<any>({});
  const [name, setName] = useState("Medis");

  useEffect(() => {
    fetch("/api/vaccination/medis/report", { cache: "no-store" })
      .then((response) => response.json())
      .then((json) => {
        if (!json?.ok) return;
        setSummary(json.summary || {});
        setName(json.owner?.name || json.owner?.username || "Medis");
      })
      .catch(() => null);
  }, []);

  return (
    <main className="space-y-5">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-blue-950 via-blue-800 to-emerald-600 p-7 text-white shadow-sm">
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-100">Dedicated Vaccination Medis</div>
        <h1 className="mt-2 text-3xl font-black">Halo, {name}</h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-blue-100">Workspace ini hanya menampilkan fungsi yang dibutuhkan Medis: tindakan, rekap peserta yang Anda handle, dan laporan pribadi Medis.</p>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <a href="/vaccination/administer" className="rounded-3xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="text-[11px] font-black uppercase text-emerald-600">Operasional</div><div className="mt-2 text-xl font-black text-slate-900">Tindakan Medis</div><p className="mt-2 text-sm font-medium leading-6 text-slate-500">Pilih peserta, proses tindakan, vaksin/lot, dan selesaikan tindakan.</p></a>
        <a href="/vaccination/medis/rekap" className="rounded-3xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="text-[11px] font-black uppercase text-blue-600">Rekap</div><div className="mt-2 text-xl font-black text-slate-900">Peserta Saya</div><p className="mt-2 text-sm font-medium leading-6 text-slate-500">Daftar peserta yang tercatat ditangani oleh akun Medis ini.</p></a>
        <a href="/vaccination/medis/laporan" className="rounded-3xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="text-[11px] font-black uppercase text-violet-600">Laporan</div><div className="mt-2 text-xl font-black text-slate-900">Laporan Medis</div><p className="mt-2 text-sm font-medium leading-6 text-slate-500">Ringkasan dan export data tindakan milik Medis yang sedang login.</p></a>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[["Peserta Saya", summary.participants || 0], ["Tindakan / Produk", summary.administrations || 0], ["Perusahaan", summary.companies || 0], ["Produk Vaksin", summary.products || 0]].map(([label, value]) => <div key={String(label)} className="rounded-3xl border bg-white p-5 shadow-sm"><div className="text-xs font-black text-slate-500">{label}</div><div className="mt-2 text-3xl font-black text-slate-950">{value}</div></div>)}
      </section>
    </main>
  );
}
