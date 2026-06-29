"use client";

import { useState } from "react";

// WELLNESS_PORTAL_HAMBURGER_MENU_V387_CLICKABLE
// Floating hamburger navigation without full-screen overlay.
// Fix: menu links are clickable on mobile.

type MenuItem = {
  label: string;
  href: string;
  description: string;
  badge?: string;
};

const menuItems: MenuItem[] = [
  {
    label: "Dashboard Wellness",
    href: "/wellness/dashboard",
    description: "Lihat dashboard monitoring wellness",
    badge: "ADMIN",
  },
  {
    label: "Input Peserta",
    href: "/wellness/input",
    description: "Input harian peserta wellness",
    badge: "INPUT",
  },
  {
    label: "Input NAKES",
    href: "/wellness/nakes-input",
    description: "Input data klinis oleh tim medis",
    badge: "NAKES",
  },
  {
    label: "Import Peserta",
    href: "/wellness/import",
    description: "Import data peserta program wellness",
    badge: "IMPORT",
  },
  {
    label: "Import History MCU",
    href: "/wellness/history-import",
    description: "Import baseline, mini MCU, dan final MCU",
    badge: "MCU",
  },
  {
    label: "Dashboard Utama",
    href: "/dashboard",
    description: "Kembali ke dashboard utama aplikasi",
    badge: "MAIN",
  },
];

export default function PortalHamburgerMenu() {
  const [open, setOpen] = useState(false);

  function goTo(href: string) {
    setOpen(false);
    window.location.href = href;
  }

  return (
    <div className="fixed right-4 top-4 z-50 md:right-6 md:top-6">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl shadow-slate-300 transition hover:scale-105 hover:bg-slate-50"
        aria-label={open ? "Tutup menu navigasi" : "Buka menu navigasi"}
        aria-expanded={open}
      >
        <div className="space-y-1.5">
          <span
            className={`block h-0.5 w-5 rounded-full bg-slate-900 transition ${
              open ? "translate-y-2 rotate-45" : ""
            }`}
          />
          <span
            className={`block h-0.5 w-5 rounded-full bg-slate-900 transition ${
              open ? "opacity-0" : ""
            }`}
          />
          <span
            className={`block h-0.5 w-5 rounded-full bg-slate-900 transition ${
              open ? "-translate-y-2 -rotate-45" : ""
            }`}
          />
        </div>
      </button>

      {open ? (
        <div className="absolute right-0 mt-3 w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-300">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  Navigasi
                </div>

                <div className="mt-1 text-base font-black text-slate-950">
                  Wellness Portal
                </div>

                <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  Pilih halaman tujuan.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-500 shadow-sm ring-1 ring-slate-200"
              >
                X
              </button>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto p-2">
            {menuItems.map((item) => (
              <button
                key={item.href}
                type="button"
                onClick={() => goTo(item.href)}
                className="group block w-full rounded-2xl px-4 py-3 text-left transition hover:bg-blue-50 active:bg-blue-100"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-black text-slate-900 group-hover:text-blue-700">
                    {item.label}
                  </div>

                  {item.badge ? (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-700">
                      {item.badge}
                    </span>
                  ) : null}
                </div>

                <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  {item.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}