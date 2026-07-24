"use client";

import { useEffect, useMemo, useState } from "react";

// WELLNESS_PORTAL_MENU_UI_V50
// WELLNESS_PARTICIPANT_CHAT_MENU_V54
// WELLNESS_PARTICIPANT_CHAT_NOTIFICATION_BELL_V74
// WELLNESS_PARTICIPANT_ASSIGNED_COACH_MENU_V76
// WELLNESS_PARTICIPANT_CHAT_GROUP_MENU_V76B

// WELLNESS_PARTICIPANT_PORTAL_BOTTOM_NAV_V431
// HARMONY_PARTICIPANT_DEVICE_SYNC_HAMBURGER_V116
// WELLNESS_PARTICIPANT_HEALTH_CONNECT_SEPARATE_MENU_V119
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
  | "support"
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
    key: "support",
    label: "Chat With Admin",
    shortLabel: "Admin",
    description: "Bantuan teknis aplikasi",
    emoji: "🛠️",
  },
  {
    key: "profile",
    label: "Profil",
    shortLabel: "Profile",
    description: "Data peserta dan ID sync",
    emoji: "👤",
  },
];

const bottomItems: PortalTab[] = [
  "home",
  "nutrition",
  "workout",
  "history",
  "devices",
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
  const [quickOpen, setQuickOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [chatGroupOpen, setChatGroupOpen] = useState(
    activeTab === "chat" || activeTab === "support",
  );
  const [coachUnread, setCoachUnread] = useState(0);
  const [adminUnread, setAdminUnread] = useState(0);
  const [assignedCoachName, setAssignedCoachName] = useState("");
  const [nativeHealthConnectSyncAvailable, setNativeHealthConnectSyncAvailable] =
    useState(false);

  const participantName =
    clean(participant?.name) ||
    clean(participant?.participant_name) ||
    clean(participant?.full_name) ||
    "Peserta Wellness";

  const participantId = Number(
    participant?.id ||
      participant?.participant_id ||
      participant?.wellness_participant_id ||
      0,
  );
  const totalUnread = Math.max(0, coachUnread) + Math.max(0, adminUnread);

  const activeItem = useMemo(
    () => menuItems.find((item) => item.key === activeTab) || menuItems[0],
    [activeTab],
  );

  useEffect(() => {
    const bridge =
      typeof window !== "undefined"
        ? (window as any).HarmonyNativeFitness
        : null;

    setNativeHealthConnectSyncAvailable(
      Boolean(bridge && typeof bridge.openDeviceSync === "function"),
    );
  }, []);

  async function loadUnreadNotifications() {
    if (!participantId) {
      setCoachUnread(0);
      setAdminUnread(0);
      return;
    }

    const timestamp = Date.now();
    const [coachResult, adminResult] = await Promise.all([
      fetch(
        `/api/wellness/portal/coach-notes?participant_id=${participantId}&mode=chat_summary&t=${timestamp}`,
        { cache: "no-store" },
      )
        .then((response) => response.json())
        .catch(() => ({ ok: false })),
      fetch(`/api/wellness/support?mode=summary&t=${timestamp}`, {
        cache: "no-store",
      })
        .then((response) => response.json())
        .catch(() => ({ ok: false })),
    ]);

    if (coachResult?.ok) {
      setAssignedCoachName(clean(coachResult?.coach?.name));
      setCoachUnread(
        Math.max(
          0,
          Number(
            coachResult.unread_count ?? coachResult.unread_coach_messages ?? 0,
          ) || 0,
        ),
      );
    }
    if (adminResult?.ok) {
      setAdminUnread(Math.max(0, Number(adminResult.unread_count || 0) || 0));
    }
  }

  useEffect(() => {
    if (!participantId) return;

    void loadUnreadNotifications();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadUnreadNotifications();
      }
    }, 30000);

    const refreshOnFocus = () => void loadUnreadNotifications();
    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadUnreadNotifications();
      }
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [participantId]);

  useEffect(() => {
    setNotificationOpen(false);
    if (activeTab === "chat") setCoachUnread(0);
    if (activeTab === "support") setAdminUnread(0);
    if (activeTab === "chat" || activeTab === "support") {
      setChatGroupOpen(true);
    }
  }, [activeTab]);

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
    setNotificationOpen(false);
    if (tab === "chat") setCoachUnread(0);
    if (tab === "support") setAdminUnread(0);
  }

  function openNativeHealthConnectSyncV119() {
    const bridge =
      typeof window !== "undefined"
        ? (window as any).HarmonyNativeFitness
        : null;

    if (!bridge || typeof bridge.openDeviceSync !== "function") {
      return;
    }

    try {
      bridge.openDeviceSync();
      setOpen(false);
      setQuickOpen(false);
      setNotificationOpen(false);
    } catch {
      // Existing Device Sync remains untouched when native Android panel fails.
    }
  }


  function NotificationBell() {
    // WELLNESS_NOTIFICATION_BELL_ALL_SCREENS_V75
    // Lonceng selalu terlihat di seluruh Portal Peserta. Badge dan animasi
    // hanya aktif ketika terdapat chat baru.
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setNotificationOpen((previous) => !previous)}
          className={`relative flex h-12 w-12 items-center justify-center rounded-2xl border bg-white text-xl shadow-lg shadow-slate-200 ${
            totalUnread > 0
              ? "border-amber-200 text-amber-600"
              : "border-slate-100 text-slate-500"
          }`}
          aria-label={
            totalUnread > 0
              ? `Ada ${totalUnread} chat baru`
              : "Buka notifikasi chat"
          }
          aria-expanded={notificationOpen}
        >
          <span
            className={
              totalUnread > 0 ? "animate-[pulse_1.8s_ease-in-out_infinite]" : ""
            }
          >
            🔔
          </span>
          {totalUnread > 0 ? (
            <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white ring-2 ring-white">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          ) : null}
        </button>

        {notificationOpen ? (
          <div className="absolute right-0 top-[3.5rem] z-[10020] w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white shadow-2xl shadow-slate-950/20">
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">
                Notifikasi
              </div>
              <div className="mt-1 text-sm font-black text-slate-950">
                Ada chat baru
              </div>
            </div>

            <div className="grid gap-2 p-3">
              {coachUnread > 0 ? (
                <button
                  type="button"
                  onClick={() => chooseTab("chat")}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-teal-50 px-4 py-3 text-left"
                >
                  <div>
                    <div className="text-sm font-black text-teal-950">
                      💬 Chat dari Coach {assignedCoachName || ""}
                    </div>
                    <div className="mt-1 text-[11px] font-bold text-teal-700">
                      Buka percakapan Coach
                    </div>
                  </div>
                  <span className="rounded-full bg-teal-600 px-2.5 py-1 text-xs font-black text-white">
                    {coachUnread}
                  </span>
                </button>
              ) : null}

              {adminUnread > 0 ? (
                <button
                  type="button"
                  onClick={() => chooseTab("support")}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-indigo-50 px-4 py-3 text-left"
                >
                  <div>
                    <div className="text-sm font-black text-indigo-950">
                      🛠️ Chat dari Admin
                    </div>
                    <div className="mt-1 text-[11px] font-bold text-indigo-700">
                      Buka bantuan teknis
                    </div>
                  </div>
                  <span className="rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-black text-white">
                    {adminUnread}
                  </span>
                </button>
              ) : null}

              {totalUnread === 0 ? (
                <>
                  <div className="rounded-2xl bg-slate-50 px-4 py-4 text-center">
                    <div className="text-sm font-black text-slate-800">
                      Belum ada chat baru
                    </div>
                    <div className="mt-1 text-[11px] font-bold text-slate-500">
                      Lonceng tetap aktif pada seluruh halaman portal.
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => chooseTab("chat")}
                      className="rounded-2xl bg-teal-50 px-3 py-3 text-xs font-black text-teal-800"
                    >
                      💬 Chat Coach {assignedCoachName || ""}
                    </button>
                    <button
                      type="button"
                      onClick={() => chooseTab("support")}
                      className="rounded-2xl bg-indigo-50 px-3 py-3 text-xs font-black text-indigo-800"
                    >
                      🛠️ Chat Admin
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
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
              {activeItem.emoji}{" "}
              {activeItem.key === "chat" && assignedCoachName
                ? `Chat With Coach ${assignedCoachName}`
                : activeItem.label}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <NotificationBell />
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
      </div>

      <div className="fixed right-4 top-4 z-[9998] hidden items-center gap-2 md:flex">
        <NotificationBell />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-100 bg-white text-2xl font-black text-slate-900 shadow-2xl shadow-slate-300/60"
          aria-label="Buka menu peserta"
        >
          ☰
        </button>
      </div>

      {quickOpen && !["chat", "support", "profile"].includes(activeTab) ? (
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

      {!(["chat", "support", "profile"] as PortalTab[]).includes(activeTab) ? (
        <button
          type="button"
          onClick={() => setQuickOpen((previous) => !previous)}
          className="fixed bottom-[5.2rem] right-5 z-[9997] flex h-16 w-16 items-center justify-center rounded-full bg-orange-500 text-4xl font-black text-white shadow-2xl shadow-orange-300 md:hidden"
          aria-label="Quick input"
        >
          +
        </button>
      ) : null}

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
                  if (item.key === "support") return null;

                  if (item.key === "chat") {
                    const chatActive =
                      activeTab === "chat" || activeTab === "support";
                    return (
                      <div
                        key="chat-group"
                        className={`overflow-hidden rounded-3xl border transition ${
                          chatActive
                            ? "border-orange-200 bg-white shadow-lg shadow-orange-100"
                            : "border-white bg-white/80"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setChatGroupOpen((previous) => !previous)
                          }
                          className="flex w-full items-center justify-between gap-3 p-4 text-left"
                          aria-expanded={chatGroupOpen}
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <div
                              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl ${
                                chatActive
                                  ? "bg-orange-500 text-white"
                                  : "bg-orange-50 text-orange-600"
                              }`}
                            >
                              💬
                            </div>
                            <div className="min-w-0">
                              <div
                                className={`text-sm font-black ${
                                  chatActive
                                    ? "text-orange-700"
                                    : "text-slate-950"
                                }`}
                              >
                                Chat
                              </div>
                              <div className="mt-1 text-xs font-bold leading-5 text-slate-500">
                                Percakapan Coach dan bantuan Admin
                              </div>
                            </div>
                          </div>
                          <span className="text-lg font-black text-slate-500">
                            {chatGroupOpen ? "−" : "+"}
                          </span>
                        </button>

                        {chatGroupOpen ? (
                          <div className="grid gap-2 border-t border-orange-100 bg-orange-50/45 p-3">
                            <button
                              type="button"
                              onClick={() => chooseTab("chat")}
                              className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left ${
                                activeTab === "chat"
                                  ? "bg-white text-orange-700 shadow-sm"
                                  : "bg-white/70 text-slate-900"
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="break-words text-sm font-black leading-5">
                                  Chat With Coach{assignedCoachName
                                    ? ` ${assignedCoachName}`
                                    : ""}
                                </div>
                                <div className="mt-1 text-[11px] font-bold text-slate-500">
                                  Konsultasi wellness
                                </div>
                              </div>
                              {coachUnread > 0 ? (
                                <span className="rounded-full bg-rose-500 px-2.5 py-1 text-xs font-black text-white">
                                  {coachUnread}
                                </span>
                              ) : null}
                            </button>

                            <button
                              type="button"
                              onClick={() => chooseTab("support")}
                              className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left ${
                                activeTab === "support"
                                  ? "bg-white text-indigo-700 shadow-sm"
                                  : "bg-white/70 text-slate-900"
                              }`}
                            >
                              <div>
                                <div className="text-sm font-black">
                                  Chat With Admin
                                </div>
                                <div className="mt-1 text-[11px] font-bold text-slate-500">
                                  Bantuan teknis aplikasi
                                </div>
                              </div>
                              {adminUnread > 0 ? (
                                <span className="rounded-full bg-rose-500 px-2.5 py-1 text-xs font-black text-white">
                                  {adminUnread}
                                </span>
                              ) : null}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  }

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

                {nativeHealthConnectSyncAvailable ? (
                  <button
                    type="button"
                    onClick={openNativeHealthConnectSyncV119}
                    className="w-full rounded-3xl border border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-50 p-4 text-left transition hover:border-teal-300 hover:bg-teal-50"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-xl text-white">
                        🔄
                      </div>

                      <div className="min-w-0">
                        <div className="text-sm font-black text-teal-950">
                          Health Connect Sync
                        </div>
                        <div className="mt-1 text-xs font-bold leading-5 text-teal-700/80">
                          Participant ID, izin, sumber wearable, diagnostic, dan sync Android
                        </div>
                        <div className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-teal-700 shadow-sm">
                          Menu baru · tidak mengganti Device Sync
                        </div>
                      </div>
                    </div>
                  </button>
                ) : null}
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
