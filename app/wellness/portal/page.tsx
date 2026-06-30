"use client";

import { useEffect, useMemo, useState } from "react";
import ParticipantPortalMenu from "./_components/ParticipantPortalMenu";
import WorkoutLogResponsive from "./_components/WorkoutLogResponsive";

// WELLNESS_PARTICIPANT_AUTO_CALORIE_CHART_V395
// Participant-only portal UX.
// V395 scope:
// - keep OTP, Strava, Google Fit, and existing session flow unchanged
// - nutrition form hides calorie/macro fields from participant
// - nutrition calories are calculated by API from master KaloriData
// - manual workout calories are calculated by API from master KaloriOlahraga / MET fallback
// - participant dashboard shows Calories In and health progress charts

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

const fieldClass =
  "rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

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
    notes: "",
  });
  const [nutritionPhoto, setNutritionPhoto] = useState<File | null>(null);

  const [workoutForm, setWorkoutForm] = useState({
    log_date: todayDate(),
    started_at: "",
    activity_type: "Walking",
    activity_name: "",
    duration_minutes: "",
    distance_km: "",
    steps: "",
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

    setMessage("Menyimpan nutrisi harian dan menghitung kalori dari master...");

    const body = new FormData();
    body.append("log_date", nutritionForm.log_date);
    body.append("meal_type", nutritionForm.meal_type);
    body.append("food_name", nutritionForm.food_name);
    body.append("portion", nutritionForm.portion);
    body.append("notes", nutritionForm.notes);
    if (nutritionPhoto) body.append("photo", nutritionPhoto);

    const result = await fetch("/api/wellness/participant/nutrition", {
      method: "POST",
      body,
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      setMessage(result.message || "Nutrisi harian berhasil disimpan.");
      setNutritionForm((previous) => ({
        ...previous,
        food_name: "",
        portion: "",
        notes: "",
      }));
      setNutritionPhoto(null);
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

    setMessage("Menyimpan workout manual dan menghitung kalori otomatis...");

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
      setMessage(result.message || "Workout manual berhasil disimpan.");
      setWorkoutForm((previous) => ({
        ...previous,
        started_at: "",
        activity_name: "",
        duration_minutes: "",
        distance_km: "",
        steps: "",
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
    let pendingCalories = 0;

    for (const item of workoutItems || []) {
      workoutMinutes += asNumber(item.duration_minutes || item.total_duration_minutes);
      workoutCalories += asNumber(item.calories || item.total_calories);
      steps += asNumber(item.steps || item.total_steps);
    }

    for (const item of todayNutrition || []) {
      const calories = Number(item.calories);
      if (Number.isFinite(calories)) foodCalories += calories;
      else pendingCalories += 1;

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
      pendingCalories,
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
                    className={fieldClass}
                    value={form.code}
                    onChange={(e) => setValue("code", e.target.value)}
                    placeholder="Contoh: 278"
                  />
                </label>

                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Buat Username
                  <input
                    className={fieldClass}
                    value={form.username}
                    onChange={(e) => setValue("username", e.target.value)}
                    placeholder="Contoh: samsul278"
                  />
                </label>

                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Email
                  <input
                    type="email"
                    className={fieldClass}
                    value={form.email}
                    onChange={(e) => setValue("email", e.target.value)}
                    placeholder="nama@email.com"
                  />
                </label>

                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Nomor HP
                  <input
                    className={fieldClass}
                    value={form.phone}
                    onChange={(e) => setValue("phone", e.target.value)}
                    placeholder="08xxxx"
                  />
                </label>

                {step === "verify" ? (
                  <label className="grid gap-2 text-sm font-bold text-slate-700">
                    OTP
                    <input
                      className={fieldClass}
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
                <p className="rounded-2xl bg-blue-50 p-3 text-blue-900">
                  Kalori nutrisi dan workout dihitung otomatis dari master data, sehingga peserta tidak perlu mengisi angka kalori manual.
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
                note={
                  totals.pendingCalories > 0
                    ? `${totals.foodCount} input, ${totals.pendingCalories} belum match master`
                    : `${totals.foodCount} input nutrisi hari ini`
                }
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
                clinicalHistory={clinicalHistory}
              />
            ) : null}

            {activeTab === "nutrition" ? (
              <NutritionTab
                form={nutritionForm}
                photo={nutritionPhoto}
                setPhoto={setNutritionPhoto}
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
  clinicalHistory,
}: {
  participant: any;
  nutritionLogs: any[];
  totals: any;
  setActiveTab: (tab: PortalTab) => void;
  stravaConnected: boolean;
  googleFitConnected: boolean;
  clinicalHistory: any[];
}) {
  return (
    <section className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
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
                Nama makanan + foto
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("workout")}
              className="rounded-3xl bg-emerald-600 px-5 py-4 text-left text-sm font-black text-white shadow-lg shadow-emerald-100"
            >
              + Input Workout
              <div className="mt-1 text-xs font-bold text-white/80">
                Kalori otomatis
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
                <NutritionMiniCard key={`${item.id || index}-${index}`} item={item} />
              ))
            )}
          </div>
        </div>
      </div>

      <HealthProgressSection clinicalHistory={clinicalHistory} participant={participant} />
    </section>
  );
}

function NutritionTab({
  form,
  photo,
  setPhoto,
  setValue,
  saveNutrition,
  logs,
}: {
  form: any;
  photo: File | null;
  setPhoto: (file: File | null) => void;
  setValue: (key: string, value: string) => void;
  saveNutrition: () => void;
  logs: any[];
}) {
  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black">Input Nutrisi Harian</h2>
        <p className="mt-1 text-sm font-bold text-slate-500">
          Peserta cukup isi nama makanan, waktu makan, porsi, dan foto. Kalori otomatis diambil dari Master KaloriData.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Input label="Tanggal">
            <input
              type="date"
              value={form.log_date}
              onChange={(e) => setValue("log_date", e.target.value)}
              className={fieldClass}
            />
          </Input>

          <Input label="Waktu Makan">
            <select
              value={form.meal_type}
              onChange={(e) => setValue("meal_type", e.target.value)}
              className={fieldClass}
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
              className={fieldClass}
              placeholder="Contoh: ubi ungu, ayam bakar, apel"
            />
          </Input>

          <Input label="Porsi">
            <input
              value={form.portion}
              onChange={(e) => setValue("portion", e.target.value)}
              className={fieldClass}
              placeholder="Contoh: 1 porsi / 150 gram / 1 mangkuk"
            />
          </Input>

          <div className="md:col-span-2">
            <Input label="Foto Makanan">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setPhoto(event.target.files?.[0] || null)}
                className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-600 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </Input>
            {photo ? (
              <div className="mt-2 text-xs font-bold text-blue-700">
                Foto dipilih: {photo.name}
              </div>
            ) : null}
          </div>

          <div className="md:col-span-2">
            <Input label="Catatan">
              <textarea
                value={form.notes}
                onChange={(e) => setValue("notes", e.target.value)}
                className={`${fieldClass} min-h-[100px]`}
                placeholder="Catatan tambahan, misalnya makan di luar, minuman manis, dll."
              />
            </Input>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-xs font-bold leading-5 text-blue-900">
          Peserta tidak perlu mengisi kalori, protein, karbohidrat, atau lemak. Sistem akan mencari nama makanan pada Master KaloriData.
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
              <NutritionLogCard key={`${item.id || index}-${index}`} item={item} />
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
        Peserta cukup isi jenis aktivitas dan durasi. Kalori dihitung otomatis dari Master KaloriOlahraga / MET.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Input label="Tanggal">
          <input
            type="date"
            value={form.log_date}
            onChange={(e) => setValue("log_date", e.target.value)}
            className={fieldClass}
          />
        </Input>

        <Input label="Waktu Mulai, opsional">
          <input
            type="datetime-local"
            value={form.started_at}
            onChange={(e) => setValue("started_at", e.target.value)}
            className={fieldClass}
          />
        </Input>

        <Input label="Jenis Aktivitas">
          <select
            value={form.activity_type}
            onChange={(e) => setValue("activity_type", e.target.value)}
            className={fieldClass}
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
            className={fieldClass}
            placeholder="Contoh: Jalan pagi, gym upper body"
          />
        </Input>

        <Input label="Durasi">
          <input
            type="number"
            value={form.duration_minutes}
            onChange={(e) => setValue("duration_minutes", e.target.value)}
            className={fieldClass}
            placeholder="menit"
          />
        </Input>

        <Input label="Jarak">
          <input
            type="number"
            value={form.distance_km}
            onChange={(e) => setValue("distance_km", e.target.value)}
            className={fieldClass}
            placeholder="km, opsional"
          />
        </Input>

        <Input label="Steps">
          <input
            type="number"
            value={form.steps}
            onChange={(e) => setValue("steps", e.target.value)}
            className={fieldClass}
            placeholder="opsional"
          />
        </Input>

        <Input label="Catatan">
          <input
            value={form.notes}
            onChange={(e) => setValue("notes", e.target.value)}
            className={fieldClass}
            placeholder="Opsional"
          />
        </Input>
      </div>

      <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-xs font-bold leading-5 text-emerald-900">
        Field kalori disembunyikan dari peserta. Kalori manual workout akan dihitung otomatis oleh sistem.
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
              <NutritionLogCard key={`${item.id || index}-${index}`} item={item} />
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

function NutritionMiniCard({ item }: { item: any }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-900">
            {item.food_name || "-"}
          </div>
          <div className="mt-0.5 text-xs font-bold capitalize text-slate-500">
            {item.meal_type || "-"} • {item.portion || "-"}
          </div>
          {item.photo_url ? (
            <img
              src={item.photo_url}
              alt="Foto makanan"
              className="mt-3 h-20 w-20 rounded-2xl object-cover"
            />
          ) : null}
        </div>
        <div className="text-right">
          <div className="text-sm font-black text-blue-700">
            {Number.isFinite(Number(item.calories))
              ? `${fmtNumber(item.calories, 0)} kkal`
              : "Belum match"}
          </div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
            {item.calorie_match_status || item.calorie_source || "master"}
          </div>
        </div>
      </div>
    </div>
  );
}

function NutritionLogCard({ item }: { item: any }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex gap-3">
        {item.photo_url ? (
          <img
            src={item.photo_url}
            alt="Foto makanan"
            className="h-20 w-20 shrink-0 rounded-2xl object-cover"
          />
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-slate-900">
            {item.food_name || "-"}
          </div>
          <div className="mt-1 text-xs font-bold capitalize text-slate-500">
            {item.log_date} • {item.meal_type || "-"} • {item.portion || "-"}
          </div>
          <div className="mt-2 text-xs font-black text-blue-700">
            {Number.isFinite(Number(item.calories))
              ? `${fmtNumber(item.calories, 0)} kkal`
              : "Kalori belum terhitung"}
          </div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
            {item.calorie_match_status || item.calorie_source || "master"}
          </div>
        </div>
      </div>
    </div>
  );
}

function getDateValue(item: any) {
  return clean(
    item?.log_date ||
      item?.exam_date ||
      item?.checkup_date ||
      item?.measurement_date ||
      item?.created_at ||
      item?.date
  ).slice(0, 10);
}

function getNumeric(item: any, keys: string[]) {
  for (const key of keys) {
    const value = Number(item?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function buildSeries(rows: any[], keys: string[]) {
  const mapped = (rows || [])
    .map((row) => ({
      date: getDateValue(row),
      value: getNumeric(row, keys),
    }))
    .filter((row) => row.date && row.value !== null) as Array<{
      date: string;
      value: number;
    }>;

  const unique = new Map<string, { date: string; value: number }>();
  for (const row of mapped) unique.set(row.date, row);

  return Array.from(unique.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function HealthProgressSection({
  clinicalHistory,
  participant,
}: {
  clinicalHistory: any[];
  participant: any;
}) {
  const sourceRows = Array.isArray(clinicalHistory) ? clinicalHistory : [];

  const weightSeries = buildSeries(sourceRows, [
    "weight_kg",
    "weight",
    "body_weight",
    "bb",
    "berat_badan",
  ]);

  const bmiSeries = buildSeries(sourceRows, ["bmi", "imt"]);
  const waistSeries = buildSeries(sourceRows, [
    "waist_cm",
    "waist",
    "abdominal_circumference",
    "lingkar_perut",
  ]);
  const hba1cSeries = buildSeries(sourceRows, ["hba1c", "hbA1c", "hb_a1c"]);
  const glucoseSeries = buildSeries(sourceRows, [
    "glucose",
    "gula_darah",
    "fasting_glucose",
    "blood_glucose",
  ]);
  const systolicSeries = buildSeries(sourceRows, [
    "systolic",
    "systolic_bp",
    "td_sistolik",
    "blood_pressure_systolic",
  ]);
  const diastolicSeries = buildSeries(sourceRows, [
    "diastolic",
    "diastolic_bp",
    "td_diastolik",
    "blood_pressure_diastolic",
  ]);

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-black">Grafik Perkembangan Kesehatan</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">
            Menampilkan parameter yang tersedia dari data peserta / input nakes.
          </p>
        </div>
        <div className="rounded-full bg-slate-50 px-4 py-2 text-xs font-black text-slate-500">
          {participant?.code ? `Kode ${participant.code}` : "Peserta"}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <MiniLineChart title="Berat Badan" unit="kg" series={weightSeries} />
        <MiniLineChart title="BMI / IMT" unit="" series={bmiSeries} />
        <MiniLineChart title="Lingkar Perut" unit="cm" series={waistSeries} />
        <MiniLineChart title="HbA1c" unit="%" series={hba1cSeries} />
        <MiniLineChart title="Gula Darah" unit="mg/dL" series={glucoseSeries} />
        <BloodPressureChart systolic={systolicSeries} diastolic={diastolicSeries} />
      </div>
    </section>
  );
}

function MiniLineChart({
  title,
  unit,
  series,
}: {
  title: string;
  unit: string;
  series: Array<{ date: string; value: number }>;
}) {
  const latest = series.length ? series[series.length - 1] : null;
  const points = series.slice(-8);

  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-900">{title}</div>
          <div className="mt-1 text-xs font-bold text-slate-500">
            {latest ? `${latest.date}` : "Belum ada data"}
          </div>
        </div>
        <div className="text-right text-lg font-black text-slate-950">
          {latest ? `${fmtNumber(latest.value, 1)}${unit ? ` ${unit}` : ""}` : "-"}
        </div>
      </div>

      <SimpleSvgLine series={points} />

      {points.length < 2 ? (
        <div className="mt-2 text-xs font-bold text-slate-400">
          Butuh minimal 2 data untuk melihat tren.
        </div>
      ) : null}
    </div>
  );
}

function BloodPressureChart({
  systolic,
  diastolic,
}: {
  systolic: Array<{ date: string; value: number }>;
  diastolic: Array<{ date: string; value: number }>;
}) {
  const latestSys = systolic.length ? systolic[systolic.length - 1] : null;
  const latestDia = diastolic.length ? diastolic[diastolic.length - 1] : null;

  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-900">Tekanan Darah</div>
          <div className="mt-1 text-xs font-bold text-slate-500">
            {latestSys?.date || latestDia?.date || "Belum ada data"}
          </div>
        </div>
        <div className="text-right text-lg font-black text-slate-950">
          {latestSys || latestDia
            ? `${latestSys?.value || "-"}/${latestDia?.value || "-"}`
            : "-"}
        </div>
      </div>

      <SimpleSvgLine series={systolic.slice(-8)} />
      <div className="mt-2 text-xs font-bold text-slate-500">
        Sistolik ditampilkan sebagai garis tren utama.
      </div>
    </div>
  );
}

function SimpleSvgLine({ series }: { series: Array<{ date: string; value: number }> }) {
  if (!series || series.length < 2) {
    return (
      <div className="mt-4 h-24 rounded-2xl border border-dashed border-slate-200 bg-white" />
    );
  }

  const width = 280;
  const height = 90;
  const padding = 10;
  const values = series.map((item) => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;

  const points = series.map((item, index) => {
    const x =
      padding +
      (index / Math.max(series.length - 1, 1)) * (width - padding * 2);
    const y =
      height -
      padding -
      ((item.value - min) / spread) * (height - padding * 2);
    return { x, y };
  });

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-4 h-24 w-full rounded-2xl bg-white"
      role="img"
      aria-label="Grafik tren"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="4" className="text-blue-600" />
      {points.map((point, index) => (
        <circle
          key={`${point.x}-${point.y}-${index}`}
          cx={point.x}
          cy={point.y}
          r="4"
          className="fill-blue-600"
        />
      ))}
    </svg>
  );
}
