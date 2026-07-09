"use client";

import { useEffect, useState } from "react";

// WELLNESS_PARTICIPANT_PORTAL_MENU_WEBVIEW_SAFE_V430
// Fix:
// - Mobile drawer dibuat fixed fullscreen agar tidak ketutup hero/card.
// - Z-index dinaikkan.
// - Drawer bisa scroll.
// - Cocok dibuka dari browser biasa maupun Android WebView APK.
// - Menu khusus peserta saja: Home, Nutrisi, Workout, Health Talk, History, Devices, Profile, Logout.

type PortalTab =
  | "home"
  | "nutrition"
  | "workout"
  | "healthtalk"
  | "history"
  | "devices"
  | "profile";

type MenuItem = {
  key: PortalTab;
  label: string;
  description: string;
  emoji: string;
};

const menuItems: MenuItem[] = [
  {
    key: "home",
    label: "Ringkasan",
    description: "Dashboard wellness pribadi",
    emoji: "🏠",
  },
  {
    key: "nutrition",
    label: "Input Nutrisi",
    description: "Catat makanan harian",
    emoji: "🥗",
  },
  {
    key: "workout",
    label: "Input Workout",
    description: "Catat aktivitas manual",
    emoji: "🏃",
  },
  {
    key: "healthtalk",
    label: "Health Talk",
    description: "Catat kehadiran seminar / health talk",
    emoji: "🎤",
  },
  {
    key: "history",
    label: "History",
    description: "Riwayat nutrisi, workout, dan health talk",
    emoji: "📊",
  },
  {
    key: "devices",
    label: "Device Sync",
    description: "Google Fit / Health Connect",
    emoji: "⌚",
  },
  {
    key: "profile",
    label: "Profil",
    description: "Data peserta dan ID sync",
    emoji: "👤",
  },
];

function clean(value: any) {
  return String(value ?? "").trim();
}

export default function ParticipantPortalMenu({
  activeTab,
  onChangeTab,
  onLogout,
  participant,
}: {
  activeTab: PortalTab;
  onChangeTab: (tab: PortalTab) => void;
  onLogout: () => void;
  participant?: any;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function chooseTab(tab: PortalTab) {
    onChangeTab(tab);
    setOpen(false);
  }

  const activeItem = menuItems.find((item) => item.key === activeTab);
  const participantName =
    clean(participant?.name) ||
    clean(participant?.participant_name) ||
    clean(participant?.full_name) ||
    "Peserta Wellness";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 top-4 z-[9998] flex h-14 w-14 items-center justify-center rounded-full border border-slate-100 bg-white text-2xl font-black text-slate-900 shadow-2xl shadow-slate-300/60"
        aria-label="Buka menu peserta"
      >
        ☰
      </button>

      <div className="fixed left-4 top-4 z-[9997] hidden max-w-[calc(100vw-7rem)] rounded-full border border-slate-100 bg-white/95 px-4 py-3 text-xs font-black text-slate-700 shadow-xl shadow-slate-200 backdrop-blur md:block">
        {activeItem?.emoji} {activeItem?.label || "Menu Peserta"}
      </div>

      {open ? (
        <div className="fixed inset-0 z-[9999] bg-slate-950/50 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Tutup overlay menu"
          />

          <aside className="absolute bottom-4 right-4 top-4 flex w-[calc(100vw-2rem)] max-w-[420px] flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-white shadow-2xl shadow-slate-950/30">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-blue-700 via-indigo-600 to-emerald-500 p-5 text-white">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-white/70">
                  Menu Peserta
                </div>

                <div className="mt-2 truncate text-lg font-black">
                  {participantName}
                </div>

                <div className="mt-1 text-xs font-bold leading-5 text-white/80">
                  Khusus akses individu peserta.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/95 text-xl font-black text-slate-900 shadow-lg"
                aria-label="Tutup menu"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid gap-3">
                {menuItems.map((item) => {
                  const active = item.key === activeTab;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => chooseTab(item.key)}
                      className={`w-full rounded-3xl border p-4 text-left transition ${
                        active
                          ? "border-blue-200 bg-blue-50 shadow-lg shadow-blue-100"
                          : "border-slate-100 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg ${
                            active
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {item.emoji}
                        </div>

                        <div className="min-w-0">
                          <div
                            className={`text-sm font-black ${
                              active ? "text-blue-900" : "text-slate-900"
                            }`}
                          >
                            {item.label}
                          </div>

                          <div
                            className={`mt-1 text-xs font-bold leading-5 ${
                              active ? "text-blue-700" : "text-slate-500"
                            }`}
                          >
                            {item.description}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-100 bg-slate-50 p-4">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className="w-full rounded-3xl bg-rose-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-rose-100"
              >
                Keluar dari Portal Peserta
              </button>

              <div className="mt-3 text-center text-[11px] font-bold leading-5 text-slate-400">
                Harmony Health App · Participant Portal
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}