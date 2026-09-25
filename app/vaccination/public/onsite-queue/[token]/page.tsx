"use client";

// V153.33_SAFE_ONE_APPROVAL_DIAGNOSTICS

import { FormEvent, useEffect, useState } from "react";

type PreflightDiagnostics = {
  notification: string;
  serviceWorker: string;
  subscription: string;
  serverVapid: string;
  localNotification: string;
  audio: string;
  vibration: string;
};

const initialDiagnostics: PreflightDiagnostics = {
  notification: "CHECKING",
  serviceWorker: "CHECKING",
  subscription: "CHECKING",
  serverVapid: "CHECKING",
  localNotification: "NOT TESTED",
  audio: "NOT TESTED",
  vibration: "NOT TESTED",
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

function diagnosticClass(value: string) {
  const text = String(value || "").toUpperCase();
  if (text.includes("READY") || text.includes("GRANTED") || text.includes("ACTIVE") || text.includes("CREATED") || text.includes("SUPPORTED")) {
    return "text-emerald-700";
  }
  if (text.includes("DENIED") || text.includes("ERROR") || text.includes("MISSING") || text.includes("UNSUPPORTED") || text.includes("FAILED")) {
    return "text-red-700";
  }
  return "text-amber-700";
}

export default function VaccinationOnsiteQueueJoinPage({ params }: { params: { token: string } }) {
  const [event, setEvent] = useState<any>(null);
  const [joinToken, setJoinToken] = useState("");
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [approvalState, setApprovalState] = useState<
    "checking" | "required" | "activating" | "ready" | "blocked" | "unsupported" | "server-error"
  >("checking");
  const [approvalMessage, setApprovalMessage] = useState(
    "Menyiapkan sistem panggilan antrean..."
  );
  const [preparedSubscription, setPreparedSubscription] = useState<any>(null);
  const [diagnostics, setDiagnostics] = useState<PreflightDiagnostics>(initialDiagnostics);

  function patchDiagnostics(values: Partial<PreflightDiagnostics>) {
    setDiagnostics((current) => ({ ...current, ...values }));
  }

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const slot = query.get("slot") || "";
    const sig = query.get("sig") || "";

    fetch(
      `/api/vaccination/onsite-queue/public?event_token=${encodeURIComponent(params.token)}&slot=${encodeURIComponent(slot)}&sig=${encodeURIComponent(sig)}&t=${Date.now()}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) {
          setError(json.message || "QR tidak valid.");
          return;
        }
        setEvent(json.event);
        setJoinToken(json.join_token || "");
      })
      .finally(() => setLoading(false));
  }, [params.token]);

  async function playApprovalTone() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        patchDiagnostics({ audio: "UNSUPPORTED" });
        return;
      }
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") await ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.1;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      patchDiagnostics({ audio: ctx.state === "running" ? "READY" : "BLOCKED BY BROWSER" });
      window.setTimeout(() => {
        try { void ctx.close(); } catch {}
      }, 450);
    } catch {
      patchDiagnostics({ audio: "BLOCKED BY BROWSER" });
    }
  }

  async function activateFullApproval(promptPermission: boolean) {
    if (
      typeof window === "undefined" ||
      typeof Notification === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setApprovalState("unsupported");
      setApprovalMessage(
        "Browser ini belum mendukung Web Push yang dibutuhkan sistem antrean."
      );
      patchDiagnostics({
        notification: typeof Notification === "undefined" ? "UNSUPPORTED" : Notification.permission.toUpperCase(),
        serviceWorker: "UNSUPPORTED",
        subscription: "UNSUPPORTED",
      });
      return;
    }

    setApprovalState("activating");
    setError("");
    setApprovalMessage("Menyiapkan satu kali approval panggilan antrean...");

    try {
      const config = await fetch(`/api/vaccination/onsite-queue/push?t=${Date.now()}`, {
        cache: "no-store",
      }).then((r) => r.json());

      if (!config.ok || !config.configured || !config.publicKey) {
        patchDiagnostics({ serverVapid: "MISSING" });
        setApprovalState("server-error");
        setApprovalMessage(
          config.message || "Background Web Push server belum dikonfigurasi."
        );
        return;
      }
      patchDiagnostics({ serverVapid: "READY" });

      let permission = Notification.permission;
      if (permission === "default" && promptPermission) {
        permission = await Notification.requestPermission();
      }

      patchDiagnostics({ notification: permission.toUpperCase() });

      if (permission !== "granted") {
        if (permission === "denied") {
          setApprovalState("blocked");
          setApprovalMessage(
            "Notifikasi diblokir oleh browser. Aktifkan izin notifikasi situs ini dari pengaturan browser lalu klik Cek Ulang."
          );
        } else {
          setApprovalState("required");
          setApprovalMessage(
            "Klik Aktifkan Panggilan Antrean. Browser hanya akan meminta satu izin Notification."
          );
        }
        return;
      }

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
        serviceWorker: worker ? `ACTIVE (${worker.state})` : "FAILED",
      });

      let subscription = await readyRegistration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await readyRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey),
        });
      }

      const subscriptionJson = subscription.toJSON();
      if (
        !subscriptionJson?.endpoint ||
        !subscriptionJson?.keys?.p256dh ||
        !subscriptionJson?.keys?.auth
      ) {
        throw new Error("Push subscription tidak lengkap.");
      }

      setPreparedSubscription(subscriptionJson);
      patchDiagnostics({ subscription: "ACTIVE" });

      const preflightTag = `vaccination-onsite-preflight-${Date.now()}`;
      let localNotification = "API RESOLVED";
      try {
        await readyRegistration.showNotification("Panggilan Antrean Aktif", {
          body: "Notifikasi berhasil diaktifkan. Anda boleh melanjutkan registrasi.",
          tag: preflightTag,
          requireInteraction: false,
          silent: false,
          vibrate: [180, 80, 180],
          data: { status: "PREFLIGHT" },
        } as any);

        await new Promise((resolve) => window.setTimeout(resolve, 350));
        const notifications = await readyRegistration.getNotifications({
          tag: preflightTag,
        });
        localNotification = notifications.length > 0 ? "CREATED IN OS/TRAY" : "API RESOLVED";
      } catch (notificationError: any) {
        localNotification = `FAILED: ${String(notificationError?.message || notificationError).slice(0, 80)}`;
      }
      patchDiagnostics({ localNotification });

      if ("vibrate" in navigator) {
        try {
          const result = navigator.vibrate([120, 70, 120]);
          patchDiagnostics({ vibration: result ? "SUPPORTED" : "NOT CONFIRMED" });
        } catch {
          patchDiagnostics({ vibration: "FAILED" });
        }
      } else {
        patchDiagnostics({ vibration: "UNSUPPORTED" });
      }

      if (promptPermission) {
        await playApprovalTone();
      } else {
        patchDiagnostics({ audio: "WILL UNLOCK ON NEXT TAP" });
      }

      setApprovalState("ready");
      setApprovalMessage(
        localNotification === "CREATED IN OS/TRAY"
          ? "Panggilan antrean siap. Form sudah dibuka."
          : "Sistem push siap. Jika banner test tidak terlihat, OS/browser kemungkinan menahan heads-up atau suara."
      );
    } catch (approvalError: any) {
      setApprovalState("server-error");
      setApprovalMessage(
        approvalError?.message || "Gagal menyiapkan panggilan antrean."
      );
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (
      typeof Notification === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setApprovalState("unsupported");
      return;
    }

    patchDiagnostics({ notification: Notification.permission.toUpperCase() });

    if (Notification.permission === "granted") {
      void activateFullApproval(false);
      return;
    }

    if (Notification.permission === "denied") {
      setApprovalState("blocked");
      setApprovalMessage(
        "Notifikasi pernah diblokir. Aktifkan izin situs dari pengaturan browser lalu klik Cek Ulang."
      );
      return;
    }

    setApprovalState("required");
    setApprovalMessage(
      "Klik sekali untuk mengaktifkan panggilan antrean. Setelah browser menampilkan izin Notification, pilih Allow."
    );
  }, []);

  function checkAgain() {
    setDiagnostics(initialDiagnostics);
    setPreparedSubscription(null);

    if (typeof Notification === "undefined") {
      setApprovalState("unsupported");
      return;
    }

    if (Notification.permission === "granted") {
      void activateFullApproval(false);
      return;
    }

    if (Notification.permission === "denied") {
      patchDiagnostics({ notification: "DENIED" });
      setApprovalState("blocked");
      setApprovalMessage(
        "Notifikasi masih diblokir di browser."
      );
      return;
    }

    patchDiagnostics({ notification: "DEFAULT" });
    setApprovalState("required");
    setApprovalMessage(
      "Klik Aktifkan Panggilan Antrean untuk memunculkan satu izin Notification."
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();

    if (approvalState !== "ready" || !preparedSubscription) {
      setError("Aktifkan panggilan antrean terlebih dahulu.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const json = await fetch("/api/vaccination/onsite-queue/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventToken: params.token,
          joinToken,
          participantName: name,
          employeeId,
          phone,
          pushSubscription: preparedSubscription,
        }),
      }).then((r) => r.json());

      if (!json.ok) {
        setError(json.message || "Gagal membuat antrean.");
        return;
      }

      const ticketToken = json?.entry?.public_token;
      if (!ticketToken) {
        setError("Tiket antrean tidak tersedia.");
        return;
      }

      window.location.href = `/vaccination/public/onsite-ticket/${encodeURIComponent(ticketToken)}`;
    } finally {
      setSubmitting(false);
    }
  }

  const diagnosticsRows = [
    ["Notification permission", diagnostics.notification],
    ["Service Worker", diagnostics.serviceWorker],
    ["Push subscription", diagnostics.subscription],
    ["Server VAPID", diagnostics.serverVapid],
    ["Test notification", diagnostics.localNotification],
    ["Getar", diagnostics.vibration],
    ["Audio foreground", diagnostics.audio],
  ];

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-lg rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
        <div className="text-center">
          <div className="text-xs font-black uppercase tracking-[0.3em] text-violet-300">
            Onsite Queue
          </div>
          <h1 className="mt-3 text-3xl font-black">
            {event?.session_name || "Antrian Vaksinasi"}
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-300">
            {[event?.company_name, event?.location].filter(Boolean).join(" · ")}
          </p>
        </div>

        {loading ? (
          <div className="mt-6 rounded-2xl bg-white/10 p-5 text-center font-bold">
            Memvalidasi QR onsite...
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
            {error}
          </div>
        ) : null}

        {!loading && joinToken && approvalState !== "ready" ? (
          <div className="mt-6 rounded-3xl bg-white p-5 text-slate-950">
            <div className="text-lg font-black">Aktifkan Panggilan Antrean</div>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              {approvalMessage}
            </p>

            <button
              disabled={approvalState === "activating" || approvalState === "unsupported"}
              onClick={() => activateFullApproval(true)}
              className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 font-black text-white disabled:opacity-50"
            >
              {approvalState === "activating"
                ? "Menyiapkan Panggilan..."
                : "Aktifkan Panggilan Antrean"}
            </button>

            {(approvalState === "blocked" || approvalState === "server-error") ? (
              <button
                onClick={checkAgain}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-black text-slate-700"
              >
                Cek Ulang
              </button>
            ) : null}

            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                Diagnostic
              </div>
              <div className="space-y-2 text-xs font-bold">
                {diagnosticsRows.map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4">
                    <span className="text-slate-500">{label}</span>
                    <span className={`text-right ${diagnosticClass(value)}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Tidak ada approval tambahan di halaman tiket. Jika izin browser sudah pernah diberikan,
              sistem akan menyiapkan push otomatis.
            </p>
          </div>
        ) : null}

        {!loading && joinToken && approvalState === "ready" ? (
          <form
            onSubmit={submit}
            className="mt-6 space-y-4 rounded-3xl bg-white p-5 text-slate-950"
          >
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700">
              Panggilan antrean sudah siap. Silakan isi form.
            </div>

            <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-xs font-black text-slate-600">
                Lihat diagnostic notifikasi
              </summary>
              <div className="mt-3 space-y-2 text-xs font-bold">
                {diagnosticsRows.map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4">
                    <span className="text-slate-500">{label}</span>
                    <span className={`text-right ${diagnosticClass(value)}`}>{value}</span>
                  </div>
                ))}
              </div>
            </details>

            <div>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                Nama Lengkap
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-3 font-semibold"
                placeholder="Nama lengkap"
              />
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                NIK Karyawan
              </label>
              <input
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-3 font-semibold"
                placeholder="NIK Karyawan"
              />
              <div className="mt-1 text-xs text-slate-500">
                1 NIK Karyawan hanya mendapat 1 nomor antrean pada event ini.
              </div>
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                No HP
              </label>
              <input
                required
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 15))
                }
                className="mt-1 w-full rounded-xl border px-3 py-3 font-semibold"
                placeholder="08xxxxxxxxxx"
              />
            </div>

            <button
              disabled={submitting}
              className="w-full rounded-xl bg-violet-600 px-4 py-3 font-black text-white disabled:opacity-50"
            >
              {submitting ? "Membuat antrean..." : "Ambil Nomor Antrean"}
            </button>
          </form>
        ) : null}

        <p className="mt-5 text-center text-xs text-slate-400">
          Background notification tetap mengikuti pengaturan heads-up, sound, Do Not Disturb,
          dan battery policy perangkat.
        </p>
      </div>
    </main>
  );
}
