"use client";

import HarmonyMenu from "@/components/HarmonyMenu";

const menuItems = [
  { title: "Dashboard Vaksinasi", href: "/vaccination/dashboard", desc: "Filter sudah/belum vaksin, dokter/petugas, dan export data.", tag: "Report" },
  { title: "Master Vaksin & Lot", href: "/vaccination/master", desc: "Input master vaksin, aturan next dose, stok, dan lot number.", tag: "Master" },
  { title: "Session Vaksinasi", href: "/vaccination/session", desc: "Buat event perusahaan, pilih database corporate, dan set multi-vaksin.", tag: "Setup" },
  { title: "Registrasi Vaksin", href: "/vaccination/register", desc: "Import peserta corporate, registrasi ulang, dan rilis nomor antrian.", tag: "Frontdesk" },
  { title: "Antrian Vaksin", href: "/vaccination/queue", desc: "Panggil nomor antrian berjalan dan tampilkan halaman publik untuk pasien.", tag: "Queue" },
  { title: "Administered / Medis", href: "/vaccination/administer", desc: "Input dokter, vaksin, lot number, Done, dan print sticker label.", tag: "Medis" },
];

export default function VaccinationPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <div>
            <div className="text-2xl font-black tracking-tight text-slate-900">Harmony Health App</div>
            <div className="text-sm font-medium text-slate-500">Vaksinasi Perusahaan</div>
          </div>
          <HarmonyMenu />
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-slate-900 p-8 text-white">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-3xl font-black">Vaksinasi Perusahaan</div>
                <p className="mt-2 max-w-3xl text-sm font-medium text-emerald-50">
                  Modul registrasi vaksin, antrian QR, administered, lot number, next dose, sticker label, dan dashboard export.
                </p>
                <div className="mt-4 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white">
                  Corporate Vaccination Workflow
                </div>
              </div>

              <a href="/dashboard" className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-emerald-700 shadow-sm transition hover:bg-emerald-50">
                Dashboard Operasional
              </a>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {menuItems.map((item) => (
            <a key={item.href} href={item.href} className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-slate-900 group-hover:text-emerald-700">{item.title}</div>
                  <div className="mt-2 text-sm font-medium leading-6 text-slate-500">{item.desc}</div>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                  {item.tag}
                </span>
              </div>
            </a>
          ))}
        </section>
      </div>
    </main>
  );
}
