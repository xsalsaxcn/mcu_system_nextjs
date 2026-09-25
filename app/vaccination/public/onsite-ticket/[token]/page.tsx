"use client";

// V153.34_SAFE_TICKET_NOTIFICATION_RECOVERY

import { useEffect, useRef, useState } from "react";

const PUSH_DIAG_CACHE = "vaccination-onsite-diagnostics-v1";
const PUSH_DIAG_KEY = "/__vaccination_onsite_push_diag__";

type TicketDiagnostics = {
  permission: string;
  serviceWorker: string;
  subscription: string;
  serverVapid: string;
  serverPush: string;
  providerStatus: string;
  swPushEvent: string;
  showNotification: string;
  osNotificationObject: string;
};

const initialDiagnostics: TicketDiagnostics = {
  permission: "CHECKING",
  serviceWorker: "CHECKING",
  subscription: "CHECKING",
  serverVapid: "CHECKING",
  serverPush: "NOT TESTED",
  providerStatus: "NOT TESTED",
  swPushEvent: "NOT TESTED",
  showNotification: "NOT TESTED",
  osNotificationObject: "NOT TESTED",
};

function statusLabel(value: any) {
  const status = String(value || "").toUpperCase();
  if (status === "CALLED" || status === "IN_PROGRESS") return "GILIRAN ANDA";
  if (status === "SKIPPED") return "TERSKIP";
  if (status === "DONE") return "SELESAI";
  return "MENUNGGU";
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

function diagnosticClass(value: string) {
  const text = String(value || "").toUpperCase();
  if (
    text.includes("READY") ||
    text.includes("GRANTED") ||
    text.includes("ACTIVE") ||
    text.includes("RECEIVED") ||
    text.includes("RESOLVED") ||
    text.includes("201") ||
    text.includes("202") ||
    text.includes("FOUND")
  ) {
    return "text-emerald-700";
  }
  if (
    text.includes("DENIED") ||
    text.includes("FAILED") ||
    text.includes("MISSING") ||
    text.includes("UNSUPPORTED") ||
    text.includes("ERROR") ||
    text.includes("NONE")
  ) {
    return "text-red-700";
  }
  return "text-amber-700";
}

export default function VaccinationOnsiteTicketPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [notificationState, setNotificationState] = useState("Memeriksa notifikasi...");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [calledModalOpen, setCalledModalOpen] = useState(false);
  const [testPushBusy, setTestPushBusy] = useState(false);
  const [testPushMessage, setTestPushMessage] = useState("");
  const [diagnostics, setDiagnostics] = useState<TicketDiagnostics>(initialDiagnostics);
  const lastStatusRef = useRef("");
  const audioRef = useRef<AudioContext | null>(null);

  function patchDiagnostics(values: Partial<TicketDiagnostics>) {
    setDiagnostics((current) => ({ ...current, ...values }));
  }

  function playAlert() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = audioRef.current || new AudioCtx();
      audioRef.current = ctx;
      if (ctx.state === "suspended") void ctx.resume();
      [0, 0.45, 0.9].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.value = 0.08;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.22);
      });
    } catch {}
  }

  function fireCalledAlert(queueNumber: string) {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate([500, 180, 500, 180, 900]); } catch {}
    }
    playAlert();
    setCalledModalOpen(true);

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("Antrean Anda Sudah Dipanggil", {
          body: `${queueNumber} dipanggil. Silakan menuju area vaksinasi sekarang.`,
          tag: `vaccination-onsite-foreground-${queueNumber}`,
          requireInteraction: true,
        });
      } catch {}
    }
  }

  async function load() {
    const json = await fetch(
      `/api/vaccination/onsite-queue/public?ticket_token=${encodeURIComponent(params.token)}&t=${Date.now()}`,
      { cache: "no-store" }
    ).then((r) => r.json());

    if (!json.ok) {
      setError(json.message || "Tiket antrean tidak ditemukan.");
      return null;
    }

    setData(json);
    const status = String(json?.entry?.queue_status || "").toUpperCase();
    const previous = lastStatusRef.current;

    if (
      ["CALLED", "IN_PROGRESS"].includes(status) &&
      !["CALLED", "IN_PROGRESS"].includes(previous)
    ) {
      fireCalledAlert(json?.entry?.queue_number || "Nomor Anda");
    }

    lastStatusRef.current = status;
    return json;
  }

  async function readDevicePushDiagnostic() {
    if (typeof window === "undefined" || !("caches" in window)) return null;
    try {
      const cache = await caches.open(PUSH_DIAG_CACHE);
      const response = await cache.match(PUSH_DIAG_KEY);
      if (!response) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async function clearDevicePushDiagnostic() {
    if (typeof window === "undefined" || !("caches" in window)) return;
    try {
      const cache = await caches.open(PUSH_DIAG_CACHE);
      await cache.delete(PUSH_DIAG_KEY);
    } catch {}
  }

  async function collectDiagnostics() {
    if (typeof window === "undefined") return;

    if (typeof Notification === "undefined") {
      patchDiagnostics({
        permission: "UNSUPPORTED",
        serviceWorker: "UNSUPPORTED",
        subscription: "UNSUPPORTED",
      });
      return;
    }

    patchDiagnostics({ permission: Notification.permission.toUpperCase() });

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      patchDiagnostics({
        serviceWorker: "UNSUPPORTED",
        subscription: "UNSUPPORTED",
      });
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const worker =
        registration?.active ||
        registration?.waiting ||
        registration?.installing;

      patchDiagnostics({
        serviceWorker: worker ? `ACTIVE (${worker.state})` : "NONE",
      });

      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        patchDiagnostics({
          subscription: subscription ? "ACTIVE" : "NONE",
        });

        const notifications = await registration.getNotifications();
        const queueNotifications = notifications.filter((item) => {
          const status = String((item as any)?.data?.status || "").toUpperCase();
          const tag = String(item.tag || "");
          return (
            status === "TEST" ||
            status === "CALLED" ||
            tag.startsWith("vaccination-onsite-test-") ||
            tag.startsWith("vaccination-onsite-called-")
          );
        });

        patchDiagnostics({
          osNotificationObject: queueNotifications.length
            ? `FOUND (${queueNotifications.length})`
            : "NONE",
        });
      }
    } catch {
      patchDiagnostics({
        serviceWorker: "ERROR",
        subscription: "ERROR",
      });
    }

    try {
      const config = await fetch(
        `/api/vaccination/onsite-queue/push?t=${Date.now()}`,
        { cache: "no-store" }
      ).then((r) => r.json());

      patchDiagnostics({
        serverVapid: config?.ok && config?.configured && config?.publicKey
          ? "READY"
          : "MISSING",
      });
    } catch {
      patchDiagnostics({ serverVapid: "ERROR" });
    }

    const deviceDiag = await readDevicePushDiagnostic();
    if (deviceDiag) {
      patchDiagnostics({
        swPushEvent: deviceDiag.receivedAt
          ? `RECEIVED ${new Date(deviceDiag.receivedAt).toLocaleTimeString("id-ID")}`
          : "NOT RECEIVED",
        showNotification: deviceDiag.notificationResult === "resolved"
          ? "RESOLVED"
          : deviceDiag.notificationResult === "failed"
            ? `FAILED: ${String(deviceDiag.error || "").slice(0, 60)}`
            : "NOT TESTED",
      });
    }
  }

  async function unlockAudioFromGesture() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioRef.current || new AudioCtx();
      audioRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.06;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {}
  }

  async function ensureBackgroundPush(promptPermission = false) {
    if (typeof window === "undefined") return false;

    if (
      typeof Notification === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setNotificationState("Browser tidak mendukung Web Push background");
      setPushEnabled(false);
      return false;
    }

    setPushBusy(true);

    try {
      let permission = Notification.permission;

      if (permission === "default" && promptPermission) {
        permission = await Notification.requestPermission();
      }

      patchDiagnostics({ permission: permission.toUpperCase() });

      if (permission !== "granted") {
        setPushEnabled(false);
        setNotificationState(
          permission === "denied"
            ? "Izin notifikasi diblokir"
            : "Notifikasi belum diizinkan"
        );
        return false;
      }

      const config = await fetch(
        `/api/vaccination/onsite-queue/push?t=${Date.now()}`,
        { cache: "no-store" }
      ).then((r) => r.json());

      if (!config.ok || !config.configured || !config.publicKey) {
        setPushEnabled(false);
        setNotificationState("Web Push server belum dikonfigurasi");
        patchDiagnostics({ serverVapid: "MISSING" });
        return false;
      }

      patchDiagnostics({ serverVapid: "READY" });

      const registration = await navigator.serviceWorker.register(
        "/vaccination-onsite-sw.js",
        { scope: "/" }
      );

      try { await registration.update(); } catch {}

      const readyRegistration = await navigator.serviceWorker.ready;
      const worker =
        readyRegistration.active ||
        readyRegistration.waiting ||
        readyRegistration.installing;

      patchDiagnostics({
        serviceWorker: worker ? `ACTIVE (${worker.state})` : "NONE",
      });

      let subscription = await readyRegistration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await readyRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey),
        });
      }

      patchDiagnostics({
        subscription: subscription ? "ACTIVE" : "NONE",
      });

      const save = await fetch("/api/vaccination/onsite-queue/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketToken: params.token,
          subscription: subscription.toJSON(),
        }),
      }).then((r) => r.json());

      if (!save.ok) {
        setPushEnabled(false);
        setNotificationState(save.message || "Gagal menyimpan push subscription");
        return false;
      }

      setPushEnabled(true);
      setNotificationState("Notifikasi background aktif");
      await collectDiagnostics();
      return true;
    } catch (pushError: any) {
      setPushEnabled(false);
      setNotificationState(
        pushError?.message || "Notifikasi background tidak dapat diaktifkan"
      );
      return false;
    } finally {
      setPushBusy(false);
    }
  }

  async function activateTicketNotificationRecovery() {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      setNotificationState("Browser tidak mendukung Notification API");
      patchDiagnostics({ permission: "UNSUPPORTED" });
      return;
    }

    setTestPushMessage("");
    await unlockAudioFromGesture();

    const activated = await ensureBackgroundPush(true);
    patchDiagnostics({ permission: Notification.permission.toUpperCase() });

    if (!activated) {
      if (Notification.permission === "denied") {
        setNotificationState(
          "Notifikasi diblokir browser. Aktifkan Notifications untuk situs ini dari Site settings lalu kembali ke halaman ini."
        );
      }
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const tag = `vaccination-onsite-recovery-${Date.now()}`;
      await registration.showNotification("Panggilan Antrean Aktif", {
        body: "Notifikasi antrean sudah aktif. Anda akan mendapat pemberitahuan saat nomor dipanggil.",
        tag,
        requireInteraction: false,
        silent: false,
        vibrate: [180, 80, 180],
        data: { status: "RECOVERY", ticketToken: params.token },
      } as any);

      if ("vibrate" in navigator) {
        try { navigator.vibrate([120, 70, 120]); } catch {}
      }

      setNotificationState("Panggilan background aktif ✓");
      setTestPushMessage(
        "Approval berhasil. Sekarang klik Test Jalur Notifikasi Background untuk menguji push dari server."
      );
      await collectDiagnostics();
    } catch (recoveryError: any) {
      setTestPushMessage(
        `Background push aktif, tetapi test notifikasi lokal gagal: ${String(recoveryError?.message || recoveryError).slice(0, 120)}`
      );
      await collectDiagnostics();
    }
  }

  useEffect(() => {
    void load();

    let cancelled = false;
    let timer: number | undefined;

    const schedule = async () => {
      if (cancelled) return;
      const latest = await load();
      if (cancelled) return;

      const ahead = Number(latest?.ahead_count ?? 99);
      const status = String(latest?.entry?.queue_status || "WAITING").toUpperCase();
      const delay = ["CALLED", "IN_PROGRESS"].includes(status)
        ? 2500
        : ahead <= 5
          ? 3000
          : ahead <= 30
            ? 7000
            : 12000;

      timer = window.setTimeout(schedule, delay);
    };

    timer = window.setTimeout(schedule, 3000);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [params.token]);

  useEffect(() => {
    void collectDiagnostics();

    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      void ensureBackgroundPush(false);
    }
  }, [params.token]);

  useEffect(() => {
    const refreshPermission = () => {
      if (typeof Notification === "undefined") return;
      patchDiagnostics({ permission: Notification.permission.toUpperCase() });
      if (Notification.permission === "granted") {
        void ensureBackgroundPush(false);
      } else {
        setPushEnabled(false);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshPermission();
    };

    window.addEventListener("focus", refreshPermission);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", refreshPermission);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [params.token]);

  async function testBackgroundPush() {
    setTestPushBusy(true);
    setTestPushMessage("Mengirim test dari server ke push provider...");

    patchDiagnostics({
      serverPush: "SENDING",
      providerStatus: "WAITING",
      swPushEvent: "WAITING",
      showNotification: "WAITING",
      osNotificationObject: "WAITING",
    });

    try {
      await clearDevicePushDiagnostic();

      const json = await fetch("/api/vaccination/onsite-queue/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          ticketToken: params.token,
        }),
      }).then((r) => r.json());

      const statuses = Array.isArray(json?.push?.delivery_statuses)
        ? json.push.delivery_statuses
        : [];

      patchDiagnostics({
        serverPush: json.ok
          ? `SENT ${Number(json?.push?.sent || 0)}`
          : "FAILED",
        providerStatus: statuses.length
          ? statuses.join(", ")
          : json.ok
            ? "ACCEPTED"
            : "NO STATUS",
      });

      if (!json.ok) {
        setTestPushMessage(json.message || "Test background push gagal.");
        return;
      }

      let deviceDiag: any = null;

      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        deviceDiag = await readDevicePushDiagnostic();
        if (deviceDiag?.receivedAt) break;
      }

      if (deviceDiag?.receivedAt) {
        patchDiagnostics({
          swPushEvent: `RECEIVED ${new Date(deviceDiag.receivedAt).toLocaleTimeString("id-ID")}`,
          showNotification: deviceDiag.notificationResult === "resolved"
            ? "RESOLVED"
            : deviceDiag.notificationResult === "failed"
              ? `FAILED: ${String(deviceDiag.error || "").slice(0, 60)}`
              : "UNKNOWN",
        });
      } else {
        patchDiagnostics({
          swPushEvent: "NOT RECEIVED",
          showNotification: "NOT REACHED",
        });
      }

      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        if (registration) {
          const notifications = await registration.getNotifications();
          const testNotifications = notifications.filter((item) => {
            const status = String((item as any)?.data?.status || "").toUpperCase();
            return status === "TEST" || String(item.tag || "").startsWith("vaccination-onsite-test-");
          });

          patchDiagnostics({
            osNotificationObject: testNotifications.length
              ? `FOUND (${testNotifications.length})`
              : "NONE",
          });
        }
      } catch {
        patchDiagnostics({ osNotificationObject: "ERROR" });
      }

      if (
        deviceDiag?.receivedAt &&
        deviceDiag?.notificationResult === "resolved"
      ) {
        setTestPushMessage(
          "Push diterima Service Worker dan showNotification() berhasil. Jika banner/suara tetap tidak terlihat, cek pengaturan notifikasi browser/HP: Allow notifications, Pop-up/Heads-up, Sound, Do Not Disturb, dan battery restriction."
        );
      } else if (Number(json?.push?.sent || 0) > 0) {
        setTestPushMessage(
          "Push provider menerima request server, tetapi Service Worker di device belum tercatat menerima event. Diagnostic di bawah menunjukkan titik putusnya."
        );
      } else {
        setTestPushMessage(
          json.message || "Server belum berhasil mengirim background push."
        );
      }
    } catch (testError: any) {
      setTestPushMessage(testError?.message || "Test background push gagal.");
      patchDiagnostics({
        serverPush: "ERROR",
      });
    } finally {
      setTestPushBusy(false);
      await collectDiagnostics();
    }
  }

  const status = String(data?.entry?.queue_status || "WAITING").toUpperCase();
  const isCalled = ["CALLED", "IN_PROGRESS"].includes(status);
  const isSkipped = status === "SKIPPED";
  const isDone = status === "DONE";

  const notificationPermission = String(diagnostics.permission || "CHECKING").toUpperCase();
  const notificationNeedsApproval = notificationPermission !== "GRANTED";
  const notificationDenied = notificationPermission === "DENIED";

  const diagnosticRows = [
    ["Notification permission", diagnostics.permission],
    ["Service Worker", diagnostics.serviceWorker],
    ["Push subscription", diagnostics.subscription],
    ["Server VAPID", diagnostics.serverVapid],
    ["Server push", diagnostics.serverPush],
    ["Push provider HTTP", diagnostics.providerStatus],
    ["Service Worker push event", diagnostics.swPushEvent],
    ["showNotification()", diagnostics.showNotification],
    ["Notification object OS", diagnostics.osNotificationObject],
  ];

  return (
    <main
      className={`min-h-screen px-4 py-8 ${
        isCalled
          ? "bg-emerald-50 text-emerald-950"
          : isSkipped
            ? "bg-amber-50 text-amber-950"
            : isDone
              ? "bg-slate-100 text-slate-950"
              : "bg-violet-50 text-slate-950"
      }`}
    >
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">
            {error}
          </div>
        ) : null}

        {data ? (
          <>
            <div className="text-center">
              <div className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">
                Antrean Anda
              </div>
              <div
                className={`mt-4 text-7xl font-black leading-none drop-shadow-sm sm:text-8xl ${
                  isCalled
                    ? "text-emerald-700"
                    : isSkipped
                      ? "text-amber-700"
                      : isDone
                        ? "text-slate-700"
                        : "text-violet-700"
                }`}
              >
                {data.entry.queue_number}
              </div>
              <div className="mt-4 text-2xl font-black text-slate-900">
                {statusLabel(status)}
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-600">
                {data.entry.participant_name}
              </div>
            </div>

            {isCalled ? (
              <div className="mt-6 rounded-3xl bg-emerald-600 p-6 text-center text-white shadow-xl">
                <div className="text-3xl font-black">
                  ANTREAN ANDA SUDAH DIPANGGIL
                </div>
                <div className="mt-2 text-lg font-bold">
                  Silakan menuju area vaksinasi sekarang.
                </div>
              </div>
            ) : null}

            {isSkipped ? (
              <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-100 p-5 text-center text-amber-900">
                <div className="text-xl font-black">
                  Nomor Anda sempat ter-skip.
                </div>
                <div className="mt-2 text-sm font-semibold">
                  Datang ke petugas. Petugas dapat klik Aktifkan Kembali tanpa membuat nomor baru.
                </div>
              </div>
            ) : null}

            {!isCalled && !isSkipped && !isDone ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-center">
                  <div className="text-xs font-bold text-slate-500">
                    Sedang Dipanggil
                  </div>
                  <div className="mt-1 text-3xl font-black text-violet-700">
                    {data.event.current_queue_number || "-"}
                  </div>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-center">
                  <div className="text-xs font-bold text-slate-500">
                    Antrean di Depan
                  </div>
                  <div className="mt-1 text-3xl font-black text-violet-700">
                    {data.ahead_count ?? 0}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-6 rounded-2xl border bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              <div>{data.event.session_name}</div>
              <div>
                {[data.event.company_name, data.event.location]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>

            {notificationNeedsApproval ? (
              <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <div className="text-center">
                  <div className="text-sm font-black text-violet-900">
                    Aktifkan Panggilan Antrean
                  </div>
                  <p className="mt-1 text-xs font-semibold text-violet-700">
                    {notificationDenied
                      ? "Notifikasi saat ini diblokir browser. Ubah izin Notifications situs ini menjadi Allow, lalu kembali dan klik Cek Ulang."
                      : "Notifikasi belum diizinkan. Klik satu kali di bawah agar browser menampilkan approval Notification."}
                  </p>
                </div>

                {!notificationDenied ? (
                  <button
                    disabled={pushBusy}
                    onClick={activateTicketNotificationRecovery}
                    className="mt-3 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                  >
                    {pushBusy ? "Mengaktifkan..." : "Aktifkan Panggilan Antrean"}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      patchDiagnostics({ permission: Notification.permission.toUpperCase() });
                      void collectDiagnostics();
                    }}
                    className="mt-3 w-full rounded-xl border border-violet-300 bg-white px-4 py-3 text-sm font-black text-violet-700"
                  >
                    Cek Ulang Izin Notifikasi
                  </button>
                )}
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center text-xs font-bold text-emerald-700">
              {pushBusy
                ? "Memeriksa background push..."
                : pushEnabled
                  ? "Panggilan background aktif ✓"
                  : notificationState}
            </div>

            <button
              disabled={testPushBusy || !pushEnabled}
              onClick={testBackgroundPush}
              className="mt-3 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40"
            >
              {testPushBusy
                ? "Menguji Jalur Push..."
                : "Test Jalur Notifikasi Background"}
            </button>

            {testPushMessage ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
                {testPushMessage}
              </div>
            ) : null}

            <details open className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-black text-slate-800">
                Diagnostic Jalur Notifikasi
              </summary>
              <div className="mt-3 space-y-2 text-xs font-bold">
                {diagnosticRows.map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4">
                    <span className="text-slate-500">{label}</span>
                    <span className={`text-right ${diagnosticClass(value)}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </details>

            <p className="mt-4 text-center text-xs text-slate-500">
              Jika HTTP provider 201/202, Service Worker menerima push, dan
              showNotification() = RESOLVED tetapi banner/suara tidak terlihat,
              berarti Android/browser menahan heads-up atau sound melalui pengaturan notifikasi OS.
            </p>
          </>
        ) : null}
      </div>

      {calledModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="text-sm font-black uppercase tracking-[0.25em] text-emerald-600">
              Peringatan
            </div>
            <div className="mt-3 text-3xl font-black text-slate-950">
              Antrean Anda Sudah Dipanggil
            </div>
            <div className="mt-4 text-6xl font-black text-emerald-700">
              {data?.entry?.queue_number || "-"}
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-600">
              Silakan segera menuju area vaksinasi sekarang.
            </p>
            <button
              onClick={() => setCalledModalOpen(false)}
              className="mt-6 w-full rounded-xl bg-emerald-600 px-4 py-3 font-black text-white"
            >
              Tutup
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
