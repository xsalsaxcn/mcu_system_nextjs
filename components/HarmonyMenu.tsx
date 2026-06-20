"use client";

import { useState } from "react";

const menuGroups = [
  {
    title: "Dashboard",
    items: [
      { label: "Dashboard Operasional", href: "/dashboard" },
      { label: "Review Hasil MCU", href: "/review" },
    ],
  },
  {
    title: "MCU",
    items: [
      { label: "Setup Parameter", href: "/setup-parameters" },
      { label: "Setup Label Paket", href: "/setup-label-paket" },
      { label: "Parameter Kelulusan", href: "/parameter-kelulusan" },
      { label: "Input CAPASKA", href: "/input" },
      { label: "Input Corporate", href: "/input-corporate" },
      { label: "AI MCU Analyzer", href: "/ai-mcu/analyze" },
      // CAPASKA_GENERATE_PDF_MENU_V332
      { label: "Generate PDF CAPASKA", href: "/ai-mcu/generate?program=capaska" },
      { label: "Training AI MCU", href: "/ai-mcu/train" },
      { label: "Cetak Label", href: "/labels" },
    ],
  },
  {
    title: "Wellness",
    items: [
      { label: "Dashboard Wellness", href: "/wellness/dashboard" },
      { label: "Input Harian Wellness", href: "/wellness/input" },
      { label: "Profil Wellness", href: "/wellness/profile" },
      { label: "Signup Peserta Wellness", href: "/wellness/signup" },
      { label: "Master Wellness", href: "/wellness/master" },
      { label: "Import Peserta Wellness", href: "/wellness/import" },
    ],
  },
  {
    title: "Vaksinasi Perusahaan",
    items: [
      { label: "Dashboard Vaksinasi", href: "/vaccination/dashboard" },
      { label: "Master Vaksin & Lot", href: "/vaccination/master" },
      { label: "Session Vaksinasi", href: "/vaccination/session" },
      { label: "Registrasi Vaksin", href: "/vaccination/register" },
      { label: "Antrian Vaksin", href: "/vaccination/queue" },
      { label: "Administered / Medis", href: "/vaccination/administer" },
      { label: "Inventory Vaksin", href: "/vaccination/inventory" },
      { label: "Reminder Vaksin", href: "/vaccination/reminder" },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Import Data", href: "/import" },
      { label: "Hapus Database", href: "/cleanup" },
      { label: "Master Users", href: "/master" },
    ],
  },
];

export default function HarmonyMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        ☰ Menu
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-[9998] cursor-default bg-slate-950/55"
            onClick={() => setOpen(false)}
          />

          <aside className="fixed left-3 top-3 bottom-3 z-[9999] flex w-[min(88vw,380px)] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl md:left-auto md:right-6 md:top-24 md:bottom-auto md:max-h-[calc(100vh-120px)]">
            <div className="flex items-start justify-between gap-3 bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-950 px-5 py-5 text-white">
              <div>
                <div className="text-base font-black">Harmony Health App</div>
                <div className="mt-1 text-xs font-semibold text-blue-100">Navigasi layanan</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl bg-white/15 px-3 py-2 text-xs font-black text-white transition hover:bg-white/25"
              >
                Tutup
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-50 p-3">
              {menuGroups.map((group) => (
                <div key={group.title} className="mb-3 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="mb-2 px-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                    {group.title}
                  </div>

                  <div className="grid gap-1">
                    {group.items.map((item) => (
                      <a
                        key={`${group.title}-${item.href}`}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="block rounded-2xl px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                      >
                        {item.label}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
