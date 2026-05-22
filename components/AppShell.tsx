"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/lib/shared/types";

function menuFor(user: SessionUser) {
  if (user.role === "admin") {
    return [
      ["Dashboard", "/dashboard"],
      ["Registrasi Ulang", "/registrasi-ulang"],
      ["Import Peserta", "/import"],
      ["Setup Parameter", "/setup-parameters"],
      ["Setup Label Paket", "/setup-label-paket"],
      ["Parameter Kelulusan", "/parameter-kelulusan"],
      ["Input CAPASKA", "/input"],
      ["Input Corporate", "/input-corporate"],
      ["Cetak Label", "/labels"],
      ["Review Hasil", "/review"],
      ["Hapus Database", "/cleanup"],
      ["Master Users", "/master"]
    ];
  }

  if (user.role === "doctor" || user.role === "supervisor") {
    return [
      ["Dashboard", "/dashboard"],
      ["Review Hasil", "/review"]
    ];
  }

  if (user.program_type === "corporate") {
    return [
      ["Dashboard", "/dashboard"],
      ["Input Corporate", "/input-corporate"]
    ];
  }

  return [
    ["Dashboard", "/dashboard"],
    ["Input CAPASKA", "/input"]
  ];
}

function isMainToolbarItem(label: string) {
  return label === "Dashboard" || label === "Registrasi Ulang";
}

export default function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menu = menuFor(user);
  const mainMenu = menu.filter(([label]) => isMainToolbarItem(label));
  const drawerMenu = menu.filter(([label]) => !isMainToolbarItem(label));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="text-lg font-black text-slate-900">MCU System</div>
            <div className="text-xs font-medium text-slate-500">
              {user.name} · {user.role} · {user.post_name || "-"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={() => setOpen((value) => !value)}
            >
              ☰ Menu
            </button>
            <button className="btn-secondary" onClick={logout}>Logout</button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-3">
          {mainMenu.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-black ${
                pathname === href ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {open && (
          <div className="absolute left-0 right-0 top-full z-40 border-t border-slate-200 bg-white shadow-xl">
            <div className="mx-auto grid max-w-7xl gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
              {drawerMenu.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`rounded-2xl border px-4 py-3 text-sm font-black ${
                    pathname === href
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-20 bg-black/10"
          onClick={() => setOpen(false)}
        />
      )}

      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
    </div>
  );
}
