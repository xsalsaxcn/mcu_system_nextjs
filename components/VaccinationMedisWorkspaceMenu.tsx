"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

// VACCINATION_MEDIS_WORKSPACE_MENU_V150_4
// Dedicated navigation for vaccination_medis on vaccination routes only.
// It also publishes the logged-in vaccination identity to document.dataset so
// existing doctor/staff helpers can lock the Medis identity consistently.

type MePayload = {
  ok?: boolean;
  user?: {
    id?: number;
    name?: string;
    username?: string;
    role?: string;
  };
};

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function currentPath() {
  if (typeof window === "undefined") return "";
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

const MEDIS_LINKS = [
  { label: "Workspace Medis", href: "/vaccination/medis", note: "Ringkasan workspace khusus Medis" },
  { label: "Tindakan Medis", href: "/vaccination/administer", note: "Pilih session, peserta, vaksin, lot, dan proses tindakan" },
  { label: "Rekap Peserta", href: "/vaccination/medis/rekap", note: "Mirror peserta yang sudah ditangani pada modul vaksinasi" },
  { label: "Laporan Medis", href: "/vaccination/medis/laporan", note: "Laporan operasional yang hanya dapat dikonsumsi role Medis" },
];

export default function VaccinationMedisWorkspaceMenu() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<MePayload["user"] | null>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    if (!currentPath().startsWith("/vaccination")) return;

    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: MePayload) => {
        if (!active || !json?.ok || !json.user) return;
        const role = clean(json.user.role).toLowerCase();
        if (role !== "vaccination_medis") return;

        setUser(json.user);
        document.documentElement.dataset.hhaVaccinationRole = role;
        document.documentElement.dataset.hhaVaccinationUser = clean(json.user.name || json.user.username);

        const path = currentPath();
        if (
          path === "/vaccination" ||
          path.startsWith("/vaccination/portal") ||
          path.startsWith("/vaccination/validation") ||
          path.startsWith("/vaccination/inventory") ||
          path.startsWith("/vaccination/master") ||
          path.startsWith("/vaccination/session") ||
          path.startsWith("/vaccination/dashboard") ||
          path.startsWith("/vaccination/register") ||
          path.startsWith("/vaccination/queue")
        ) {
          window.location.replace("/vaccination/medis");
        }
      })
      .catch(() => null);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user || typeof document === "undefined") return;

    const hideForbiddenLinks = () => {
      const selectors = [
        'a[href="/vaccination"]',
        'a[href="/vaccination/validation"]',
        '#hha-validation-menu-link-v129',
      ].join(",");

      document.querySelectorAll(selectors).forEach((node) => {
        const el = node as HTMLElement;
        if (el.dataset.hhaMedisMenuHiddenV1504 === "1") return;
        el.dataset.hhaMedisMenuHiddenV1504 = "1";
        el.dataset.hhaMedisMenuPreviousDisplayV1504 = el.style.display || "";
        el.style.display = "none";
      });
    };

    hideForbiddenLinks();
    const observer = new MutationObserver(hideForbiddenLinks);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const displayName = useMemo(
    () => clean(user?.name || user?.username || "Vaccination Medis"),
    [user],
  );

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/vaccination/login";
  }

  if (!mounted || !user) return null;

  const drawer = open
    ? createPortal(
        <div className="fixed inset-0 z-[2147483000]">
          <button
            type="button"
            aria-label="Tutup Menu Medis"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-950/55"
          />
          <aside className="absolute bottom-3 right-3 top-3 flex w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="bg-gradient-to-br from-blue-950 via-blue-800 to-emerald-600 px-5 py-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-100">Vaccination Medis</div>
                  <div className="mt-1 text-xl font-black">Menu Workspace</div>
                  <div className="mt-1 text-xs font-semibold text-blue-100">{displayName}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-2xl border border-white/25 bg-white/15 px-3 py-2 text-xs font-black text-white"
                >
                  Tutup
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-3">
              <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-2 px-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Pages</div>
                <div className="grid gap-1">
                  {MEDIS_LINKS.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="rounded-2xl px-3 py-3 transition hover:bg-blue-50"
                    >
                      <div className="text-sm font-black text-slate-800">{item.label}</div>
                      <div className="mt-0.5 text-[11px] font-semibold leading-4 text-slate-500">{item.note}</div>
                    </a>
                  ))}
                </div>
              </section>

              <section className="mt-3 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-2 px-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Account</div>
                <div className="grid gap-2">
                  <a
                    href="/vaccination/login"
                    className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-black text-blue-800"
                  >
                    Login Portal Vaksinasi
                  </a>
                  <button
                    type="button"
                    onClick={logout}
                    className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white"
                  >
                    Logout
                  </button>
                </div>
              </section>
            </div>
          </aside>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 top-4 z-[2147482000] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-900 shadow-lg hover:bg-slate-50"
        aria-label="Buka Menu Medis"
      >
        ☰ Menu Medis
      </button>
      {drawer}
    </>
  );
}
