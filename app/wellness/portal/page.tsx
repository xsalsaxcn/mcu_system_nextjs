"use client";
import WorkoutLogResponsive from "./_components/WorkoutLogResponsive";
import { useEffect, useMemo, useState } from "react";

// WELLNESS_PARTICIPANT_OTP_STRAVA_GFIT_V376_PORTAL
// Participant-facing Wellness portal. Access is gated by OTP.
// Participants can connect Strava and Google Fit legacy/Health Connect bridge option,
// then sync workout history into wellness_activity_logs.

type Step = "request" | "verify" | "portal";

function clean(value: any) {
  return String(value ?? "").trim();
}

function fmt(value: any, suffix = "") {
  const text = clean(value);
  if (!text) return "-";
  return `${text}${suffix ? ` ${suffix}` : ""}`;
}

function providerStatus(integrations: any[], provider: string) {
  return integrations.find((item) => item.provider === provider && item.is_active !== false) || null;
}

function noticeText(value: string) {
  const text = clean(value);
  const map: Record<string, string> = {
    STRAVA_CONNECTED: "Strava berhasil terhubung. Klik Sync Strava untuk menarik activity terbaru.",
    GOOGLE_FIT_CONNECTED: "Google Fit berhasil terhubung. Klik Sync Google Fit untuk menarik activity terbaru.",
    STRAVA_CLIENT_ID_NOT_SET: "STRAVA_CLIENT_ID belum diatur di Environment Variables.",
    GOOGLE_FIT_CLIENT_ID_NOT_SET: "GOOGLE_FIT_CLIENT_ID / GOOGLE_CLIENT_ID belum diatur di Environment Variables.",
    OTP_REQUIRED: "Silakan aktifkan OTP peserta terlebih dahulu.",
  };
  return map[text] || text;
}

export default function WellnessParticipantPortalPage() {
  const [step, setStep] = useState<Step>("request");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Masuk menggunakan KODE/No Karyawan dan OTP.");
  const [form, setForm] = useState({ code: "", email: "", phone: "", otp: "" });
  const [debugOtp, setDebugOtp] = useState("");
  const [participant, setParticipant] = useState<any>(null);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [syncing, setSyncing] = useState("");

  async function loadMe() {
    setLoading(true);
    const result = await fetch("/api/wellness/participant/me", { cache: "no-store" })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      setParticipant(result.participant);
      setIntegrations(result.integrations || []);
      setActivities(result.activities || []);
      setStep("portal");
      setMessage("Portal peserta aktif. Activity manual, Strava, dan Google Fit akan muncul di history.");
    }
    setLoading(false);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notice = params.get("notice");
    if (notice) setMessage(noticeText(notice));
    loadMe();
  }, []);

  function setValue(key: string, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function requestOtp() {
    setMessage("Membuat OTP...");
    const result = await fetch("/api/wellness/participant/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      setStep("verify");
      setDebugOtp(result.debug_otp || "");
      setMessage(result.message || "OTP dibuat. Masukkan kode OTP.");
    } else {
      setMessage(result.message || "Gagal membuat OTP.");
    }
  }

  async function verifyOtp() {
    setMessage("Verifikasi OTP...");
    const result = await fetch("/api/wellness/participant/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      setMessage("OTP berhasil. Memuat portal peserta...");
      await loadMe();
    } else {
      setMessage(result.message || "OTP tidak valid.");
    }
  }

  async function logout() {
    await fetch("/api/wellness/participant/me", { method: "DELETE" }).catch(() => null);
    setParticipant(null);
    setIntegrations([]);
    setActivities([]);
    setStep("request");
    setMessage("Session peserta keluar. Masuk ulang dengan OTP.");
  }

  async function syncProvider(provider: "strava" | "google-fit") {
    setSyncing(provider);
    setMessage(`Sync ${provider === "strava" ? "Strava" : "Google Fit"}...`);
    const result = await fetch(`/api/wellness/integrations/${provider}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: 30 }),
    })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      setMessage(`Sync selesai. ${result.synced || 0} activity masuk dari ${result.source}. ${result.note || ""}`);
      await loadMe();
    } else {
      setMessage(result.message || "Gagal sync activity.");
    }
    setSyncing("");
  }

  const stravaConnected = providerStatus(integrations, "strava");
  const googleFitConnected = providerStatus(integrations, "google_fit");

  const totals = useMemo(() => {
    let minutes = 0;
    let calories = 0;
    for (const item of activities || []) {
      minutes += Number(item.duration_minutes || 0);
      calories += Number(item.calories || 0);
    }
    return { minutes, calories, count: activities?.length || 0 };
  }, [activities]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-blue-700 via-indigo-600 to-emerald-500 p-7 text-white shadow-xl shadow-blue-100">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Wellness Participant Portal</div>
              <h1 className="mt-2 text-3xl font-black md:text-4xl">Portal Peserta Wellness</h1>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-white/90">
                Akses peserta wajib melalui OTP. Setelah masuk, peserta bisa konek Strava dan Google Fit, lalu activity otomatis masuk ke history workout.
              </p>
            </div>
            {participant ? (
              <button onClick={logout} className="rounded-full bg-white px-5 py-3 text-xs font-black text-blue-700">Logout</button>
            ) : null}
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className={`rounded-2xl px-4 py-3 text-sm font-bold leading-6 ${message.toLowerCase().includes("gagal") || message.toLowerCase().includes("belum") ? "bg-amber-50 text-amber-900" : "bg-blue-50 text-blue-800"}`}>
            {loading ? "Memuat portal..." : message}
          </div>
        </section>

        {step !== "portal" ? (
          <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Aktifkan OTP Peserta</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">Masukkan KODE/No Karyawan. Email/No HP dipakai untuk validasi bila data tersedia.</p>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  KODE / No Karyawan
                  <input className="rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" value={form.code} onChange={(e) => setValue("code", e.target.value)} placeholder="Contoh: 58" />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Email, opsional bila sudah ada di data
                  <input className="rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" value={form.email} onChange={(e) => setValue("email", e.target.value)} placeholder="email@company.com" />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  No HP, opsional bila sudah ada di data
                  <input className="rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" value={form.phone} onChange={(e) => setValue("phone", e.target.value)} placeholder="08xxxx" />
                </label>

                {step === "verify" ? (
                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    OTP
                    <input className="rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" value={form.otp} onChange={(e) => setValue("otp", e.target.value)} placeholder="6 digit OTP" />
                  </label>
                ) : null}

                {debugOtp ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">
                    OTP testing: {debugOtp}
                  </div>
                ) : null}

                {step === "request" ? (
                  <button onClick={requestOtp} className="rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-100">Kirim / Buat OTP</button>
                ) : (
                  <button onClick={verifyOtp} className="rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-emerald-100">Verifikasi OTP & Masuk</button>
                )}
              </div>
            </div>

            <aside className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black">Keamanan Akses</h2>
              <div className="mt-4 space-y-3 text-sm font-bold leading-6 text-slate-600">
                <p>Portal ini tidak bisa dibuka langsung tanpa OTP/session peserta.</p>
                <p>Setelah OTP aktif, tombol koneksi Strava dan Google Fit baru muncul.</p>
                <p>Untuk production, matikan <code>WELLNESS_OTP_DEBUG</code> dan sambungkan OTP ke email/WhatsApp gateway.</p>
              </div>
            </aside>
          </section>
        ) : (
          <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5 text-blue-800">
                <div className="text-xs font-black uppercase tracking-wide opacity-70">Peserta</div>
                <div className="mt-2 text-xl font-black">{fmt(participant?.code)} - {participant?.name}</div>
                <div className="mt-1 text-xs font-bold opacity-70">{participant?.company_name || participant?.group_name || "Wellness participant"}</div>
              </div>
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 text-emerald-800">
                <div className="text-xs font-black uppercase tracking-wide opacity-70">Workout</div>
                <div className="mt-2 text-3xl font-black">{totals.count}</div>
                <div className="mt-1 text-xs font-bold opacity-70">activity history</div>
              </div>
              <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5 text-amber-900">
                <div className="text-xs font-black uppercase tracking-wide opacity-70">Durasi / Kalori</div>
                <div className="mt-2 text-xl font-black">{totals.minutes} menit / {totals.calories} kkal</div>
                <div className="mt-1 text-xs font-bold opacity-70">dari semua sumber</div>
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-black">Konek dengan Strava</h2>
                    <p className="mt-1 text-sm font-bold leading-6 text-slate-500">Tarik jenis aktivitas, durasi, jarak, dan kalori dari Strava.</p>
                  </div>
                  <span className={`rounded-full px-3 py-2 text-xs font-black ${stravaConnected ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-500"}`}>
                    {stravaConnected ? "Connected" : "Not connected"}
                  </span>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <a href="/api/wellness/integrations/strava/connect" className="rounded-full bg-orange-600 px-5 py-3 text-xs font-black text-white shadow-lg shadow-orange-100">
                    {stravaConnected ? "Reconnect Strava" : "Konek Strava"}
                  </a>
                  <button onClick={() => syncProvider("strava")} disabled={!stravaConnected || syncing === "strava"} className="rounded-full bg-slate-900 px-5 py-3 text-xs font-black text-white disabled:opacity-40">
                    {syncing === "strava" ? "Sync..." : "Sync Strava"}
                  </button>
                </div>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-black">Konek dengan Google Fit</h2>
                    <p className="mt-1 text-sm font-bold leading-6 text-slate-500">Legacy Google Fit. Untuk project baru, rencanakan Health Connect/native bridge.</p>
                  </div>
                  <span className={`rounded-full px-3 py-2 text-xs font-black ${googleFitConnected ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-500"}`}>
                    {googleFitConnected ? "Connected" : "Not connected"}
                  </span>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <a href="/api/wellness/integrations/google-fit/connect" className="rounded-full bg-blue-600 px-5 py-3 text-xs font-black text-white shadow-lg shadow-blue-100">
                    {googleFitConnected ? "Reconnect Google Fit" : "Konek Google Fit"}
                  </a>
                  <button onClick={() => syncProvider("google-fit")} disabled={!googleFitConnected || syncing === "google-fit"} className="rounded-full bg-slate-900 px-5 py-3 text-xs font-black text-white disabled:opacity-40">
                    {syncing === "google-fit" ? "Sync..." : "Sync Google Fit"}
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">History Workout</h2>
                  <p className="mt-1 text-sm font-bold text-slate-500">Sumber bisa manual, Strava, atau Google Fit.</p>
                </div>
                <button onClick={loadMe} className="rounded-full bg-slate-50 px-4 py-2 text-xs font-black text-slate-700">Refresh</button>
              </div>

              {!activities.length ? (
                <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
                  Belum ada aktivitas. Connect app lalu klik Sync.
                </div>
              ) : (
                <div className="mt-5 overflow-auto rounded-3xl border border-slate-100">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Tanggal</th>
                        <th className="px-4 py-3">Sumber</th>
                        <th className="px-4 py-3">Jenis aktivitas</th>
                        <th className="px-4 py-3">Durasi</th>
                        <th className="px-4 py-3">Kalori</th>
                        <th className="px-4 py-3">Jarak</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activities.map((item, index) => (
                        <tr key={`${item.id || index}-${index}`}>
                          <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{fmt(item.log_date)}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-black text-blue-700">{fmt(item.source)}</td>
                          <td className="min-w-[180px] px-4 py-3 font-black text-slate-900">{fmt(item.activity_name || item.activity_type)}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-600">{fmt(item.duration_minutes, "menit")}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-600">{fmt(item.calories, "kkal")}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-600">{fmt(item.distance_km, "km")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
