"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  const drawer = open ? (
    <div
      data-harmony-menu="portal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        aria-label="Close menu"
        onClick={() => setOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100dvh",
          background: "rgba(2, 6, 23, 0.72)",
          backdropFilter: "blur(6px)",
          border: 0,
          padding: 0,
          margin: 0,
          zIndex: 2147483646,
        }}
      />

      <aside
        data-harmony-menu="portal-drawer"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 2147483647,
          width: "min(88vw, 380px)",
          height: "100dvh",
          overflowY: "auto",
          overflowX: "hidden",
          background: "#ffffff",
          borderRight: "1px solid #e2e8f0",
          borderTopRightRadius: "28px",
          borderBottomRightRadius: "28px",
          boxShadow: "0 25px 80px rgba(15, 23, 42, 0.35)",
          padding: "16px",
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="text-sm font-black text-slate-950">Harmony Health App</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">Navigasi layanan</div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm"
          >
            Tutup
          </button>
        </div>

        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.title} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 px-1 text-[11px] font-black uppercase tracking-wide text-slate-400">
                {group.title}
              </div>

              <div className="space-y-1">
                {group.items.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="nav-menu-button"
        aria-label="Open menu"
      >
        <span className="nav-menu-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        Menu
      </button>

      {mounted && drawer ? createPortal(drawer, document.body) : null}
    </>
  );
}

export default function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: SessionUser | null;
}) {
  const rawUser = (user || {}) as unknown as Record<string, unknown>;
  const role = getRole(rawUser);
  const isOperator = role === "operator";
  const menuGroups = isOperator ? getOperatorMenuGroups(rawUser) : adminMenuGroups;
  const displayName = valueOf(rawUser, ["name", "username", "email"]) || "User";
  const roleLabel = valueOf(rawUser, ["role", "role_name", "user_role"]) || "-";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <MenuDrawer groups={menuGroups} />

            <a href="/dashboard" className="min-w-0">
              <div className="truncate text-sm font-black text-slate-950 md:text-base">
                Harmony Health App
              </div>
              <div className="truncate text-[11px] font-semibold text-slate-500 md:text-xs">
                MCU Corporate · CAPASKA · Vaksinasi
              </div>
            </a>
          </div>

          <div className="min-w-0 text-right">
            <div className="truncate text-xs font-black text-slate-800 md:text-sm">
              {displayName}
            </div>
            <div className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {roleLabel}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 md:px-6">
        {children}
      </main>
    </div>
  );
}
