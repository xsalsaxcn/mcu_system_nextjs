"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  BellRing,
  ChevronDown,
  ClipboardList,
  Database,
  FileClock,
  LayoutDashboard,
  Menu,
  Package2,
  ShieldCheck,
  Syringe,
  UsersRound,
  X,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    title: "Persiapan",
    icon: Package2,
    items: [
      { label: "Master Vaksin & Lot", href: "/vaccination/master", icon: Syringe },
      { label: "Session Vaksin", href: "/vaccination/session", icon: ClipboardList },
    ],
  },
  {
    title: "Pelaksanaan",
    icon: Activity,
    items: [
      { label: "Registrasi Vaksin", href: "/vaccination/register", icon: UsersRound },
      { label: "Antrian Vaksin", href: "/vaccination/queue", icon: FileClock },
      { label: "Administered / Medis", href: "/vaccination/administer", icon: Syringe },
      { label: "Tim Validasi", href: "/vaccination/validation", icon: ShieldCheck },
    ],
  },
  {
    title: "Pelaporan",
    icon: BarChart3,
    items: [
      { label: "Dashboard Vaksinasi", href: "/vaccination/dashboard", icon: LayoutDashboard },
      { label: "History Layanan", href: "/vaccination/history", icon: FileClock },
      { label: "History Company Service", href: "/vaccination/company-history", icon: Database },
      { label: "Inventory", href: "/vaccination/inventory", icon: Package2 },
    ],
  },
  {
    title: "Reminder",
    icon: BellRing,
    items: [
      { label: "Reminder Status", href: "/vaccination/reminder", icon: BellRing },
    ],
  },
];

function currentGroup(pathname: string) {
  return groups.find((group) => group.items.some((item) => pathname.startsWith(item.href)))?.title || "Pelaksanaan";
}

export default function VaccinationWorkspaceMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string>(() => currentGroup(pathname || ""));

  useEffect(() => {
    if (open) setExpanded(currentGroup(pathname || ""));
  }, [open, pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const currentLabel = useMemo(() => {
    for (const group of groups) {
      const item = group.items.find((entry) => pathname.startsWith(entry.href));
      if (item) return item.label;
    }
    return "Vaksinasi Perusahaan";
  }, [pathname]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
        aria-label="Buka menu vaksinasi"
      >
        <Menu className="h-4 w-4" />
        Menu Vaksinasi
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Tutup menu vaksinasi"
            className="fixed inset-0 z-[9998] cursor-default bg-slate-950/35 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />

          <aside className="fixed inset-y-0 left-0 z-[9999] flex w-[min(88vw,340px)] flex-col border-r border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                    <Syringe className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-base font-black text-slate-900">Vaksinasi Perusahaan</div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-slate-500">{currentLabel}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Tutup menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
              <a
                href="/vaccination"
                onClick={() => setOpen(false)}
                className={`mb-2 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-black transition ${
                  pathname === "/vaccination" ? "bg-emerald-50 text-emerald-700" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <LayoutDashboard className="h-4 w-4" />
                Overview
              </a>

              {groups.map((group) => {
                const GroupIcon = group.icon;
                const isExpanded = expanded === group.title;
                const hasActive = group.items.some((item) => pathname.startsWith(item.href));
                return (
                  <div key={group.title} className="mb-1">
                    <button
                      type="button"
                      onClick={() => setExpanded((value) => (value === group.title ? "" : group.title))}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm font-black transition ${
                        hasActive ? "bg-slate-100 text-slate-900" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <GroupIcon className="h-4 w-4" />
                        {group.title}
                      </span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>

                    {isExpanded ? (
                      <div className="ml-5 mt-1 border-l border-slate-200 pl-3">
                        {group.items.map((item) => {
                          const ItemIcon = item.icon;
                          const active = pathname.startsWith(item.href);
                          return (
                            <a
                              key={item.href}
                              href={item.href}
                              onClick={() => setOpen(false)}
                              className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                                active
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                              }`}
                            >
                              <ItemIcon className="h-4 w-4" />
                              {item.label}
                            </a>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-2">
                <a href="/vaccination/portal" className="rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-black text-white transition hover:bg-slate-800">
                  Portal Vaksinasi
                </a>
                <a href="/dashboard" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-black text-slate-700 transition hover:bg-slate-100">
                  Dashboard Operasional
                </a>
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
