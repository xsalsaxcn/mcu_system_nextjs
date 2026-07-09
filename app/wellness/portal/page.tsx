"use client";

import { useEffect, useMemo, useState } from "react";
import ParticipantPortalMenu from "./_components/ParticipantPortalMenu";
import WorkoutLogResponsive from "./_components/WorkoutLogResponsive";

// WELLNESS_PARTICIPANT_PORTAL_HEALTH_CONNECT_V421
// Base dari V415:
// - Summary card Workout Calories dan Steps tetap hanya menghitung HARI INI.
// - History Workout tetap menampilkan semua riwayat.
// - Google Fit Daily pada tanggal yang sama dipilih row terbaru.
// - Health Connect Daily pada tanggal yang sama dipilih row terbaru.
// - todayDate dan activity date key pakai Asia/Jakarta.
// - Auto sync Google Fit tetap setiap 10 menit saat portal terbuka.
// - Strava card diganti menjadi Health Connect.
// - Health Connect saat ini menunggu Android companion app.
// - Data Health Connect yang masuk ke wellness_activity_logs akan langsung ikut summary.

type Step = "request" | "verify" | "portal";
type PortalTab =
  | "home"
  | "nutrition"
  | "workout"
  | "healthtalk"
  | "history"
  | "devices"
  | "profile";

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
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((item) => item.type === "year")?.value || "";
  const month = parts.find((item) => item.type === "month")?.value || "";
  const day = parts.find((item) => item.type === "day")?.value || "";

  if (!year || !month || !day) return new Date().toISOString().slice(0, 10);

  return `${year}-${month}-${day}`;
}

function jakartaDateFromAny(value: any) {
  const text = clean(value);
  if (!text) return "";

  const isoDateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnly) return `${isoDateOnly[1]}-${isoDateOnly[2]}-${isoDateOnly[3]}`;

  const localDateTime = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+\d{1,2}:\d{2}/);
  if (localDateTime) return `${localDateTime[1]}-${localDateTime[2]}-${localDateTime[3]}`;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text.slice(0, 10);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((item) => item.type === "year")?.value || "";
  const month = parts.find((item) => item.type === "month")?.value || "";
  const day = parts.find((item) => item.type === "day")?.value || "";

  if (!year || !month || !day) return text.slice(0, 10);

  return `${year}-${month}-${day}`;
}

function activityDateKey(item: any) {
  return (
    clean(item?.log_date).slice(0, 10) ||
    clean(item?.date).slice(0, 10) ||
    clean(item?.tanggal).slice(0, 10) ||
    clean(item?.raw_payload?.log_date).slice(0, 10) ||
    jakartaDateFromAny(
      item?.started_at ||
        item?.start_date_local ||
        item?.raw_payload?.start_date_local ||
        item?.raw_payload?.last_sync_at ||
        item?.raw_payload?.health_connect_last_sync_at ||
        item?.updated_at ||
        item?.created_at
    )
  );
}

function activityUpdatedAtMs(item: any) {
  const raw =
    item?.raw_payload?.last_sync_at ||
    item?.raw_payload?.health_connect_last_sync_at ||
    item?.updated_at ||
    item?.started_at ||
    item?.created_at ||
    item?.raw_payload?.synced_at ||
    "";

  const date = new Date(raw);

  if (!Number.isNaN(date.getTime())) return date.getTime();

  return 0;
}

function isGoogleFitDailyRow(item: any) {
  const source = clean(item?.source || item?.input_source || item?.provider).toLowerCase();

  const name = clean(
    item?.activity_name ||
      item?.activity_type ||
      item?.nama_activities ||
      item?.raw_payload?.provider ||
      item?.raw_payload?.sync_mode ||
      ""
  ).toLowerCase();

  return (
    source === "google_fit" ||
    source === "google-fit" ||
    name.includes("google fit daily") ||
    name.includes("google_fit") ||
    name.includes("aggregate_daily")
  );
}

function isHealthConnectDailyRow(item: any) {
  const source = clean(item?.source || item?.input_source || item?.provider).toLowerCase();

  const name = clean(
    item?.activity_name ||
      item?.activity_type ||
      item?.nama_activities ||
      item?.raw_payload?.provider ||
      item?.raw_payload?.sync_mode ||
      ""
  ).toLowerCase();

  return (
    source === "health_connect" ||
    source === "health-connect" ||
    name.includes("health connect daily") ||
    name.includes("health_connect") ||
    name.includes("daily_aggregate")
  );
}

function normalizeTodayWorkoutItems(items: any[] = []) {
  const today = todayDate();
  const result = new Map<string, any>();

  for (const item of items || []) {
    const date = activityDateKey(item);
    if (date !== today) continue;

    const googleFitDaily = isGoogleFitDailyRow(item);
    const healthConnectDaily = isHealthConnectDailyRow(item);

    const key = googleFitDaily
      ? `google_fit_daily_${date}`
      : healthConnectDaily
        ? `health_connect_daily_${date}`
        : String(
            item?.id ||
              item?.external_activity_id ||
              item?.provider_activity_id ||
              `${date}-${result.size}`
          );

    const previous = result.get(key);

    if (!previous) {
      result.set(key, item);
      continue;
    }

    const previousTime = activityUpdatedAtMs(previous);
    const currentTime = activityUpdatedAtMs(item);

    if (currentTime >= previousTime) {
      result.set(key, item);
    }
  }

  return [...result.values()].sort((a, b) => {
    return activityUpdatedAtMs(b) - activityUpdatedAtMs(a);
  });
}

function activityCaloriesValue(item: any) {
  return asNumber(
    item?.calories ??
      item?.total_calories ??
      item?.activity_calories ??
      item?.raw_payload?.google_fit_calories_expended ??
      item?.raw_payload?.health_connect_calories ??
      item?.raw_payload?.health_connect_active_calories ??
      item?.raw_payload?.calories
  );
}

function activityMinutesValue(item: any) {
  return asNumber(
    item?.duration_minutes ??
      item?.total_duration_minutes ??
      item?.raw_payload?.google_fit_active_minutes ??
      item?.raw_payload?.health_connect_active_minutes ??
      item?.raw_payload?.active_minutes
  );
}

function activityStepsValue(item: any) {
  return asNumber(
    item?.steps ??
      item?.total_steps ??
      item?.raw_payload?.google_fit_steps ??
      item?.raw_payload?.health_connect_steps
  );
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
  const [healthtalkLogs, setHealthtalkLogs] = useState<any[]>([]);
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
  const [workoutEvidence, setWorkoutEvidence] = useState<File | null>(null);

  const [healthtalkForm, setHealthtalkForm] = useState({
    log_date: todayDate(),
    healthtalk_type: "Healthtalk/Seminar",
    healthtalk_title: "",
    notes: "",
  });
  const [healthtalkEvidence, setHealthtalkEvidence] = useState<File | null>(null);

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

  async function loadHealthtalk() {
    const result = await fetch("/api/wellness/participant/healthtalk", {
      cache: "no-store",
    })
      .then((response) => response.json())
      .catch(() => ({ ok: false, logs: [] }));

    if (result.ok) {
      setHealthtalkLogs(result.logs || []);
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
        setMessage(
          "Portal peserta aktif. Silakan input nutrisi harian, workout manual, atau sync device."
        );
      }

      await Promise.all([loadNutrition(), loadHealthtalk()]);
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

  function setHealthtalkValue(key: string, value: string) {
    setHealthtalkForm((previous) => ({ ...previous, [key]: value }));
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
    setHealthtalkLogs([]);
    setStep("request");
    setActiveTab("home");
    setMessage("Session peserta keluar. Masuk ulang dengan OTP.");
  }

  async function syncProvider(
    provider: "strava" | "google-fit",
    options?: { silent?: boolean; days?: number }
  ) {
    setSyncing(provider);

    if (!options?.silent) {
      setMessage(`Sync ${provider === "strava" ? "Strava" : "Google Fit"}...`);
    }

    const result = await fetch(`/api/wellness/integrations/${provider}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        days: options?.days || (provider === "google-fit" ? 2 : 30),
      }),
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      if (!options?.silent) {
        const fetched = Number(result.fetched || result.fetched_daily || 0);
        const inserted = Number(result.inserted || result.synced || 0);
        const updated = Number(result.updated || 0);
        const skipped = Number(result.skipped || 0);

        setMessage(
          result.message ||
            `Sync selesai. Fetched ${fetched}, masuk baru ${inserted}, update ${updated}, skip ${skipped}.`
        );
      }

      await loadMe({ keepMessage: true });
    } else if (!options?.silent) {
      setMessage(result.message || "Gagal sync activity.");
    }

    setSyncing("");
  }

  async function saveNutrition() {
    if (!clean(nutritionForm.food_name)) {
      setMessage("Nama makanan wajib diisi.");
      return;
    }

    setMessage("Menyimpan nutrisi ke Google Sheet...");

    const body = new FormData();
    body.append("log_date", nutritionForm.log_date);
    body.append("meal_type", nutritionForm.meal_type);
    body.append("food_name", nutritionForm.food_name);
    body.append("portion", nutritionForm.portion);
    body.append("notes", nutritionForm.notes);

    if (nutritionPhoto) {
      body.append("photo", nutritionPhoto);
    }

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
      setMessage(result.message || "Nutrisi harian berhasil masuk Google Sheet.");

      if (result.log) {
        setNutritionLogs((previous) => [result.log, ...previous]);
      }

      setNutritionForm((previous) => ({
        ...previous,
        food_name: "",
        portion: "",
        notes: "",
      }));

      setNutritionPhoto(null);
      setActiveTab("home");
      return;
    }

    setMessage(result.message || result.detail || "Gagal menyimpan nutrisi.");
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

    setMessage("Menyimpan workout manual ke Google Sheet dan menghitung kalori otomatis...");

    const body = new FormData();
    body.append("log_date", workoutForm.log_date);
    body.append("started_at", workoutForm.started_at);
    body.append("activity_type", workoutForm.activity_type);
    body.append("activity_name", workoutForm.activity_name);
    body.append("duration_minutes", workoutForm.duration_minutes);
    body.append("distance_km", workoutForm.distance_km);
    body.append("steps", workoutForm.steps);
    body.append("notes", workoutForm.notes);
    if (workoutEvidence) body.append("activity_evidence", workoutEvidence);

    const result = await fetch("/api/wellness/participant/workout", {
      method: "POST",
      body,
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
      setWorkoutEvidence(null);
      await loadMe({ keepMessage: true });
      setActiveTab("history");
    } else {
      setMessage(result.detail || result.message || "Gagal menyimpan workout.");
    }
  }

  async function saveHealthtalk() {
    if (!clean(healthtalkForm.healthtalk_title)) {
      setMessage("Jenis atau judul Health Talk wajib diisi.");
      return;
    }

    setMessage("Menyimpan Health Talk ke Google Sheet...");

    const body = new FormData();
    body.append("log_date", healthtalkForm.log_date);
    body.append("healthtalk_type", healthtalkForm.healthtalk_type);
    body.append("healthtalk_title", healthtalkForm.healthtalk_title);
    body.append("notes", healthtalkForm.notes);
    if (healthtalkEvidence) body.append("healthtalk_evidence", healthtalkEvidence);

    const result = await fetch("/api/wellness/participant/healthtalk", {
      method: "POST",
      body,
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      setMessage(result.message || "Health Talk berhasil disimpan.");
      setHealthtalkForm((previous) => ({
        ...previous,
        healthtalk_title: "",
        notes: "",
      }));
      setHealthtalkEvidence(null);
      await loadHealthtalk();
      setActiveTab("history");
    } else {
      setMessage(result.detail || result.message || "Gagal menyimpan Health Talk.");
    }
  }

  const healthConnectConnected = providerStatus(integrations, "health_connect");
  const googleFitConnected = providerStatus(integrations, "google_fit");

  useEffect(() => {
    if (step !== "portal") return;
    if (!googleFitConnected) return;

    const intervalId = window.setInterval(() => {
      syncProvider("google-fit", { silent: true, days: 2 });
    }, 10 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [step, googleFitConnected]);

  const workoutItems = useMemo(() => {
    if (Array.isArray(activities) && activities.length > 0) return activities;

    if (Array.isArray(activitySummary) && activitySummary.length > 0) {
      return activitySummary;
    }

    return [];
  }, [activities, activitySummary]);

  const todayWorkoutItems = useMemo(() => {
    return normalizeTodayWorkoutItems(workoutItems);
  }, [workoutItems]);

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

    for (const item of todayWorkoutItems || []) {
      workoutMinutes += activityMinutesValue(item);
      workoutCalories += activityCaloriesValue(item);
      steps += activityStepsValue(item);
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
      workoutCount: todayWorkoutItems?.length || 0,
      foodCalories,
      protein,
      carbs,
      fat,
      foodCount: todayNutrition.length,
      pendingCalories,
    };
  }, [todayWorkoutItems, todayNutrition]);

  const lastClinical =
    Array.isArray(clinicalHistory) && clinicalHistory.length > 0
      ? clinicalHistory[0]
      : null;

  const isWarningMessage =
    message.toLowerCase().includes("gagal") ||
    message.toLowerCase().includes("belum") ||
    message.toLowerCase().includes("error") ||
    message.toLowerCase().includes("invalid") ||
    message.toLowerCase().includes("wajib");

  return (
    <main className="min-h-screen bg-[#f4fbfa] pb-28 pt-16 text-slate-900 md:bg-[#f6fbff] md:pb-0 md:pt-0">
      {step === "portal" ? (
        <ParticipantPortalMenu
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          onLogout={logout}
          participant={participant}
        />
      ) : null}

      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-teal-400 via-sky-400 to-blue-500 p-6 text-white shadow-xl shadow-sky-100 md:p-8">
          <div className="flex flex-col gap-3 pr-14 md:pr-0">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-600">
              Wellness Participant Portal
            </div>

            <h1 className="text-3xl font-black md:text-4xl">
              {step === "portal" ? "Portal Individu Peserta" : "Aktivasi Portal Peserta"}
            </h1>

            <p className="max-w-3xl text-sm font-bold leading-6 text-slate-700">
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
                <p>Peserta juga bisa menghubungkan Google Fit dan Health Connect untuk sinkronisasi aktivitas.</p>
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
                note={`${fmtNumber(totals.workoutMinutes, 1)} menit aktivitas hari ini`}
                tone="emerald"
              />

              <SummaryCard
                label="Steps"
                value={fmtNumber(totals.steps, 0)}
                note="hari ini dari manual/device bila tersedia"
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
                healthConnectConnected={!!healthConnectConnected}
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
                evidence={workoutEvidence}
                setEvidence={setWorkoutEvidence}
                setValue={setWorkoutValue}
                saveWorkout={saveWorkout}
              />
            ) : null}

            {activeTab === "healthtalk" ? (
              <HealthtalkTab
                form={healthtalkForm}
                evidence={healthtalkEvidence}
                setEvidence={setHealthtalkEvidence}
                setValue={setHealthtalkValue}
                saveHealthtalk={saveHealthtalk}
                logs={healthtalkLogs}
              />
            ) : null}

            {activeTab === "history" ? (
              <HistoryTab
                workoutItems={workoutItems}
                nutritionLogs={nutritionLogs}
                healthtalkLogs={healthtalkLogs}
                refresh={() => loadMe()}
              />
            ) : null}

            {activeTab === "devices" ? (
              <DevicesTab
                healthConnectConnected={!!healthConnectConnected}
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
    blue: "border-sky-100 bg-[#eaf7fb] text-sky-900",
    emerald: "border-teal-100 bg-[#e6f7f3] text-teal-900",
    amber: "border-amber-100 bg-[#fff4e8] text-amber-900",
    slate: "border-slate-100 bg-white text-slate-900",
  };

  const dotClass: Record<string, string> = {
    blue: "bg-sky-500",
    emerald: "bg-teal-500",
    amber: "bg-amber-400",
    slate: "bg-slate-400",
  };

  return (
    <div className={`overflow-hidden rounded-[2rem] border p-5 shadow-sm ${toneClass[tone]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${dotClass[tone]}`} />
            <div className="text-[11px] font-black uppercase tracking-[0.16em] opacity-70">
              {label}
            </div>
          </div>

          <div className="mt-3 text-2xl font-black md:text-3xl">{value}</div>

          <div className="mt-1 text-xs font-bold leading-5 opacity-70">{note}</div>
        </div>

        <div className="hidden h-14 w-20 rounded-2xl bg-white/60 p-2 md:block">
          <MiniDecorChart tone={tone} />
        </div>
      </div>
    </div>
  );
}

function MiniDecorChart({ tone }: { tone: "blue" | "emerald" | "amber" | "slate" }) {
  const colorClass: Record<string, string> = {
    blue: "text-sky-500",
    emerald: "text-teal-500",
    amber: "text-amber-500",
    slate: "text-slate-500",
  };

  return (
    <svg viewBox="0 0 90 52" className={`h-full w-full ${colorClass[tone]}`} aria-hidden="true">
      <path
        d="M4 38 C 16 16, 27 43, 40 25 S 66 8, 86 19"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="40" cy="25" r="4" fill="currentColor" />
      <circle cx="86" cy="19" r="4" fill="currentColor" />
    </svg>
  );
}

function HomeTab({
  participant,
  nutritionLogs,
  totals,
  setActiveTab,
  healthConnectConnected,
  googleFitConnected,
  clinicalHistory,
}: {
  participant: any;
  nutritionLogs: any[];
  totals: any;
  setActiveTab: (tab: PortalTab) => void;
  healthConnectConnected: boolean;
  googleFitConnected: boolean;
  clinicalHistory: any[];
}) {
  const latestClinical =
    Array.isArray(clinicalHistory) && clinicalHistory.length > 0
      ? clinicalHistory[0]
      : null;

  const bmiSeries = buildSeries(clinicalHistory || [], ["bmi", "imt"]).slice(-7);
  const weightSeries = buildSeries(clinicalHistory || [], [
    "weight_kg",
    "weight",
    "body_weight",
    "bb",
    "berat_badan",
  ]).slice(-7);

  const chartSeries = bmiSeries.length >= 2 ? bmiSeries : weightSeries;
  const chartTitle = bmiSeries.length >= 2 ? "BMI Trend" : "Weight Trend";
  const chartUnit = bmiSeries.length >= 2 ? "" : "kg";

  const stepsTarget = 8000;
  const workoutTarget = 30;
  const nutritionTarget = 3;

  const stepsProgress = Math.min(100, Math.round((Number(totals.steps || 0) / stepsTarget) * 100));
  const workoutProgress = Math.min(100, Math.round((Number(totals.workoutMinutes || 0) / workoutTarget) * 100));
  const nutritionProgress = Math.min(100, Math.round((Number(totals.foodCount || 0) / nutritionTarget) * 100));

  const activeProgress = Math.max(stepsProgress, workoutProgress, nutritionProgress);

  const deviceLabel =
    healthConnectConnected || googleFitConnected
      ? "Device connected"
      : "Device belum sync";

  return (
    <section className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="overflow-hidden rounded-[2.3rem] border border-white bg-white shadow-xl shadow-slate-200/60">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#dff3f1] via-[#e7f4fb] to-[#e9eefc] p-6 md:p-7">
            <div className="absolute right-[-40px] top-[-40px] h-40 w-40 rounded-full bg-white/35 blur-2xl" />
            <div className="absolute bottom-[-50px] left-[-35px] h-36 w-36 rounded-full bg-teal-200/35 blur-2xl" />

            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-teal-700/70">
                  Today Wellness
                </div>

                <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 md:text-4xl">
                  Halo, {participant?.name || "Peserta"}
                </h2>

                <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-slate-600">
                  Ringkasan aktivitas, nutrisi, dan progres kesehatan hari ini.
                  Input harian dibuat lebih ringan seperti fitness diary.
                </p>
              </div>

              <div className="hidden rounded-full bg-white/70 px-4 py-3 text-xs font-black text-slate-600 shadow-sm md:block">
                Kode {participant?.code || "-"}
              </div>
            </div>

            <div className="relative z-10 mt-6 grid gap-3 md:grid-cols-3">
              <FitnessMiniPill
                label="Steps"
                value={fmtNumber(totals.steps || 0)}
                note={`Target ${fmtNumber(stepsTarget)}`}
              />

              <FitnessMiniPill
                label="Workout"
                value={`${fmtNumber(totals.workoutMinutes || 0, 0)} min`}
                note={`${fmtNumber(totals.workoutCalories || 0)} kkal`}
              />

              <FitnessMiniPill
                label="Nutrition"
                value={`${fmtNumber(totals.foodCount || 0)} log`}
                note={`${fmtNumber(totals.foodCalories || 0)} kkal in`}
              />
            </div>
          </div>

          <div className="grid gap-5 p-5 md:grid-cols-[320px_1fr] md:p-6">
            <div className="rounded-[2rem] bg-slate-950 p-5 text-white shadow-lg shadow-slate-200">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
                    Activity Level
                  </div>

                  <div className="mt-2 text-3xl font-black">
                    {fmtNumber(activeProgress, 0)}%
                  </div>

                  <div className="mt-1 text-xs font-bold text-white/55">
                    progress harian
                  </div>
                </div>

                <FitnessRing percentage={activeProgress} />
              </div>

              <div className="mt-5 grid gap-3">
                <FitnessProgressRow
                  label="Steps"
                  value={stepsProgress}
                  text={`${fmtNumber(totals.steps || 0)} / ${fmtNumber(stepsTarget)}`}
                />

                <FitnessProgressRow
                  label="Workout"
                  value={workoutProgress}
                  text={`${fmtNumber(totals.workoutMinutes || 0, 0)} / ${workoutTarget} min`}
                />

                <FitnessProgressRow
                  label="Nutrition"
                  value={nutritionProgress}
                  text={`${fmtNumber(totals.foodCount || 0)} / ${nutritionTarget} log`}
                />
              </div>
            </div>

            <div className="rounded-[2rem] bg-[#f8fbfc] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-slate-950">
                    {chartTitle}
                  </h3>

                  <p className="mt-1 text-xs font-bold text-slate-500">
                    Grafik dibuat smooth agar terasa seperti fitness app.
                  </p>
                </div>

                <div className="rounded-full bg-white px-3 py-2 text-xs font-black text-teal-700 shadow-sm">
                  {deviceLabel}
                </div>
              </div>

              <FitnessWavyChart
                series={chartSeries}
                unit={chartUnit}
                fallbackLabel={chartSeries.length >= 2 ? "Trend aktual" : "Preview trend"}
              />
            </div>
          </div>
        </div>

        <div className="rounded-[2.3rem] border border-slate-100 bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                Quick Action
              </div>

              <h3 className="mt-2 text-2xl font-black text-slate-950">
                Daily Diary
              </h3>
            </div>

            <div className="rounded-full bg-teal-50 px-3 py-2 text-xs font-black text-teal-700">
              {todayDate()}
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <FitnessActionCard
              title="Food Diary"
              description="Input makanan, porsi, dan foto."
              label="Nutrition"
              tone="teal"
              onClick={() => setActiveTab("nutrition")}
            />

            <FitnessActionCard
              title="Workout Diary"
              description="Catat olahraga manual dan bukti aktivitas."
              label="Workout"
              tone="sky"
              onClick={() => setActiveTab("workout")}
            />

            <FitnessActionCard
              title="Health Talk"
              description="Upload bukti seminar atau edukasi."
              label="Talk"
              tone="peach"
              onClick={() => setActiveTab("healthtalk")}
            />

            <FitnessActionCard
              title="Connect Device"
              description="Cek Health Connect atau Google Fit."
              label="Sync"
              tone="slate"
              onClick={() => setActiveTab("devices")}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="rounded-[2.3rem] border border-slate-100 bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                Health Snapshot
              </div>

              <h3 className="mt-2 text-2xl font-black text-slate-950">
                Progres Kesehatan
              </h3>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700"
            >
              Lihat History
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <FitnessMetricCard
              label="BMI"
              value={latestClinical?.bmi ? fmtNumber(latestClinical.bmi, 1) : "-"}
              note="data klinis terakhir"
              tone="teal"
            />

            <FitnessMetricCard
              label="Tensi"
              value={
                latestClinical?.systolic
                  ? `${latestClinical.systolic}/${latestClinical.diastolic || "-"}`
                  : "-"
              }
              note="mmHg"
              tone="sky"
            />

            <FitnessMetricCard
              label="Calories In"
              value={`${fmtNumber(totals.foodCalories || 0)} kkal`}
              note={`${fmtNumber(totals.foodCount || 0)} input hari ini`}
              tone="peach"
            />

            <FitnessMetricCard
              label="Burned"
              value={`${fmtNumber(totals.workoutCalories || 0)} kkal`}
              note={`${fmtNumber(totals.workoutMinutes || 0, 0)} menit workout`}
              tone="slate"
            />
          </div>
        </div>

        <div className="rounded-[2.3rem] border border-slate-100 bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                Meal Log
              </div>

              <h3 className="mt-2 text-2xl font-black text-slate-950">
                Nutrisi Hari Ini
              </h3>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("nutrition")}
              className="rounded-full bg-teal-50 px-4 py-2 text-xs font-black text-teal-700"
            >
              + Input
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {nutritionLogs.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <div className="text-base font-black text-slate-900">
                  Belum ada food diary hari ini.
                </div>

                <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                  Tambahkan makanan pertama agar kalori harian mulai terbaca.
                </p>

                <button
                  type="button"
                  onClick={() => setActiveTab("nutrition")}
                  className="mt-4 rounded-full bg-teal-600 px-5 py-3 text-xs font-black text-white shadow-lg shadow-teal-100"
                >
                  Input Nutrisi
                </button>
              </div>
            ) : (
              nutritionLogs.slice(0, 4).map((item, index) => (
                <FitnessMealCard key={`${item.id || index}-${index}`} item={item} />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function FitnessMiniPill({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-[1.7rem] bg-white/65 p-4 shadow-sm backdrop-blur">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </div>

      <div className="mt-2 text-2xl font-black text-slate-950">
        {value}
      </div>

      <div className="mt-1 text-xs font-bold text-slate-500">
        {note}
      </div>
    </div>
  );
}

function FitnessRing({ percentage }: { percentage: number }) {
  const safe = Math.max(0, Math.min(100, Number(percentage) || 0));
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dash = (safe / 100) * circumference;

  return (
    <svg viewBox="0 0 90 90" className="h-20 w-20">
      <circle
        cx="45"
        cy="45"
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="10"
      />
      <circle
        cx="45"
        cy="45"
        r={radius}
        fill="none"
        stroke="white"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        transform="rotate(-90 45 45)"
      />
      <text
        x="45"
        y="50"
        textAnchor="middle"
        className="fill-white text-[18px] font-black"
      >
        {safe}
      </text>
    </svg>
  );
}

function FitnessProgressRow({
  label,
  value,
  text,
}: {
  label: string;
  value: number;
  text: string;
}) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs font-bold text-white/65">
        <span>{label}</span>
        <span>{text}</span>
      </div>

      <div className="mt-2 h-2 rounded-full bg-white/10">
        <div
          className="h-2 rounded-full bg-white"
          style={{ width: `${safe}%` }}
        />
      </div>
    </div>
  );
}

function FitnessWavyChart({
  series,
  unit,
  fallbackLabel,
}: {
  series: Array<{ date: string; value: number }>;
  unit: string;
  fallbackLabel: string;
}) {
  const realValues = (series || [])
    .map((item) => Number(item.value))
    .filter((value) => Number.isFinite(value));

  const values =
    realValues.length >= 2
      ? realValues
      : [38, 45, 40, 55, 49, 65, 60, 68];

  const width = 520;
  const height = 190;
  const paddingX = 26;
  const paddingY = 26;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;

  const points = values.map((value, index) => {
    const x =
      paddingX +
      (index / Math.max(values.length - 1, 1)) * (width - paddingX * 2);

    const y =
      height -
      paddingY -
      ((value - min) / spread) * (height - paddingY * 2);

    return { x, y, value };
  });

  const line = points
    .map((point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;

      const previous = points[index - 1];
      const midX = (previous.x + point.x) / 2;

      return `C ${midX} ${previous.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
    })
    .join(" ");

  const area =
    `${line} L ${points[points.length - 1].x} ${height - paddingY} ` +
    `L ${points[0].x} ${height - paddingY} Z`;

  const latestValue = values[values.length - 1];

  return (
    <div className="mt-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-3xl font-black text-slate-950">
            {fmtNumber(latestValue, 1)}
            {unit ? ` ${unit}` : ""}
          </div>

          <div className="mt-1 text-xs font-bold text-slate-500">
            {fallbackLabel}
          </div>
        </div>

        <div className="rounded-full bg-white px-3 py-2 text-xs font-black text-slate-500 shadow-sm">
          Smooth chart
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-3 h-44 w-full overflow-visible rounded-[1.8rem] bg-white"
        role="img"
        aria-label="Wellness trend chart"
      >
        <defs>
          <linearGradient id="fitnessLineGradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#4fb3ad" />
            <stop offset="55%" stopColor="#51a7d9" />
            <stop offset="100%" stopColor="#6f8fd8" />
          </linearGradient>

          <linearGradient id="fitnessAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7fcfd0" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3].map((item) => {
          const y = paddingY + item * ((height - paddingY * 2) / 3);

          return (
            <line
              key={item}
              x1={paddingX}
              x2={width - paddingX}
              y1={y}
              y2={y}
              stroke="#e8eef2"
              strokeWidth="2"
              strokeDasharray="5 8"
            />
          );
        })}

        <path d={area} fill="url(#fitnessAreaGradient)" />

        <path
          d={line}
          fill="none"
          stroke="url(#fitnessLineGradient)"
          strokeWidth="7"
          strokeLinecap="round"
        />

        {points.map((point, index) => (
          <g key={`${point.x}-${point.y}-${index}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r={index === points.length - 1 ? "8" : "5"}
              fill="white"
              stroke={index === points.length - 1 ? "#2f8fa3" : "#9ed9da"}
              strokeWidth="4"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

function FitnessActionCard({
  title,
  description,
  label,
  tone,
  onClick,
}: {
  title: string;
  description: string;
  label: string;
  tone: "teal" | "sky" | "peach" | "slate";
  onClick: () => void;
}) {
  const toneClass: Record<string, string> = {
    teal: "bg-[#e1f3f0] text-teal-800",
    sky: "bg-[#e1f0f8] text-sky-800",
    peach: "bg-[#ffe9de] text-orange-800",
    slate: "bg-slate-100 text-slate-800",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-[1.8rem] p-4 text-left transition hover:scale-[1.01] ${toneClass[tone]}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="rounded-full bg-white/75 px-3 py-2 text-xs font-black">
          {label}
        </div>

        <div className="rounded-full bg-white/60 px-3 py-2 text-xs font-black transition group-hover:bg-white">
          Start
        </div>
      </div>

      <div className="mt-4 text-lg font-black">
        {title}
      </div>

      <div className="mt-1 text-xs font-bold leading-5 opacity-75">
        {description}
      </div>
    </button>
  );
}

function FitnessMetricCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "teal" | "sky" | "peach" | "slate";
}) {
  const toneClass: Record<string, string> = {
    teal: "bg-teal-50 text-teal-800",
    sky: "bg-sky-50 text-sky-800",
    peach: "bg-orange-50 text-orange-800",
    slate: "bg-slate-50 text-slate-800",
  };

  return (
    <div className={`rounded-[1.7rem] p-4 ${toneClass[tone]}`}>
      <div className="text-xs font-black uppercase tracking-wide opacity-65">
        {label}
      </div>

      <div className="mt-2 text-2xl font-black">
        {value}
      </div>

      <div className="mt-1 text-xs font-bold opacity-65">
        {note}
      </div>
    </div>
  );
}

function FitnessMealCard({ item }: { item: any }) {
  return (
    <div className="rounded-[1.7rem] bg-slate-50 p-3">
      <div className="flex items-center gap-3">
        {item.photo_url ? (
          <img
            src={item.photo_url}
            alt="Foto makanan"
            className="h-16 w-16 shrink-0 rounded-2xl object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-xs font-black text-teal-700">
            FOOD
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-slate-950">
            {item.food_name || "-"}
          </div>

          <div className="mt-1 text-xs font-bold capitalize text-slate-500">
            {item.meal_type || "-"} - {item.portion || "-"}
          </div>

          <div className="mt-2 text-xs font-black text-teal-700">
            {Number.isFinite(Number(item.calories))
              ? `${fmtNumber(item.calories, 0)} kkal`
              : "Kalori belum match"}
          </div>
        </div>
      </div>
    </div>
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
  const todayLogs = (logs || []).filter(
    (item) => clean(item.log_date).slice(0, 10) === form.log_date
  );

  const totalCalories = todayLogs.reduce((sum, item) => {
    const value = Number(item.calories);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

  return (
    <section className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_390px]">
        <div className="overflow-hidden rounded-[2.4rem] border border-white bg-white shadow-xl shadow-slate-200/60">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#e1f3f0] via-[#e7f4fb] to-[#fff0e8] p-6 md:p-7">
            <div className="absolute right-[-50px] top-[-40px] h-40 w-40 rounded-full bg-white/45 blur-2xl" />
            <div className="absolute bottom-[-50px] left-[-30px] h-36 w-36 rounded-full bg-teal-200/35 blur-2xl" />

            <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-teal-700/70">
                  Food Diary
                </div>

                <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 md:text-4xl">
                  Input Nutrisi Harian
                </h2>

                <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-slate-600">
                  Catat makanan dengan foto, porsi, dan waktu makan. Kalori otomatis dicocokkan dari Master KaloriData.
                </p>
              </div>

              <div className="rounded-[1.6rem] bg-white/70 px-5 py-4 shadow-sm">
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Calories In
                </div>
                <div className="mt-1 text-2xl font-black text-slate-950">
                  {fmtNumber(totalCalories, 0)}
                </div>
                <div className="text-xs font-bold text-slate-500">
                  kkal di tanggal ini
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 md:p-6">
            <div className="grid gap-5 md:grid-cols-[260px_1fr]">
              <div>
                <label className="block cursor-pointer rounded-[2rem] border border-dashed border-teal-200 bg-[#f4fbfa] p-5 text-center transition hover:bg-teal-50">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setPhoto(event.target.files?.[0] || null)}
                    className="hidden"
                  />

                  <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white text-sm font-black text-teal-700 shadow-sm">
                    {photo ? "PHOTO" : "UPLOAD"}
                  </div>

                  <div className="mt-4 text-sm font-black text-slate-950">
                    {photo ? photo.name : "Upload Foto Makanan"}
                  </div>

                  <div className="mt-2 text-xs font-bold leading-5 text-slate-500">
                    Klik untuk pilih foto dari galeri atau file.
                  </div>
                </label>

                <div className="mt-4 rounded-[1.7rem] bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-wide text-slate-400">
                    Tips Input
                  </div>
                  <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
                    Gunakan nama makanan yang umum, misalnya nasi putih, ayam bakar, telur rebus, apel, atau ubi.
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Input label="Tanggal">
                    <input
                      type="date"
                      value={form.log_date}
                      onChange={(e) => setValue("log_date", e.target.value)}
                      className={fieldClass}
                    />
                  </Input>

                  <Input label="Waktu Makan">
                    <div className="grid grid-cols-2 gap-2">
                      {mealOptions.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setValue("meal_type", item.value)}
                          className={`rounded-2xl px-3 py-3 text-xs font-black transition ${
                            form.meal_type === item.value
                              ? "bg-teal-600 text-white shadow-lg shadow-teal-100"
                              : "bg-slate-50 text-slate-600"
                          }`}
                        >
                          {item.label.replace(" / ", " ")}
                        </button>
                      ))}
                    </div>
                  </Input>
                </div>

                <Input label="Nama Makanan">
                  <input
                    value={form.food_name}
                    onChange={(e) => setValue("food_name", e.target.value)}
                    className={fieldClass}
                    placeholder="Contoh: ayam bakar, nasi merah, apel"
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

                <Input label="Catatan">
                  <textarea
                    value={form.notes}
                    onChange={(e) => setValue("notes", e.target.value)}
                    className={`${fieldClass} min-h-[110px]`}
                    placeholder="Catatan tambahan, misalnya makan di luar, minuman manis, dll."
                  />
                </Input>

                <div className="rounded-[1.7rem] bg-teal-50 p-4 text-xs font-bold leading-5 text-teal-900">
                  Peserta tidak perlu mengisi kalori, protein, karbohidrat, atau lemak. Sistem akan mencocokkan nama makanan dengan Master KaloriData.
                </div>

                <button
                  type="button"
                  onClick={saveNutrition}
                  className="rounded-[1.5rem] bg-teal-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-teal-100"
                >
                  Simpan Nutrisi
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[2.4rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                Meal History
              </div>

              <h3 className="mt-2 text-2xl font-black text-slate-950">
                Riwayat Nutrisi
              </h3>
            </div>

            <div className="rounded-full bg-teal-50 px-3 py-2 text-xs font-black text-teal-700">
              {logs.length} log
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {logs.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <div className="text-base font-black text-slate-900">
                  Belum ada input nutrisi.
                </div>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                  Input pertama akan muncul di sini.
                </p>
              </div>
            ) : (
              logs.slice(0, 10).map((item, index) => (
                <NutritionLogCard key={`${item.id || index}-${index}`} item={item} />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
function WorkoutTab({
  form,
  evidence,
  setEvidence,
  setValue,
  saveWorkout,
}: {
  form: any;
  evidence: File | null;
  setEvidence: (file: File | null) => void;
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

        <Input label="Bukti Aktivitas, opsional">
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(event) => setEvidence(event.target.files?.[0] || null)}
            className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-600 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
          />
          {evidence ? (
            <div className="mt-2 text-xs font-bold text-emerald-700">
              File dipilih: {evidence.name}
            </div>
          ) : null}
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
  healthtalkLogs,
  refresh,
}: {
  workoutItems: any[];
  nutritionLogs: any[];
  healthtalkLogs: any[];
  refresh: () => void;
}) {
  return (
    <section className="space-y-5">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black">History Workout</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              Sumber bisa manual, Health Connect, atau Google Fit.
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

      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <h2 className="text-xl font-black">History Health Talk</h2>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {healthtalkLogs.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400 md:col-span-2">
              Belum ada input Health Talk.
            </div>
          ) : (
            healthtalkLogs.map((item, index) => (
              <HealthtalkLogCard key={`${item.id || index}-${index}`} item={item} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function HealthtalkTab({
  form,
  evidence,
  setEvidence,
  setValue,
  saveHealthtalk,
  logs,
}: {
  form: any;
  evidence: File | null;
  setEvidence: (file: File | null) => void;
  setValue: (key: string, value: string) => void;
  saveHealthtalk: () => void;
  logs: any[];
}) {
  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black">Input Health Talk / Seminar</h2>
        <p className="mt-1 text-sm font-bold text-slate-500">
          Catat seminar/health talk yang peserta ikuti. Bukti akan masuk ke Google Drive dan row masuk ke Form Responses.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Input label="Tanggal Health Talk">
            <input
              type="date"
              value={form.log_date}
              onChange={(e) => setValue("log_date", e.target.value)}
              className={fieldClass}
            />
          </Input>

          <Input label="Jenis Kegiatan">
            <select
              value={form.healthtalk_type}
              onChange={(e) => setValue("healthtalk_type", e.target.value)}
              className={fieldClass}
            >
              <option value="Healthtalk/Seminar">Healthtalk/Seminar</option>
              <option value="Webinar">Webinar</option>
              <option value="Coaching">Coaching</option>
              <option value="Edukasi Kesehatan">Edukasi Kesehatan</option>
            </select>
          </Input>

          <div className="md:col-span-2">
            <Input label="Judul / Topik Health Talk">
              <input
                value={form.healthtalk_title}
                onChange={(e) => setValue("healthtalk_title", e.target.value)}
                className={fieldClass}
                placeholder="Contoh: Seminar olahraga, edukasi nutrisi, webinar diabetes"
              />
            </Input>
          </div>

          <div className="md:col-span-2">
            <Input label="Bukti Health Talk">
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(event) => setEvidence(event.target.files?.[0] || null)}
                className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-600 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              />
            </Input>
            {evidence ? (
              <div className="mt-2 text-xs font-bold text-violet-700">
                File dipilih: {evidence.name}
              </div>
            ) : null}
          </div>

          <div className="md:col-span-2">
            <Input label="Catatan">
              <textarea
                value={form.notes}
                onChange={(e) => setValue("notes", e.target.value)}
                className={`${fieldClass} min-h-[100px]`}
                placeholder="Catatan tambahan, misalnya nama pembicara, lokasi, atau insight penting."
              />
            </Input>
          </div>
        </div>

        <button
          type="button"
          onClick={saveHealthtalk}
          className="mt-5 w-full rounded-2xl bg-violet-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-violet-100 md:w-auto"
        >
          Simpan Health Talk
        </button>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-black">Riwayat Health Talk</h3>

        <div className="mt-4 space-y-3">
          {logs.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm font-bold text-slate-400">
              Belum ada input Health Talk.
            </div>
          ) : (
            logs.slice(0, 8).map((item, index) => (
              <HealthtalkLogCard key={`${item.id || index}-${index}`} item={item} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function DevicesTab({
  healthConnectConnected,
  googleFitConnected,
  syncing,
  syncProvider,
}: {
  healthConnectConnected: boolean;
  googleFitConnected: boolean;
  syncing: string;
  syncProvider: (provider: "strava" | "google-fit") => void;
}) {
  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Health Connect</h2>
            <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
              Tarik steps, calories, distance, dan durasi aktivitas dari Health
              Connect melalui aplikasi Harmony Health Connect di HP Android.
            </p>
          </div>

          <span
            className={`rounded-full px-3 py-2 text-xs font-black ${
              healthConnectConnected
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {healthConnectConnected ? "Connected" : "Belum sync"}
          </span>
        </div>

        <div className="mt-5 rounded-3xl bg-emerald-50 p-4 text-xs font-bold leading-5 text-emerald-900">
          Health Connect sudah siap. Pastikan Mi Fitness / Google Fit / Samsung
          Health sudah menulis data ke Health Connect, lalu buka aplikasi
          Harmony Health Connect di HP dan klik Sync Hari Ini.
        </div>

        <div className="mt-5 grid gap-3 rounded-3xl border border-slate-100 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">
            Cara Sync
          </div>

          <div className="grid gap-2 text-sm font-bold leading-6 text-slate-600">
            <div>1. Buka aplikasi Harmony Health Connect di HP Android.</div>
            <div>2. Isi Participant ID sesuai peserta.</div>
            <div>3. Klik Cek Permission.</div>
            <div>4. Klik Sync Hari Ini.</div>
            <div>5. Refresh portal ini untuk melihat update Steps dan Calories.</div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-emerald-600 px-5 py-3 text-xs font-black text-white shadow-lg shadow-emerald-100"
          >
            Refresh Portal
          </button>

          <button
            type="button"
            disabled
            className="rounded-full bg-slate-100 px-5 py-3 text-xs font-black text-slate-500"
          >
            Sync dilakukan dari Android App
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
  const activeProviders = (integrations || [])
    .filter((item) => {
      if (item?.is_active === false) return false;
      if (item?.is_active === 0) return false;
      return true;
    })
    .map((item) => item.provider)
    .filter(Boolean);

  const participantId =
    participant?.id ||
    participant?.participant_id ||
    participant?.wellness_participant_id ||
    "-";

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black">Profil Peserta</h2>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <ProfileRow label="Participant ID" value={participantId} />
        <ProfileRow label="Nama" value={participant?.name} />
        <ProfileRow label="Kode Karyawan" value={participant?.code} />
        <ProfileRow label="Gender" value={participant?.gender} />
        <ProfileRow label="Email" value={participant?.portal_email || participant?.email} />
        <ProfileRow label="Nomor HP" value={participant?.portal_phone || participant?.phone} />
        <ProfileRow label="Username" value={participant?.portal_username} />
      </div>

      <div className="mt-6 rounded-3xl bg-emerald-50 p-4">
        <div className="text-sm font-black text-emerald-900">
          ID untuk Sync Health Connect
        </div>
        <div className="mt-2 text-3xl font-black text-emerald-700">
          {participantId}
        </div>
        <div className="mt-2 text-xs font-bold leading-5 text-emerald-900">
          Masukkan angka ini pada aplikasi Harmony Health Connect di HP Android,
          bukan Kode Karyawan.
        </div>
      </div>

      <div className="mt-6 rounded-3xl bg-slate-50 p-4">
        <div className="text-sm font-black text-slate-900">Device Connected</div>
        <div className="mt-2 text-xs font-bold text-slate-500">
          {activeProviders.length
            ? activeProviders.join(", ")
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

function HealthtalkLogCard({ item }: { item: any }) {
  const evidenceUrl = item.evidence_preview_url || item.evidence_url;
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex gap-3">
        {evidenceUrl ? (
          <img
            src={evidenceUrl}
            alt="Bukti Health Talk"
            className="h-20 w-20 shrink-0 rounded-2xl object-cover"
          />
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-slate-900">
            {item.healthtalk_title || item.healthtalk_type || "Health Talk"}
          </div>
          <div className="mt-1 text-xs font-bold capitalize text-slate-500">
            {item.log_date || "-"} • {item.healthtalk_type || "-"}
          </div>
          {item.notes ? (
            <div className="mt-2 text-xs font-bold leading-5 text-slate-500">
              {item.notes}
            </div>
          ) : null}
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
    <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-900">{title}</div>
          <div className="mt-1 text-xs font-bold text-slate-400">
            {latest ? latest.date : "Belum ada data"}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-right text-sm font-black text-slate-950">
          {latest ? `${fmtNumber(latest.value, 1)}${unit ? ` ${unit}` : ""}` : "-"}
        </div>
      </div>

      <div className="mt-4 rounded-[1.5rem] bg-[#f5fbfb] p-3">
        <SmoothSvgChart series={points} height={105} showLabels={false} />
      </div>

      {points.length < 2 ? (
        <div className="mt-3 text-xs font-bold text-slate-400">
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
    <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-900">Tekanan Darah</div>
          <div className="mt-1 text-xs font-bold text-slate-400">
            {latestSys?.date || latestDia?.date || "Belum ada data"}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-right text-sm font-black text-slate-950">
          {latestSys || latestDia
            ? `${latestSys?.value || "-"}/${latestDia?.value || "-"}`
            : "-"}
        </div>
      </div>

      <div className="mt-4 rounded-[1.5rem] bg-[#f5fbfb] p-3">
        <SmoothSvgChart series={systolic.slice(-8)} height={105} showLabels={false} />
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-500">
        <span className="h-3 w-3 rounded-full bg-teal-500" />
        Tren sistolik utama
      </div>
    </div>
  );
}

function SimpleSvgLine({ series }: { series: Array<{ date: string; value: number }> }) {
  return <SmoothSvgChart series={series} height={96} showLabels={false} />;
}

function SmoothSvgChart({
  series,
  height = 96,
  showLabels = false,
}: {
  series: Array<{ date: string; value: number }>;
  height?: number;
  showLabels?: boolean;
}) {
  if (!series || series.length < 2) {
    return (
      <div
        className="rounded-2xl border border-dashed border-slate-200 bg-white"
        style={{ height }}
      />
    );
  }

  const width = 320;
  const paddingX = 16;
  const paddingTop = 10;
  const paddingBottom = showLabels ? 24 : 12;

  const values = series
    .map((item) => Number(item.value))
    .filter((value) => Number.isFinite(value));

  if (values.length < 2) {
    return (
      <div
        className="rounded-2xl border border-dashed border-slate-200 bg-white"
        style={{ height }}
      />
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;

  const points = series.map((item, index) => {
    const value = Number(item.value);

    const x =
      paddingX +
      (index / Math.max(series.length - 1, 1)) * (width - paddingX * 2);

    const y =
      height -
      paddingBottom -
      ((value - min) / spread) * (height - paddingTop - paddingBottom);

    return {
      x,
      y,
      label: item.date,
      value,
    };
  });

  const smoothPath = buildSmoothPath(points);

  const areaPath =
    `${smoothPath} L ${points[points.length - 1].x} ${height - paddingBottom} ` +
    `L ${points[0].x} ${height - paddingBottom} Z`;

  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full overflow-visible"
      role="img"
      aria-label="Grafik tren"
    >
      {[0, 1, 2].map((item) => {
        const y =
          paddingTop + item * ((height - paddingTop - paddingBottom) / 2);

        return (
          <line
            key={item}
            x1={paddingX}
            x2={width - paddingX}
            y1={y}
            y2={y}
            stroke="#e8eef2"
            strokeWidth="1.5"
            strokeDasharray="5 8"
          />
        );
      })}

      <path
        d={areaPath}
        fill="#14b8a6"
        fillOpacity="0.10"
      />

      <path
        d={smoothPath}
        fill="none"
        stroke="#14b8a6"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {points.map((point, index) => (
        <circle
          key={`${point.x}-${point.y}-${index}`}
          cx={point.x}
          cy={point.y}
          r={index === points.length - 1 ? 5 : 3.2}
          fill={index === points.length - 1 ? "white" : "#14b8a6"}
          stroke={index === points.length - 1 ? "#14b8a6" : "none"}
          strokeWidth={index === points.length - 1 ? 4 : 0}
        />
      ))}

      <circle cx={last.x} cy={last.y} r="9" fill="#14b8a6" fillOpacity="0.10" />

      {showLabels
        ? points.map((point, index) => (
            <text
              key={`${point.label}-${index}`}
              x={point.x}
              y={height - 4}
              textAnchor="middle"
              className="fill-slate-400 text-[10px] font-bold"
            >
              {point.label}
            </text>
          ))
        : null}
    </svg>
  );
}

function buildSmoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const current = points[i];
    const midX = (previous.x + current.x) / 2;

    path += ` C ${midX} ${previous.y}, ${midX} ${current.y}, ${current.x} ${current.y}`;
  }

  return path;
}

