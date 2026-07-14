"use client";

import { useEffect, useMemo, useState } from "react";

// WELLNESS_PORTAL_MENU_UI_V50
// WELLNESS_PARTICIPANT_CHAT_MENU_V54

// WELLNESS_PARTICIPANT_PORTAL_BOTTOM_NAV_V431
// Mobile app style:
// - Bottom navigation seperti aplikasi.
// - Floating quick action untuk input nutrisi/workout.
// - Drawer tetap tersedia untuk semua menu.
// - Aman untuk Android WebView APK.

type PortalTab =
  | "home"
  | "nutrition"
  | "workout"
  | "healthtalk"
  | "history"
  | "devices"
  | "profile"
  | "chat"
  | "charts";

type MenuItem = {
  key: PortalTab;
  label: string;
  shortLabel: string;
  description: string;
  emoji: string;
};

const menuItems: MenuItem[] = [
  {
    key: "home",
    label: "Ringkasan",
    shortLabel: "Home",
    description: "Dashboard wellness pribadi",
    emoji: "🏠",
  },
  {
    key: "nutrition",
    label: "Input Nutrisi",
    shortLabel: "Food",
    description: "Catat makanan harian",
    emoji: "🥗",
  },
  {
    key: "workout",
    label: "Input Workout",
    shortLabel: "Move",
    description: "Catat aktivitas manual",
    emoji: "🏃",
  },
  {
    key: "healthtalk",
    label: "Health Talk",
    shortLabel: "Talk",
    description: "Catat seminar / health talk",
    emoji: "🎤",
  },
  {
    key: "charts",
    label: "Grafik",
    shortLabel: "Grafik",
    description: "Progress nutrisi, workout, dan pemeriksaan",
    emoji: "\u{1F4C8}",
  },
  {
    key: "history",
    label: "History",
    shortLabel: "History",
    description: "Riwayat nutrisi, workout, dan health talk",
    emoji: "📊",
  },
  {
    key: "devices",
    label: "Device Sync",
    shortLabel: "Device",
    description: "Google Fit / Health Connect",
    emoji: "⌚",
  },
  {
    key: "chat",
    label: "Chat With Coach",
    shortLabel: "Chat",
    description: "Konsultasi langsung dengan coach",
    emoji: "\u{1F4AC}",
  },
  {
    key: "profile",
    label: "Profil",
    shortLabel: "Profile",
    description: "Data peserta dan ID sync",
    emoji: "👤",
  },
];

const bottomItems: PortalTab[] = ["home", "nutrition", "workout", "history", "devices"];

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
  const [quickOpen, setQuickOpen] = useState(false);

  const participantName =
    clean(participant?.name) ||
    clean(participant?.participant_name) ||
    clean(participant?.full_name) ||
    "Peserta Wellness";

  const activeItem = useMemo(
    () => menuItems.find((item) => item.key === activeTab) || menuItems[0],
    [activeTab]
  );

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
    setQuickOpen(false);
  }

  return (
    <>
      <div className="fixed left-0 right-0 top-0 z-[9996] border-b border-orange-100 bg-[#fff8ef]/95 px-4 pb-3 pt-3 shadow-sm backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-500">
              Harmony Health
            </div>
            <div className="truncate text-base font-black text-slate-950">
              {activeItem.emoji} {activeItem.label}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-2xl font-black text-white shadow-lg shadow-slate-200"
            aria-label="Buka menu peserta"
          >
            ☰
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 top-4 z-[9998] hidden h-14 w-14 items-center justify-center rounded-full border border-slate-100 bg-white text-2xl font-black text-slate-900 shadow-2xl shadow-slate-300/60 md:flex"
        aria-label="Buka menu peserta"
      >
        ☰
      </button>

      {quickOpen ? (
        <div className="fixed bottom-24 right-5 z-[9997] grid gap-3 md:hidden">
          <button
            type="button"
            onClick={() => chooseTab("nutrition")}
            className="rounded-3xl bg-orange-500 px-5 py-4 text-sm font-black text-white shadow-xl shadow-orange-200"
          >
            🥗 Input Nutrisi
          </button>

          <button
            type="button"
            onClick={() => chooseTab("workout")}
            className="rounded-3xl bg-slate-950 px-5 py-4 text-sm font-black text-white shadow-xl shadow-slate-300"
          >
            🏃 Input Workout
          </button>

          <button
            type="button"
            onClick={() => chooseTab("healthtalk")}
            className="rounded-3xl bg-emerald-600 px-5 py-4 text-sm font-black text-white shadow-xl shadow-emerald-200"
          >
            🎤 Health Talk
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setQuickOpen((previous) => !previous)}
        className="fixed bottom-[5.2rem] right-5 z-[9997] flex h-16 w-16 items-center justify-center rounded-full bg-orange-500 text-4xl font-black text-white shadow-2xl shadow-orange-300 md:hidden"
        aria-label="Quick input"
      >
        +
      </button>

      <nav className="fixed bottom-0 left-0 right-0 z-[9996] border-t border-orange-100 bg-white/95 px-2 pb-3 pt-2 shadow-2xl shadow-slate-300 backdrop-blur md:hidden">
        <div className="grid grid-cols-5 gap-1">
          {bottomItems.map((key) => {
            const item = menuItems.find((menu) => menu.key === key)!;
            const active = activeTab === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() => chooseTab(key)}
                className={`rounded-2xl px-2 py-2 text-center transition ${
                  active
                    ? "bg-orange-50 text-orange-600"
                    : "bg-white text-slate-400"
                }`}
              >
                <div className="text-lg">{item.emoji}</div>
                <div className="mt-0.5 text-[10px] font-black leading-4">
                  {item.shortLabel}
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {open ? (
        <div className="fixed inset-x-0 bottom-0 top-[4.75rem] z-[9999] bg-slate-950/50 backdrop-blur-sm md:inset-0">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Tutup overlay menu"
          />

          <aside className="absolute bottom-4 right-4 top-0 flex w-[calc(100vw-2rem)] max-w-[430px] flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-white shadow-2xl shadow-slate-950/30 md:top-4">
            <div className="bg-gradient-to-br from-orange-400 via-orange-500 to-amber-500 p-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-white/75">
                    Menu Peserta
                  </div>

                  <div className="mt-2 truncate text-xl font-black">
                    {participantName}
                  </div>

                  <div className="mt-1 text-xs font-bold leading-5 text-white/85">
                    Akses nutrisi, workout, device sync, dan progress wellness.
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
            </div>

            <div className="flex-1 overflow-y-auto bg-[#fff8ef] p-4">
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
                          ? "border-orange-200 bg-white shadow-lg shadow-orange-100"
                          : "border-white bg-white/80 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl ${
                            active
                              ? "bg-orange-500 text-white"
                              : "bg-orange-50 text-orange-600"
                          }`}
                        >
                          {item.emoji}
                        </div>

                        <div className="min-w-0">
                          <div
                            className={`text-sm font-black ${
                              active ? "text-orange-700" : "text-slate-950"
                            }`}
                          >
                            {item.label}
                          </div>

                          <div className="mt-1 text-xs font-bold leading-5 text-slate-500">
                            {item.description}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-orange-100 bg-white p-4">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className="w-full rounded-3xl bg-slate-950 px-5 py-4 text-sm font-black text-white shadow-lg shadow-slate-200"
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


