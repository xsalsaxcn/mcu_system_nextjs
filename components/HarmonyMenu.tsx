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
      { label: "Setup Parameter", href: "/parameters" },
      { label: "Setup Label Paket", href: "/package-labels" },
      { label: "Parameter Kelulusan", href: "/pass-criteria" },
      { label: "Input CAPASKA", href: "/input/capaska" },
      { label: "Input Corporate", href: "/input/corporate" },
      { label: "AI MCU Analyzer", href: "/ai-mcu/analyze" },
      { label: "Training AI MCU", href: "/ai-mcu/train" },
      { label: "Cetak Label", href: "/print-label" },
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
      { label: "Hapus Database", href: "/delete-database" },
      { label: "Master Users", href: "/users" },
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
            className="fixed inset-0 z-40 cursor-default bg-black/10"
            onClick={() => setOpen(false)}
          />

          <div className="absolute right-0 z-50 mt-3 w-[360px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
              <div className="text-sm font-black text-slate-900">Harmony Health App</div>
              <div className="text-xs font-semibold text-slate-500">Navigasi layanan</div>
            </div>

            <div className="max-h-[70vh] overflow-auto p-3">
              {menuGroups.map((group) => (
                <div key={group.title} className="mb-3 rounded-2xl border border-slate-100 bg-white p-3">
                  <div className="mb-2 px-2 text-xs font-black uppercase tracking-wide text-slate-400">
                    {group.title}
                  </div>

                  <div className="grid gap-1">
                    {group.items.map((item) => (
                      <a
                        key={`${group.title}-${item.href}`}
                        href={item.href}
                        className="rounded-xl px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                      >
                        {item.label}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
