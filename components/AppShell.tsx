"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/shared/types";

function menuFor(user: SessionUser) {
  if (user.role === "admin") {
    return [
      ["Dashboard", "/dashboard"],
      ["Import Peserta", "/import"],
      ["Registrasi Ulang", "/registrasi-ulang"],
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

export default function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const menu = menuFor(user);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="text-lg font-black text-slate-900">MCU System</div>
            <div className="text-xs font-medium text-slate-500">
              {user.name} · {user.role} · {user.post_name || "-"}
            </div>
          </div>
          <button className="btn-secondary" onClick={logout}>Logout</button>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-3">
          {menu.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold ${
                pathname === href ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
    </div>
  );
}
