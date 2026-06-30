"use client";

import { useEffect, useMemo, useState } from "react";
import ParticipantPortalMenu from "./_components/ParticipantPortalMenu";
import WorkoutLogResponsive from "./_components/WorkoutLogResponsive";

// WELLNESS_PARTICIPANT_PORTAL_V393
// Participant-only portal UX:
// - employee code + username + email + phone + OTP flow
// - participant-only hamburger menu
// - daily nutrition input
// - manual workout input
// - Strava + Google Fit sync
// - mobile-first workout history cards

type Step = "request" | "verify" | "portal";
type PortalTab = "home" | "nutrition" | "workout" | "history" | "devices" | "profile";

function clean(value: any) {
  return String(value ?? "").trim();
}

function asNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmt(value: any, suffix = "") {
  const text = clean(value);
  if (!text) return "-";
  return `${text}${suffix ? ` ${suffix}` : ""}`;
}

function fmtNumber(value: any, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";

  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function providerStatus(integrations: any[], provider: string) {
  return (
    integrations.find((item) => {
      if (item?.provider !== provider) return false;
      if (item?.is_active === false) return false;
      if (item?.is_active === 0) return false;
      return true;
    }) || null
  );
}

function noticeText(value: string) {
  const text = clean(value);

  const map: Record<string, string> = {
    STRAVA_CONNECTED:
      "Strava berhasil terhubung. Klik Sync Strava untuk menarik activity terbaru.",
    GOOGLE_FIT_CONNECTED:
      "Google Fit berhasil terhubung. Klik Sync Google Fit untuk menarik activity terbaru.",
    STRAVA_CLIENT_ID_NOT_SET:
      "STRAVA_CLIENT_ID belum diatur di Environment Variables.",
    STRAVA_CLIENT_ID_MISSING:
      "STRAVA_CLIENT_ID belum terbaca di Environment Variables Vercel Production.",
    GOOGLE_FIT_CLIENT_ID_MISSING:
      "GOOGLE_FIT_CLIENT_ID belum terbaca di Environment Variables Vercel Production.",
    APP_SECRET_MISSING:
      "APP_SECRET belum terbaca di Environment Variables.",
    PORTAL_SESSION_REQUIRED:
      "Session peserta belum aktif. Silakan login OTP ulang.",
    STRAVA_TOKEN_EXCHANGE_FAILED:
      "Strava sudah authorize, tetapi token gagal dibuat. Cek STRAVA_CLIENT_SECRET.",
    GOOGLE_FIT_TOKEN_EXCHANGE_FAILED:
      "Google sudah authorize, tetapi token gagal dibuat. Cek GOOGLE_FIT_CLIENT_SECRET.",
    STRAVA_SAVE_FAILED:
      "Strava sudah authorize, tetapi gagal menyimpan koneksi ke database.",
    GOOGLE_FIT_SAVE_FAILED:
      "Google Fit sudah authorize, tetapi gagal menyimpan koneksi ke database.",
    STRAVA_STATE_INVALID:
      "State Strava tidak valid atau sudah kedaluwarsa. Silakan konek ulang.",
    GOOGLE_FIT_STATE_INVALID:
      "State Google Fit tidak valid atau sudah kedaluwarsa. Silakan konek ulang.",
    OTP_REQUIRED: "Silakan aktifkan OTP peserta terlebih dahulu.",
  };

  return map[text] || text;
}

const mealOptions = [
  { value: "breakfast", label: "Breakfast / Sarapan" },
  { value: "lunch", label: "Lunch / Makan Siang" },
  { value: "dinner", label: "Dinner / Makan Malam" },
  { value: "snack", label: "Snack / Camilan" },
];

const activityOptions = [
  "Walking",
  "Jogging",
  "Running",
  "Cycling",
  "Gym",
  "Strength Training",
  "Swimming",
  "Yoga",
  "Workout",
  "Other",
];

export default function WellnessParticipantPortalPage() {
  const [step, setStep] = useState<Step>("request");
  const [activeTab, setActiveTab] = useState<PortalTab>("home");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(
    "Masuk menggunakan Kode Karyawan. Lengkapi username, email, dan nomor HP untuk aktivasi portal peserta."
  );
  const [form, setForm] = useState({
    code: "",
    username: "",
    email: "",
    phone: "",
    otp: "",
  });
  const [participant, setParticipant] = useState<any>(null);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [activitySummary, setActivitySummary] = useState<any[]>([]);
  const [clinicalHistory, setClinicalHistory] = useState<any[]>([]);
  const [nutritionLogs, setNutritionLogs] = useState<any[]>([]);
  const [syncing, setSyncing] = useState("");

  const [nutritionForm, setNutritionForm] = useState({
    log_date: todayDate(),
    meal_type: "breakfast",
    food_name: "",
    portion: "",
    calories: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
    notes: "",
  });

  const [workoutForm, setWorkoutForm] = useState({
    log_date: todayDate(),
    started_at: "",
    activity_type: "Walking",
    activity_name: "",
    duration_minutes: "",
    calories: "",
    distance_km: "",
    notes: "",
  });

  async function loadNutrition() {
    const result = await fetch("/api/wellness/participant/nutrition", {
      cache: "no-store",
    })
      .then((response) => response.json())
      .catch(() => ({ ok: false, logs: [] }));

    if (result.ok) {
      setNutritionLogs(result.logs || []);
    }
  }

  async function loadMe(options?: { keepMessage?: boolean }) {
    setLoading(true);

    const result = await fetch("/api/wellness/participant/me", {
      cache: "no-store",
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      setParticipant(result.participant);
      setIntegrations(result.integrations || []);
      setActivities(result.activities || []);
      setActivitySummary(result.activity_summary || []);
      setClinicalHistory(result.clinical_history || []);
      setStep("portal");

      if (!options?.keepMessage) {
        setMessage("Portal peserta aktif. Silakan input nutrisi harian, workout manual, atau sync device.");
      }

      await loadNutrition();
    }

    setLoading(false);
    return result;
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notice = params.get("notice");

    if (notice) {
      setMessage(noticeText(notice));
      loadMe({ keepMessage: true });
    } else {
      loadMe();
    }
  }, []);

  function setValue(key: string, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function setNutritionValue(key: string, value: string) {
    setNutritionForm((previous) => ({ ...previous, [key]: value }));
  }

  function setWorkoutValue(key: string, value: string) {
    setWorkoutForm((previous) => ({ ...previous, [key]: value }));
  }

  async function requestOtp() {
    if (!clean(form.code)) {
      setMessage("Kode Karyawan wajib diisi.");
      return;
    }

    if (!clean(form.username)) {
      setMessage("Username wajib dibuat agar peserta bisa mengenali akun portalnya.");
      return;
    }

    if (!clean(form.email) && !clean(form.phone)) {
      setMessage("Isi minimal email atau nomor HP untuk pengiriman OTP.");
      return;
    }

    setMessage("Mengirim OTP peserta...");

    const payload = {
      ...form,
      portal_username: form.username,
      portal_email: form.email,
      portal_phone: form.phone,
    };

    const result = await fetch("/api/wellness/participant/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      setStep("verify");
      setMessage(
        result.message ||
          "OTP sudah dikirim. Cek email/WhatsApp/SMS sesuai data yang kamu isi."
      );
    } else {
      setMessage(result.message || "Gagal membuat atau mengirim OTP.");
    }
  }

  async function verifyOtp() {
    if (!clean(form.otp)) {
      setMessage("OTP wajib diisi.");
      return;
    }

    setMessage("Verifikasi OTP...");

    const result = await fetch("/api/wellness/participant/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      setMessage("OTP berhasil. Memuat portal peserta...");
      await loadMe();
    } else {
      setMessage(result.message || "OTP tidak valid.");
    }
  }

  async function logout() {
    await fetch("/api/wellness/participant/me", {
      method: "DELETE",
    }).catch(() => null);

    setParticipant(null);
    setIntegrations([]);
    setActivities([]);
    setActivitySummary([]);
    setClinicalHistory([]);
    setNutritionLogs([]);
    setStep("request");
    setActiveTab("home");
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
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      const fetched = Number(result.fetched || 0);
      const inserted = Number(result.inserted || result.synced || 0);
      const updated = Number(result.updated || 0);
      const skipped = Number(result.skipped || 0);

      setMessage(
        result.message ||
          `Sync selesai. Fetched ${fetched}, masuk baru ${inserted}, update ${updated}, skip ${skipped}.`
      );

      await loadMe({ keepMessage: true });
    } else {
      setMessage(result.message || "Gagal sync activity.");
    }

    setSyncing("");
  }

  async function saveNutrition() {
    if (!clean(nutritionForm.food_name)) {
      setMessage("Nama makanan wajib diisi.");
      return;
    }

    setMessage("Menyimpan nutrisi harian...");

    const result = await fetch("/api/wellness/participant/nutrition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nutritionForm),
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      setMessage("Nutrisi harian berhasil disimpan.");
      setNutritionForm((previous) => ({
        ...previous,
        food_name: "",
        portion: "",
        calories: "",
        protein_g: "",
        carbs_g: "",
        fat_g: "",
        notes: "",
      }));
      await loadNutrition();
      setActiveTab("home");
    } else {
      setMessage(result.message || "Gagal menyimpan nutrisi.");
    }
  }

  async function saveWorkout() {
    if (!clean(workoutForm.activity_type)) {
      setMessage("Jenis workout wajib diisi.");
      return;
    }

    if (!clean(workoutForm.duration_minutes)) {
      setMessage("Durasi workout wajib diisi.");
      return;
    }

    setMessage("Menyimpan workout manual...");

    const result = await fetch("/api/wellness/participant/workout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workoutForm),
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      setMessage("Workout manual berhasil disimpan.");
      setWorkoutForm((previous) => ({
        ...previous,
        started_at: "",
        activity_name: "",
        duration_minutes: "",
        calories: "",
        distance_km: "",
        notes: "",
      }));
      await loadMe({ keepMessage: true });
      setActiveTab("history");
    } else {
      setMessage(result.message || "Gagal menyimpan workout.");
    }
  }

  const stravaConnected = providerStatus(integrations, "strava");
  const googleFitConnected = providerStatus(integrations, "google_fit");

  const workoutItems = useMemo(() => {
    if (Array.isArray(activities) && activities.length > 0) return activities;

    if (Array.isArray(activitySummary) && activitySummary.length > 0) {
      return activitySummary;
    }

    return [];
  }, [activities, activitySummary]);

  const todayNutrition = useMemo(() => {
    const today = todayDate();
    return nutritionLogs.filter((item) => clean(item.log_date).slice(0, 10) === today);
  }, [nutritionLogs]);

  const totals = useMemo(() => {
    let workoutMinutes = 0;
    let workoutCalories = 0;
    let steps = 0;
    let foodCalories = 0;
    let protein = 0;
    let carbs = 0;
    let fat = 0;

    for (const item of workoutItems || []) {
      workoutMinutes += asNumber(item.duration_minutes || item.total_duration_minutes);
      workoutCalories += asNumber(item.calories || item.total_calories);
      steps += asNumber(item.steps || item.total_steps);
    }

    for (const item of todayNutrition || []) {
      foodCalories += asNumber(item.calories);
      protein += asNumber(item.protein_g);
      carbs += asNumber(item.carbs_g);
      fat += asNumber(item.fat_g);
    }

    return {
      workoutMinutes,
      workoutCalories,
      steps,
      workoutCount: workoutItems?.length || 0,
      foodCalories,
      protein,
      carbs,
      fat,
      foodCount: todayNutrition.length,
    };
  }, [workoutItems, todayNutrition]);

  const lastClinical = Array.isArray(clinicalHistory) && clinicalHistory.length > 0
    ? clinicalHistory[0]
    : null;

  const isWarningMessage =
    message.toLowerCase().includes("gagal") ||
    message.toLowerCase().includes("belum") ||
    message.toLowerCase().includes("error") ||
    message.toLowerCase().includes("invalid") ||
    message.toLowerCase().includes("wajib");

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {step === "portal" ? (
        <ParticipantPortalMenu
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          onLogout={logout}
          participant={participant}
        />
      ) : null}

      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-blue-700 via-indigo-600 to-emerald-500 p-6 text-white shadow-xl shadow-blue-100 md:p-8">
          <div className="flex flex-col gap-3 pr-14 md:pr-0">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-white/70">
              Wellness Participant Portal
            </div>

            <h1 className="text-3xl font-black md:text-4xl">
              {step === "portal" ? "Portal Individu Peserta" : "Aktivasi Portal Peserta"}
            </h1>

            <p className="max-w-3xl text-sm font-bold leading-6 text-white/90">
              {step === "portal"
                ? "Pantau aktivitas, input nutrisi harian, catat workout manual, dan sinkronkan perangkat wellness kamu."
                : "Masukkan Kode Karyawan, buat username, lengkapi email/nomor HP, lalu verifikasi OTP untuk masuk."}
            </p>
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div
            className={`rounded-2xl px-4 py-3 text-sm font-bold leading-6 ${
              isWarningMessage
                ? "bg-amber-50 text-amber-900"
                : "bg-blue-50 text-blue-800"
            }`}
          >
            {loading ? "Memuat portal..." : message}
          </div>
        </section>

        {step !== "portal" ? (
          <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Login Peserta</h2>

              <p className="mt-1 text-sm font-bold text-slate-500">
                Gunakan Kode Karyawan sesuai data program wellness. Username
                digunakan sebagai identitas portal peserta.
              </p>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Kode Karyawan
                  <input
                    className="rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    value={form.code}
                    onChange={(e) => setValue("code", e.target.value)}
                    placeholder="Contoh: 278"
                  />
                </label>

                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Buat Username
                  <input
                    className="rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    value={form.username}
                    onChange={(e) => setValue("username", e.target.value)}
                    placeholder="Contoh: samsul278"
                  />
                </label>

                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Email
                  <input
                    type="email"
                    className="rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    value={form.email}
                    onChange={(e) => setValue("email", e.target.value)}
                    placeholder="nama@email.com"
                  />
                </label>

                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Nomor HP
                  <input
                    className="rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    value={form.phone}
                    onChange={(e) => setValue("phone", e.target.value)}
                    placeholder="08xxxx"
                  />
                </label>

                {step === "verify" ? (
                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    OTP
                    <input
                      className="rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      value={form.otp}
                      onChange={(e) => setValue("otp", e.target.value)}
                      placeholder="6 digit OTP"
                    />
                  </label>
                ) : null}

                {step === "request" ? (
                  <button
                    type="button"
                    onClick={requestOtp}
                    className="rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-100"
                  >
                    Kirim OTP
                  </button>
                ) : (
                  <div className="grid gap-3">
                    <button
                      type="button"
                      onClick={verifyOtp}
                      className="rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-emerald-100"
                    >
                      Verifikasi OTP & Masuk
                    </button>

                    <button
                      type="button"
                      onClick={requestOtp}
                      className="rounded-2xl bg-slate-100 px-5 py-3 text-xs font-black text-slate-700"
                    >
                      Kirim Ulang OTP
                    </button>
                  </div>
                )}
              </div>
            </div>

            <aside className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black">Akses Peserta</h2>

              <div className="mt-4 space-y-3 text-sm font-bold leading-6 text-slate-600">
                <p>Portal ini khusus peserta program wellness.</p>
                <p>Setelah masuk, peserta dapat input nutrisi harian dan workout manual.</p>
                <p>Peserta juga bisa menghubungkan Strava dan Google Fit untuk sinkronisasi otomatis.</p>
                <p className="rounded-2xl bg-amber-50 p-3 text-amber-900">
                  Untuk OTP asli, pastikan backend request-otp sudah tersambung
                  ke email/WhatsApp gateway dan <code>WELLNESS_OTP_DEBUG</code> dimatikan.
                </p>
              </div>
            </aside>
          </section>
        ) : (
          <div className="mt-6 space-y-6">
            <section className="grid gap-4 md:grid-cols-4">
              <SummaryCard
                label="Calories In"
                value={`${fmtNumber(totals.foodCalories, 0)} kkal`}
                note={`${totals.foodCount} input nutrisi hari ini`}
                tone="blue"
              />

              <SummaryCard
                label="Workout Calories"
                value={`${fmtNumber(totals.workoutCalories, 0)} kkal`}
                note={`${fmtNumber(totals.workoutMinutes, 1)} menit aktivitas`}
                tone="emerald"
              />

              <SummaryCard
                label="Steps"
                value={fmtNumber(totals.steps, 0)}
                note="dari manual/device bila tersedia"
                tone="amber"
              />

              <SummaryCard
                label="BMI / Tensi"
                value={lastClinical?.bmi ? fmtNumber(lastClinical.bmi, 1) : "-"}
                note={
                  lastClinical?.systolic
                    ? `${lastClinical.systolic}/${lastClinical.diastolic || "-"} mmHg`
                    : "data klinis terakhir"
                }
                tone="slate"
              />
            </section>

            {activeTab === "home" ? (
              <HomeTab
                participant={participant}
                nutritionLogs={todayNutrition}
                totals={totals}
                setActiveTab={setActiveTab}
                stravaConnected={!!stravaConnected}
                googleFitConnected={!!googleFitConnected}
              />
            ) : null}

            {activeTab === "nutrition" ? (
              <NutritionTab
                form={nutritionForm}
                setValue={setNutritionValue}
                saveNutrition={saveNutrition}
                logs={nutritionLogs}
              />
            ) : null}

            {activeTab === "workout" ? (
              <WorkoutTab
                form={workoutForm}
                setValue={setWorkoutValue}
                saveWorkout={saveWorkout}
              />
            ) : null}

            {activeTab === "history" ? (
              <HistoryTab
                workoutItems={workoutItems}
                nutritionLogs={nutritionLogs}
                refresh={() => loadMe()}
              />
            ) : null}

            {activeTab === "devices" ? (
              <DevicesTab
                stravaConnected={!!stravaConnected}
                googleFitConnected={!!googleFitConnected}
                syncing={syncing}
                syncProvider={syncProvider}
              />
            ) : null}

            {activeTab === "profile" ? (
              <ProfileTab
                participant={participant}
                integrations={integrations}
                logout={logout}
              />
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "blue" | "emerald" | "amber" | "slate";
}) {
  const toneClass: Record<string, string> = {
    blue: "border-blue-100 bg-blue-50 text-blue-800",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-800",
    amber: "border-amber-100 bg-amber-50 text-amber-900",
    slate: "border-slate-200 bg-white text-slate-900",
  };

  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${toneClass[tone]}`}>
      <div className="text-xs font-black uppercase tracking-wide opacity-70">
        {label}
      </div>

      <div className="mt-2 text-2xl font-black">{value}</div>

      <div className="mt-1 text-xs font-bold opacity-70">{note}</div>
    </div>
  );
}

function HomeTab({
  participant,
  nutritionLogs,
  totals,
  setActiveTab,
  stravaConnected,
  googleFitConnected,
}: {
  participant: any;
  nutritionLogs: any[];
  totals: any;
  setActiveTab: (tab: PortalTab) => void;
  stravaConnected: boolean;
  googleFitConnected: boolean;
}) {
  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
          Halo Peserta
        </div>

        <h2 className="mt-2 text-2xl font-black text-slate-950">
          {participant?.name || "Peserta Wellness"}
        </h2>

        <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
          Hari ini kamu sudah mencatat {totals.foodCount} nutrisi dan memiliki
          {` ${totals.workoutCount}`} catatan workout/device di history.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={() => setActiveTab("nutrition")}
            className="rounded-3xl bg-blue-600 px-5 py-4 text-left text-sm font-black text-white shadow-lg shadow-blue-100"
          >
            + Input Nutrisi
            <div className="mt-1 text-xs font-bold text-white/80">
              Catat makan harian
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("workout")}
            className="rounded-3xl bg-emerald-600 px-5 py-4 text-left text-sm font-black text-white shadow-lg shadow-emerald-100"
          >
            + Input Workout
            <div className="mt-1 text-xs font-bold text-white/80">
              Catat olahraga manual
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("devices")}
            className="rounded-3xl bg-slate-900 px-5 py-4 text-left text-sm font-black text-white shadow-lg shadow-slate-200"
          >
            Connect Device
            <div className="mt-1 text-xs font-bold text-white/70">
              Strava/Fit status: {stravaConnected || googleFitConnected ? "ada" : "belum"}
            </div>
          </button>
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-black">Nutrisi Hari Ini</h3>

        <div className="mt-4 space-y-3">
          {nutritionLogs.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm font-bold text-slate-400">
              Belum ada input nutrisi hari ini.
            </div>
          ) : (
            nutritionLogs.slice(0, 4).map((item, index) => (
              <div
                key={`${item.id || index}-${index}`}
                className="rounded-2xl bg-slate-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-slate-900">
                      {item.food_name || "-"}
                    </div>
                    <div className="mt-0.5 text-xs font-bold capitalize text-slate-500">
                      {item.meal_type || "-"} • {item.portion || "-"}
                    </div>
                  </div>
                  <div className="text-sm font-black text-blue-700">
                    {fmt(item.calories, "kkal")}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function NutritionTab({
  form,
  setValue,
  saveNutrition,
  logs,
}: {
  form: any;
  setValue: (key: string, value: string) => void;
  saveNutrition: () => void;
  logs: any[];
}) {
  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black">Input Nutrisi Harian</h2>
        <p className="mt-1 text-sm font-bold text-slate-500">
          Catat makanan harian peserta. Kalori dan makro boleh diisi manual.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Input label="Tanggal">
            <input
              type="date"
              value={form.log_date}
              onChange={(e) => setValue("log_date", e.target.value)}
              className="field"
            />
          </Input>

          <Input label="Waktu Makan">
            <select
              value={form.meal_type}
              onChange={(e) => setValue("meal_type", e.target.value)}
              className="field"
            >
              {mealOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Input>

          <Input label="Nama Makanan">
            <input
              value={form.food_name}
              onChange={(e) => setValue("food_name", e.target.value)}
              className="field"
              placeholder="Contoh: Nasi ayam, salad, telur rebus"
            />
          </Input>

          <Input label="Porsi">
            <input
              value={form.portion}
              onChange={(e) => setValue("portion", e.target.value)}
              className="field"
              placeholder="Contoh: 1 porsi / 150 gram / 1 mangkuk"
            />
          </Input>

          <Input label="Kalori">
            <input
              type="number"
              value={form.calories}
              onChange={(e) => setValue("calories", e.target.value)}
              className="field"
              placeholder="kkal"
            />
          </Input>

          <Input label="Protein">
            <input
              type="number"
              value={form.protein_g}
              onChange={(e) => setValue("protein_g", e.target.value)}
              className="field"
              placeholder="gram"
            />
          </Input>

          <Input label="Karbohidrat">
            <input
              type="number"
              value={form.carbs_g}
              onChange={(e) => setValue("carbs_g", e.target.value)}
              className="field"
              placeholder="gram"
            />
          </Input>

          <Input label="Lemak">
            <input
              type="number"
              value={form.fat_g}
              onChange={(e) => setValue("fat_g", e.target.value)}
              className="field"
              placeholder="gram"
            />
          </Input>

          <div className="md:col-span-2">
            <Input label="Catatan">
              <textarea
                value={form.notes}
                onChange={(e) => setValue("notes", e.target.value)}
                className="field min-h-[100px]"
                placeholder="Catatan tambahan, misalnya makan di luar, minuman manis, dll."
              />
            </Input>
          </div>
        </div>

        <button
          type="button"
          onClick={saveNutrition}
          className="mt-5 w-full rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-100 md:w-auto"
        >
          Simpan Nutrisi
        </button>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-black">Riwayat Nutrisi Terbaru</h3>

        <div className="mt-4 space-y-3">
          {logs.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm font-bold text-slate-400">
              Belum ada input nutrisi.
            </div>
          ) : (
            logs.slice(0, 8).map((item, index) => (
              <div
                key={`${item.id || index}-${index}`}
                className="rounded-2xl bg-slate-50 p-4"
              >
                <div className="text-sm font-black text-slate-900">
                  {item.food_name || "-"}
                </div>
                <div className="mt-1 text-xs font-bold capitalize text-slate-500">
                  {item.log_date} • {item.meal_type || "-"} • {item.portion || "-"}
                </div>
                <div className="mt-2 text-xs font-black text-blue-700">
                  {fmt(item.calories, "kkal")} • P {fmt(item.protein_g, "g")} • C{" "}
                  {fmt(item.carbs_g, "g")} • F {fmt(item.fat_g, "g")}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function WorkoutTab({
  form,
  setValue,
  saveWorkout,
}: {
  form: any;
  setValue: (key: string, value: string) => void;
  saveWorkout: () => void;
}) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black">Input Workout Manual</h2>
      <p className="mt-1 text-sm font-bold text-slate-500">
        Untuk aktivitas yang tidak tercatat di Strava/Google Fit, peserta dapat
        input manual.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Input label="Tanggal">
          <input
            type="date"
            value={form.log_date}
            onChange={(e) => setValue("log_date", e.target.value)}
            className="field"
          />
        </Input>

        <Input label="Waktu Mulai, opsional">
          <input
            type="datetime-local"
            value={form.started_at}
            onChange={(e) => setValue("started_at", e.target.value)}
            className="field"
          />
        </Input>

        <Input label="Jenis Aktivitas">
          <select
            value={form.activity_type}
            onChange={(e) => setValue("activity_type", e.target.value)}
            className="field"
          >
            {activityOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Input>

        <Input label="Nama Aktivitas">
          <input
            value={form.activity_name}
            onChange={(e) => setValue("activity_name", e.target.value)}
            className="field"
            placeholder="Contoh: Jalan pagi, gym upper body"
          />
        </Input>

        <Input label="Durasi">
          <input
            type="number"
            value={form.duration_minutes}
            onChange={(e) => setValue("duration_minutes", e.target.value)}
            className="field"
            placeholder="menit"
          />
        </Input>

        <Input label="Kalori">
          <input
            type="number"
            value={form.calories}
            onChange={(e) => setValue("calories", e.target.value)}
            className="field"
            placeholder="kkal, opsional"
          />
        </Input>

        <Input label="Jarak">
          <input
            type="number"
            value={form.distance_km}
            onChange={(e) => setValue("distance_km", e.target.value)}
            className="field"
            placeholder="km, opsional"
          />
        </Input>

        <Input label="Catatan">
          <input
            value={form.notes}
            onChange={(e) => setValue("notes", e.target.value)}
            className="field"
            placeholder="Opsional"
          />
        </Input>
      </div>

      <button
        type="button"
        onClick={saveWorkout}
        className="mt-5 w-full rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-emerald-100 md:w-auto"
      >
        Simpan Workout
      </button>
    </section>
  );
}

function HistoryTab({
  workoutItems,
  nutritionLogs,
  refresh,
}: {
  workoutItems: any[];
  nutritionLogs: any[];
  refresh: () => void;
}) {
  return (
    <section className="space-y-5">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black">History Workout</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              Sumber bisa manual, Strava, atau Google Fit.
            </p>
          </div>

          <button
            type="button"
            onClick={refresh}
            className="w-full rounded-full bg-slate-50 px-4 py-2 text-xs font-black text-slate-700 md:w-auto"
          >
            Refresh
          </button>
        </div>

        <div className="mt-5">
          <WorkoutLogResponsive items={workoutItems} />
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <h2 className="text-xl font-black">History Nutrisi</h2>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {nutritionLogs.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400 md:col-span-2">
              Belum ada input nutrisi.
            </div>
          ) : (
            nutritionLogs.map((item, index) => (
              <div
                key={`${item.id || index}-${index}`}
                className="rounded-3xl border border-slate-100 bg-slate-50 p-4"
              >
                <div className="text-sm font-black text-slate-900">
                  {item.food_name || "-"}
                </div>
                <div className="mt-1 text-xs font-bold capitalize text-slate-500">
                  {item.log_date} • {item.meal_type || "-"} • {item.portion || "-"}
                </div>
                <div className="mt-2 text-xs font-black text-blue-700">
                  {fmt(item.calories, "kkal")} • P {fmt(item.protein_g, "g")} • C{" "}
                  {fmt(item.carbs_g, "g")} • F {fmt(item.fat_g, "g")}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function DevicesTab({
  stravaConnected,
  googleFitConnected,
  syncing,
  syncProvider,
}: {
  stravaConnected: boolean;
  googleFitConnected: boolean;
  syncing: string;
  syncProvider: (provider: "strava" | "google-fit") => void;
}) {
  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Strava</h2>
            <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
              Tarik workout GPS, durasi, jarak, dan kalori dari Strava.
            </p>
          </div>

          <span
            className={`rounded-full px-3 py-2 text-xs font-black ${
              stravaConnected
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-50 text-slate-500"
            }`}
          >
            {stravaConnected ? "Connected" : "Not connected"}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href="/api/wellness/integrations/strava/connect"
            className="rounded-full bg-orange-600 px-5 py-3 text-xs font-black text-white shadow-lg shadow-orange-100"
          >
            {stravaConnected ? "Reconnect Strava" : "Konek Strava"}
          </a>

          <button
            type="button"
            onClick={() => syncProvider("strava")}
            disabled={!stravaConnected || syncing === "strava"}
            className="rounded-full bg-slate-900 px-5 py-3 text-xs font-black text-white disabled:opacity-40"
          >
            {syncing === "strava" ? "Sync..." : "Sync Strava"}
          </button>
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Google Fit</h2>
            <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
              Tarik steps, daily activity, dan workout dari Google Fit.
            </p>
          </div>

          <span
            className={`rounded-full px-3 py-2 text-xs font-black ${
              googleFitConnected
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-50 text-slate-500"
            }`}
          >
            {googleFitConnected ? "Connected" : "Not connected"}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href="/api/wellness/integrations/google-fit/connect"
            className="rounded-full bg-blue-600 px-5 py-3 text-xs font-black text-white shadow-lg shadow-blue-100"
          >
            {googleFitConnected ? "Reconnect Google Fit" : "Konek Google Fit"}
          </a>

          <button
            type="button"
            onClick={() => syncProvider("google-fit")}
            disabled={!googleFitConnected || syncing === "google-fit"}
            className="rounded-full bg-slate-900 px-5 py-3 text-xs font-black text-white disabled:opacity-40"
          >
            {syncing === "google-fit" ? "Sync..." : "Sync Google Fit"}
          </button>
        </div>
      </div>
    </section>
  );
}

function ProfileTab({
  participant,
  integrations,
  logout,
}: {
  participant: any;
  integrations: any[];
  logout: () => void;
}) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black">Profil Peserta</h2>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <ProfileRow label="Nama" value={participant?.name} />
        <ProfileRow label="Kode Karyawan" value={participant?.code} />
        <ProfileRow label="Gender" value={participant?.gender} />
        <ProfileRow label="Email" value={participant?.portal_email || participant?.email} />
        <ProfileRow label="Nomor HP" value={participant?.portal_phone || participant?.phone} />
        <ProfileRow label="Username" value={participant?.portal_username} />
      </div>

      <div className="mt-6 rounded-3xl bg-slate-50 p-4">
        <div className="text-sm font-black text-slate-900">Device Connected</div>
        <div className="mt-2 text-xs font-bold text-slate-500">
          {integrations.length
            ? integrations.map((item) => item.provider).join(", ")
            : "Belum ada device terkoneksi."}
        </div>
      </div>

      <button
        type="button"
        onClick={logout}
        className="mt-6 rounded-2xl bg-slate-900 px-5 py-3 text-xs font-black text-white"
      >
        Logout
      </button>
    </section>
  );
}

function ProfileRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-black text-slate-900">
        {fmt(value)}
      </div>
    </div>
  );
}

function Input({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-700">
      {label}
      {children}
    </label>
  );
}
