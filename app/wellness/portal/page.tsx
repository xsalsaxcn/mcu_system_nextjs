"use client";

import { useEffect, useMemo, useState } from "react";
import ParticipantPortalMenu from "./_components/ParticipantPortalMenu";
import AchievementChartsTab from "./_components/AchievementChartsTab";
import WorkoutLogResponsive from "./_components/WorkoutLogResponsive";

// WELLNESS_PARTICIPANT_PORTAL_HEALTH_CONNECT_V421
// WELLNESS_PARTICIPANT_COACH_CHAT_V54
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
  | "profile"
  | "chat"
  | "charts";

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
  
// PORTAL_DEEPLINK_TAB_CHARTS_V47
// Dipakai mobile app agar tombol Grafik Capaian langsung membuka tab Grafik.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const tab = new URLSearchParams(window.location.search).get("tab");

    if (tab === "charts") {
      setActiveTab("charts");
    }
  }, []);
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
    <main className="min-h-screen overflow-x-hidden bg-[#f4fbfa] pb-28 pt-16 text-slate-900 md:bg-[#f6fbff] md:pb-0 md:pt-0">
      
      {step === "portal" ? (
        <ParticipantPortalMenu
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          onLogout={logout}
          participant={participant}
        />
      ) : null}

      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">


        {step !== "portal" ? (
          <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Login Peserta</h2>

              <p className="mt-1 text-sm font-bold text-slate-500">
                Gunakan Kode Karyawan sesuai data program wellness. Username
                digunakan sebagai identitas portal peserta.
              </p>

              <PortalLoginStatusNoticeV43
                message={message}
                isWarning={isWarningMessage}
                step={step}
              />

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
              <NutritionTab participant={participant}
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

            {activeTab === "charts" ? (
              <AchievementChartsTab
                participant={participant}
                workoutItems={workoutItems}
                clinicalHistory={clinicalHistory}
              />
            ) : null}
            {activeTab === "history" ? (
              <HistoryTab participant={participant}
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

            {activeTab === "chat" ? (
              <ParticipantCoachChat participant={participant} />
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



// WELLNESS_PARTICIPANT_COACH_CHAT_V54
function ParticipantCoachChat({ participant }: { participant: any }) {
  const participantId = asNumber(
    participant?.id || participant?.participant_id || participant?.wellness_participant_id
  );
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatNotice, setChatNotice] = useState("");

  async function loadChat() {
    if (!participantId) return;
    setLoadingChat(true);

    const result = await fetch(
      `/api/wellness/portal/coach-notes?participant_id=${participantId}&mode=chat`,
      { cache: "no-store" }
    )
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      const rows = Array.isArray(result.messages) ? result.messages : [];
      setMessages(rows);
      setChatNotice("");

      const unreadCoachNoteIds = rows
        .filter((item: any) => item.sender === "coach" && !item.is_read)
        .map((item: any) => Number(item.id))
        .filter(Boolean);

      if (unreadCoachNoteIds.length > 0) {
        await fetch("/api/wellness/portal/coach-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "mark_chat_read",
            participant_id: participantId,
            note_ids: unreadCoachNoteIds,
          }),
        }).catch(() => null);

        setMessages((current) =>
          current.map((item) =>
            unreadCoachNoteIds.includes(Number(item.id))
              ? { ...item, is_read: true, read_at: new Date().toISOString() }
              : item
          )
        );
      }
    } else {
      setChatNotice(result.message || "Chat belum dapat dimuat.");
    }

    setLoadingChat(false);
  }

  async function sendChat() {
    const message = clean(text);
    if (!participantId || !message) {
      setChatNotice("Tulis pesan terlebih dahulu.");
      return;
    }

    setSending(true);
    setChatNotice("Mengirim pesan...");

    const result = await fetch("/api/wellness/portal/coach-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send_chat",
        participant_id: participantId,
        message,
      }),
    })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      setText("");
      setChatNotice("Pesan sudah dikirim kepada coach.");
      await loadChat();
    } else {
      setChatNotice(result.message || "Pesan gagal dikirim.");
    }

    setSending(false);
  }

  useEffect(() => {
    loadChat();
  }, [participantId]);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-white bg-white shadow-xl shadow-slate-200/60">
      <div className="bg-gradient-to-br from-teal-500 via-cyan-500 to-sky-500 p-5 text-white md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-white/75">
              Coach Support
            </div>
            <h2 className="mt-2 text-2xl font-black">Chat With Coach</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-white/90">
              Sampaikan kendala nutrisi, workout, atau target wellness kepada coach.
            </p>
          </div>
          <button
            type="button"
            onClick={loadChat}
            className="rounded-full bg-white/20 px-4 py-2 text-xs font-black backdrop-blur"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="p-4 md:p-6">
        {chatNotice ? (
          <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
            {chatNotice}
          </div>
        ) : null}

        <div className="max-h-[54vh] min-h-[300px] space-y-3 overflow-y-auto rounded-[1.75rem] bg-[#f4fbfa] p-4">
          {loadingChat ? (
            <div className="py-12 text-center text-sm font-bold text-slate-400">
              Memuat percakapan...
            </div>
          ) : messages.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-base font-black text-slate-900">Belum ada percakapan.</div>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                Mulai chat untuk meminta arahan langsung dari coach.
              </p>
            </div>
          ) : (
            messages.map((item: any) => {
              const fromParticipant = item.sender === "participant";
              return (
                <div
                  key={item.id}
                  className={`flex ${fromParticipant ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[86%] rounded-[1.5rem] px-4 py-3 shadow-sm ${
                      fromParticipant
                        ? "rounded-br-md bg-slate-950 text-white"
                        : "rounded-bl-md border border-teal-100 bg-white text-slate-900"
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-sm font-bold leading-6">
                      {item.message || item.coach_note || "-"}
                    </div>
                    <div
                      className={`mt-2 text-[11px] font-bold ${
                        fromParticipant ? "text-white/60" : "text-slate-400"
                      }`}
                    >
                      {formatCoachDate(item.created_at || item.session_date)}
                      {fromParticipant
                        ? item.is_read
                          ? " · Sudah dibaca coach"
                          : " · Terkirim"
                        : " · Coach"}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 grid gap-3">
          <textarea
            className={`${fieldClass} min-h-[96px] resize-none`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Tulis pesan untuk coach..."
          />
          <button
            type="button"
            onClick={sendChat}
            disabled={sending || !clean(text)}
            className="rounded-2xl bg-teal-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-teal-100 disabled:opacity-50"
          >
            {sending ? "Mengirim..." : "Kirim Pesan"}
          </button>
        </div>
      </div>
    </section>
  );
}

function PortalLoginStatusNoticeV43({
  message,
  isWarning,
  step,
}: {
  message: string;
  isWarning: boolean;
  step: Step;
}) {
  const text = clean(message);

  const isOtpStep = step === "verify";
  const isSuccess =
    text.toLowerCase().includes("berhasil") ||
    text.toLowerCase().includes("otp dikirim") ||
    text.toLowerCase().includes("dikirim") ||
    text.toLowerCase().includes("memuat portal");

  const title = isWarning
    ? "Perlu diperiksa"
    : isOtpStep
      ? "OTP sudah dikirim"
      : isSuccess
        ? "Status berhasil"
        : "Informasi akses";

  const body = isOtpStep
    ? text || "Kode OTP sudah dikirim. Silakan cek email/WhatsApp dan masukkan kode OTP untuk masuk ke portal."
    : text || "Masukkan kode karyawan, username, email, dan nomor HP untuk aktivasi portal peserta.";

  const toneClass = isWarning
    ? "border-red-100 bg-red-50 text-red-900"
    : isOtpStep || isSuccess
      ? "border-teal-100 bg-teal-50 text-teal-900"
      : "border-sky-100 bg-sky-50 text-sky-900";

  const dotClass = isWarning
    ? "bg-red-500"
    : isOtpStep || isSuccess
      ? "bg-teal-500"
      : "bg-sky-500";

  return (
    <div className={`mt-4 rounded-[1.5rem] border p-4 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${dotClass}`} />

        <div className="min-w-0">
          <div className="text-sm font-black">
            {title}
          </div>

          <div className="mt-1 text-xs font-bold leading-5 opacity-80">
            {body}
          </div>

          {isOtpStep ? (
            <div className="mt-3 rounded-2xl bg-white/65 px-3 py-2 text-[11px] font-black">
              Masukkan OTP 6 digit lalu klik Verifikasi OTP & Masuk.
            </div>
          ) : null}
        </div>
      </div>
    </div>
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




function HideOldInvalidSummaryCardV39() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    function compactText(element: Element | null) {
      return String(element?.textContent || "").replace(/\s+/g, " ").trim();
    }

    function hide(element: HTMLElement | null, reason: string) {
      if (!element) return;
      element.style.display = "none";
      element.setAttribute("data-hidden-by", "HideOldInvalidSummaryCardV39");
      element.setAttribute("data-hidden-reason", reason);
    }

    function isLegacyCaloriesCard(element: HTMLElement) {
      const text = compactText(element);

      return (
        text.includes("CALORIES IN") &&
        text.includes("0 kkal") &&
        text.includes("0 input nutrisi hari ini") &&
        !text.includes("Halo,")
      );
    }

    function findMetricGridFromCaloriesCard(card: HTMLElement) {
      let current: HTMLElement | null = card;

      for (let level = 0; current && level < 8; level++) {
        const text = compactText(current);
        const className = current.getAttribute("class") || "";

        const hasLegacySummary =
          text.includes("CALORIES IN") &&
          text.includes("WORKOUT CALORIES") &&
          text.includes("STEPS") &&
          text.includes("BMI / TENSI") &&
          !text.includes("Halo,");

        const looksLikeLayout =
          className.includes("grid") ||
          className.includes("space-y") ||
          className.includes("rounded") ||
          className.includes("shadow") ||
          className.includes("border");

        if (hasLegacySummary && looksLikeLayout) {
          return current;
        }

        current = current.parentElement;
      }

      return card;
    }

    function hideEmptyIntroArtifacts() {
      const candidates = Array.from(
        document.body.querySelectorAll("section, div, article")
      ) as HTMLElement[];

      candidates.forEach((element) => {
        const text = compactText(element);
        const rect = element.getBoundingClientRect();
        const className = element.getAttribute("class") || "";

        const cardLike =
          className.includes("rounded") ||
          className.includes("shadow") ||
          className.includes("border") ||
          className.includes("bg-white");

        if (
          cardLike &&
          text.length === 0 &&
          rect.width > 220 &&
          rect.height > 20 &&
          rect.height < 160
        ) {
          hide(element, "empty-intro-artifact");
        }
      });
    }

    function scan() {
      if (!document.body) return;

      const all = Array.from(
        document.body.querySelectorAll("section, div, article")
      ) as HTMLElement[];

      all.forEach((element) => {
        if (!isLegacyCaloriesCard(element)) return;

        const grid = findMetricGridFromCaloriesCard(element);
        hide(grid, "legacy-metric-grid");

        let parent = grid.parentElement as HTMLElement | null;

        if (parent) {
          const parentText = compactText(parent);

          if (
            parentText.includes("CALORIES IN") &&
            parentText.includes("0 input nutrisi hari ini") &&
            parentText.includes("Halo,") &&
            parentText.length < 2500
          ) {
            Array.from(parent.children).forEach((child) => {
              const childElement = child as HTMLElement;
              const childText = compactText(childElement);

              if (
                childText.includes("CALORIES IN") &&
                childText.includes("0 input nutrisi hari ini") &&
                !childText.includes("Halo,")
              ) {
                hide(childElement, "legacy-summary-child");
              }
            });
          }
        }
      });

      hideEmptyIntroArtifacts();
    }

    scan();

    const observer = new MutationObserver(() => {
      scan();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const timer = window.setInterval(scan, 800);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return null;
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
  const participantId = Number(
    participant?.id ||
      participant?.participant_id ||
      participant?.wellness_participant_id ||
      0
  );

  const [directNutrition, setDirectNutrition] = useState<any>({
    ok: false,
    today: todayDate(),
    logs: [],
    today_logs: [],
    latest_logs: [],
    today_count: 0,
    today_row_count: 0,
    today_calories: 0,
    sources: null,
  });

  const [nutritionLoading, setNutritionLoading] = useState(false);

  async function loadDirectNutrition() {
    if (!participantId) return;

    setNutritionLoading(true);

    const result = await fetch(
      `/api/wellness/portal/nutrition-direct?participant_id=${participantId}&t=${Date.now()}`,
      { cache: "no-store" }
    )
      .then((response) => response.json())
      .catch(() => null);

    if (result?.ok) {
      setDirectNutrition(result);
    }

    setNutritionLoading(false);
  }

  useEffect(() => {
    loadDirectNutrition();
  }, [participantId]);

  const latestClinical =
    Array.isArray(clinicalHistory) && clinicalHistory.length > 0
      ? clinicalHistory[0]
      : null;

  const todayCalories = Number(directNutrition?.today_calories || 0);
  const todayFoodCount = Number(directNutrition?.today_count || 0);
  const todayRowCount = Number(directNutrition?.today_row_count || 0);

  const mealLogs =
    directNutrition?.today_logs?.length > 0
      ? directNutrition.today_logs
      : directNutrition?.latest_logs?.length > 0
        ? directNutrition.latest_logs
        : nutritionLogs || [];

  const mealTitle =
    directNutrition?.today_logs?.length > 0
      ? "Nutrisi Hari Ini"
      : directNutrition?.latest_logs?.length > 0
        ? "Riwayat Nutrisi Terakhir"
        : "Nutrisi Hari Ini";

  const mealSubtitle =
    directNutrition?.today_logs?.length > 0
      ? `${fmtNumber(todayCalories, 0)} kkal dari ${fmtNumber(todayFoodCount, 0)} item makanan hari ini`
      : directNutrition?.latest_logs?.length > 0
        ? "Belum ada input hari ini. Menampilkan data terakhir."
        : "Belum ada input nutrisi.";

  return (
    <section className="w-full max-w-full space-y-5 overflow-hidden">
      <CoachNoticeCenter participant={participant} />
      <div className="rounded-[2rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-teal-700/70">
              Today Wellness
            </div>

            <h2 className="mt-2 text-2xl font-black text-slate-950">
              Halo, {participant?.name || "Peserta"}
            </h2>

            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
              Ringkasan aktivitas, nutrisi, dan progres kesehatan hari ini.
            </p>
          </div>

          <button
            type="button"
            onClick={loadDirectNutrition}
            className="rounded-full bg-slate-950 px-5 py-3 text-xs font-black text-white"
          >
            {nutritionLoading ? "Memuat..." : "Refresh Nutrisi"}
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <PortalMetricCardV34
            label="Calories In"
            value={`${fmtNumber(todayCalories, 0)} kkal`}
            note={`${fmtNumber(todayFoodCount, 0)} item dari ${fmtNumber(todayRowCount, 0)} input hari ini`}
            tone="sky"
          />

          <PortalMetricCardV34
            label="Workout Calories"
            value={`${fmtNumber(totals.workoutCalories || 0)} kkal`}
            note={`${fmtNumber(totals.workoutMinutes || 0, 1)} menit aktivitas hari ini`}
            tone="teal"
          />

          <PortalMetricCardV34
            label="Steps"
            value={fmtNumber(totals.steps || 0)}
            note="hari ini dari manual/device bila tersedia"
            tone="peach"
          />

          <PortalMetricCardV34
            label="BMI / Tensi"
            value={latestClinical?.bmi ? fmtNumber(latestClinical.bmi, 1) : "-"}
            note={
              latestClinical?.systolic
                ? `${latestClinical.systolic}/${latestClinical.diastolic || "-"} mmHg`
                : "110/80 mmHg"
            }
            tone="slate"
          />
        </div>
      </div>

      <div className="rounded-[2rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
              Meal Log
            </div>

            <h3 className="mt-2 text-2xl font-black text-slate-950">
              {mealTitle}
            </h3>

            <p className="mt-2 text-sm font-black leading-5 text-slate-500">
              {mealSubtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("nutrition")}
            className="rounded-full bg-teal-50 px-4 py-2 text-xs font-black text-teal-700"
          >
            + Input
          </button>
        </div>

        {directNutrition?.sources ? (
          <div className="mt-4 rounded-[1.4rem] bg-slate-50 px-4 py-3 text-[11px] font-bold leading-5 text-slate-500">
            Source: Supabase {directNutrition.sources.supabase_rows || 0} row | Google Sheet{" "}
            {directNutrition.sources.google_sheet_rows || 0} row
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          {mealLogs.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <div className="text-base font-black text-slate-900">
                Belum ada food diary.
              </div>

              <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                Input nutrisi akan muncul di sini setelah data Google Sheet atau Supabase terbaca.
              </p>
            </div>
          ) : (
            mealLogs.slice(0, 6).map((item: any, index: number) => (
              <PortalMealLogItemV34 key={`${item.id || index}-${index}`} item={item} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function PortalMetricCardV34({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "sky" | "teal" | "peach" | "slate";
}) {
  const cls: Record<string, string> = {
    sky: "bg-sky-50 text-sky-900",
    teal: "bg-teal-50 text-teal-900",
    peach: "bg-orange-50 text-orange-900",
    slate: "bg-slate-50 text-slate-900",
  };

  return (
    <div className={`rounded-[1.8rem] p-5 ${cls[tone]}`}>
      <div className="text-xs font-black uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="mt-3 text-3xl font-black">{value}</div>
      <div className="mt-1 text-xs font-bold leading-5 opacity-70">{note}</div>
    </div>
  );
}

function normalizeImageUrlV34(value: any) {
  const raw = clean(value);
  if (!raw) return "";

  const fileMatch = raw.match(/\/file\/d\/([^/]+)/i);
  if (fileMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w600`;
  }

  const idMatch = raw.match(/[?&]id=([^&]+)/i);
  if (idMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w600`;
  }

  return raw;
}

function PortalMealLogItemV34({ item }: { item: any }) {
  const photo = normalizeImageUrlV34(item.photo_url);
  const sourceLabel =
    item.source === "google_sheet"
      ? "Google Sheet"
      : item.source === "supabase"
        ? "Supabase"
        : item.source || "Food log";

  return (
    <div className="rounded-[1.7rem] bg-slate-50 p-3">
      <div className="flex items-center gap-3">
        {photo ? (
          <img
            src={photo}
            alt="Foto makanan"
            className="h-16 w-16 shrink-0 rounded-2xl object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white text-xs font-black text-teal-700">
            FOOD
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-slate-950">
            {item.food_name || item.meal_text || "-"}
          </div>

          <div className="mt-1 text-xs font-bold capitalize text-slate-500">
            {item.log_date || "-"} | {item.meal_time || item.meal_type || "-"}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-teal-50 px-3 py-1 text-[11px] font-black text-teal-700">
              {fmtNumber(item.calories || item.total_calories || 0, 0)} kkal
            </span>

            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-500">
              {sourceLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
function CoachNoticeCenter({ participant }: { participant: any }) {
  const participantId = Number(
    participant?.id ||
      participant?.participant_id ||
      participant?.wellness_participant_id ||
      0
  );

  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");
  const [notificationPermission, setNotificationPermission] = useState("");

  const unreadNotes = notes.filter((note) => !note.is_read);
  const latestNote = notes.length > 0 ? notes[0] : null;
  const hasAlarm = unreadNotes.length > 0;
  const hasHighPriority = unreadNotes.some((note) => note.priority === "high");

  async function loadCoachNotes() {
    if (!participantId) return;

    setLoading(true);

    const result = await fetch(
      `/api/wellness/portal/coach-notes?participant_id=${participantId}`,
      { cache: "no-store" }
    )
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      setNotes(result.notes || []);

      if ((result.unread_count || 0) > 0) {
        setNoticeMessage(
          `${result.unread_count} catatan coach belum dibaca.`
        );
      } else {
        setNoticeMessage("");
      }
    } else {
      setNoticeMessage(result.message || "Gagal memuat catatan coach.");
    }

    setLoading(false);
  }

  async function markNoteRead(noteId: any) {
    if (!participantId || !noteId) return;

    const result = await fetch("/api/wellness/portal/coach-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_id: participantId,
        note_id: noteId,
      }),
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      await loadCoachNotes();
    } else {
      setNoticeMessage(result.message || "Gagal menandai catatan.");
    }
  }

  async function markAllRead() {
    if (!participantId) return;

    const result = await fetch("/api/wellness/portal/coach-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_id: participantId,
        mark_all: true,
      }),
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      await loadCoachNotes();
    } else {
      setNoticeMessage(result.message || "Gagal menandai semua catatan.");
    }
  }

  async function enableBrowserNotification() {
    if (typeof window === "undefined") return;

    if (!("Notification" in window)) {
      setNotificationPermission("Browser tidak mendukung notifikasi.");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      const body =
        unreadNotes.length > 0
          ? `${unreadNotes.length} catatan coach belum dibaca.`
          : "Notifikasi coach sudah aktif.";

      new Notification("Harmony Health - Catatan Coach", {
        body,
      });
    }
  }

  useEffect(() => {
    loadCoachNotes();
  }, [participantId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasAlarm) return;

    const permission =
      "Notification" in window ? Notification.permission : "unsupported";

    setNotificationPermission(permission);

    if (permission === "granted") {
      const firstUnread = unreadNotes[0];

      try {
        new Notification("Catatan Coach Baru", {
          body:
            firstUnread?.action_plan ||
            firstUnread?.coach_note ||
            "Ada catatan baru dari coach.",
        });
      } catch {
        // ignore notification runtime issues
      }
    }
  }, [hasAlarm, unreadNotes.length]);

  if (!participantId) {
    return null;
  }

  return (
    <section
      className={`overflow-hidden rounded-[2rem] border shadow-xl shadow-slate-200/60 ${
        hasAlarm
          ? hasHighPriority
            ? "border-rose-200 bg-rose-50"
            : "border-amber-200 bg-amber-50"
          : "border-white bg-white"
      }`}
    >
      <div className="relative p-5 md:p-6">
        {hasAlarm ? (
          <div className="absolute right-5 top-5 flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-black text-rose-700 shadow-sm">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
            NEW
          </div>
        ) : null}

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-teal-700/70">
              Catatan Coach
            </div>

            <h2 className="mt-2 text-2xl font-black text-slate-950">
              Notice dari Coach
            </h2>

            <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-slate-600">
              Catatan, arahan, dan action plan dari coach akan muncul di sini.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadCoachNotes}
              className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={enableBrowserNotification}
              className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white shadow-sm"
            >
              Aktifkan Notifikasi
            </button>
          </div>
        </div>

        {noticeMessage ? (
          <div
            className={`mt-4 rounded-[1.5rem] px-4 py-3 text-sm font-black ${
              hasAlarm
                ? "bg-white text-rose-700"
                : "bg-slate-50 text-slate-600"
            }`}
          >
            {noticeMessage}
          </div>
        ) : null}

        {notificationPermission ? (
          <div className="mt-2 text-xs font-bold text-slate-500">
            Status notifikasi browser: {notificationPermission}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-5 rounded-[2rem] border border-dashed border-slate-200 bg-white/70 p-6 text-center text-sm font-bold text-slate-400">
            Memuat catatan coach...
          </div>
        ) : notes.length === 0 ? (
          <div className="mt-5 rounded-[2rem] border border-dashed border-slate-200 bg-white/70 p-6 text-center">
            <div className="text-base font-black text-slate-900">
              Belum ada catatan dari coach.
            </div>

            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
              Jika coach membuat catatan atau action plan, peserta akan melihatnya di bagian ini.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            {latestNote ? (
              <CoachNoticeCard
                note={latestNote}
                featured
                onRead={() => markNoteRead(latestNote.id)}
              />
            ) : null}

            {notes.slice(1, 4).map((note) => (
              <CoachNoticeCard
                key={note.id}
                note={note}
                onRead={() => markNoteRead(note.id)}
              />
            ))}

            {unreadNotes.length > 1 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="rounded-[1.5rem] bg-teal-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-teal-100"
              >
                Tandai Semua Dibaca
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

function CoachNoticeCard({
  note,
  featured = false,
  onRead,
}: {
  note: any;
  featured?: boolean;
  onRead: () => void;
}) {
  const isHigh = note.priority === "high";
  const isUnread = !note.is_read;

  return (
    <div
      className={`rounded-[1.8rem] border p-4 ${
        isUnread
          ? isHigh
            ? "border-rose-200 bg-white"
            : "border-amber-200 bg-white"
          : "border-slate-100 bg-white/70"
      }`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isUnread ? (
              <span className="rounded-full bg-rose-50 px-3 py-1 text-[11px] font-black text-rose-700">
                BELUM DIBACA
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-500">
                SUDAH DIBACA
              </span>
            )}

            {isHigh ? (
              <span className="rounded-full bg-rose-600 px-3 py-1 text-[11px] font-black text-white">
                MEDICAL REVIEW
              </span>
            ) : null}

            {featured ? (
              <span className="rounded-full bg-teal-50 px-3 py-1 text-[11px] font-black text-teal-700">
                TERBARU
              </span>
            ) : null}
          </div>

          <div className="mt-3 text-sm font-black text-slate-950">
            {note.topic || "Catatan Coaching"}
          </div>

          <div className="mt-1 text-xs font-bold text-slate-400">
            {formatCoachDate(note.created_at || note.session_date)} - Status:{" "}
            {note.follow_up_status || "Open"}
          </div>

          {note.main_issue ? (
            <div className="mt-3 rounded-2xl bg-slate-50 p-3">
              <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                Masalah Utama
              </div>
              <div className="mt-1 text-sm font-bold leading-6 text-slate-700">
                {note.main_issue}
              </div>
            </div>
          ) : null}

          {note.coach_note ? (
            <div className="mt-3 rounded-2xl bg-teal-50 p-3">
              <div className="text-[11px] font-black uppercase tracking-wide text-teal-700/70">
                Catatan Coach
              </div>
              <div className="mt-1 text-sm font-bold leading-6 text-teal-950">
                {note.coach_note}
              </div>
            </div>
          ) : null}

          {note.action_plan ? (
            <div className="mt-3 rounded-2xl bg-sky-50 p-3">
              <div className="text-[11px] font-black uppercase tracking-wide text-sky-700/70">
                Action Plan
              </div>
              <div className="mt-1 text-sm font-bold leading-6 text-sky-950">
                {note.action_plan}
              </div>
            </div>
          ) : null}

          {note.next_follow_up_date ? (
            <div className="mt-3 text-xs font-black text-slate-500">
              Follow up berikutnya: {formatCoachDate(note.next_follow_up_date)}
            </div>
          ) : null}
        </div>

        {isUnread ? (
          <button
            type="button"
            onClick={onRead}
            className="shrink-0 rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
          >
            Tandai Dibaca
          </button>
        ) : null}
      </div>
    </div>
  );
}

function formatCoachDate(value: any) {
  const raw = clean(value);
  if (!raw) return "-";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10);

  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function NutritionTab({
  participant,
  form,
  photo,
  setPhoto,
  setValue,
  saveNutrition,
  logs,
}: {
  participant?: any;
  form: any;
  photo: File | null;
  setPhoto: (file: File | null) => void;
  setValue: (key: string, value: string) => void;
  saveNutrition: () => void;
  logs: any[];
}) {
  const participantId = Number(
    participant?.id ||
      participant?.participant_id ||
      participant?.wellness_participant_id ||
      form?.participant_id ||
      form?.participantId ||
      form?.wellness_participant_id ||
      0
  );

  const [foodMaster, setFoodMaster] = useState<any[]>([]);
  const [portionMap, setPortionMap] = useState<Record<string, string>>({});
  const [directNutrition, setDirectNutrition] = useState<any>({
    ok: false,
    logs: [],
    today_logs: [],
    latest_logs: [],
    today_count: 0,
    today_calories: 0,
    sources: null,
  });

  const [loadingHistory, setLoadingHistory] = useState(false);
  const [savingSmart, setSavingSmart] = useState(false);

  const foodText = clean(
    form.food_name ||
      form.foodName ||
      form.meal_text ||
      form.mealText ||
      form.makanan
  );

  const mealChips = [
    { value: "Breakfast / Sarapan", label: "Sarapan" },
    { value: "Lunch / Makan Siang", label: "Makan Siang" },
    { value: "Dinner / Makan Malam", label: "Malam" },
    { value: "Snack", label: "Snack" },
  ];

  async function loadFoodMaster() {
    const result = await fetch("/api/wellness/reference/foods?limit=2000", {
      cache: "no-store",
    })
      .then((response) => response.json())
      .catch(() => null);

    const rows = Array.isArray(result)
      ? result
      : Array.isArray(result?.data)
        ? result.data
        : Array.isArray(result?.foods)
          ? result.foods
          : Array.isArray(result?.items)
            ? result.items
            : [];

    setFoodMaster(rows);
  }

  async function loadDirectNutrition() {
    if (!participantId) return;

    setLoadingHistory(true);

    const result = await fetch(
      `/api/wellness/portal/nutrition-direct?participant_id=${participantId}&t=${Date.now()}`,
      { cache: "no-store" }
    )
      .then((response) => response.json())
      .catch(() => null);

    if (result?.ok) {
      setDirectNutrition(result);
    }

    setLoadingHistory(false);
  }

  useEffect(() => {
    loadFoodMaster();
  }, []);

  useEffect(() => {
    loadDirectNutrition();
  }, [participantId]);

  const parsedFoods = useMemo(() => {
    return buildAutoFoodBreakdownV29(foodText, foodMaster, portionMap);
  }, [foodText, foodMaster, portionMap]);

  const totalEstimatedCalories = parsedFoods.reduce((sum, item) => {
    return sum + Number(item.subtotal_calories || 0);
  }, 0);

  const breakdownPayload = useMemo(() => {
    return parsedFoods.map((item) => ({
      input_name: item.input_name,
      matched_name: item.matched_name,
      category: item.category,
      portion_fraction: item.portion_fraction,
      portion_multiplier: item.portion_multiplier,
      base_calories: item.base_calories,
      subtotal_calories: item.subtotal_calories,
      match_status: item.match_status,
    }));
  }, [parsedFoods]);

  useEffect(() => {
    const payloadText = JSON.stringify(breakdownPayload);
    const portionText = parsedFoods
      .map((item) => `${item.input_name} ${item.portion_fraction}`)
      .join(", ");

    if (clean(form.food_breakdown) !== payloadText) {
      setValue("food_breakdown", payloadText);
    }

    if (clean(form.portion_breakdown) !== payloadText) {
      setValue("portion_breakdown", payloadText);
    }

    if (clean(form.estimated_calories) !== String(totalEstimatedCalories)) {
      setValue("estimated_calories", String(totalEstimatedCalories));
    }

    if (clean(form.calories) !== String(totalEstimatedCalories)) {
      setValue("calories", String(totalEstimatedCalories));
    }

    if (portionText && clean(form.portion) !== portionText) {
      setValue("portion", portionText);
    }

    if (clean(form.portion_group) !== "auto_breakdown") {
      setValue("portion_group", "auto_breakdown");
    }

    if (clean(form.portion_fraction) !== "multi_food") {
      setValue("portion_fraction", "multi_food");
    }
  }, [JSON.stringify(breakdownPayload), totalEstimatedCalories]);

  const historyLogs =
    directNutrition?.today_logs?.length > 0
      ? directNutrition.today_logs
      : directNutrition?.latest_logs?.length > 0
        ? directNutrition.latest_logs
        : logs || [];

  async function submitNutritionSmart() {
    setSavingSmart(true);
    await Promise.resolve(saveNutrition());

    window.setTimeout(() => {
      loadDirectNutrition();
      setSavingSmart(false);
    }, 1200);
  }

  function changePortion(key: string, value: string) {
    setPortionMap((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  return (
    <section className="w-full max-w-full space-y-4 overflow-hidden">
      <div className="rounded-[1.8rem] border border-white bg-white p-4 shadow-lg shadow-slate-200/50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-teal-700/70">
              Food Diary
            </div>

            <h2 className="mt-2 text-2xl font-black leading-tight text-slate-950">
              Input Nutrisi
            </h2>

            <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
              Ketik makanan dengan koma. Sistem otomatis membuat breakdown dan estimasi kalori.
            </p>
          </div>

          <div className="shrink-0 rounded-[1.3rem] bg-teal-50 px-4 py-3 text-right">
            <div className="text-[10px] font-black uppercase tracking-wide text-teal-700/70">
              Estimasi
            </div>
            <div className="text-xl font-black text-teal-900">
              {fmtNumber(totalEstimatedCalories, 0)}
            </div>
            <div className="text-[10px] font-bold text-teal-700/70">
              kkal
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-2 text-xs font-black text-slate-700">
            Tanggal
            <input
              type="date"
              value={form.log_date}
              onChange={(e) => setValue("log_date", e.target.value)}
              className={`${fieldClass} w-full text-sm`}
            />
          </label>

          <div className="grid gap-2">
            <div className="text-xs font-black text-slate-700">
              Waktu Makan
            </div>

            <div className="grid grid-cols-4 gap-2">
              {mealChips.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setValue("meal_type", item.value)}
                  className={`rounded-2xl px-2 py-3 text-[11px] font-black transition ${
                    form.meal_type === item.value
                      ? "bg-teal-600 text-white shadow-md shadow-teal-100"
                      : "bg-slate-50 text-slate-600"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <label className="grid gap-2 text-xs font-black text-slate-700">
            Nama Makanan
            <textarea
              value={form.food_name}
              onChange={(e) => setValue("food_name", e.target.value)}
              className={`${fieldClass} min-h-[92px] w-full resize-none text-sm`}
              placeholder="Contoh: Nasi putih, sayur sop, ayam goreng"
            />
          </label>

          <CompactAutoFoodBreakdownV43
            foods={parsedFoods}
            onChangePortion={changePortion}
          />

          <label className="grid gap-2 text-xs font-black text-slate-700">
            Upload Foto
            <div className="flex items-center gap-3 rounded-[1.4rem] border border-dashed border-teal-200 bg-[#f4fbfa] p-3">
              <label className="shrink-0 cursor-pointer rounded-2xl bg-white px-4 py-3 text-xs font-black text-teal-700 shadow-sm">
                Pilih Foto
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setPhoto(event.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>

              <div className="min-w-0 flex-1 truncate text-xs font-bold text-slate-500">
                {photo ? photo.name : "Belum ada foto dipilih"}
              </div>
            </div>
          </label>

          <label className="grid gap-2 text-xs font-black text-slate-700">
            Catatan
            <textarea
              value={form.notes}
              onChange={(e) => setValue("notes", e.target.value)}
              className={`${fieldClass} min-h-[78px] w-full resize-none text-sm`}
              placeholder="Contoh: makan di luar, minuman manis, porsi besar, dll."
            />
          </label>

          <div className="rounded-[1.4rem] bg-teal-50 p-3 text-[11px] font-bold leading-5 text-teal-900">
            Peserta tidak perlu mengisi kalori manual. Sistem mencocokkan makanan dengan Master KaloriData.
          </div>

          <button
            type="button"
            onClick={submitNutritionSmart}
            disabled={savingSmart}
            className="w-full rounded-[1.4rem] bg-teal-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-teal-100 disabled:opacity-50"
          >
            {savingSmart ? "Menyimpan..." : "Simpan Nutrisi"}
          </button>
        </div>
      </div>

      <div className="rounded-[1.8rem] border border-white bg-white p-4 shadow-lg shadow-slate-200/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
              Meal History
            </div>

            <h3 className="mt-2 text-xl font-black text-slate-950">
              Riwayat Nutrisi
            </h3>

            {directNutrition?.sources ? (
              <p className="mt-1 text-[11px] font-bold leading-5 text-slate-500">
                Supabase {directNutrition.sources.supabase_rows || 0} row | Google Sheet{" "}
                {directNutrition.sources.google_sheet_rows || 0} row
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={loadDirectNutrition}
            className="rounded-full bg-teal-50 px-3 py-2 text-[11px] font-black text-teal-700"
          >
            {loadingHistory ? "..." : "Refresh"}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {historyLogs.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-bold text-slate-400">
              Belum ada input nutrisi.
            </div>
          ) : (
            historyLogs.slice(0, 6).map((item: any, index: number) => (
              <CompactNutritionHistoryItemV43 key={`${item.id || index}-${index}`} item={item} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function CompactAutoFoodBreakdownV43({
  foods,
  onChangePortion,
}: {
  foods: any[];
  onChangePortion: (key: string, value: string) => void;
}) {
  const total = foods.reduce((sum, item) => sum + Number(item.subtotal_calories || 0), 0);

  if (!foods.length) {
    return (
      <div className="rounded-[1.4rem] border border-dashed border-slate-200 bg-slate-50 p-4">
        <div className="text-xs font-black text-slate-900">
          Breakdown otomatis akan muncul di sini.
        </div>
        <p className="mt-1 text-[11px] font-bold leading-5 text-slate-500">
          Pisahkan makanan dengan koma.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[1.4rem] border border-teal-100 bg-[#f4fbfa] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black text-slate-950">
            Auto Breakdown
          </div>
          <div className="text-[11px] font-bold text-slate-500">
            {foods.length} item makanan
          </div>
        </div>

        <div className="rounded-full bg-white px-3 py-2 text-[11px] font-black text-teal-700">
          {fmtNumber(total, 0)} kkal
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {foods.map((item) => (
          <div key={item.key} className="rounded-[1.2rem] bg-white p-3 shadow-sm">
            <div className="text-sm font-black text-slate-950">
              {item.input_name}
            </div>

            <div className="mt-1 text-[11px] font-bold leading-5 text-slate-500">
              {item.match_status === "matched"
                ? `${item.matched_name} | ${item.category || "Umum"} | ${fmtNumber(item.base_calories, 0)} kkal dasar`
                : "Belum match di Master KaloriData"}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <select
                value={item.portion_fraction}
                onChange={(event) => onChangePortion(item.key, event.target.value)}
                className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-black text-slate-700 outline-none"
              >
                <option value="1/4">1/4 porsi</option>
                <option value="1/3">1/3 porsi</option>
                <option value="1/2">1/2 porsi</option>
                <option value="1">1 porsi</option>
              </select>

              <div className="shrink-0 rounded-2xl bg-teal-50 px-3 py-3 text-xs font-black text-teal-700">
                {fmtNumber(item.subtotal_calories, 0)} kkal
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompactNutritionHistoryItemV43({ item }: { item: any }) {
  const photo = normalizeImageUrlV37 ? normalizeImageUrlV37(item.photo_url) : clean(item.photo_url);
  const sourceLabel =
    item.source === "google_sheet"
      ? "Google Sheet"
      : item.source === "supabase"
        ? "Supabase"
        : item.source || "Food log";

  return (
    <div className="rounded-[1.4rem] bg-slate-50 p-3">
      <div className="flex items-center gap-3">
        {photo ? (
          <img
            src={photo}
            alt="Foto makanan"
            className="h-14 w-14 shrink-0 rounded-2xl object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-[10px] font-black text-teal-700">
            FOOD
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-slate-950">
            {item.food_name || item.meal_text || "-"}
          </div>

          <div className="mt-1 truncate text-[11px] font-bold capitalize text-slate-500">
            {item.log_date || "-"} | {item.meal_time || item.meal_type || "-"}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-teal-50 px-3 py-1 text-[10px] font-black text-teal-700">
              {fmtNumber(item.calories || item.total_calories || 0, 0)} kkal
            </span>

            <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-slate-500">
              {sourceLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
function AutoFoodBreakdownV29({
  foods,
  onChangePortion,
}: {
  foods: any[];
  onChangePortion: (key: string, value: string) => void;
}) {
  const total = foods.reduce((sum, item) => sum + Number(item.subtotal_calories || 0), 0);

  if (!foods.length) {
    return (
      <div className="rounded-[1.8rem] border border-dashed border-slate-200 bg-slate-50 p-5">
        <div className="text-sm font-black text-slate-900">
          Breakdown makanan akan muncul otomatis.
        </div>
        <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
          Tulis nama makanan dan pisahkan dengan koma.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[1.8rem] border border-teal-100 bg-[#f4fbfa] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-950">
            Auto Breakdown Kalori
          </div>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
            Pilih porsi untuk setiap item makanan.
          </p>
        </div>

        <div className="rounded-full bg-white px-4 py-2 text-xs font-black text-teal-700 shadow-sm">
          Total {fmtNumber(total, 0)} kkal
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {foods.map((item) => (
          <div
            key={item.key}
            className="rounded-[1.5rem] bg-white p-4 shadow-sm"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-slate-950">
                  {item.input_name}
                </div>

                <div className="mt-1 text-xs font-bold text-slate-500">
                  {item.match_status === "matched"
                    ? `Match: ${item.matched_name} | ${item.category || "Umum"} | ${fmtNumber(item.base_calories, 0)} kkal dasar`
                    : "Belum match di Master KaloriData"}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <select
                  value={item.portion_fraction}
                  onChange={(event) => onChangePortion(item.key, event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-black text-slate-700 outline-none"
                >
                  <option value="1/4">1/4 porsi</option>
                  <option value="1/3">1/3 porsi</option>
                  <option value="1/2">1/2 porsi</option>
                  <option value="1">1 porsi</option>
                </select>

                <div className="rounded-2xl bg-teal-50 px-3 py-3 text-xs font-black text-teal-700">
                  {fmtNumber(item.subtotal_calories, 0)} kkal
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NutritionHistoryItemV29({ item }: { item: any }) {
  const sourceLabel =
    item.source === "google_sheet"
      ? "Google Sheet"
      : item.source === "supabase"
        ? "Supabase"
        : item.source || "Food log";

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
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white text-xs font-black text-teal-700">
            FOOD
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-slate-950">
            {item.food_name || item.meal_text || "-"}
          </div>

          <div className="mt-1 text-xs font-bold capitalize text-slate-500">
            {item.log_date || "-"} | {item.meal_time || item.meal_type || "-"}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-teal-50 px-3 py-1 text-[11px] font-black text-teal-700">
              {fmtNumber(item.calories || item.total_calories || 0, 0)} kkal
            </span>

            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-500">
              {sourceLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildAutoFoodBreakdownV29(
  foodText: string,
  foodMaster: any[],
  portionMap: Record<string, string>
) {
  const tokens = splitFoodInputV29(foodText);
  const masterIndex = buildFoodMasterIndexV29(foodMaster);

  return tokens.map((token) => {
    const key = normalizeFoodTextV29(token);
    const matched = matchFoodMasterV29(token, masterIndex);
    const category = matched?.category || guessFoodCategoryV29(token);
    const defaultPortion = defaultPortionByCategoryV29(category);
    const portionFraction = portionMap[key] || defaultPortion;
    const multiplier = portionMultiplierV29(portionFraction);
    const baseCalories = Number(matched?.calories || 0);
    const subtotal = Math.round(baseCalories * multiplier);

    return {
      key,
      input_name: token,
      matched_name: matched?.name || "",
      category,
      portion_fraction: portionFraction,
      portion_multiplier: multiplier,
      base_calories: baseCalories,
      subtotal_calories: subtotal,
      match_status: matched ? "matched" : "unmatched",
    };
  });
}

function splitFoodInputV29(value: string) {
  return clean(value)
    .split(/,|;|\bdan\b|\+/i)
    .map((item) => clean(item))
    .filter(Boolean);
}

function normalizeFoodTextV29(value: any) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFoodMasterIndexV29(rows: any[]) {
  const items: Array<{
    name: string;
    normalized: string;
    calories: number;
    category: string;
    raw: any;
  }> = [];

  for (const row of rows || []) {
    const calories = Number(row.calories || row.calorie || row.kcal || 0);
    const category = clean(row.category || row.kategori || "Umum");

    const aliases = Array.isArray(row.aliases)
      ? row.aliases
      : clean(row.aliases)
          .split(",")
          .map((item) => clean(item))
          .filter(Boolean);

    const names = [
      row.food_name,
      row.name,
      ...aliases,
    ]
      .map((item) => clean(item))
      .filter(Boolean);

    for (const name of names) {
      const normalized = normalizeFoodTextV29(name);

      if (!normalized) continue;

      items.push({
        name,
        normalized,
        calories,
        category,
        raw: row,
      });
    }
  }

  return items;
}

function matchFoodMasterV29(
  input: string,
  index: Array<{
    name: string;
    normalized: string;
    calories: number;
    category: string;
    raw: any;
  }>
) {
  const normalized = normalizeFoodTextV29(input);

  if (!normalized) return null;

  return (
    index.find((item) => item.normalized === normalized) ||
    index.find((item) => normalized.includes(item.normalized)) ||
    index.find((item) => item.normalized.includes(normalized)) ||
    null
  );
}

function guessFoodCategoryV29(value: string) {
  const text = normalizeFoodTextV29(value);

  if (
    text.includes("nasi") ||
    text.includes("mie") ||
    text.includes("bihun") ||
    text.includes("kwetiau") ||
    text.includes("roti") ||
    text.includes("kentang") ||
    text.includes("ubi") ||
    text.includes("singkong") ||
    text.includes("jagung") ||
    text.includes("oat")
  ) {
    return "Makanan Pokok";
  }

  if (
    text.includes("ayam") ||
    text.includes("ikan") ||
    text.includes("telur") ||
    text.includes("daging") ||
    text.includes("sapi") ||
    text.includes("tempe") ||
    text.includes("tahu") ||
    text.includes("udang")
  ) {
    return "Lauk / Protein";
  }

  if (
    text.includes("sayur") ||
    text.includes("sop") ||
    text.includes("capcay") ||
    text.includes("kangkung") ||
    text.includes("bayam") ||
    text.includes("lalap")
  ) {
    return "Sayur";
  }

  if (
    text.includes("apel") ||
    text.includes("pisang") ||
    text.includes("jeruk") ||
    text.includes("pepaya") ||
    text.includes("mangga") ||
    text.includes("buah")
  ) {
    return "Buah";
  }

  return "Umum / Minuman";
}

function defaultPortionByCategoryV29(category: string) {
  const text = normalizeFoodTextV29(category);

  if (text.includes("makanan pokok")) return "1/3";
  if (text.includes("sayur")) return "1/3";
  if (text.includes("lauk") || text.includes("protein")) return "1/3";
  if (text.includes("buah")) return "1/3";

  return "1";
}

function portionMultiplierV29(value: string) {
  if (value === "1/4") return 0.25;
  if (value === "1/3") return 1 / 3;
  if (value === "1/2") return 0.5;
  if (value === "1") return 1;

  return 1;
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


function HealthtalkTab(props: {
  form?: any;
  evidence?: File | null;
  setEvidence?: (file: File | null) => void;
  setValue?: (key: string, value: string) => void;
  saveHealthtalk?: () => void | Promise<void>;
  logs?: any[];
  [key: string]: any;
}) {
  const {
    form = {},
    evidence = null,
    setEvidence = () => {},
    setValue = () => {},
    saveHealthtalk = () => {},
    logs = [],
  } = props;

  return (
    <section className="w-full max-w-full space-y-5 overflow-hidden">
      <div className="overflow-hidden rounded-[2rem] border border-white bg-white shadow-xl shadow-slate-200/60">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#e7f4fb] via-[#e1f3f0] to-[#fff0e8] p-5 md:p-6">
          <div className="text-xs font-black uppercase tracking-[0.22em] text-teal-700/70">
            Health Talk
          </div>

          <h2 className="mt-3 text-2xl font-black leading-tight text-slate-950 md:text-3xl">
            Input Health Talk
          </h2>

          <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-slate-600">
            Catat kehadiran seminar, edukasi kesehatan, atau aktivitas pembelajaran wellness.
          </p>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[250px_1fr] md:p-6">
          <div>
            <label className="block cursor-pointer rounded-[2rem] border border-dashed border-teal-200 bg-[#f4fbfa] p-5 text-center transition hover:bg-teal-50">
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(event) => setEvidence(event.target.files?.[0] || null)}
                className="hidden"
              />

              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-white text-sm font-black text-teal-700 shadow-sm">
                {evidence ? "FILE" : "UPLOAD"}
              </div>

              <div className="mt-4 text-sm font-black text-slate-950">
                {evidence ? evidence.name : "Upload Bukti"}
              </div>

              <div className="mt-2 text-xs font-bold leading-5 text-slate-500">
                Bisa berupa foto atau PDF bukti kehadiran.
              </div>
            </label>
          </div>

          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Tanggal
              <input
                type="date"
                value={form.event_date || form.log_date || ""}
                onChange={(e) => setValue("event_date", e.target.value)}
                className={fieldClass}
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Judul / Topik Health Talk
              <input
                value={form.title || form.topic || ""}
                onChange={(e) => setValue("title", e.target.value)}
                className={fieldClass}
                placeholder="Contoh: Edukasi Sindrom Metabolik"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Jenis Kehadiran
              <select
                value={form.attendance_type || ""}
                onChange={(e) => setValue("attendance_type", e.target.value)}
                className={fieldClass}
              >
                <option value="">Pilih jenis kehadiran</option>
                <option value="Online">Online</option>
                <option value="Offline">Offline</option>
                <option value="Recording">Recording</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Catatan
              <textarea
                value={form.notes || ""}
                onChange={(e) => setValue("notes", e.target.value)}
                className={`${fieldClass} min-h-[110px]`}
                placeholder="Catatan tambahan atau poin edukasi yang didapat."
              />
            </label>

            <button
              type="button"
              onClick={() => saveHealthtalk()}
              className="rounded-[1.5rem] bg-teal-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-teal-100"
            >
              Simpan Health Talk
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
              Health Talk History
            </div>

            <h3 className="mt-2 text-2xl font-black text-slate-950">
              Riwayat Health Talk
            </h3>
          </div>

          <div className="rounded-full bg-teal-50 px-3 py-2 text-xs font-black text-teal-700">
            {logs.length} log
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {logs.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
              Belum ada input Health Talk.
            </div>
          ) : (
            logs.slice(0, 10).map((item: any, index: number) => (
              <div
                key={`${item.id || index}-${index}`}
                className="rounded-[1.7rem] bg-slate-50 p-4"
              >
                <div className="text-sm font-black text-slate-950">
                  {item.title || item.topic || "Health Talk"}
                </div>

                <div className="mt-1 text-xs font-bold text-slate-400">
                  {item.event_date || item.log_date || item.created_at || "-"}
                </div>

                <div className="mt-3 text-sm font-bold leading-6 text-slate-600">
                  {item.notes || item.description || "-"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function parseRawPayloadV41(item: any) {
  const raw = item?.raw_payload;

  if (!raw) return {};

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  if (typeof raw === "object") return raw;

  return {};
}

function numberFromMixedV41(value: any) {
  if (value === null || value === undefined) return 0;

  const text = String(value)
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

function firstPositiveNumberV41(values: any[]) {
  for (const value of values) {
    const n = numberFromMixedV41(value);
    if (n > 0) return n;
  }

  return 0;
}

function numberFromTextPatternV41(text: any, pattern: RegExp) {
  const raw = clean(text);
  const match = raw.match(pattern);

  if (!match?.[1]) return 0;

  return numberFromMixedV41(match[1]);
}

function historyStepsValueV41(item: any) {
  const raw = parseRawPayloadV41(item);
  const original = raw?.original_payload || raw?.original || raw?.diagnostic || {};

  const direct = firstPositiveNumberV41([
    item?.steps,
    item?.total_steps,
    item?.step_count,
    item?.health_connect_steps,
    item?.google_fit_steps,
    raw?.steps,
    raw?.total_steps,
    raw?.step_count,
    raw?.health_connect_steps,
    raw?.google_fit_steps,
    raw?.activity_steps,
    original?.steps,
    original?.total_steps,
    original?.step_count,
    original?.health_connect_steps,
    original?.google_fit_steps,
  ]);

  if (direct > 0) return direct;

  return (
    numberFromTextPatternV41(item?.activity_name, /([0-9][0-9.,]*)\s*steps/i) ||
    numberFromTextPatternV41(item?.activity_type, /([0-9][0-9.,]*)\s*steps/i) ||
    numberFromTextPatternV41(item?.notes, /([0-9][0-9.,]*)\s*steps/i) ||
    0
  );
}

function historyCaloriesValueV41(item: any) {
  const raw = parseRawPayloadV41(item);
  const original = raw?.original_payload || raw?.original || raw?.diagnostic || {};

  return firstPositiveNumberV41([
    item?.calories,
    item?.total_calories,
    item?.calorie,
    item?.kcal,
    raw?.calories,
    raw?.total_calories,
    raw?.calorie,
    raw?.kcal,
    raw?.active_calories,
    original?.calories,
    original?.total_calories,
    original?.active_calories,
  ]);
}
function HistoryTab({
  participant,
  nutritionLogs,
  workoutLogs,
  workoutItems,
  healthTalkLogs,
  healthtalkLogs,
  clinicalHistory,
  refresh,
}: {
  participant?: any;
  nutritionLogs?: any[];
  workoutLogs?: any[];
  workoutItems?: any[];
  healthTalkLogs?: any[];
  healthtalkLogs?: any[];
  clinicalHistory?: any[];
  refresh?: () => any;
}) {
  const participantId = Number(
    participant?.id ||
      participant?.participant_id ||
      participant?.wellness_participant_id ||
      0
  );

  const [openSection, setOpenSection] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loadingKey, setLoadingKey] = useState("");

  const [nutritionLoaded, setNutritionLoaded] = useState(false);
  const [directNutrition, setDirectNutrition] = useState<any>({
    ok: false,
    logs: [],
    today_logs: [],
    latest_logs: [],
    today_count: 0,
    today_row_count: 0,
    today_calories: 0,
    sources: null,
  });

  async function loadNutritionHistory() {
    if (!participantId) return;

    setLoadingKey("nutrition");

    const result = await fetch(
      `/api/wellness/portal/nutrition-direct?participant_id=${participantId}&t=${Date.now()}`,
      { cache: "no-store" }
    )
      .then((response) => response.json())
      .catch(() => null);

    if (result?.ok) {
      setDirectNutrition(result);
      setNutritionLoaded(true);
    }

    setLoadingKey("");
  }

  async function openDropdown(key: "nutrition" | "workout" | "healthtalk") {
    if (openSection === key) {
      setOpenSection("");
      return;
    }

    setOpenSection(key);

    if (key === "nutrition" && !nutritionLoaded) {
      await loadNutritionHistory();
      return;
    }

    if ((key === "workout" || key === "healthtalk") && refresh) {
      setLoadingKey(key);
      await Promise.resolve(refresh());
      setLoadingKey("");
    }
  }

  function setTodayFilter() {
    const today = todayDate();
    setStartDate(today);
    setEndDate(today);
  }

  function setLast7DaysFilter() {
    const now = new Date();
    const past = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    setStartDate(past.toISOString().slice(0, 10));
    setEndDate(todayDate());
  }

  function clearFilter() {
    setStartDate("");
    setEndDate("");
  }

  const rawNutrition =
    nutritionLoaded && directNutrition?.logs?.length > 0
      ? directNutrition.logs
      : nutritionLogs || [];

  const rawWorkout = workoutLogs || workoutItems || [];
  const rawHealthTalk = healthTalkLogs || healthtalkLogs || [];
  const rawClinical = clinicalHistory || [];

  const nutrition = filterHistoryByDateV37(rawNutrition, startDate, endDate, [
    "log_date",
    "created_at",
    "updated_at",
  ]);

  const workout = filterHistoryByDateV37(rawWorkout, startDate, endDate, [
    "log_date",
    "created_at",
    "updated_at",
    "date",
  ]);

  const healthTalk = filterHistoryByDateV37(rawHealthTalk, startDate, endDate, [
    "event_date",
    "log_date",
    "created_at",
    "updated_at",
  ]);

  const clinical = filterHistoryByDateV37(rawClinical, startDate, endDate, [
    "exam_date",
    "log_date",
    "created_at",
    "updated_at",
  ]);

  const nutritionCalories = nutrition.reduce((sum: number, item: any) => {
    return sum + Number(item.calories || item.total_calories || 0);
  }, 0);

  const workoutCalories = workout.reduce((sum: number, item: any) => {
    return sum + Number(item.calories || item.total_calories || 0);
  }, 0);

  const workoutSteps = workout.reduce((sum: number, item: any) => {
    return sum + Number(item.steps || item.total_steps || 0);
  }, 0);

  return (
    <section className="w-full max-w-full space-y-5 overflow-hidden">
      <div className="rounded-[2rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-teal-700/70">
              Participant History
            </div>

            <h2 className="mt-2 text-2xl font-black text-slate-950">
              History Peserta
            </h2>

            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
              Buka dropdown sesuai kebutuhan. Data nutrisi akan diretrieve saat dropdown dibuka.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (openSection === "nutrition") loadNutritionHistory();
              if (openSection !== "nutrition" && refresh) refresh();
            }}
            className="rounded-full bg-slate-950 px-5 py-3 text-xs font-black text-white"
          >
            {loadingKey ? "Memuat..." : "Refresh"}
          </button>
        </div>

        <div className="mt-5 rounded-[1.8rem] bg-slate-50 p-4">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">
            Filter Tanggal
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto_auto]">
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className={fieldClass}
            />

            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className={fieldClass}
            />

            <button
              type="button"
              onClick={setTodayFilter}
              className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-700"
            >
              Hari Ini
            </button>

            <button
              type="button"
              onClick={setLast7DaysFilter}
              className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-700"
            >
              7 Hari
            </button>

            <button
              type="button"
              onClick={clearFilter}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black text-white"
            >
              Semua
            </button>
          </div>
        </div>
      </div>

      <HistoryAccordionCardV37
        title="History Nutrisi"
        subtitle={
          nutritionLoaded
            ? `${nutrition.length} log | ${fmtNumber(nutritionCalories, 0)} kkal`
            : "Klik untuk retrieve data nutrisi"
        }
        open={openSection === "nutrition"}
        loading={loadingKey === "nutrition"}
        onClick={() => openDropdown("nutrition")}
      >
        {directNutrition?.sources ? (
          <div className="mb-4 rounded-[1.4rem] bg-slate-50 px-4 py-3 text-[11px] font-bold leading-5 text-slate-500">
            Source: Supabase {directNutrition.sources.supabase_rows || 0} row | Google Sheet{" "}
            {directNutrition.sources.google_sheet_rows || 0} row
          </div>
        ) : null}

        {nutrition.length === 0 ? (
          <EmptyHistoryCardV37 text={nutritionLoaded ? "Belum ada input nutrisi pada periode ini." : "Klik dropdown untuk memuat data nutrisi."} />
        ) : (
          <div className="space-y-3">
            {nutrition.slice(0, 30).map((item: any, index: number) => (
              <HistoryMealItemV37 key={`${item.id || index}-${index}`} item={item} />
            ))}
          </div>
        )}
      </HistoryAccordionCardV37>

      <HistoryAccordionCardV37
        title="History Workout"
        subtitle={`${workout.length} log | ${fmtNumber(workoutCalories, 0)} kkal | ${fmtNumber(workoutSteps, 0)} steps`}
        open={openSection === "workout"}
        loading={loadingKey === "workout"}
        onClick={() => openDropdown("workout")}
      >
        {workout.length === 0 ? (
          <EmptyHistoryCardV37 text="Belum ada input workout pada periode ini." />
        ) : (
          <div className="space-y-3">
            {workout.slice(0, 30).map((item: any, index: number) => (
              <HistoryGenericItemV37
                key={`${item.id || index}-${index}`}
                title={item.activity_name || item.activity_type || item.source || "Workout"}
                subtitle={formatDateTextV37(item.log_date || item.created_at || item.updated_at)}
                note={`${fmtNumber(historyCaloriesValueV41(item), 0)} kkal | ${fmtNumber(historyStepsValueV41(item), 0)} steps`}
              />
            ))}
          </div>
        )}
      </HistoryAccordionCardV37>

      <HistoryAccordionCardV37
        title="History Health Talk"
        subtitle={`${healthTalk.length} log`}
        open={openSection === "healthtalk"}
        loading={loadingKey === "healthtalk"}
        onClick={() => openDropdown("healthtalk")}
      >
        {healthTalk.length === 0 ? (
          <EmptyHistoryCardV37 text="Belum ada input Health Talk pada periode ini." />
        ) : (
          <div className="space-y-3">
            {healthTalk.slice(0, 30).map((item: any, index: number) => (
              <HistoryGenericItemV37
                key={`${item.id || index}-${index}`}
                title={item.title || item.topic || "Health Talk"}
                subtitle={formatDateTextV37(item.event_date || item.log_date || item.created_at)}
                note={item.notes || item.description || "-"}
              />
            ))}
          </div>
        )}
      </HistoryAccordionCardV37>

      {clinical.length > 0 ? (
        <HistoryAccordionCardV37
          title="History Klinis"
          subtitle={`${clinical.length} data`}
          open={openSection === "clinical"}
          loading={false}
          onClick={() => setOpenSection(openSection === "clinical" ? "" : "clinical")}
        >
          <div className="space-y-3">
            {clinical.slice(0, 20).map((item: any, index: number) => (
              <HistoryGenericItemV37
                key={`${item.id || index}-${index}`}
                title={formatDateTextV37(item.exam_date || item.log_date || item.created_at)}
                subtitle={`BMI ${item.bmi || item.imt || "-"} | Tensi ${
                  item.systolic ? `${item.systolic}/${item.diastolic || "-"}` : "-"
                }`}
                note={item.summary || item.notes || item.risk_category || "-"}
              />
            ))}
          </div>
        </HistoryAccordionCardV37>
      ) : null}
    </section>
  );
}

function HistoryAccordionCardV37({
  title,
  subtitle,
  open,
  loading,
  onClick,
  children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  loading: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div>
          <div className="text-2xl font-black text-slate-950">
            {title}
          </div>

          <div className="mt-2 text-sm font-bold leading-5 text-slate-500">
            {loading ? "Memuat data..." : subtitle}
          </div>
        </div>

        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-slate-50 text-xl font-black text-slate-700">
          {open ? "-" : "+"}
        </div>
      </button>

      {open ? (
        <div className="mt-5">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function EmptyHistoryCardV37({ text }: { text: string }) {
  return (
    <div className="rounded-[1.8rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
      {text}
    </div>
  );
}

function HistoryGenericItemV37({
  title,
  subtitle,
  note,
}: {
  title: string;
  subtitle: string;
  note: string;
}) {
  return (
    <div className="rounded-[1.7rem] bg-slate-50 p-4">
      <div className="text-sm font-black text-slate-950">
        {title}
      </div>
      <div className="mt-1 text-xs font-bold text-slate-400">
        {subtitle}
      </div>
      <div className="mt-3 text-sm font-bold leading-6 text-slate-600">
        {note}
      </div>
    </div>
  );
}

function normalizeImageUrlV37(value: any) {
  const raw = clean(value);
  if (!raw) return "";

  const fileMatch = raw.match(/\/file\/d\/([^/]+)/i);
  if (fileMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w600`;
  }

  const idMatch = raw.match(/[?&]id=([^&]+)/i);
  if (idMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w600`;
  }

  return raw;
}

function HistoryMealItemV37({ item }: { item: any }) {
  const photo = normalizeImageUrlV37(item.photo_url);
  const sourceLabel =
    item.source === "google_sheet"
      ? "Google Sheet"
      : item.source === "supabase"
        ? "Supabase"
        : item.source || "Food log";

  return (
    <div className="rounded-[1.7rem] bg-slate-50 p-3">
      <div className="flex items-center gap-3">
        {photo ? (
          <img
            src={photo}
            alt="Foto makanan"
            className="h-16 w-16 shrink-0 rounded-2xl object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white text-xs font-black text-teal-700">
            FOOD
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-slate-950">
            {item.food_name || item.meal_text || "-"}
          </div>

          <div className="mt-1 text-xs font-bold capitalize text-slate-500">
            {formatDateTextV37(item.log_date || item.created_at)} | {item.meal_time || item.meal_type || "-"}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-teal-50 px-3 py-1 text-[11px] font-black text-teal-700">
              {fmtNumber(item.calories || item.total_calories || 0, 0)} kkal
            </span>

            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-500">
              {sourceLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function filterHistoryByDateV37(
  items: any[],
  startDate: string,
  endDate: string,
  keys: string[]
) {
  return (items || []).filter((item) => {
    const dateText = extractDateFromItemV37(item, keys);

    if (!dateText) return true;
    if (startDate && dateText < startDate) return false;
    if (endDate && dateText > endDate) return false;

    return true;
  });
}

function extractDateFromItemV37(item: any, keys: string[]) {
  for (const key of keys) {
    const raw = clean(item?.[key]);

    if (!raw) continue;

    const iso = raw.match(/\d{4}-\d{2}-\d{2}/);
    if (iso) return iso[0];

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return "";
}

function formatDateTextV37(value: any) {
  const raw = clean(value);

  if (!raw) return "-";

  const iso = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return raw.slice(0, 10);
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




















