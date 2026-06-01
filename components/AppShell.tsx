"use client";

import { useState, type ReactNode } from "react";
import type { SessionUser } from "@/lib/shared/types";

const adminMenuGroups = [
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
      { label: "Setup Parameter", href: "/setup-parameters" },
      { label: "Setup Label Paket", href: "/setup-label-paket" },
      { label: "Parameter Kelulusan", href: "/parameter-kelulusan" },
      { label: "Input CAPASKA", href: "/input" },
      { label: "Input Corporate", href: "/input-corporate" },
      { label: "AI MCU Analyzer", href: "/ai-mcu/analyze" },
      { label: "Training AI MCU", href: "/ai-mcu/train" },
      { label: "Cetak Label", href: "/labels" },
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

function valueOf(rawUser: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = rawUser[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value);
    }
  }

  return "";
}

function getRole(rawUser: Record<string, unknown>) {
  return valueOf(rawUser, ["role", "role_name", "user_role"]).toLowerCase();
}

function getProgram(rawUser: Record<string, unknown>) {
  return valueOf(rawUser, ["program_type", "program", "program_status"]).toLowerCase();
}

function getPost(rawUser: Record<string, unknown>) {
  return valueOf(rawUser, ["post", "post_name", "post_label", "assigned_post", "station", "parameter"]).toLowerCase();
}

function getUsername(rawUser: Record<string, unknown>) {
  return valueOf(rawUser, ["username", "email", "name"]).toLowerCase();
}

function getOperatorFormRoute(rawUser: Record<string, unknown>) {
  const program = getProgram(rawUser);
  const post = getPost(rawUser);
  const username = getUsername(rawUser);

  if (post.includes("registrasi")) {
    return "/registrasi-ulang";
  }

  const corporateTokens = [
    "corporate",
    "corp",
    "antropometri",
    "vital",
    "laboratorium",
    "lab",
    "ekg",
    "audiometri",
    "spirometri",
    "treadmill",
  ];

  const isCorporate =
    program.includes("corporate") ||
    corporateTokens.some((token) => post.includes(token) || username.includes(token));

  return isCorporate ? "/input-corporate" : "/input";
}

function getOperatorFormLabel(rawUser: Record<string, unknown>) {
  const post = getPost(rawUser);
  const program = getProgram(rawUser);

  if (post.includes("registrasi")) return "Registrasi Ulang";
  if (program.includes("corporate")) return "Form Corporate";

  return "Form CAPASKA";
}

function getOperatorMenuGroups(rawUser: Record<string, unknown>) {
  const formRoute = getOperatorFormRoute(rawUser);
  const formLabel = getOperatorFormLabel(rawUser);

  return [
    {
      title: "Operator",
      items: [
        { label: "Dashboard Operator", href: "/dashboard" },
        { label: formLabel, href: formRoute },
      ],
    },
  ];
}

function MenuDrawer({ groups }: { groups: typeof adminMenuGroups }) {
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
              {groups.map((group) => (
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
  const role = getRole(rawUser);
  const isOperator = role === "operator";

  const displayName = String(
    rawUser.name ||
      rawUser.username ||
      rawUser.email ||
      "Administrator"
  );

  const roleLabel = String(
    rawUser.role ||
      rawUser.role_name ||
      "Admin"
  );

  const menuGroups = isOperator ? getOperatorMenuGroups(rawUser) : adminMenuGroups;
  const operatorFormRoute = getOperatorFormRoute(rawUser);
  const operatorFormLabel = getOperatorFormLabel(rawUser);

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
                {displayName} - {roleLabel}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a href="/dashboard" className="top-nav-link">
              Dashboard
            </a>

            {isOperator ? (
              <a href={operatorFormRoute} className="top-nav-link">
                {operatorFormLabel}
              </a>
            ) : (
              <a href="/registrasi-ulang" className="top-nav-link">
                Registrasi Ulang
              </a>
            )}

            {!isOperator ? (
              <div className="ml-0 flex items-center gap-2 md:ml-3">
                <MenuDrawer groups={menuGroups} />
              </div>
            ) : null}

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

      <main className="mx-auto max-w-7xl px-5 py-8">
        {children}
      </main>
    </div>
  );
}
