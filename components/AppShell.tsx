"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { SessionUser } from "@/lib/shared/types";

type MenuItem = {
  label: string;
  href: string;
  roles?: string[];
  programs?: string[];
};

type MenuGroup = {
  title: string;
  items: MenuItem[];
};

function canSee(item: MenuItem, user: SessionUser) {
  const role = String(user.role || "");
  const program = String(user.program_type || "");

  if (item.roles?.length && !item.roles.includes(role)) return false;
  if (item.programs?.length && !item.programs.includes(program) && program !== "all") return false;

  return true;
}

function groupedMenu(user: SessionUser): MenuGroup[] {
  const role = String(user.role || "");
  const program = String(user.program_type || "");

  const adminOnly = ["admin"];
  const clinicalRoles = ["admin", "supervisor", "doctor"];
  const capaskaRoles = ["admin", "supervisor", "doctor", "operator"];

  const groups: MenuGroup[] = [
    {
      title: "DASHBOARD",
      items: [
        { label: "Dashboard Operasional", href: "/dashboard" },
        { label: "Registrasi Ulang MCU", href: "/registrasi-ulang", roles: adminOnly },
        { label: "Review Hasil", href: "/review", roles: clinicalRoles }
      ]
    },
    {
      title: "CAPASKA",
      items: [
        { label: "Dashboard CAPASKA", href: "/dashboard", roles: capaskaRoles, programs: ["capaska", "all"] },
        { label: "Registrasi Ulang CAPASKA", href: "/registrasi-ulang", roles: adminOnly, programs: ["capaska", "all"] },
        { label: "Input CAPASKA", href: "/input", roles: ["admin", "operator"], programs: ["capaska", "all"] },
        { label: "Review Hasil CAPASKA", href: "/review", roles: clinicalRoles, programs: ["capaska", "all"] },
        { label: "Generate PDF CAPASKA", href: "/generate-pdf-capaska", roles: adminOnly, programs: ["capaska", "all"] }
      ]
    },
    {
      title: "MCU",
      items: [
        { label: "Setup Parameter", href: "/setup-parameters", roles: adminOnly },
        { label: "Setup Label Paket", href: "/setup-label-paket", roles: adminOnly },
        { label: "Parameter Kelulusan", href: "/parameter-kelulusan", roles: adminOnly },
        { label: "Input Corporate", href: "/input-corporate", roles: ["admin", "operator"], programs: ["corporate", "all"] },
        { label: "Cetak Label", href: "/labels", roles: adminOnly }
      ]
    },
    {
      title: "AI MCU",
      items: [
        { label: "AI MCU Analyzer", href: "/ai-mcu-analyzer", roles: adminOnly },
        { label: "Training AI MCU", href: "/training-ai-mcu", roles: adminOnly }
      ]
    },
    {
      title: "ADMIN",
      items: [
        { label: "Import Peserta", href: "/import", roles: adminOnly },
        { label: "Master Users", href: "/master", roles: adminOnly },
        { label: "Hapus Database", href: "/cleanup", roles: adminOnly }
      ]
    },
    {
      title: "WELLNESS",
      items: [
        { label: "Dashboard Wellness", href: "/wellness", roles: adminOnly },
        { label: "Import Wellness", href: "/wellness/import", roles: adminOnly }
      ]
    }
  ];

  // Operator CAPASKA should still see their core input even if role/program metadata is partial.
  if (role === "operator" && (program === "capaska" || program === "all")) {
    return [
      {
        title: "DASHBOARD",
        items: [
          { label: "Dashboard Operasional", href: "/dashboard" }
        ]
      },
      {
        title: "CAPASKA",
        items: [
          { label: "Input CAPASKA", href: "/input" }
        ]
      }
    ];
  }

  // Operator Corporate should remain simple.
  if (role === "operator" && program === "corporate") {
    return [
      {
        title: "DASHBOARD",
        items: [
          { label: "Dashboard Operasional", href: "/dashboard" }
        ]
      },
      {
        title: "MCU",
        items: [
          { label: "Input Corporate", href: "/input-corporate" }
        ]
      }
    ];
  }

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canSee(item, user))
    }))
    .filter((group) => group.items.length > 0);
}

function mainToolbar(user: SessionUser) {
  const role = String(user.role || "");
  const program = String(user.program_type || "");

  const items: MenuItem[] = [
    { label: "Dashboard", href: "/dashboard" }
  ];

  if (role === "admin") {
    items.push({ label: "Registrasi Ulang", href: "/registrasi-ulang" });
  }

  if (role === "operator" && (program === "capaska" || program === "all")) {
    items.push({ label: "Input CAPASKA", href: "/input" });
  }

  if (role === "operator" && program === "corporate") {
    items.push({ label: "Input Corporate", href: "/input-corporate" });
  }

  if (role === "supervisor" || role === "doctor") {
    items.push({ label: "Review Hasil", href: "/review" });
  }

  return items;
}

export default function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => groupedMenu(user), [user]);
  const toolbarItems = useMemo(() => mainToolbar(user), [user]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  function itemClass(href: string, compact = false) {
    const active = pathname === href;

    return compact
      ? `whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-black transition ${
          active ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-800 hover:bg-slate-200"
        }`
      : `block rounded-2xl px-4 py-3 text-sm font-black transition ${
          active ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-800 hover:bg-slate-50"
        }`;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="text-xl font-black text-slate-900">MCU System</div>
            <div className="text-xs font-semibold text-slate-500">
              {user.name} · {user.role} · {user.post_name || "-"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={() => setOpen(true)}
            >
              ☰ Menu
            </button>

            <button className="btn-secondary" onClick={logout}>Logout</button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-3">
          {toolbarItems.map((item) => (
            <Link key={item.href + item.label} href={item.href} className={itemClass(item.href, true)}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 px-3 py-8">
          <div className="max-h-[88vh] w-full max-w-md overflow-hidden rounded-[2rem] border border-white/50 bg-white shadow-2xl">
            <div className="bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-950 px-5 py-4 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-black">Harmony Health App</div>
                  <div className="text-sm font-semibold text-blue-100">Navigasi layanan</div>
                </div>

                <button
                  type="button"
                  className="rounded-2xl border border-white/70 px-4 py-2 text-sm font-black text-white hover:bg-white/10"
                  onClick={() => setOpen(false)}
                >
                  Tutup
                </button>
              </div>

              <div className="mt-3 rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white">
                Menu v42 · Modul CAPASKA restored
              </div>
            </div>

            <div className="max-h-[calc(88vh-96px)] space-y-3 overflow-y-auto bg-slate-50 p-4">
              {groups.map((group) => (
                <section key={group.title} className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="px-2 pb-2 text-xs font-black uppercase tracking-wide text-slate-400">
                    {group.title}
                  </div>

                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <Link
                        key={item.href + item.label}
                        href={item.href}
                        className={itemClass(item.href)}
                        onClick={() => setOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
    </div>
  );
}
