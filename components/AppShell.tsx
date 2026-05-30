"use client";

import { useState } from "react";
import type { SessionUser } from "@/lib/shared/types";

const menuGroups = [
  {
    title: "Dashboard",
    items: [
      { label: "Dashboard Operasional", href: "/dashboard" },
      { label: "Registrasi Ulang MCU", href: "/registrasi-ulang" },
      { label: "Review Hasil", href: "/review-hasil" },
    ],
  },
  {
    title: "MCU",
    items: [
      { label: "Import Peserta", href: "/import-peserta" },
      { label: "Setup Parameter", href: "/setup-parameter" },
      { label: "Setup Label Paket", href: "/setup-label-paket" },
      { label: "Parameter Kelulusan", href: "/parameter-kelulusan" },
      { label: "Input CAPASKA", href: "/input-capaska" },
      { label: "Input Corporate", href: "/input-corporate" },
      { label: "AI MCU Analyzer", href: "/ai-mcu" },
      { label: "Training AI MCU", href: "/ai-mcu/train" },
      { label: "Cetak Label", href: "/cetak-label" },
      { label: "Hapus Database", href: "/hapus-database" },
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
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Master Users", href: "/master-users" },
    ],
  },
];

function HarmonyMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        <span className="text-lg leading-none">☰</span>
        Menu
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 cursor-default bg-black/10"
            onClick={() => setOpen(false)}
          />

          <div className="absolute right-0 z-50 mt-3 w-[380px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 bg-gradient-to-r from-blue-600 to-slate-900 px-5 py-4 text-white">
              <div className="text-sm font-black">Harmony Health App</div>
              <div className="text-xs font-semibold text-blue-100">Navigasi layanan</div>
            </div>

            <div className="max-h-[72vh] overflow-auto bg-slate-50 p-3">
              {menuGroups.map((group) => (
                <div key={group.title} className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
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

export default function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } catch {
      // ignore logout network error
    }

    window.location.href = "/login";
  }

  const rawUser = user as unknown as Record<string, unknown>;

  const displayName = String(rawUser.name || rawUser.username || rawUser.email || "Administrator");
  const role = String(rawUser.role || rawUser.role_name || "Admin");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <a href="/dashboard" className="group">
            <div className="text-2xl font-black tracking-tight text-slate-900 group-hover:text-blue-700">
              Harmony Health App
            </div>
            <div className="mt-0.5 text-sm font-medium text-slate-500">
              {displayName} · {role}
            </div>
          </a>

          <div className="flex items-center gap-3">
            <HarmonyMenu />

            <button
              type="button"
              onClick={logout}
              className="rounded-2xl px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {children}
      </main>
    </div>
  );
}
