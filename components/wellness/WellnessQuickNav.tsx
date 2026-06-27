"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const WELLNESS_QUICK_NAV_MARKER = "WELLNESS_QUICK_NAV_V374";

const ITEMS = [
  { href: "/wellness/dashboard", label: "Dashboard" },
  { href: "/wellness/input", label: "Input Harian" },
  { href: "/wellness/nakes-input", label: "Input NAKES" },
  { href: "/wellness/history-import", label: "Import History MCU" },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function WellnessQuickNav() {
  const pathname = usePathname();

  return (
    <nav data-marker={WELLNESS_QUICK_NAV_MARKER} className="rounded-[2rem] border border-blue-100 bg-blue-50 p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-black uppercase tracking-wide text-blue-700">Menu Wellness</div>
          <div className="mt-1 text-sm font-semibold text-slate-600">
            Pilih menu sesuai kebutuhan: input harian peserta, input klinis NAKES, dashboard, atau import history MCU.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "rounded-2xl px-4 py-3 text-sm font-black transition",
                  active
                    ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                    : "bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
