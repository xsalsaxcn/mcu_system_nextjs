"use client";

import { useState } from "react";

// WELLNESS_PARTICIPANT_ALL_FORMS_EXISTING_GS_V398_MENU
// Participant-only hamburger menu. No admin/internal links.
// V398 adds Health Talk because the old Jotform flow also collected health talk evidence.

type PortalTab = "home" | "nutrition" | "workout" | "healthtalk" | "history" | "devices" | "profile";

type MenuItem = {
  id: PortalTab;
  label: string;
  description: string;
  badge?: string;
};

const menuItems: MenuItem[] = [
  {
    id: "home",
    label: "Dashboard Saya",
    description: "Ringkasan wellness pribadi",
    badge: "Home",
  },
  {
    id: "nutrition",
    label: "Input Nutrisi",
    description: "Catat makanan harian",
    badge: "Food",
  },
  {
    id: "workout",
    label: "Input Workout",
    description: "Catat aktivitas manual",
    badge: "Move",
  },
  {
    id: "healthtalk",
    label: "Health Talk",
    description: "Catat seminar/edukasi kesehatan",
    badge: "Talk",
  },
  {
    id: "history",
    label: "History",
    description: "Riwayat nutrisi, workout, health talk",
    badge: "Log",
  },
  {
    id: "devices",
    label: "Connect Device",
    description: "Strava dan Google Fit",
    badge: "Sync",
  },
  {
    id: "profile",
    label: "Profil Saya",
    description: "Data peserta dan koneksi",
    badge: "Me",
  },
];

export default function ParticipantPortalMenu({
  activeTab,
  onChangeTab,
  onLogout,
  participant,
}: {
  activeTab: PortalTab;
  onChangeTab: (tab: PortalTab) => void;
  onLogout: () => void;
  participant: any;
}) {
  const [open, setOpen] = useState(false);

  function pick(tab: PortalTab) {
    onChangeTab(tab);
    setOpen(false);
  }

  return (
    <div className="fixed right-4 top-4 z-50 md:right-6 md:top-6">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl shadow-slate-300 transition hover:scale-105 hover:bg-slate-50"
        aria-label={open ? "Tutup menu peserta" : "Buka menu peserta"}
        aria-expanded={open}
      >
        <div className="space-y-1.5">
          <span
            className={`block h-0.5 w-5 rounded-full bg-slate-900 transition ${
              open ? "translate-y-2 rotate-45" : ""
            }`}
          />
          <span
            className={`block h-0.5 w-5 rounded-full bg-slate-900 transition ${
              open ? "opacity-0" : ""
            }`}
          />
          <span
            className={`block h-0.5 w-5 rounded-full bg-slate-900 transition ${
              open ? "-translate-y-2 -rotate-45" : ""
            }`}
          />
        </div>
      </button>

      {open ? (
        <div className="absolute right-0 mt-3 w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-300">
          <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 to-emerald-50 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  Menu Peserta
                </div>

                <div className="mt-1 truncate text-base font-black text-slate-950">
                  {participant?.name || "Wellness Portal"}
                </div>

                <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  Khusus akses individu peserta.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-500 shadow-sm ring-1 ring-slate-200"
              >
                X
              </button>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto p-2">
            {menuItems.map((item) => {
              const isActive = item.id === activeTab;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => pick(item.id)}
                  className={`group block w-full rounded-2xl px-4 py-3 text-left transition active:bg-blue-100 ${
                    isActive ? "bg-blue-50" : "hover:bg-blue-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div
                      className={`text-sm font-black ${
                        isActive ? "text-blue-800" : "text-slate-900 group-hover:text-blue-700"
                      }`}
                    >
                      {item.label}
                    </div>

                    {item.badge ? (
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                          isActive
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-700"
                        }`}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                    {item.description}
                  </div>
                </button>
              );
            })}

            <div className="my-2 border-t border-slate-100" />

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="block w-full rounded-2xl px-4 py-3 text-left transition hover:bg-red-50 active:bg-red-100"
            >
              <div className="text-sm font-black text-red-700">Logout</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-red-500">
                Keluar dari portal peserta.
              </div>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
