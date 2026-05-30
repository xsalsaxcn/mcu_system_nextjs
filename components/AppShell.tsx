"use client";

import { useState, type ReactNode } from "react";
import type { SessionUser } from "@/lib/shared/types";

const menuGroups = [
  {
    title: "Dashboard",
    items: [
      { label: "Dashboard Operasional", href: "/dashboard" },
      { label: "Registrasi Ulang MCU", href: "/registrasi-ulang" },
      { label: "Review Hasil", href: "/review" },
    ],
  },
  {
    title: "MCU",
    items: [
      { label: "Import Peserta", href: "/import" },
      { label: "Setup Parameter", href: "/setup-parameters" },
      { label: "Setup Label Paket", href: "/setup-label-paket" },
      { label: "Parameter Kelulusan", href: "/parameter-kelulusan" },
      { label: "Input CAPASKA", href: "/input" },
      { label: "Input Corporate", href: "/input-corporate" },
      { label: "AI MCU Analyzer", href: "/ai-mcu/analyze" },
      { label: "Training AI MCU", href: "/ai-mcu/train" },
      { label: "Cetak Label", href: "/labels" },
      { label: "Hapus Database", href: "/cleanup" },
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
      { label: "Master Users", href: "/master" },
    ],
  },
];

function MenuDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="nav-menu-button"
      >
        <span className="nav-menu-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        Menu
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 cursor-default bg-slate-950/20 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />

          <aside className="absolute right-0 z-50 mt-3 w-[390px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-950 px-5 py-5 text-white">
              <div className="text-base font-black">Harmony Health App</div>
              <div className="mt-1 text-xs font-semibold text-blue-100">
                Navigasi layanan
              </div>
            </div>

            <div className="max-h-[72vh] overflow-auto bg-slate-50 p-3">
              {menuGroups.map((group) => (
                <section
                  key={group.title}
                  className="mb-3 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="mb-2 px-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                    {group.title}
                  </div>

                  <div className="grid gap-1">
                    {group.items.map((item) => (
                      <a
                        key={`${group.title}-${item.href}`}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="rounded-2xl px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                      >
                        {item.label}
                      </a>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </aside>
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
  children: ReactNode;
}) {
  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } catch {
      // Ignore logout network error.
    }

    window.location.href = "/login";
  }

  const rawUser = user as unknown as Record<string, unknown>;

  const displayName = String(
    rawUser.name ||
      rawUser.username ||
      rawUser.email ||
      "Administrator"
  );

  const role = String(
    rawUser.role ||
      rawUser.role_name ||
      "Admin"
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <a
              href="/dashboard"
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-slate-900 text-sm font-black text-white shadow-sm"
            >
              HHA
            </a>

            <div>
              <a href="/dashboard" className="group block">
                <div className="text-2xl font-black tracking-tight text-slate-900 group-hover:text-blue-700">
                  Harmony Health App
                </div>
              </a>
              <div className="mt-0.5 text-sm font-semibold text-slate-500">
                {displayName} - {role}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a href="/dashboard" className="top-nav-link">
              Dashboard
            </a>
            <a href="/registrasi-ulang" className="top-nav-link">
              Registrasi Ulang
            </a>

            <div className="ml-0 flex items-center gap-2 md:ml-3">
              <MenuDrawer />

              <button
                type="button"
                onClick={logout}
                className="rounded-2xl px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8">
        {children}
      </main>
    </div>
  );
}
