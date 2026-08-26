// WELLNESS_COMPANY_ISOLATION_V126C_FINAL
"use client";

// WELLNESS_DEVICE_HISTORY_PRIMARY_SOURCE_V72
// WELLNESS_GOOGLE_FIT_EXACT_LAST_SYNC_V79K
  // WELLNESS_PARTICIPANT_SINGLE_FITNESS_SOURCE_UI_V79F
// WELLNESS_PARTICIPANT_FITNESS_LAST_SYNC_V79J
// WELLNESS_GOOGLE_FIT_NATIVE_BRIDGE_V79N
// WELLNESS_GOOGLE_FIT_STABLE_SYNC_AND_TOTAL_DISPLAY_V79O
// WELLNESS_GOOGLE_FIT_NATIVE_SNAPSHOT_BUTTON_V86B
// WELLNESS_GOOGLE_FIT_OLD_CARD_REST_LKG_V123
// WELLNESS_GOOGLE_FIT_CARD_TOTAL_DISPLAY_V124
// WELLNESS_FITNESS_NATIVE_ALIGNMENT_V125_FIX
// WELLNESS_GOOGLE_FIT_FIRST_CONNECT_SYNC_UNLOCK_V111
// WELLNESS_GOOGLE_FIT_MANUAL_FORCE_RESTART_V113
  // WELLNESS_GOOGLE_FIT_CONNECTION_STATUS_V79G
// WELLNESS_TODAY_NUTRITION_GOOGLE_FIT_LABEL_V73
// WELLNESS_NUTRITION_FILLING_GUIDE_V74
// WELLNESS_PARTICIPANT_PROFILE_ASSIGNED_COACH_V76
// WELLNESS_PROFILE_AND_SYNC_CUTOFF_V126F
// WELLNESS_PARTICIPANT_HISTORY_DELETE_V126M
// WELLNESS_NUTRITION_CANONICAL_DEDUPE_SAFE_DELETE_V126M1
// WELLNESS_MOBILE_UPLOAD_LOCAL_DATE_SAFE_DELETE_GOOGLE_FIT_V126M2
// WELLNESS_NUTRITION_GOOGLE_SHEET_ONLY_V126M3A
// WELLNESS_LOCAL_DATE_JAKARTA_V126M13_2

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ParticipantPortalMenu from "./_components/ParticipantPortalMenu";
import AchievementChartsTab from "./_components/AchievementChartsTab";
import WorkoutLogResponsive from "./_components/WorkoutLogResponsive";
import SupportChatPanel from "@/components/wellness/SupportChatPanel";
import WellnessMomentumDashboard, {
  type WellnessMomentumDay,
} from "@/components/wellness/WellnessMomentumDashboard";
import WellnessProfilePanel, {
  WellnessAvatar,
  WellnessProfileAvatar,
} from "@/components/wellness/WellnessProfile";
import {
  buildWellnessStreakSummary,
  wellnessStreakSteps,
  wellnessStreakWorkoutCalories,
} from "@/lib/wellness/streak";

// WELLNESS_PARTICIPANT_PORTAL_HEALTH_CONNECT_V421
// WELLNESS_PARTICIPANT_COACH_CHAT_V54
// WELLNESS_PARTICIPANT_ADMIN_SUPPORT_V61
// WELLNESS_PROGRESS_CHAT_SMOOTH_V65
// WELLNESS_DEVICE_DAILY_DEDUPE_ACTIVE_CALORIE_V70
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
  | "support"
  | "charts";

function clean(value: any) {
  return String(value ?? "").trim();
}

// WELLNESS_GOOGLE_FIT_REST_LKG_V116
// Last Known Good:
// Sync Google Fit dijalankan melalui REST server dan OAuth tersimpan.
// Android native bridge tetap ada di APK tetapi tidak dipanggil portal.
function nativeGoogleFitBridgeV125Fix() {
  return null;
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

// WELLNESS_SAVING_OVERLAY_V126M46
// Satu overlay bersama untuk submit Nutrisi, Workout, dan Health Talk.
// Overlay hanya mengatur UX; endpoint, payload, dan data persistence tidak diubah.
type SavingOverlayModuleV126M46 = "nutrition" | "workout" | "healthtalk";
type SavingOverlayStatusV126M46 = "idle" | "saving" | "success" | "error";

type SavingOverlayStateV126M46 = {
  open: boolean;
  module: SavingOverlayModuleV126M46;
  status: SavingOverlayStatusV126M46;
  detail: string;
  message: string;
};

const emptySavingOverlayV126M46: SavingOverlayStateV126M46 = {
  open: false,
  module: "nutrition",
  status: "idle",
  detail: "",
  message: "",
};

function savingModuleLabelV126M46(module: SavingOverlayModuleV126M46) {
  if (module === "workout") return "Workout";
  if (module === "healthtalk") return "Health Talk";
  return "Nutrisi";
}

function WellnessSavingOverlayV126M46({
  state,
  onClose,
}: {
  state: SavingOverlayStateV126M46;
  onClose: () => void;
}) {
  if (!state.open || typeof document === "undefined") return null;

  const isSaving = state.status === "saving";
  const isSuccess = state.status === "success";
  const moduleLabel = savingModuleLabelV126M46(state.module);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wellness-saving-overlay-title"
      aria-describedby="wellness-saving-overlay-description"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-[2.25rem] border border-white/80 bg-white shadow-2xl shadow-slate-950/30">
        <div className="relative overflow-hidden bg-gradient-to-br from-cyan-50 via-teal-50 to-emerald-50 px-6 pb-7 pt-8 text-center md:px-9">
          <div className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-cyan-200/35 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-12 h-40 w-40 rounded-full bg-emerald-200/35 blur-2xl" />

          <div
            className={`relative mx-auto flex h-20 w-20 items-center justify-center rounded-[1.7rem] shadow-lg ${
              isSaving
                ? "bg-teal-600 text-white shadow-teal-200"
                : isSuccess
                  ? "bg-emerald-600 text-white shadow-emerald-200"
                  : "bg-rose-600 text-white shadow-rose-200"
            }`}
          >
            {isSaving ? (
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/35 border-t-white" />
            ) : isSuccess ? (
              <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.8 2.6 17.1A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.9L13.7 3.8a2 2 0 0 0-3.4 0Z" />
              </svg>
            )}
          </div>

          <div className="relative mt-5 text-[11px] font-black uppercase tracking-[0.22em] text-teal-700">
            {moduleLabel}
          </div>
          <h2 id="wellness-saving-overlay-title" className="relative mt-2 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
            {isSaving
              ? "Data Anda Sedang Disimpan"
              : isSuccess
                ? "Data Berhasil Disimpan"
                : "Data Belum Berhasil Disimpan"}
          </h2>
          <p id="wellness-saving-overlay-description" className="relative mx-auto mt-3 max-w-md text-sm font-bold leading-6 text-slate-600">
            {isSaving
              ? "Jangan tutup, kembali, atau memuat ulang halaman sampai proses penyimpanan selesai."
              : state.message}
          </p>
        </div>

        <div className="space-y-4 px-6 py-6 md:px-9">
          {isSaving ? (
            <>
              <div className="rounded-[1.4rem] border border-teal-100 bg-teal-50 px-4 py-4 text-sm font-black leading-6 text-teal-900" role="status" aria-live="polite">
                {state.detail || "Memvalidasi dan menyimpan data..."}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-black text-slate-500">
                <div className="rounded-2xl bg-slate-50 px-2 py-3">Validasi</div>
                <div className="rounded-2xl bg-slate-50 px-2 py-3">Simpan</div>
                <div className="rounded-2xl bg-slate-50 px-2 py-3">Sinkronisasi</div>
              </div>
              <div className="text-center text-[11px] font-bold leading-5 text-slate-400">
                Waktu proses dapat berbeda tergantung ukuran foto dan koneksi internet.
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className={`w-full rounded-[1.35rem] px-5 py-4 text-sm font-black text-white shadow-lg ${
                isSuccess
                  ? "bg-emerald-600 shadow-emerald-100"
                  : "bg-slate-900 shadow-slate-200"
              }`}
            >
              {isSuccess ? "Selesai" : "Kembali ke Form"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
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

function nutritionLogDateV73(item: any) {
  const raw = clean(
    item?.log_date ||
      item?.date ||
      item?.meal_date ||
      item?.created_at ||
      item?.updated_at,
  );

  if (!raw) return "";

  const exactDate = raw.match(/^\d{4}-\d{2}-\d{2}$/);
  if (exactDate) return exactDate[0];

  const isoDate = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (isoDate && !raw.includes("T")) return isoDate[0];

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return isoDate?.[0] || "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);

  const year = parts.find((entry) => entry.type === "year")?.value || "";
  const month = parts.find((entry) => entry.type === "month")?.value || "";
  const day = parts.find((entry) => entry.type === "day")?.value || "";

  return year && month && day ? `${year}-${month}-${day}` : isoDate?.[0] || "";
}

function nutritionCaloriesValueV73(item: any) {
  return asNumber(
    item?.calories ??
      item?.total_calories ??
      item?.calorie_total ??
      item?.estimated_calories,
  );
}

function nutritionMealKeyV73(item: any, index: number) {
  return clean(
    item?.meal_type || item?.meal_time || item?.category || item?.id || index,
  ).toLowerCase();
}

function jakartaDateFromAny(value: any) {
  const text = clean(value);
  if (!text) return "";

  const isoDateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnly)
    return `${isoDateOnly[1]}-${isoDateOnly[2]}-${isoDateOnly[3]}`;

  const localDateTime = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+\d{1,2}:\d{2}/);
  if (localDateTime)
    return `${localDateTime[1]}-${localDateTime[2]}-${localDateTime[3]}`;

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
        item?.created_at,
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

function activityRawPayloadV72(item: any) {
  const raw = item?.raw_payload;

  if (!raw) return {};

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  return typeof raw === "object" ? raw : {};
}

function isGoogleFitDailyRow(item: any) {
  const raw = activityRawPayloadV72(item);
  const source = clean(
    item?.source || item?.input_source || item?.provider || raw?.provider,
  ).toLowerCase();
  const externalId = clean(
    item?.external_activity_id || item?.provider_activity_id || item?.id,
  ).toLowerCase();
  const syncMode = clean(raw?.sync_mode).toLowerCase();
  const name = clean(
    item?.activity_name || item?.activity_type || item?.nama_activities || "",
  ).toLowerCase();

  const providerMatches = source === "google_fit" || source === "google-fit";
  const dailyMatches =
    externalId.includes("google_fit_daily_") ||
    name.includes("google fit daily") ||
    syncMode === "aggregate_daily";

  return providerMatches && dailyMatches;
}

function isHealthConnectDailyRow(item: any) {
  const raw = activityRawPayloadV72(item);
  const source = clean(
    item?.source || item?.input_source || item?.provider || raw?.provider,
  ).toLowerCase();
  const externalId = clean(
    item?.external_activity_id || item?.provider_activity_id || item?.id,
  ).toLowerCase();
  const syncMode = clean(raw?.sync_mode).toLowerCase();
  const name = clean(
    item?.activity_name || item?.activity_type || item?.nama_activities || "",
  ).toLowerCase();

  const providerMatches =
    source === "health_connect" || source === "health-connect";
  const dailyMatches =
    externalId.includes("health_connect_daily_") ||
    name.includes("health connect daily") ||
    syncMode === "daily_aggregate";

  return providerMatches && dailyMatches;
}

function isDeviceDailyRow(item: any) {
  return isGoogleFitDailyRow(item) || isHealthConnectDailyRow(item);
}

function deviceDailyProviderV72(item: any) {
  if (isHealthConnectDailyRow(item)) return "health_connect";
  if (isGoogleFitDailyRow(item)) return "google_fit";
  return "";
}

function activityDistanceValue(item: any) {
  const raw = activityRawPayloadV72(item);

  return asNumber(
    item?.distance_km ??
      item?.total_distance_km ??
      raw?.health_connect_distance_km ??
      raw?.google_fit_distance_km ??
      raw?.distance_km,
  );
}

function rawActivityCaloriesValue(item: any) {
  const raw = activityRawPayloadV72(item);

  return asNumber(
    item?.calories ??
      item?.total_calories ??
      item?.activity_calories ??
      item?.calories_burned ??
      raw?.selected_active_calories ??
      raw?.sanitized_active_calories ??
      raw?.health_connect_calories ??
      raw?.health_connect_calories_original ??
      raw?.health_connect_active_calories ??
      raw?.google_fit_active_calories ??
      raw?.calories,
  );
}

function estimatedDeviceDailyCalories(item: any) {
  const steps = activityStepsValue(item);
  const minutes = activityMinutesValue(item);
  const rawDistance = activityDistanceValue(item);
  const estimatedDistance = steps > 0 ? steps * 0.0007 : rawDistance;
  const minDistance = Math.max(0.05, steps * 0.00025);
  const maxDistance = Math.max(0.3, steps * 0.0015);
  const distance =
    steps > 0 && rawDistance >= minDistance && rawDistance <= maxDistance
      ? rawDistance
      : estimatedDistance;

  if (steps > 0) {
    const distanceEstimate = distance * 70 * 0.53;
    return Math.max(1, Math.round(Math.min(distanceEstimate, steps * 0.1)));
  }

  if (minutes > 0) {
    return Math.min(1200, Math.max(1, Math.round(minutes * 4.2)));
  }

  return 0;
}

// WELLNESS_GOOGLEFIT_PORTAL_COACH_PARITY_V126M47_1
// Use the same canonical calorie resolver as streak and Coach. When Google Fit
// only supplies its exact daily total, the Portal must not silently turn it
// into zero while the sync card and Coach can already read the same row.
function activityCaloriesValue(item: any) {
  if (isDeviceDailyRow(item)) {
    return wellnessStreakWorkoutCalories(item);
  }

  return rawActivityCaloriesValue(item);
}

function googleFitTotalCaloriesValueV73(item: any) {
  if (!isGoogleFitDailyRow(item)) return 0;

  const raw = activityRawPayloadV72(item);

  // WELLNESS_GOOGLE_FIT_CARD_STABLE_V126M14
  // Read the exact Google Fit total from both raw payload and the daily row.
  // This remains display-only; activityCaloriesValue() is intentionally unchanged.
  return asNumber(
    raw?.google_fit_calories_expended ??
      raw?.google_fit_total_calories ??
      raw?.calories_expended_total ??
      raw?.exact_snapshot?.total_calories ??
      raw?.native_last_snapshot?.total_calories ??
      raw?.original_payload?.calories_expended ??
      raw?.original_payload?.calories ??
      item?.total_calories ??
      item?.calories ??
      item?.calories_burned,
  );
}

function historyWorkoutNoteV73(item: any) {
  const activeCalories = historyCaloriesValueV41(item);
  const steps = historyStepsValueV41(item);

  if (isGoogleFitDailyRow(item)) {
    const totalCalories = googleFitTotalCaloriesValueV73(item);

    if (totalCalories > 0) {
      if (activeCalories > 0) {
        return `${fmtNumber(activeCalories, 0)} kkal aktivitas | ${fmtNumber(
          totalCalories,
          0,
        )} kkal total (termasuk istirahat) | ${fmtNumber(steps, 0)} steps`;
      }

      return `${fmtNumber(totalCalories, 0)} kkal total Google Fit | ${fmtNumber(
        steps,
        0,
      )} steps | kalori aktif tidak diestimasi`;
    }
  }

  const totalCalories = asNumber(
    item?.smartwatch_total_calories ??
      item?.raw_payload?.smartwatch_total_calories,
  );
  const distanceKm = asNumber(item?.distance_km ?? item?.distance);
  const durationMinutes = asNumber(item?.duration_minutes);
  const durationSeconds = asNumber(
    item?.duration_seconds ?? item?.raw_payload?.duration_seconds,
  );
  const durationLabel =
    durationMinutes > 0
      ? durationSeconds > 0
        ? `${Math.floor(durationMinutes)}:${String(Math.floor(durationSeconds)).padStart(2, "0")}`
        : `${fmtNumber(durationMinutes, 0)} menit`
      : "";
  const averageHr = asNumber(
    item?.average_heart_rate ?? item?.raw_payload?.average_heart_rate,
  );
  const maxHr = asNumber(
    item?.max_heart_rate ?? item?.raw_payload?.max_heart_rate,
  );
  const source = clean(
    item?.device_source ?? item?.raw_payload?.device_source,
  );

  return [
    `${fmtNumber(activeCalories, 0)} kkal aktif`,
    totalCalories > 0 ? `${fmtNumber(totalCalories, 0)} kkal total` : "",
    steps > 0 ? `${fmtNumber(steps, 0)} steps` : "",
    distanceKm > 0 ? `${fmtNumber(distanceKm, 2)} km` : "",
    durationLabel,
    averageHr > 0 ? `HR avg ${fmtNumber(averageHr, 0)}` : "",
    maxHr > 0 ? `HR max ${fmtNumber(maxHr, 0)}` : "",
    source && source.toLowerCase() !== "manual" ? source : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function dailyRowPriorityV72(item: any) {
  const raw = activityRawPayloadV72(item);

  if (isHealthConnectDailyRow(item)) {
    const selected = asNumber(raw?.selected_active_calories);
    const reported = asNumber(raw?.health_connect_calories_original);
    if (
      selected > 0 ||
      (raw?.health_connect_calories_used === true && reported > 0)
    ) {
      return 400;
    }
    return 300;
  }

  if (isGoogleFitDailyRow(item)) return 200;
  return 0;
}

function dailyRowQuality(item: any) {
  const steps = activityStepsValue(item);
  const calories = activityCaloriesValue(item);
  return steps * 1000 + calories;
}

function normalizeWorkoutItemsForMetrics(items: any[] = []) {
  const result = new Map<string, any>();

  for (const item of items || []) {
    const date = activityDateKey(item);
    const key = isDeviceDailyRow(item)
      ? `device_daily_${date}`
      : String(
          item?.id ||
            item?.external_activity_id ||
            item?.provider_activity_id ||
            `${date}-${result.size}`,
        );
    const previous = result.get(key);

    if (!previous) {
      result.set(key, item);
      continue;
    }

    if (isDeviceDailyRow(item) && isDeviceDailyRow(previous)) {
      const previousPriority = dailyRowPriorityV72(previous);
      const currentPriority = dailyRowPriorityV72(item);

      if (currentPriority > previousPriority) {
        result.set(key, item);
        continue;
      }

      if (currentPriority < previousPriority) continue;
    }

    const previousQuality = dailyRowQuality(previous);
    const currentQuality = dailyRowQuality(item);
    const shouldReplace =
      currentQuality > previousQuality ||
      (currentQuality === previousQuality &&
        activityUpdatedAtMs(item) >= activityUpdatedAtMs(previous));

    if (shouldReplace) result.set(key, item);
  }

  return [...result.values()].sort(
    (a, b) => activityUpdatedAtMs(b) - activityUpdatedAtMs(a),
  );
}

function normalizeWorkoutItemsForHistoryV72(items: any[] = []) {
  const result = new Map<string, any>();

  for (const item of items || []) {
    const date = activityDateKey(item);
    const provider = deviceDailyProviderV72(item);
    const key = provider
      ? `${provider}_${date}`
      : String(
          item?.id ||
            item?.external_activity_id ||
            item?.provider_activity_id ||
            `${date}-${result.size}`,
        );
    const previous = result.get(key);

    if (
      !previous ||
      activityUpdatedAtMs(item) >= activityUpdatedAtMs(previous)
    ) {
      result.set(key, item);
    }
  }

  return [...result.values()].sort(
    (a, b) => activityUpdatedAtMs(b) - activityUpdatedAtMs(a),
  );
}

function workoutHistorySelectionKeyV72(item: any) {
  const provider = deviceDailyProviderV72(item);
  return provider ? `${provider}_${activityDateKey(item)}` : "";
}

function normalizeTodayWorkoutItems(items: any[] = []) {
  const today = todayDate();
  return normalizeWorkoutItemsForMetrics(items).filter(
    (item) => activityDateKey(item) === today,
  );
}

function activityMinutesValue(item: any) {
  const raw = activityRawPayloadV72(item);

  return asNumber(
    item?.duration_minutes ??
      item?.total_duration_minutes ??
      raw?.google_fit_active_minutes ??
      raw?.health_connect_active_minutes ??
      raw?.active_minutes,
  );
}

function activityStepsValue(item: any) {
  return wellnessStreakSteps(item);
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

function formatFitnessLastSync(value: any) {
  const raw = clean(value);
  if (!raw) return "Belum pernah sync";

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  const formatted = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed);

  return `${formatted} WIB`;
}

function noticeText(value: string) {
  const text = clean(value);

  const map: Record<string, string> = {
    STRAVA_CONNECTED:
      "Strava berhasil terhubung. Klik Sync Strava untuk menarik activity terbaru.",
    GOOGLE_FIT_CONNECTED:
      "Google Fit berhasil terhubung. Klik Sync Google Fit untuk menarik activity terbaru.",
    GOOGLE_FIT_CONNECTED_ACCESS_ONLY:
      "Google Fit terhubung dengan access token. Klik Sync sekarang; koneksi ulang mungkin diperlukan setelah token kedaluwarsa.",
    GOOGLE_FIT_SAVE_VERIFY_FAILED:
      "Google Fit authorize berhasil tetapi koneksi belum terbaca kembali dari database. Silakan reconnect sekali lagi.",
    STRAVA_CLIENT_ID_NOT_SET:
      "STRAVA_CLIENT_ID belum diatur di Environment Variables.",
    STRAVA_CLIENT_ID_MISSING:
      "STRAVA_CLIENT_ID belum terbaca di Environment Variables Vercel Production.",
    GOOGLE_FIT_CLIENT_ID_MISSING:
      "GOOGLE_FIT_CLIENT_ID belum terbaca di Environment Variables Vercel Production.",
    APP_SECRET_MISSING: "APP_SECRET belum terbaca di Environment Variables.",
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
    FITNESS_SOURCE_GOOGLE_FIT_NOT_ACTIVE:
      "Google Fit belum diaktifkan sebagai sumber utama. Hubungi Admin untuk memilih Google Fit.",
    FITNESS_SOURCE_HEALTH_CONNECT_NOT_ACTIVE:
      "Health Connect belum diaktifkan sebagai sumber utama. Hubungi Admin untuk memilih Health Connect.",
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

// WELLNESS_MOBILE_UPLOAD_LOCAL_DATE_SAFE_DELETE_GOOGLE_FIT_V126M2
const NUTRITION_UPLOAD_TARGET_BYTES_V126M2 = 1_200_000;

async function readApiResponseV126M2(response: Response) {
  const text = await response.text();
  let data: any = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const compact = text
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const requestTooLarge =
      response.status === 413 ||
      /request entity too large|payload too large|body exceeded/i.test(compact);

    data = {
      ok: false,
      message: requestTooLarge
        ? "Ukuran foto masih terlalu besar untuk dikirim. Pilih foto lain atau screenshot foto tersebut."
        : compact.slice(0, 400) ||
          `Server mengembalikan respons yang tidak valid (HTTP ${response.status}).`,
    };
  }

  if (!response.ok) {
    return {
      ...data,
      ok: false,
      message:
        data?.detail ||
        data?.message ||
        `Permintaan gagal (HTTP ${response.status}).`,
    };
  }

  return data;
}

function canvasBlobV126M2(
  canvas: HTMLCanvasElement,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(
          new Error(
            "Foto tidak dapat dikompres oleh browser ini.",
          ),
        );
      },
      "image/jpeg",
      quality,
    );
  });
}

async function compressNutritionPhotoV126M2(
  file: File,
): Promise<File> {
  if (file.size <= NUTRITION_UPLOAD_TARGET_BYTES_V126M2) {
    return file;
  }

  if (!clean(file.type).toLowerCase().startsWith("image/")) {
    throw new Error("File yang dipilih bukan gambar.");
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>(
      (resolve, reject) => {
        const element = new Image();
        element.decoding = "async";
        element.onload = () => resolve(element);
        element.onerror = () =>
          reject(
            new Error(
              "Format foto tidak dapat dibaca. Gunakan JPG, PNG, WEBP, atau screenshot foto tersebut.",
            ),
          );
        element.src = objectUrl;
      },
    );

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;

    if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
      throw new Error("Dimensi foto tidak dapat dibaca.");
    }

    const largestSide = Math.max(sourceWidth, sourceHeight);
    const initialScale = Math.min(1, 1600 / largestSide);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Browser tidak dapat menyiapkan kompresi foto.");
    }

    let latestBlob: Blob | null = null;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const dimensionScale = initialScale * Math.pow(0.84, attempt);
      canvas.width = Math.max(1, Math.round(sourceWidth * dimensionScale));
      canvas.height = Math.max(1, Math.round(sourceHeight * dimensionScale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const quality = Math.max(0.58, 0.84 - attempt * 0.05);
      latestBlob = await canvasBlobV126M2(canvas, quality);

      if (latestBlob.size <= NUTRITION_UPLOAD_TARGET_BYTES_V126M2) {
        break;
      }
    }

    if (
      !latestBlob ||
      latestBlob.size > NUTRITION_UPLOAD_TARGET_BYTES_V126M2
    ) {
      throw new Error(
        "Foto masih terlalu besar setelah dikompres. Gunakan screenshot atau foto dengan resolusi lebih kecil.",
      );
    }

    const baseName =
      clean(file.name).replace(/\.[^.]+$/, "") ||
      `nutrition-${Date.now()}`;

    return new File(
      [latestBlob],
      `${baseName}.jpg`,
      {
        type: "image/jpeg",
        lastModified: Date.now(),
      },
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}


// WELLNESS_MANUAL_WORKOUT_REFRESH_AND_MODAL_V126M8_1
// Manual workout tetap berasal dari endpoint khusus workout dan digabungkan
// dengan device activities saat Portal/Google Fit melakukan refresh.
function workoutRowIdentityV126M8(item: any, index: number) {
  const raw =
    item?.raw_payload && typeof item.raw_payload === "object"
      ? item.raw_payload
      : {};

  const databaseId = clean(
    item?._supabase_id ||
      item?.id,
  );
  if (databaseId) return `db:${databaseId}`;

  const submissionId = clean(
    item?.submission_id ||
      item?.submissionId ||
      raw?.submission_id ||
      raw?.submissionId,
  );
  if (submissionId) return `submission:${submissionId}`;

  const externalId = clean(
    item?.external_activity_id ||
      item?.provider_activity_id ||
      raw?.external_activity_id ||
      raw?.provider_activity_id,
  );
  if (externalId) return `external:${externalId}`;

  return [
    "fallback",
    clean(item?.source || item?.provider || item?.input_source),
    clean(item?.log_date || item?.date || item?.started_at),
    clean(item?.activity_name || item?.activity_type || item?.title),
    clean(item?.created_at || item?.updated_at),
    String(index),
  ].join(":");
}

function mergeWorkoutRowsV126M8(
  activityRows: any[] = [],
  manualRows: any[] = [],
) {
  const merged: any[] = [];
  const seen = new Set<string>();

  [...(activityRows || []), ...(manualRows || [])].forEach(
    (item: any, index: number) => {
      if (!item) return;

      const key = workoutRowIdentityV126M8(item, index);
      if (seen.has(key)) return;

      seen.add(key);
      merged.push(item);
    },
  );

  return merged.sort((left: any, right: any) => {
    const rightDate = clean(
      right?.log_date ||
        right?.started_at ||
        right?.created_at ||
        right?.updated_at,
    );
    const leftDate = clean(
      left?.log_date ||
        left?.started_at ||
        left?.created_at ||
        left?.updated_at,
    );
    return rightDate.localeCompare(leftDate);
  });
}

// WELLNESS_GOOGLEFIT_PORTAL_COACH_PARITY_V126M47_1
// Convert the successful REST sync response into the same activity-row shape
// returned by /participant/me. This makes the Portal update immediately while
// the subsequent server reload remains the long-term source of truth.
function googleFitSyncDailyRowsV126M47(
  dailyRows: any[],
  participantId: number,
  syncedAt: string,
) {
  return (Array.isArray(dailyRows) ? dailyRows : [])
    .map((row: any) => {
      const date = clean(row?.date).slice(0, 10);
      if (!date) return null;
      const steps = Math.max(0, Math.round(asNumber(row?.steps)));
      const totalCalories = Math.max(
        0,
        asNumber(row?.google_fit_calories_expended ?? row?.calories),
      );
      const externalId = `google_fit_daily_${participantId}_${date}`;

      return {
        participant_id: participantId,
        source: "google_fit",
        external_activity_id: externalId,
        provider_activity_id: externalId,
        activity_type: "Google Fit Daily",
        activity_name: `Google Fit Daily - ${steps} steps`,
        log_date: date,
        started_at: syncedAt,
        updated_at: syncedAt,
        duration_minutes: asNumber(row?.duration_minutes),
        calories: totalCalories,
        distance_km: asNumber(row?.distance_km),
        steps,
        raw_payload: {
          marker: "WELLNESS_GOOGLEFIT_PORTAL_COACH_PARITY_V126M47_1",
          provider: "google_fit",
          source: "google_fit",
          sync_mode: "aggregate_daily",
          log_date: date,
          last_sync_at: syncedAt,
          synced_at: syncedAt,
          google_fit_steps: steps,
          google_fit_distance_km: asNumber(row?.distance_km),
          google_fit_total_calories: totalCalories,
          google_fit_calories_expended: totalCalories,
          google_fit_active_minutes: asNumber(row?.duration_minutes),
          calories_source:
            clean(row?.calories_source) || "google_fit_calories_expended",
          selected_step_source: "google_fit_rest_aggregate",
          step_data_source_id: "google_fit_rest_aggregate",
          active_calories_available: false,
        },
      };
    })
    .filter(Boolean);
}

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
    "Gunakan Kode Karyawan dan email terdaftar untuk menerima OTP dan masuk ke portal peserta.",
  );
  const [savingOverlayV126M46, setSavingOverlayV126M46] =
    useState<SavingOverlayStateV126M46>(emptySavingOverlayV126M46);
  const savingOverlayTimerV126M46 = useRef<number | null>(null);

  function clearSavingOverlayTimerV126M46() {
    if (savingOverlayTimerV126M46.current !== null) {
      window.clearTimeout(savingOverlayTimerV126M46.current);
      savingOverlayTimerV126M46.current = null;
    }
  }

  function openSavingOverlayV126M46(
    module: SavingOverlayModuleV126M46,
    detail: string,
  ) {
    clearSavingOverlayTimerV126M46();
    setSavingOverlayV126M46({
      open: true,
      module,
      status: "saving",
      detail,
      message: "",
    });
  }

  function updateSavingOverlayV126M46(detail: string) {
    setSavingOverlayV126M46((current) =>
      current.open && current.status === "saving"
        ? { ...current, detail }
        : current,
    );
  }

  function completeSavingOverlayV126M46(message: string) {
    setSavingOverlayV126M46((current) => ({
      ...current,
      open: true,
      status: "success",
      detail: "",
      message,
    }));
    clearSavingOverlayTimerV126M46();
    savingOverlayTimerV126M46.current = window.setTimeout(() => {
      setSavingOverlayV126M46(emptySavingOverlayV126M46);
      savingOverlayTimerV126M46.current = null;
    }, 1600);
  }

  function failSavingOverlayV126M46(message: string) {
    clearSavingOverlayTimerV126M46();
    setSavingOverlayV126M46((current) => ({
      ...current,
      open: true,
      status: "error",
      detail: "",
      message,
    }));
  }

  function closeSavingOverlayV126M46() {
    if (savingOverlayV126M46.status === "saving") return;
    clearSavingOverlayTimerV126M46();
    setSavingOverlayV126M46(emptySavingOverlayV126M46);
  }

  useEffect(() => {
    const activelySaving =
      savingOverlayV126M46.open && savingOverlayV126M46.status === "saving";
    if (!activelySaving || typeof window === "undefined") return;

    const preventClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", preventClose);
    return () => window.removeEventListener("beforeunload", preventClose);
  }, [savingOverlayV126M46.open, savingOverlayV126M46.status]);

  useEffect(() => {
    return () => {
      if (savingOverlayTimerV126M46.current !== null) {
        window.clearTimeout(savingOverlayTimerV126M46.current);
      }
    };
  }, []);
  const [
    participantCompaniesV126C,
    setParticipantCompaniesV126C,
  ] = useState<any[]>([]);

  const [
    companiesLoadingV126C,
    setCompaniesLoadingV126C,
  ] = useState(true);

  const [form, setForm] = useState({
    company_id: "",
    code: "",
    username: "",
    email: "",
    phone: "",
    otp: "",
  });

  useEffect(() => {
    let active = true;

    setCompaniesLoadingV126C(true);

    fetch(
      "/api/wellness/participant/companies",
      {
        cache: "no-store",
      },
    )
      .then((response) =>
        response.json(),
      )
      .then((result) => {
        if (!active) return;

        setParticipantCompaniesV126C(
          result?.ok &&
            Array.isArray(
              result?.companies,
            )
            ? result.companies
            : [],
        );
      })
      .catch(() => {
        if (active) {
          setParticipantCompaniesV126C(
            [],
          );
        }
      })
      .finally(() => {
        if (active) {
          setCompaniesLoadingV126C(
            false,
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const [participant, setParticipant] = useState<any>(null);
  const [fitnessSettings, setFitnessSettings] = useState<any>(null);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [fitnessLastSyncAt, setFitnessLastSyncAt] = useState<
    Record<string, string>
  >({});
  const [fitnessLastSyncSnapshot, setFitnessLastSyncSnapshot] = useState<
    Record<string, any>
  >({});
  const [activities, setActivities] = useState<any[]>([]);
  const [activitySummary, setActivitySummary] = useState<any[]>([]);
  const [manualWorkoutLogsV126M8, setManualWorkoutLogsV126M8] =
    useState<any[]>([]);
  const [clinicalHistory, setClinicalHistory] = useState<any[]>([]);
  const [nutritionLogs, setNutritionLogs] = useState<any[]>([]);
  const [healthtalkLogs, setHealthtalkLogs] = useState<any[]>([]);
  const [pointSummary, setPointSummary] = useState<any>({
    total_points: 0,
    point_breakdown: {},
    healthtalk_count: 0,
  });
  const [syncing, setSyncing] = useState("");
  const googleFitNativeSilentV125Fix = useRef(false);
  const googleFitNativeInFlightV111 = useRef(false);
  const googleFitNativeTimeoutV111 = useRef<number | null>(null);

  // WELLNESS_STABLE_PORTAL_CHART_METRICS_V126M47_3
  // Multiple portal refreshes can overlap (initial load, native callback, and
  // automatic sync). Only the newest /participant/me response may update the
  // activity state, otherwise an older response can make charts move backward.
  const loadMeRequestSequenceV126M47_3 = useRef(0);

  // WELLNESS_SUBMISSION_LOCK_V126L
  const nutritionSubmitInFlightV126L = useRef(false);
  // WELLNESS_STABLE_DELIVERY_V126M17
  // Reuse the same Submission ID after an uncertain network failure so a
  // manual retry is deduplicated by Google Sheet instead of creating a new row.
  const nutritionPendingSubmissionV126M17 = useRef<{
    id: string;
    fingerprint: string;
  } | null>(null);
  const workoutSubmitInFlightV126L = useRef(false);

  // WELLNESS_WORKOUT_STABLE_SUBMISSION_V126M66_1
  // Retry manual untuk payload workout yang sama memakai Submission ID sama.
  const workoutPendingSubmissionV126M66_1 = useRef<{
    id: string;
    fingerprint: string;
  } | null>(null);

  function createSubmissionIdV126L(type: string) {
    const randomId =
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 12)}`;

    return `${type}-${randomId}`;
  }
  const [nutritionForm, setNutritionForm] = useState({
    log_date: todayDate(),
    meal_type: "",
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
    calculation_mode: "manual_master",
    duration_minutes: "",
    duration_seconds: "",
    distance_km: "",
    steps: "",
    active_calories: "",
    total_calories: "",
    average_heart_rate: "",
    max_heart_rate: "",
    device_source: "Smartwatch",
    notes: "",
  });
  const [workoutEvidence, setWorkoutEvidence] = useState<File | null>(null);

  const [healthtalkForm, setHealthtalkForm] = useState({
    log_date: todayDate(),
    healthtalk_type: "Healthtalk/Seminar",
    healthtalk_title: "",
    notes: "",
  });
  const [healthtalkEvidence, setHealthtalkEvidence] = useState<File | null>(
    null,
  );

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

  // WELLNESS_MANUAL_HISTORY_STABLE_SOURCE_V126M66_3
  const loadWorkoutSequenceV126M66_3 = useRef(0);

  async function loadWorkoutV126M8() {
    const requestSequenceV126M66_3 =
      ++loadWorkoutSequenceV126M66_3.current;

    const result = await fetch("/api/wellness/participant/workout", {
      cache: "no-store",
    })
      .then((response) => response.json())
      .catch(() => ({ ok: false, logs: [] }));

    // Jangan biarkan response refresh lama menimpa hasil Sheet yang lebih baru.
    if (
      requestSequenceV126M66_3 !==
      loadWorkoutSequenceV126M66_3.current
    ) {
      return result;
    }

    if (result.ok) {
      setManualWorkoutLogsV126M8(
        Array.isArray(result.logs) ? result.logs : [],
      );
    }

    return result;
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

  async function loadPoints() {
    const result = await fetch(
      `/api/wellness/participant/points?t=${Date.now()}`,
      { cache: "no-store" },
    )
      .then((response) => response.json())
      .catch(() => ({ ok: false }));

    if (result.ok) {
      setPointSummary(result);
    }

    return result;
  }

  async function loadMe(options?: { keepMessage?: boolean; background?: boolean }) {
    const requestSequenceV126M47_3 =
      ++loadMeRequestSequenceV126M47_3.current;
    if (!options?.background) setLoading(true);

    const result = await fetch("/api/wellness/participant/me", {
      cache: "no-store",
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (
      requestSequenceV126M47_3 !==
      loadMeRequestSequenceV126M47_3.current
    ) {
      return result;
    }

    if (result.ok) {
      // WELLNESS_PARTICIPANT_POINT_INITIAL_LOAD_CANONICAL_WORKOUT_V126M95_1
      // pointSummary starts at 0. Always hydrate canonical points whenever
      // the authenticated participant portal is successfully loaded/refreshed.
      // The points endpoint reads the same participant session cookie, so this
      // does not depend on participant React state being set first.
      await loadPoints();

      // WELLNESS_PARTICIPANT_STREAK_INITIAL_DELIVERY_V126M26_1
      // Preserve canonical streak in the participant object so Home can render
      // immediately and can rehydrate after tab changes or device sync.
      setParticipant({
        ...result.participant,
        wellness_streak: result.streak || null,
        wellness_streak_targets: result.streak_targets || null,
        wellness_streak_sources: result.streak_sources || null,
        wellness_streak_status: clean(result.streak_status),
        wellness_streak_participant_id: asNumber(
          result.streak_participant_id || result.participant?.id,
        ),
      });
      setFitnessSettings(
        result.fitness_settings || result.participant?.wellness_control || null,
      );
      const nextIntegrations =
        result.integrations || [];

      setIntegrations(nextIntegrations);

      setFitnessLastSyncAt((current) => {
        const next = { ...current };
        for (const integration of nextIntegrations) {
          const providerKey = clean(integration?.provider)
            .toLowerCase()
            .replace(/-/g, "_");
          const lastSyncAt = clean(integration?.last_sync_at);
          if (providerKey && lastSyncAt) next[providerKey] = lastSyncAt;
        }
        return next;
      });
      const nextActivities = normalizeWorkoutItemsForHistoryV72(
        result.activities || [],
      );
      setActivities(nextActivities);
      setActivitySummary(result.activity_summary || []);

      // V125 FIX: status Health Connect lama dapat tidak memiliki last_sync_at
      // walaupun daily row sudah tersimpan. Ambil waktu row terbaru sebagai fallback.
      const latestHealthConnectDailyV125Fix = nextActivities
        .filter((item: any) => isHealthConnectDailyRow(item))
        .sort((left: any, right: any) =>
          clean(
            right?.updated_at ||
              right?.raw_payload?.health_connect_last_sync_at ||
              right?.raw_payload?.last_sync_at ||
              right?.started_at,
          ).localeCompare(
            clean(
              left?.updated_at ||
                left?.raw_payload?.health_connect_last_sync_at ||
                left?.raw_payload?.last_sync_at ||
                left?.started_at,
            ),
          ),
        )[0];
      const latestHealthConnectRawV125Fix = activityRawPayloadV72(
        latestHealthConnectDailyV125Fix,
      );
      const latestHealthConnectSyncAtV125Fix = clean(
        latestHealthConnectRawV125Fix?.health_connect_last_sync_at ||
          latestHealthConnectRawV125Fix?.last_sync_at ||
          latestHealthConnectDailyV125Fix?.updated_at ||
          latestHealthConnectDailyV125Fix?.started_at ||
          latestHealthConnectDailyV125Fix?.created_at,
      );

      if (latestHealthConnectSyncAtV125Fix) {
        setFitnessLastSyncAt((current) => ({
          ...current,
          health_connect: latestHealthConnectSyncAtV125Fix,
        }));
      }

      const latestGoogleFitDaily = nextActivities
        .filter((item: any) => isGoogleFitDailyRow(item))
        .sort((left: any, right: any) =>
          clean(right?.updated_at || right?.raw_payload?.last_sync_at).localeCompare(
            clean(left?.updated_at || left?.raw_payload?.last_sync_at),
          ),
        )[0];
      const latestGoogleRaw =
        activityRawPayloadV72(
          latestGoogleFitDaily,
        );

      // V124: REST V414 menyimpan nilai harian yang benar di activity row,
      // tetapi tidak selalu menyediakan exact_snapshot. Bentuk snapshot tampilan
      // dari row terbaru agar card lama tetap menampilkan steps dan kalori total.
      const latestGoogleActiveCaloriesV124 = asNumber(
        latestGoogleRaw?.google_fit_active_calories_exact ??
          latestGoogleRaw?.google_fit_active_calories,
      );
      const latestGoogleMeasuredAtV124 = clean(
        latestGoogleRaw?.last_sync_at ||
          latestGoogleFitDaily?.updated_at ||
          latestGoogleFitDaily?.started_at ||
          latestGoogleFitDaily?.created_at,
      );
      const derivedGoogleSnapshotV124 = latestGoogleFitDaily
        ? {
            date: activityDateKey(latestGoogleFitDaily),
            measured_at: latestGoogleMeasuredAtV124,
            synced_at: latestGoogleMeasuredAtV124,
            steps: activityStepsValue(latestGoogleFitDaily),
            total_calories: googleFitTotalCaloriesValueV73(latestGoogleFitDaily),
            distance_km: activityDistanceValue(latestGoogleFitDaily),
            active_calories:
              latestGoogleActiveCaloriesV124 > 0
                ? latestGoogleActiveCaloriesV124
                : null,
            active_calories_available: latestGoogleActiveCaloriesV124 > 0,
            source: clean(
              latestGoogleRaw?.selected_step_source ||
                latestGoogleRaw?.step_data_source_id ||
                latestGoogleRaw?.provider ||
                "google_fit_rest_aggregate",
            ),
            step_data_source_id: clean(
              latestGoogleRaw?.selected_step_source ||
                latestGoogleRaw?.step_data_source_id ||
                latestGoogleRaw?.google_fit_step_source ||
                "google_fit_rest_aggregate",
            ),
          }
        : null;

      const preferredGoogleSnapshotV124 =
        latestGoogleRaw?.exact_snapshot ||
        derivedGoogleSnapshotV124 ||
        null;

      if (preferredGoogleSnapshotV124) {
        setFitnessLastSyncSnapshot((current) => ({
          ...current,
          google_fit: preferredGoogleSnapshotV124,
        }));
      }
      setClinicalHistory(result.clinical_history || []);
      setStep("portal");

      if (!options?.keepMessage) {
        setMessage(
          "Portal peserta aktif. Silakan input nutrisi harian, workout manual, atau sync device.",
        );
      }

      // WELLNESS_PORTAL_FAST_BOOT_WORKOUT_SAFE_ERROR_V126M62_4
      // Secondary histories must not block the full-screen Portal loader.
      // Also remove the accidental duplicate loadNutrition() request.
      void Promise.allSettled([
        loadNutrition(),
        loadWorkoutV126M8(),
        loadHealthtalk(),
        loadPoints(),
      ]);
    } else {
      setMessage(result.message || "Session Wellness belum aktif.");
      if (/dinonaktifkan|session|otp/i.test(clean(result.message))) {
        setParticipant(null);
        setFitnessSettings(null);
        setStep("request");
      }
    }

    if (
      !options?.background &&
      requestSequenceV126M47_3 ===
      loadMeRequestSequenceV126M47_3.current
    ) {
      setLoading(false);
    }
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

  useEffect(() => {
    function clearGoogleFitNativeTimeoutV111() {
      if (googleFitNativeTimeoutV111.current !== null) {
        window.clearTimeout(googleFitNativeTimeoutV111.current);
        googleFitNativeTimeoutV111.current = null;
      }
    }

    function handleNativeGoogleFitV125Fix(event: Event) {
      const detail = (event as CustomEvent<any>)?.detail || {};
      const silent = googleFitNativeSilentV125Fix.current;

      if (detail?.progress) {
        googleFitNativeInFlightV111.current = true;
        if (!silent) {
          setSyncing("google-fit");
          setMessage(
            clean(detail?.message) ||
              "Membaca steps dan kalori langsung dari Google Fit HP...",
          );
        }
        return;
      }

      clearGoogleFitNativeTimeoutV111();
      googleFitNativeInFlightV111.current = false;
      setSyncing("");
      googleFitNativeSilentV125Fix.current = false;

      if (!detail?.ok) {
        if (!silent) {
          setMessage(
            clean(detail?.message) ||
              "Google Fit dari HP gagal disinkronkan.",
          );
        }
        return;
      }

      const completedAt =
        clean(detail?.last_sync_at) || new Date().toISOString();

      setFitnessLastSyncAt((current) => ({
        ...current,
        google_fit: completedAt,
      }));

      if (detail?.last_sync_snapshot) {
        setFitnessLastSyncSnapshot((current) => ({
          ...current,
          google_fit: detail.last_sync_snapshot,
        }));
      }

      if (!silent) {
        setMessage(
          clean(detail?.message) ||
            "Google Fit berhasil disinkronkan langsung dari HP.",
        );
      }

      void loadMe({ keepMessage: true });
    }

    window.addEventListener(
      "harmony-native-google-fit-sync",
      handleNativeGoogleFitV125Fix as EventListener,
    );

    return () => {
      window.removeEventListener(
        "harmony-native-google-fit-sync",
        handleNativeGoogleFitV125Fix as EventListener,
      );
      clearGoogleFitNativeTimeoutV111();
      googleFitNativeInFlightV111.current = false;
      googleFitNativeSilentV125Fix.current = false;
    };
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
    if (!clean(form.company_id)) {
      setMessage(
        "Perusahaan wajib dipilih.",
      );
      return;
    }

    if (!clean(form.code)) {
      setMessage("Kode Karyawan wajib diisi.");
      return;
    }

        if (!clean(form.email)) {
      setMessage("Email wajib diisi untuk pengiriman OTP.");
      return;
    }

    setMessage("Mengirim OTP peserta...");

    const payload = {
      ...form,
      portal_email: form.email,
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
          "OTP sudah dikirim. Cek email/WhatsApp/SMS sesuai data yang kamu isi.",
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
    setFitnessSettings(null);
    setIntegrations([]);
    setFitnessLastSyncAt({});
    setFitnessLastSyncSnapshot({});
    setActivities([]);
    setActivitySummary([]);
    setManualWorkoutLogsV126M8([]);
    setClinicalHistory([]);
    setNutritionLogs([]);
    setHealthtalkLogs([]);
    setPointSummary({ total_points: 0, point_breakdown: {}, healthtalk_count: 0 });
    setStep("request");
    setActiveTab("home");
    setMessage("Session peserta keluar. Masuk ulang dengan OTP.");
  }

  async function syncProvider(
    provider: "strava" | "google-fit",
    options?: { silent?: boolean; days?: number },
  ) {
    const isGoogleFit = provider === "google-fit";
    const silent = options?.silent === true;

    // V111: auto-sync pertama tidak boleh mengunci tombol manual.
    // Bila user menekan tombol saat native sync masih berjalan, ubah proses
    // tersebut menjadi sync terlihat agar klik tetap memberi respons.
    if (isGoogleFit && googleFitNativeInFlightV111.current) {
      if (silent) {
        return;
      }

      // V113: klik manual tidak boleh hanya menunggu callback lama.
      // Bersihkan status native yang mungkin stale, lalu mulai request baru.
      if (googleFitNativeTimeoutV111.current !== null) {
        window.clearTimeout(googleFitNativeTimeoutV111.current);
        googleFitNativeTimeoutV111.current = null;
      }

      googleFitNativeInFlightV111.current = false;
      googleFitNativeSilentV125Fix.current = false;
      setSyncing("");
      setMessage("Memulai ulang sinkronisasi Google Fit...");
    }

    // V125 FIX: pada aplikasi Android gunakan snapshot native HP.
    // Browser biasa tetap memakai REST. Silent sync tidak men-disable tombol.
    if (isGoogleFit) {
      const participantId = Number(
        participant?.id ||
          participant?.participant_id ||
          participant?.wellness_participant_id ||
          0,
      );
      const bridge = nativeGoogleFitBridgeV125Fix();

      if (bridge && participantId > 0) {
        googleFitNativeSilentV125Fix.current = silent;
        googleFitNativeInFlightV111.current = true;

        if (!silent) {
          setSyncing(provider);
          setMessage("Membaca steps dan kalori langsung dari Google Fit HP...");
        }

        if (googleFitNativeTimeoutV111.current !== null) {
          window.clearTimeout(googleFitNativeTimeoutV111.current);
        }

        googleFitNativeTimeoutV111.current = window.setTimeout(() => {
          const wasSilent = googleFitNativeSilentV125Fix.current;
          googleFitNativeTimeoutV111.current = null;
          googleFitNativeInFlightV111.current = false;
          googleFitNativeSilentV125Fix.current = false;
          setSyncing("");

          if (!wasSilent) {
            setMessage(
              "Google Fit belum merespons. Tombol sudah dibuka kembali; silakan tekan Sync Google Fit sekali lagi.",
            );
          }
        }, 60_000);

        try {
          bridge.syncGoogleFit(participantId);
          return;
        } catch (error: any) {
          if (googleFitNativeTimeoutV111.current !== null) {
            window.clearTimeout(googleFitNativeTimeoutV111.current);
            googleFitNativeTimeoutV111.current = null;
          }
          googleFitNativeInFlightV111.current = false;
          googleFitNativeSilentV125Fix.current = false;
          setSyncing("");
          if (!silent) {
            setMessage(
              error?.message || "Google Fit native tidak dapat dijalankan.",
            );
          }
          return;
        }
      }
    }

    if (!silent) {
      setSyncing(provider);
      setMessage(`Sync ${provider === "strava" ? "Strava" : "Google Fit"}...`);
    }

    try {
      const result = await fetch(`/api/wellness/integrations/${provider}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: options?.days || (isGoogleFit ? 2 : 30),
        }),
      })
        .then((response) => response.json())
        .catch((error) => ({
          ok: false,
          message: error?.message || "Network error",
        }));

      if (result.ok) {
        const providerKey = isGoogleFit ? "google_fit" : provider;
        const completedAt = clean(result.last_sync_at) || new Date().toISOString();
        setFitnessLastSyncAt((current) => ({
          ...current,
          [providerKey]: completedAt,
        }));
        if (result.last_sync_snapshot) {
          setFitnessLastSyncSnapshot((current) => ({
            ...current,
            [providerKey]: result.last_sync_snapshot,
          }));
        }

        if (!silent) {
          const fetched = Number(result.fetched || result.fetched_daily || 0);
          const inserted = Number(result.inserted || result.synced || 0);
          const updated = Number(result.updated || 0);
          const skipped = Number(result.skipped || 0);

          setMessage(
            result.message ||
              `Sync selesai. Fetched ${fetched}, masuk baru ${inserted}, update ${updated}, skip ${skipped}.`,
          );
        }

        await loadMe({ keepMessage: true });

        // The sync response already contains the authoritative daily aggregate.
        // Merge it after reload so the current screen cannot remain at zero when
        // the database row is momentarily not reflected by the reload response.
        if (isGoogleFit && Array.isArray(result.daily)) {
          const participantId = asNumber(
            participant?.id ||
              participant?.participant_id ||
              participant?.wellness_participant_id,
          );
          const syncedRows = googleFitSyncDailyRowsV126M47(
            result.daily,
            participantId,
            completedAt,
          );

          if (syncedRows.length > 0) {
            setActivities((current) =>
              normalizeWorkoutItemsForHistoryV72(
                mergeWorkoutRowsV126M8(syncedRows, current || []),
              ),
            );

            const todayRow = syncedRows.find(
              (item: any) => activityDateKey(item) === todayDate(),
            );
            if (todayRow) {
              setFitnessLastSyncSnapshot((current) => ({
                ...current,
                google_fit: {
                  date: activityDateKey(todayRow),
                  measured_at: completedAt,
                  synced_at: completedAt,
                  steps: activityStepsValue(todayRow),
                  total_calories: googleFitTotalCaloriesValueV73(todayRow),
                  distance_km: activityDistanceValue(todayRow),
                  active_calories: null,
                  active_calories_available: false,
                  source: "google_fit_rest_aggregate",
                  step_data_source_id: "google_fit_rest_aggregate",
                },
              }));
            }
          }
        }
      } else if (!silent) {
        setMessage(result.message || "Gagal sync activity.");
      }
    } finally {
      if (!silent) {
        setSyncing("");
      }
    }
  }

  async function saveNutrition(): Promise<{ ok: boolean; message: string }> {
    if (nutritionSubmitInFlightV126L.current) {
      const duplicateMessage =
        "Submission nutrisi sedang diproses. Mohon tunggu.";
      setMessage(duplicateMessage);
      return {
        ok: false,
        message: duplicateMessage,
      };
    }

    const missing: string[] = [];
    if (!clean(nutritionForm.log_date)) missing.push("Tanggal");
    if (!clean(nutritionForm.meal_type)) missing.push("Waktu Makan");
    if (!clean(nutritionForm.food_name)) missing.push("Nama Makanan");

    if (missing.length > 0) {
      const validationMessage = `Data belum lengkap: ${missing.join(", ")}.`;
      setMessage(validationMessage);
      return { ok: false, message: validationMessage };
    }

    nutritionSubmitInFlightV126L.current = true;
    openSavingOverlayV126M46(
      "nutrition",
      nutritionPhoto
        ? "Menyiapkan foto dan memvalidasi laporan nutrisi..."
        : "Memvalidasi laporan nutrisi...",
    );

    window.setTimeout(() => {
      nutritionSubmitInFlightV126L.current = false;
    }, 30000);

    const fingerprintSourceV126M17 = JSON.stringify([
      clean(nutritionForm.log_date),
      clean(nutritionForm.meal_type),
      clean(nutritionForm.food_name),
      clean(nutritionForm.portion),
      clean(nutritionForm.notes),
      clean((nutritionForm as any).estimated_calories),
      nutritionPhoto?.name || "",
      nutritionPhoto?.size || 0,
      nutritionPhoto?.lastModified || 0,
    ]);
    let fingerprintHashV126M17 = 2166136261;
    for (let index = 0; index < fingerprintSourceV126M17.length; index += 1) {
      fingerprintHashV126M17 ^= fingerprintSourceV126M17.charCodeAt(index);
      fingerprintHashV126M17 = Math.imul(fingerprintHashV126M17, 16777619);
    }
    const fingerprintV126M17 = String(fingerprintHashV126M17 >>> 0);
    const pendingStorageKeyV126M17 = `wellness:nutrition-pending:${
      participant?.id || "session"
    }`;

    if (!nutritionPendingSubmissionV126M17.current) {
      try {
        const stored = window.localStorage.getItem(pendingStorageKeyV126M17);
        const parsed = stored ? JSON.parse(stored) : null;
        if (parsed?.id && parsed?.fingerprint) {
          nutritionPendingSubmissionV126M17.current = parsed;
        }
      } catch {
        // Browser storage is optional; the in-memory ref still works.
      }
    }

    const pendingV126M17 = nutritionPendingSubmissionV126M17.current;
    const submissionId =
      pendingV126M17?.fingerprint === fingerprintV126M17
        ? pendingV126M17.id
        : createSubmissionIdV126L("nutrition");

    nutritionPendingSubmissionV126M17.current = {
      id: submissionId,
      fingerprint: fingerprintV126M17,
    };
    try {
      window.localStorage.setItem(
        pendingStorageKeyV126M17,
        JSON.stringify(nutritionPendingSubmissionV126M17.current),
      );
    } catch {
      // Browser storage is optional.
    }

    let photoForUpload = nutritionPhoto;

    if (photoForUpload) {
      setMessage("Menyiapkan dan mengompres foto nutrisi...");
      updateSavingOverlayV126M46("Menyiapkan dan mengompres foto nutrisi...");

      try {
        photoForUpload = await compressNutritionPhotoV126M2(
          photoForUpload,
        );
      } catch (error: any) {
        const compressionMessage =
          error?.message ||
          "Foto gagal dikompres. Pilih foto lain atau gunakan screenshot.";
        setMessage(compressionMessage);
        failSavingOverlayV126M46(compressionMessage);
        nutritionSubmitInFlightV126L.current = false;
        return {
          ok: false,
          message: compressionMessage,
        };
      }
    }

    setMessage("Menyimpan nutrisi ke Google Sheet...");
    updateSavingOverlayV126M46(
      "Menyimpan data nutrisi dan menyinkronkan riwayat...",
    );

    const body = new FormData();
    body.append("submission_id", submissionId);
    body.append("log_date", nutritionForm.log_date);
    body.append("meal_type", nutritionForm.meal_type);
    body.append("food_name", nutritionForm.food_name);
    body.append("portion", nutritionForm.portion);
    body.append("notes", nutritionForm.notes);
    body.append("food_breakdown", clean((nutritionForm as any).food_breakdown));
    body.append(
      "portion_breakdown",
      clean((nutritionForm as any).portion_breakdown),
    );
    body.append(
      "estimated_calories",
      clean((nutritionForm as any).estimated_calories),
    );
    body.append("calories", clean((nutritionForm as any).calories));
    body.append("portion_group", clean((nutritionForm as any).portion_group));
    body.append(
      "portion_fraction",
      clean((nutritionForm as any).portion_fraction),
    );

    if (photoForUpload) {
      body.append(
        "photo",
        photoForUpload,
        photoForUpload.name,
      );
    }

    let result: any = {};

    try {
      const response = await fetch(
        "/api/wellness/participant/nutrition",
        {
          method: "POST",
          body,
        },
      );

      result = await readApiResponseV126M2(response);
    } catch (error: any) {
      result = {
        ok: false,
        message:
          error?.message ||
          "Jaringan bermasalah saat menyimpan nutrisi.",
      };
    }

    if (result.ok) {
      const successMessage = "Laporan nutrisi berhasil tersimpan.";
      setMessage(successMessage);

      if (result.log) {
        setNutritionLogs((previous) => [result.log, ...previous]);
      }

      setNutritionForm((previous) => ({
        ...previous,
        meal_type: "",
        food_name: "",
        portion: "",
        notes: "",
        food_breakdown: "",
        portion_breakdown: "",
        estimated_calories: "",
        calories: "",
        portion_group: "",
        portion_fraction: "",
      }));

      setNutritionPhoto(null);
      nutritionPendingSubmissionV126M17.current = null;
      try {
        window.localStorage.removeItem(pendingStorageKeyV126M17);
      } catch {
        // Browser storage is optional.
      }
      // WELLNESS_FAST_SAVE_UI_V126M100_1
      // The API/Google Sheet success response is the visible save boundary.
      // Point refresh remains active but must not keep the participant waiting.
      completeSavingOverlayV126M46(successMessage);
      void loadPoints();

      nutritionSubmitInFlightV126L.current = false;

      return {
        ok: true,
        message: successMessage,
      };
    }

    const errorMessage =
      result.detail ||
      result.message ||
      "Gagal menyimpan nutrisi.";
    setMessage(errorMessage);
    failSavingOverlayV126M46(errorMessage);
    nutritionSubmitInFlightV126L.current = false;

    return {
      ok: false,
      message: errorMessage,
    };
  }

  async function saveWorkout() {
    if (workoutSubmitInFlightV126L.current) {
      setMessage(
        "Submission workout sedang diproses. Mohon tunggu.",
      );
      return;
    }
    if (!clean(workoutForm.activity_type)) {
      setMessage("Jenis workout wajib diisi.");
      return;
    }

    if (!clean(workoutForm.duration_minutes)) {
      setMessage("Durasi workout wajib diisi.");
      return;
    }

    if (
      workoutForm.calculation_mode === "smartwatch" &&
      !clean(workoutForm.active_calories)
    ) {
      setMessage("Kalori aktif dari smartwatch wajib diisi.");
      return;
    }

    workoutSubmitInFlightV126L.current = true;
    openSavingOverlayV126M46(
      "workout",
      workoutEvidence
        ? "Menyiapkan bukti aktivitas dan memvalidasi workout..."
        : "Memvalidasi data workout...",
    );

    window.setTimeout(() => {
      workoutSubmitInFlightV126L.current = false;
    }, 30000);

    const smartwatchModeV126M50B3 =
      workoutForm.calculation_mode === "smartwatch";

    setMessage(
      smartwatchModeV126M50B3
        ? "Menyimpan workout dari smartwatch ke Google Sheet..."
        : "Menyimpan workout dan menghitung kalori otomatis dari Master Kalori Olahraga...",
    );
    updateSavingOverlayV126M46(
      smartwatchModeV126M50B3
        ? "Menyimpan angka workout dari smartwatch..."
        : "Menghitung kalori aktivitas dari Master Kalori Olahraga...",
    );

    const workoutFingerprintV126M66_1 = JSON.stringify([
      clean(workoutForm.log_date),
      clean(workoutForm.started_at),
      clean(workoutForm.activity_type),
      clean(workoutForm.activity_name),
      clean(workoutForm.calculation_mode),
      clean(workoutForm.duration_minutes),
      clean(workoutForm.duration_seconds),
      clean(workoutForm.distance_km),
      clean(workoutForm.steps),
      clean(workoutForm.notes),
      clean(workoutForm.active_calories),
      // WELLNESS_WORKOUT_STABLE_SUBMISSION_TYPE_HOTFIX_V126M66_1_1
      clean(workoutForm.average_heart_rate),
      clean(workoutForm.max_heart_rate),
      clean(workoutForm.device_source),
      workoutEvidence?.name || "",
      workoutEvidence?.size || 0,
      workoutEvidence?.lastModified || 0,
    ]);

    const previousWorkoutSubmissionV126M66_1 =
      workoutPendingSubmissionV126M66_1.current;

    const submissionId =
      previousWorkoutSubmissionV126M66_1?.fingerprint ===
      workoutFingerprintV126M66_1
        ? previousWorkoutSubmissionV126M66_1.id
        : createSubmissionIdV126L("workout");

    workoutPendingSubmissionV126M66_1.current = {
      id: submissionId,
      fingerprint: workoutFingerprintV126M66_1,
    };
    const body = new FormData();
    body.append("submission_id", submissionId);
    body.append("log_date", workoutForm.log_date);
    body.append("started_at", workoutForm.started_at);
    body.append("activity_type", workoutForm.activity_type);
    body.append("activity_name", workoutForm.activity_name);
    body.append("calculation_mode", workoutForm.calculation_mode);
    body.append("duration_minutes", workoutForm.duration_minutes);
    body.append("duration_seconds", workoutForm.duration_seconds);
    body.append("distance_km", workoutForm.distance_km);
    body.append("steps", workoutForm.steps);
    if (smartwatchModeV126M50B3) {
      body.append("active_calories", workoutForm.active_calories);
      body.append("total_calories", workoutForm.total_calories);
      body.append("average_heart_rate", workoutForm.average_heart_rate);
      body.append("max_heart_rate", workoutForm.max_heart_rate);
      body.append("device_source", workoutForm.device_source);
    }
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
        duration_seconds: "",
        distance_km: "",
        steps: "",
        active_calories: "",
        total_calories: "",
        average_heart_rate: "",
        max_heart_rate: "",
        device_source: previous.calculation_mode === "smartwatch" ? "Smartwatch" : previous.device_source,
        notes: "",
      }));
      setWorkoutEvidence(null);
      workoutPendingSubmissionV126M66_1.current = null;
      setActiveTab("history");
      completeSavingOverlayV126M46(
        result.message || "Workout manual berhasil disimpan.",
      );
      void loadMe({ keepMessage: true, background: true });
    } else {
      // WELLNESS_PORTAL_FAST_BOOT_WORKOUT_SAFE_ERROR_V126M62_4
      // Never render raw upstream/server detail in Participant UI.
      const workoutErrorMessage =
        result.message || "Gagal menyimpan workout.";
      setMessage(workoutErrorMessage);
      failSavingOverlayV126M46(workoutErrorMessage);
    }

    workoutSubmitInFlightV126L.current = false;
  }

  async function saveHealthtalk() {
    if (!clean(healthtalkForm.healthtalk_title)) {
      setMessage("Jenis atau judul Health Talk wajib diisi.");
      return;
    }

    openSavingOverlayV126M46(
      "healthtalk",
      healthtalkEvidence
        ? "Menyiapkan bukti dan memvalidasi data Health Talk..."
        : "Memvalidasi data Health Talk...",
    );
    setMessage("Menyimpan Health Talk ke Google Sheet...");
    updateSavingOverlayV126M46(
      "Menyimpan Health Talk dan menyinkronkan riwayat...",
    );

    const body = new FormData();
    body.append("log_date", healthtalkForm.log_date);
    body.append("healthtalk_type", healthtalkForm.healthtalk_type);
    body.append("healthtalk_title", healthtalkForm.healthtalk_title);
    body.append("notes", healthtalkForm.notes);
    if (healthtalkEvidence)
      body.append("healthtalk_evidence", healthtalkEvidence);

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
      updateSavingOverlayV126M46("Data tersimpan. Memperbarui riwayat dan poin...");
      await Promise.all([loadHealthtalk(), loadPoints()]);
      setActiveTab("history");
      completeSavingOverlayV126M46(
        result.message || "Health Talk berhasil disimpan.",
      );
    } else {
      const healthtalkErrorMessage =
        result.detail || result.message || "Gagal menyimpan Health Talk.";
      setMessage(healthtalkErrorMessage);
      failSavingOverlayV126M46(healthtalkErrorMessage);
    }
  }

  const healthConnectConnected = providerStatus(integrations, "health_connect");
  const googleFitConnected = providerStatus(integrations, "google_fit");
  const activeFitnessSource = clean(
    fitnessSettings?.fitness_source || "none",
  )
    .toLowerCase()
    .replace(/-/g, "_");
  const fitnessEnabledValue = fitnessSettings?.fitness_enabled;
  const fitnessEnabled =
    fitnessEnabledValue === true ||
    Number(fitnessEnabledValue) === 1 ||
    clean(fitnessEnabledValue).toLowerCase() === "true";

  useEffect(() => {
    if (step !== "portal") return;
    if (!fitnessEnabled || activeFitnessSource !== "google_fit") return;
    if (!googleFitConnected) return;

    // Sync segera ketika portal dibuka, lalu ulang setiap 10 menit selama terbuka.
    void syncProvider("google-fit", { silent: true, days: 2 });

    const intervalId = window.setInterval(
      () => {
        void syncProvider("google-fit", { silent: true, days: 2 });
      },
      10 * 60 * 1000,
    );

    return () => window.clearInterval(intervalId);
  }, [step, googleFitConnected, fitnessEnabled, activeFitnessSource]);

  const workoutItems = useMemo(() => {
    const activityRows =
      Array.isArray(activities) && activities.length > 0
        ? activities
        : Array.isArray(activitySummary) && activitySummary.length > 0
          ? activitySummary
          : [];

    // WELLNESS_MANUAL_HISTORY_STABLE_SOURCE_V126M66_3
    // Manual workout visible di Participant History hanya dari Google Sheet.
    // Supabase manual mirror tetap internal untuk point/streak/reconciliation.
    const deviceActivityRowsV126M66_3 = activityRows.filter(
      (item: any) => {
        const raw = activityRawPayloadV72(item);
        const provider = clean(
          item?.source ||
            item?.provider ||
            item?.input_source ||
            raw?.provider,
        )
          .toLowerCase()
          .replace(/-/g, "_");

        return provider !== "manual" && provider !== "google_sheet";
      },
    );

    const sourceRows = mergeWorkoutRowsV126M8(
      deviceActivityRowsV126M66_3,
      manualWorkoutLogsV126M8,
    );

    const filteredRows = sourceRows.filter((item: any) => {
      const raw = activityRawPayloadV72(item);
      const provider = clean(
        item?.source || item?.provider || item?.input_source || raw?.provider,
      )
        .toLowerCase()
        .replace(/-/g, "_");
      if (!["health_connect", "google_fit"].includes(provider)) return true;
      if (!fitnessEnabled) return false;
      return provider === activeFitnessSource;
    });

    // One provider + one date must contribute only one device snapshot.
    // Manual workout rows remain separate and are still added to the device row.
    return normalizeWorkoutItemsForMetrics(filteredRows);
  }, [
    activities,
    activitySummary,
    manualWorkoutLogsV126M8,
    fitnessEnabled,
    activeFitnessSource,
  ]);

  const todayWorkoutItems = useMemo(() => {
    return normalizeTodayWorkoutItems(workoutItems);
  }, [workoutItems]);

  const todayNutrition = useMemo(() => {
    const today = todayDate();
    return nutritionLogs.filter(
      (item) => clean(item.log_date).slice(0, 10) === today,
    );
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
      <WellnessSavingOverlayV126M46
        state={savingOverlayV126M46}
        onClose={closeSavingOverlayV126M46}
      />

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
          loading ? (
            <section className="relative mx-auto flex min-h-[calc(100vh-9rem)] max-w-xl items-center justify-center py-6 md:py-10">
              {/* WELLNESS_AUTH_UI_UX_V88 */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2.5rem]">
                <div className="absolute -left-24 top-12 h-56 w-56 rounded-full bg-cyan-100/55 blur-3xl" />
                <div className="absolute -right-20 bottom-8 h-64 w-64 rounded-full bg-teal-100/60 blur-3xl" />
              </div>

              <div className="relative z-10 w-full">
                <div className="mb-6 text-center">
                  <img
                    src="/wellness-pwa/icon-192.png"
                    alt="Harmony Health"
                    className="mx-auto h-20 w-20 rounded-[1.6rem] shadow-xl shadow-blue-950/10"
                  />
                  <div className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                    Harmony Health
                  </div>
                  <div className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-teal-600">
                    Wellness Participant Portal
                  </div>
                </div>

                <div className="rounded-[2.25rem] border border-white/80 bg-white/95 px-6 py-10 text-center shadow-2xl shadow-slate-200/70 backdrop-blur md:px-10 md:py-12">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-cyan-50 to-teal-100 text-teal-700 shadow-inner">
                    <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 3.75H7.5A1.5 1.5 0 0 0 6 5.25v13.5a1.5 1.5 0 0 0 1.5 1.5H15" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="m13 8 4 4-4 4M9 12h8" />
                    </svg>
                  </div>

                  <h1 className="mt-7 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
                    Sedang membuka Portal
                  </h1>
                  <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-6 text-slate-500 md:text-base">
                    Mohon tunggu sebentar, kami sedang menyiapkan data dan progress Anda.
                  </p>

                  <div className="mx-auto mt-8 h-12 w-12 animate-spin rounded-full border-4 border-teal-100 border-t-teal-600" aria-label="Memuat portal" />

                  <div className="mt-8 flex items-center justify-center gap-3 text-xs font-bold text-slate-400">
                    <span className="h-px w-14 bg-slate-200" />
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-teal-500" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 5.5 6v5.2c0 4.1 2.7 7.9 6.5 9.1 3.8-1.2 6.5-5 6.5-9.1V6L12 3Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="m9.5 12 1.6 1.6 3.5-3.7" />
                    </svg>
                    <span className="h-px w-14 bg-slate-200" />
                  </div>
                  <p className="mt-4 text-sm font-bold text-slate-500">
                    Anda akan masuk otomatis.
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <section className="relative mx-auto max-w-xl py-6 md:py-10">
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2.5rem]">
                <div className="absolute -left-24 top-10 h-56 w-56 rounded-full bg-cyan-100/55 blur-3xl" />
                <div className="absolute -right-20 bottom-6 h-64 w-64 rounded-full bg-teal-100/60 blur-3xl" />
              </div>

              <div className="relative z-10">
                <div className="mb-6 text-center">
                  <img
                    src="/wellness-pwa/icon-192.png"
                    alt="Harmony Health"
                    className="mx-auto h-20 w-20 rounded-[1.6rem] shadow-xl shadow-blue-950/10"
                  />
                  <div className="mt-4 text-2xl font-black tracking-tight text-slate-950">
                    Harmony Health
                  </div>
                  <div className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-teal-600">
                    Wellness Participant Portal
                  </div>
                </div>

                <div className="rounded-[2.25rem] border border-white/80 bg-white/95 p-6 shadow-2xl shadow-slate-200/70 backdrop-blur md:p-8">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-50 to-teal-100 text-teal-700">
                      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 5.5 6v5.2c0 4.1 2.7 7.9 6.5 9.1 3.8-1.2 6.5-5 6.5-9.1V6L12 3Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 11.2V9.9a2.5 2.5 0 0 1 5 0v1.3M9 11.2h6v4.7H9z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-3xl font-black tracking-tight text-slate-950">
                        Login Peserta
                      </h1>
                      <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                        Masuk menggunakan Kode Karyawan dan email terdaftar.
                      </p>
                    </div>
                  </div>

                  <PortalLoginStatusNoticeV43
                    message={message}
                    isWarning={isWarningMessage}
                    step={step}
                  />

                  <div className="mt-6 grid gap-5">
                    <label className="grid gap-2 text-sm font-bold text-slate-700">
                      Perusahaan
                      <select
                        className={fieldClass}
                        value={form.company_id}
                        onChange={(event) =>
                          setValue(
                            "company_id",
                            event.target.value,
                          )
                        }
                        disabled={
                          companiesLoadingV126C ||
                          step === "verify"
                        }
                      >
                        <option value="">
                          {
                            companiesLoadingV126C
                              ? "Memuat perusahaan..."
                              : "Pilih perusahaan"
                          }
                        </option>
                    
                        {participantCompaniesV126C.map(
                          (company: any) => (
                            <option
                              key={company.id}
                              value={String(
                                company.id,
                              )}
                            >
                              {company.name}
                            </option>
                          ),
                        )}
                      </select>
                    </label>

                    <label className="grid gap-2 text-sm font-black text-slate-700">
                      Kode Karyawan
                      <div className="flex items-center rounded-2xl border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-teal-400 focus-within:ring-4 focus-within:ring-teal-100">
                        <span className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <circle cx="12" cy="8" r="3" />
                            <path strokeLinecap="round" d="M5.5 20c.5-4 2.7-6 6.5-6s6 2 6.5 6" />
                          </svg>
                        </span>
                        <input
                          className="min-w-0 flex-1 bg-transparent py-4 text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400"
                          value={form.code}
                          onChange={(e) => setValue("code", e.target.value)}
                          placeholder="Contoh: 278"
                        />
                      </div>
                    </label>

                    <label className="grid gap-2 text-sm font-black text-slate-700">
                      Email
                      <div className="flex items-center rounded-2xl border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-teal-400 focus-within:ring-4 focus-within:ring-teal-100">
                        <span className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <rect x="3.5" y="5" width="17" height="14" rx="2" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="m5 7 7 5 7-5" />
                          </svg>
                        </span>
                        <input
                          type="email"
                          className="min-w-0 flex-1 bg-transparent py-4 text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400"
                          value={form.email}
                          onChange={(e) => setValue("email", e.target.value)}
                          placeholder="nama@email.com"
                        />
                      </div>
                    </label>

                    {step === "verify" ? (
                      <label className="grid gap-2 text-sm font-black text-slate-700">
                        Kode OTP
                        <div className="flex items-center rounded-2xl border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-teal-400 focus-within:ring-4 focus-within:ring-teal-100">
                          <span className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                              <circle cx="8" cy="12" r="3" />
                              <path strokeLinecap="round" d="M11 12h9M17 12v3M14 12v2" />
                            </svg>
                          </span>
                          <input
                            inputMode="numeric"
                            className="min-w-0 flex-1 bg-transparent py-4 text-center text-lg font-black tracking-[0.25em] text-slate-900 outline-none placeholder:text-sm placeholder:font-bold placeholder:tracking-normal placeholder:text-slate-400"
                            value={form.otp}
                            onChange={(e) => setValue("otp", e.target.value)}
                            placeholder="6 digit OTP"
                          />
                        </div>
                      </label>
                    ) : null}

                    {step === "request" ? (
                      <button
                        type="button"
                        onClick={requestOtp}
                        className="mt-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-700 px-5 py-4 text-sm font-black text-white shadow-xl shadow-teal-100 transition hover:-translate-y-0.5 hover:shadow-2xl active:translate-y-0"
                      >
                        Kirim OTP
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m21 3-7.5 18-2.4-8.1L3 10.5 21 3Z" />
                        </svg>
                      </button>
                    ) : (
                      <div className="grid gap-3">
                        <button
                          type="button"
                          onClick={verifyOtp}
                          className="mt-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-700 px-5 py-4 text-sm font-black text-white shadow-xl shadow-teal-100 transition hover:-translate-y-0.5 hover:shadow-2xl active:translate-y-0"
                        >
                          Verifikasi OTP & Masuk
                        </button>

                        <button
                          type="button"
                          onClick={requestOtp}
                          className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black text-slate-600 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                        >
                          Kirim Ulang OTP
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-7 flex items-center gap-3">
                    <span className="h-px flex-1 bg-slate-200" />
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-teal-400" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 5.5 6v5.2c0 4.1 2.7 7.9 6.5 9.1 3.8-1.2 6.5-5 6.5-9.1V6L12 3Z" />
                    </svg>
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>

                  <div className="mt-5 text-center text-sm font-semibold text-slate-500">
                    Belum punya akun?
                    <Link
                      href="/wellness/signup"
                      className="ml-2 font-black text-teal-700 transition hover:text-teal-900 hover:underline"
                    >
                      Sign Up
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          )
        ) : (
          <div className="mt-6 space-y-6">
            {activeTab === "home" ? (
              <HomeTab
                participant={participant}
                nutritionLogs={nutritionLogs}
                totals={totals}
                setActiveTab={setActiveTab}
                healthConnectConnected={!!healthConnectConnected}
                googleFitConnected={!!googleFitConnected}
                clinicalHistory={clinicalHistory}
                workoutItems={workoutItems}
                healthtalkLogs={healthtalkLogs}
                fitnessSettings={fitnessSettings}
                fitnessLastSyncSnapshot={fitnessLastSyncSnapshot}
                pointSummary={pointSummary}
              />
            ) : null}

            {activeTab === "nutrition" ? (
              <NutritionTab
                participant={participant}
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
              <HistoryTab
                participant={participant}
                workoutItems={workoutItems}
                nutritionLogs={nutritionLogs}
                healthtalkLogs={healthtalkLogs}
                refresh={() => loadMe({ background: true })}
              />
            ) : null}

            {activeTab === "devices" ? (
              <>
                <DevicesTab
                  healthConnectConnected={
                    !!healthConnectConnected
                  }
                  googleFitConnected={
                    !!googleFitConnected
                  }
                  healthConnectLastSyncAt={
                    fitnessLastSyncAt
                      .health_connect ||
                    healthConnectConnected
                      ?.last_sync_at ||
                    ""
                  }
                  googleFitLastSyncAt={
                    fitnessLastSyncAt
                      .google_fit ||
                    googleFitConnected
                      ?.last_sync_at ||
                    ""
                  }
                  googleFitLastSyncSnapshot={
                    fitnessLastSyncSnapshot
                      .google_fit || null
                  }
                  fitnessSettings={
                    fitnessSettings
                  }
                  syncing={syncing}
                  syncProvider={syncProvider}
                />

              </>
            ) : null}

            {activeTab === "chat" ? (
              <ParticipantCoachChat participant={participant} />
            ) : null}

            {activeTab === "support" ? (
              <SupportChatPanel
                actorType="participant"
                onClose={() => setActiveTab("home")}
              />
            ) : null}

            {activeTab === "profile" ? (
              <ProfileTab
                participant={participant}
                integrations={integrations}
                fitnessSettings={fitnessSettings}
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
// WELLNESS_PARTICIPANT_CHAT_OPTIMISTIC_READ_V65
// WELLNESS_PARTICIPANT_CHAT_COMPACT_UI_V76B
function ParticipantCoachChat({ participant }: { participant: any }) {
  const participantId = asNumber(
    participant?.id ||
      participant?.participant_id ||
      participant?.wellness_participant_id,
  );
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatNotice, setChatNotice] = useState("");
  const [assignedCoach, setAssignedCoach] = useState<any>(null);

  function scrollChatToLatest(behavior: ScrollBehavior = "smooth") {
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      document.getElementById("participant-coach-chat-end")?.scrollIntoView({
        behavior,
        block: "end",
      });
    }, 40);
  }

  async function loadChat(options?: { silent?: boolean; scroll?: boolean }) {
    if (!participantId) return;
    if (!options?.silent) setLoadingChat(true);

    const result = await fetch(
      `/api/wellness/portal/coach-notes?participant_id=${participantId}&mode=chat&t=${Date.now()}`,
      { cache: "no-store" },
    )
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      const rows = Array.isArray(result.messages) ? result.messages : [];
      setMessages(rows);
      setAssignedCoach(result.coach || null);
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
              : item,
          ),
        );
      }

      if (options?.scroll) scrollChatToLatest("auto");
    } else if (!options?.silent) {
      setChatNotice(result.message || "Chat belum dapat dimuat.");
    }

    if (!options?.silent) setLoadingChat(false);
  }

  async function sendChat() {
    const message = clean(text);
    if (!participantId || !message || sending) return;

    const optimisticId = `participant-pending-${Date.now()}`;
    const optimisticMessage = {
      id: optimisticId,
      sender: "participant",
      message,
      coach_note: message,
      created_at: new Date().toISOString(),
      is_read: false,
      optimistic: true,
    };

    setSending(true);
    setChatNotice("");
    setText("");
    setMessages((current) => [...current, optimisticMessage]);
    scrollChatToLatest();

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
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      const saved = result.chat || {};
      setMessages((current) =>
        current.map((item) =>
          item.id === optimisticId
            ? {
                ...saved,
                id: saved.id || optimisticId,
                sender: "participant",
                message,
                coach_note: message,
                created_at: saved.created_at || optimisticMessage.created_at,
                is_read: false,
                optimistic: false,
              }
            : item,
        ),
      );
      window.setTimeout(() => void loadChat({ silent: true }), 900);
    } else {
      setMessages((current) =>
        current.filter((item) => item.id !== optimisticId),
      );
      setText((current) => current || message);
      setChatNotice(
        result.message || "Pesan gagal dikirim. Silakan coba lagi.",
      );
    }

    setSending(false);
    scrollChatToLatest();
  }

  useEffect(() => {
    void loadChat({ scroll: true });
  }, [participantId]);

  useEffect(() => {
    if (!participantId) return;
    const intervalId = window.setInterval(() => {
      void loadChat({ silent: true });
    }, 12000);
    return () => window.clearInterval(intervalId);
  }, [participantId]);

  const coachDisplayName =
    clean(assignedCoach?.name || assignedCoach?.full_name) || "Coach Wellness";

  return (
    <section className="overflow-hidden rounded-[1.65rem] border border-slate-100 bg-white shadow-xl shadow-slate-200/55">
      <div className="bg-gradient-to-r from-teal-600 via-cyan-600 to-sky-600 px-4 py-3.5 text-white md:px-5 md:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <WellnessAvatar
              name={coachDisplayName}
              src={assignedCoach?.photo_preview_url || assignedCoach?.photo_url}
              size="md"
              className="ring-white/45"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/75">
                Coach Support
              </div>
              <h2 className="mt-1 break-words text-lg font-black leading-tight text-white md:text-xl">
                Chat With Coach {coachDisplayName}
              </h2>
              <p className="mt-1 text-[11px] font-bold leading-4 text-white/80 md:text-xs">
                Konsultasi nutrisi, workout, dan target wellness.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadChat({ scroll: true })}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/18 text-lg font-black backdrop-blur"
            aria-label="Refresh chat"
          >
            ↻
          </button>
        </div>
      </div>

      <div className="p-3 md:p-4">
        {chatNotice ? (
          <div className="mb-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
            {chatNotice}
          </div>
        ) : null}

        <div className="h-[min(52vh,30rem)] min-h-[18rem] space-y-2.5 overflow-y-auto rounded-[1.35rem] bg-[#f4fbfa] p-3 md:p-4">
          {loadingChat ? (
            <div className="py-12 text-center text-sm font-bold text-slate-400">
              Memuat percakapan...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-5 text-center">
              <div className="text-base font-black text-slate-900">
                Belum ada percakapan
              </div>
              <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
                Kirim pesan pertama kepada {coachDisplayName}.
              </p>
            </div>
          ) : (
            messages.map((item: any) => {
              const fromParticipant = item.sender === "participant";
              return (
                <div
                  key={item.id}
                  className={`flex items-end gap-2 ${fromParticipant ? "justify-end" : "justify-start"}`}
                >
                  {!fromParticipant ? (
                    <WellnessAvatar
                      name={coachDisplayName}
                      src={
                        assignedCoach?.photo_preview_url ||
                        assignedCoach?.photo_url
                      }
                      size="sm"
                    />
                  ) : null}
                  <div
                    className={`max-w-[78%] rounded-[1.25rem] px-3.5 py-2.5 shadow-sm transition-opacity ${
                      fromParticipant
                        ? "rounded-br-sm bg-slate-950 text-white"
                        : "rounded-bl-sm border border-teal-100 bg-white text-slate-900"
                    } ${item.optimistic ? "opacity-85" : "opacity-100"}`}
                  >
                    <div className="whitespace-pre-wrap break-words text-[13px] font-bold leading-5">
                      {item.message || item.coach_note || "-"}
                    </div>
                    <div
                      className={`mt-1.5 flex flex-wrap items-center gap-x-1 text-[10px] font-bold ${
                        fromParticipant ? "text-white/60" : "text-slate-400"
                      }`}
                    >
                      <span>
                        {formatCoachDate(item.created_at || item.session_date)}
                      </span>
                      {fromParticipant ? (
                        <span>
                          {item.is_read ? "· Sudah dibaca" : "· Terkirim"}
                        </span>
                      ) : (
                        <span>· {coachDisplayName}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div
            id="participant-coach-chat-end"
            className="h-px"
            aria-hidden="true"
          />
        </div>

        <div className="mt-3 flex items-end gap-2 rounded-[1.35rem] border border-slate-200 bg-white p-2 shadow-sm">
          <textarea
            className="min-h-[48px] max-h-[112px] flex-1 resize-none rounded-2xl border-0 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`Tulis pesan untuk ${coachDisplayName}...`}
            rows={1}
          />
          <button
            type="button"
            onClick={sendChat}
            disabled={sending || !clean(text)}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-600 text-lg font-black text-white shadow-lg shadow-teal-100 disabled:opacity-40"
            aria-label={sending ? "Pesan sedang diproses" : "Kirim pesan"}
          >
            {sending ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              "➤"
            )}
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
    ? text ||
      "Kode OTP sudah dikirim. Silakan cek email/WhatsApp dan masukkan kode OTP untuk masuk ke portal."
    : text ||
      "Masukkan kode karyawan, username, email, dan nomor HP untuk aktivasi portal peserta.";

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
          <div className="text-sm font-black">{title}</div>

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
    <div
      className={`overflow-hidden rounded-[2rem] border p-5 shadow-sm ${toneClass[tone]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${dotClass[tone]}`} />
            <div className="text-[11px] font-black uppercase tracking-[0.16em] opacity-70">
              {label}
            </div>
          </div>

          <div className="mt-3 text-2xl font-black md:text-3xl">{value}</div>

          <div className="mt-1 text-xs font-bold leading-5 opacity-70">
            {note}
          </div>
        </div>

        <div className="hidden h-14 w-20 rounded-2xl bg-white/60 p-2 md:block">
          <MiniDecorChart tone={tone} />
        </div>
      </div>
    </div>
  );
}

function MiniDecorChart({
  tone,
}: {
  tone: "blue" | "emerald" | "amber" | "slate";
}) {
  const colorClass: Record<string, string> = {
    blue: "text-sky-500",
    emerald: "text-teal-500",
    amber: "text-amber-500",
    slate: "text-slate-500",
  };

  return (
    <svg
      viewBox="0 0 90 52"
      className={`h-full w-full ${colorClass[tone]}`}
      aria-hidden="true"
    >
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
      return String(element?.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
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
        document.body.querySelectorAll("section, div, article"),
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
        document.body.querySelectorAll("section, div, article"),
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
// WELLNESS_PARTICIPANT_PROGRESS_BARS_V65
function parseWellnessNumber(value: any) {
  const raw = clean(value).replace(/[^0-9,.-]/g, "");
  if (!raw) return 0;
  if (raw.includes(",")) {
    return asNumber(raw.replace(/\./g, "").replace(",", "."));
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) return asNumber(raw.replace(/\./g, ""));
  return asNumber(raw);
}

function coachTargetFromText(text: any, label: RegExp) {
  const match = clean(text).match(label);
  return match?.[1] ? parseWellnessNumber(match[1]) : 0;
}

function clampProgressPercent(value: number) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

function progressPercent(current: number, target: number) {
  if (!(target > 0)) return 0;
  return clampProgressPercent((current / target) * 100);
}

function weightTargetProgress(
  current: number,
  baseline: number,
  target: number,
) {
  if (!(current > 0) || !(target > 0)) return 0;
  if (!(baseline > 0) || baseline === target)
    return Math.abs(current - target) <= 0.5 ? 100 : 0;
  const totalDistance = Math.abs(baseline - target);
  const remainingDistance = Math.abs(current - target);
  return clampProgressPercent(
    ((totalDistance - remainingDistance) / totalDistance) * 100,
  );
}

function WellnessProgressRow({
  label,
  valueLabel,
  percent,
  note,
  tone = "teal",
}: {
  label: string;
  valueLabel: string;
  percent: number;
  note?: string;
  tone?: "teal" | "sky" | "orange" | "violet";
}) {
  const toneClasses = {
    teal: "bg-teal-500",
    sky: "bg-sky-500",
    orange: "bg-orange-500",
    violet: "bg-violet-500",
  };
  const safePercent = clampProgressPercent(percent);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-black text-slate-900">{label}</div>
          {note ? (
            <div className="mt-1 text-xs font-bold text-slate-500">{note}</div>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-black text-slate-900">{valueLabel}</div>
          <div className="mt-1 text-[11px] font-black text-slate-400">
            {Math.round(safePercent)}%
          </div>
        </div>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-700 ${toneClasses[tone]}`}
          style={{ width: `${safePercent}%` }}
        />
      </div>
    </div>
  );
}

// WELLNESS_PARTICIPANT_MOMENTUM_STREAK_V66
function localDateKeyV66(value: any) {
  return jakartaDateFromAny(value);
}

function jakartaDayKeyV66(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function shortDayLabelV66(date: string) {
  if (!date) return "-";
  return new Date(`${date}T12:00:00+07:00`)
    .toLocaleDateString("id-ID", {
      weekday: "short",
      timeZone: "Asia/Jakarta",
    })
    .replace("Min", "Min")
    .replace("Sen", "Sen")
    .replace("Sel", "Sel")
    .replace("Rab", "Rab")
    .replace("Kam", "Kam")
    .replace("Jum", "Jum")
    .replace("Sab", "Sab");
}

function buildParticipantMomentumV66(
  nutritionRows: any[],
  workoutRows: any[],
  workoutTarget: number,
) {
  // WELLNESS_PARTICIPANT_STREAK_FALLBACK_V126M24_1
  // Client fallback now uses the exact same pure builder as Coach/API.
  const streak = buildWellnessStreakSummary({
    nutritionRows: nutritionRows || [],
    activityRows: workoutRows || [],
    workoutTargetCalories: workoutTarget,
  });

  return {
    days: streak.days.map((day) => ({
      date: day.date,
      label: day.label,
      nutritionCount: day.nutrition_count,
      nutritionCalories: day.nutrition_calories,
      workoutCalories: day.workout_calories,
      steps: day.steps,
      success: day.success,
    })),
    successDates: streak.success_dates,
    currentStreak: streak.current_streak,
  };
}

function verifiedParticipantStreakV126M26(
  payload: any,
  expectedParticipantId: number,
) {
  const participantId = asNumber(
    payload?.participant_id ||
      payload?.streak_participant_id ||
      payload?.wellness_streak_participant_id,
  );
  const streak =
    payload?.streak ||
    payload?.wellness_streak ||
    (Array.isArray(payload?.days) ? payload : null);

  if (
    !(expectedParticipantId > 0) ||
    participantId !== expectedParticipantId ||
    !streak ||
    !Array.isArray(streak?.days) ||
    streak.days.length !== 7
  ) {
    return null;
  }

  return {
    ...streak,
    __participant_id: participantId,
    __status: clean(
      payload?.status || payload?.wellness_streak_status || "ok",
    ),
    __sources:
      payload?.sources || payload?.wellness_streak_sources || null,
  };
}

function HomeTab({
  participant,
  nutritionLogs,
  totals,
  setActiveTab,
  healthConnectConnected,
  googleFitConnected,
  clinicalHistory,
  workoutItems,
  healthtalkLogs,
  fitnessSettings,
  fitnessLastSyncSnapshot,
  pointSummary,
}: {
  participant: any;
  nutritionLogs: any[];
  totals: any;
  setActiveTab: (tab: PortalTab) => void;
  healthConnectConnected: boolean;
  googleFitConnected: boolean;
  clinicalHistory: any[];
  workoutItems: any[];
  healthtalkLogs: any[];
  fitnessSettings: any;
  fitnessLastSyncSnapshot: Record<string, any>;
  pointSummary: any;
}) {
  const participantId = Number(
    participant?.id ||
      participant?.participant_id ||
      participant?.wellness_participant_id ||
      0,
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
  const initialParticipantStreakV126M26 =
    verifiedParticipantStreakV126M26(
      {
        participant_id: participant?.wellness_streak_participant_id,
        streak: participant?.wellness_streak,
        status: participant?.wellness_streak_status,
        sources: participant?.wellness_streak_sources,
      },
      participantId,
    );
  const [participantStreakV126M23, setParticipantStreakV126M23] =
    useState<any>(initialParticipantStreakV126M26);
  // WELLNESS_EDITABLE_STEP_TARGET_V126M34
  const [coachTargets, setCoachTargets] = useState({
    nutrition_max_calories: 0,
    workout_min_calories: 0,
    daily_step_target: 8000,
    target_weight_kg: 0,
  });

  useEffect(() => {
    const initial = verifiedParticipantStreakV126M26(
      {
        participant_id: participant?.wellness_streak_participant_id,
        streak: participant?.wellness_streak,
        status: participant?.wellness_streak_status,
        sources: participant?.wellness_streak_sources,
      },
      participantId,
    );

    setParticipantStreakV126M23((current: any) => {
      if (initial) return initial;
      if (
        asNumber(current?.__participant_id) > 0 &&
        asNumber(current?.__participant_id) !== participantId
      ) {
        return null;
      }
      return current;
    });

    const initialTargets = participant?.wellness_streak_targets || {};
    setCoachTargets((current) => ({
      ...current,
      nutrition_max_calories:
        asNumber(initialTargets?.nutrition_max_calories) ||
        current.nutrition_max_calories,
      workout_min_calories:
        asNumber(initialTargets?.workout_min_calories) ||
        current.workout_min_calories,
      // WELLNESS_PARTICIPANT_TARGET_BB_FALLBACK_V126M64_1
      // Hydrate current persisted/effective BB target immediately so Portal
      // never flashes or falls back to an obsolete Coach note while canonical
      // effective-targets is still loading.
      target_weight_kg:
        asNumber(
          initialTargets?.target_weight_kg ||
            initialTargets?.weight_kg ||
            participant?.target_weight_kg ||
            participant?.target_weight,
        ) || current.target_weight_kg,
    }));
  }, [
    participantId,
    participant?.wellness_streak,
    participant?.wellness_streak_targets,
    participant?.wellness_streak_status,
  ]);

  async function loadCoachTargets() {
    if (!participantId) return;

    // WELLNESS_PORTAL_EFFECTIVE_TARGET_PARITY_V126M61_1
    // Effective-dated canonical is authoritative. Existing Coach-note resolver
    // below remains untouched as compatibility fallback.
    const effectiveTargetResult = await fetch(
      `/api/wellness/participant/effective-targets?participant_id=${participantId}&t=${Date.now()}`,
      { cache: "no-store", credentials: "include" },
    )
      .then((response) => response.json())
      .catch(() => null);

    if (
      effectiveTargetResult?.ok &&
      Number(effectiveTargetResult?.participant_id || 0) === participantId &&
      effectiveTargetResult?.targets
    ) {
      const effectiveTargets = effectiveTargetResult.targets;
      setCoachTargets((previous: any) => ({
        ...previous,
        nutrition_max_calories:
          asNumber(effectiveTargets?.nutrition_max_calories) ||
          previous?.nutrition_max_calories ||
          0,
        workout_min_calories:
          asNumber(effectiveTargets?.workout_min_calories) ||
          previous?.workout_min_calories ||
          0,
        daily_step_target:
          asNumber(effectiveTargets?.daily_step_target) ||
          previous?.daily_step_target ||
          8000,
        target_weight_kg:
          asNumber(effectiveTargets?.target_weight_kg) ||
          previous?.target_weight_kg ||
          0,
      }));
      return;
    }
    const result = await fetch(
      `/api/wellness/portal/coach-notes?participant_id=${participantId}&t=${Date.now()}`,
      { cache: "no-store" },
    )
      .then((response) => response.json())
      .catch(() => null);

    // WELLNESS_PARTICIPANT_TARGET_BB_FALLBACK_V126M64_1
    // Canonical endpoint above remains authoritative. This fallback is only
    // used when it is unavailable; always choose the newest target revision,
    // never the first/oldest row returned by Coach Notes.
    const notes = Array.isArray(result?.notes) ? [...result.notes] : [];
    notes.sort((a: any, b: any) => {
      const aDate = clean(a?.session_date || a?.updated_at || a?.created_at);
      const bDate = clean(b?.session_date || b?.updated_at || b?.created_at);
      const dateDiff = bDate.localeCompare(aDate);
      if (dateDiff !== 0) return dateDiff;
      return asNumber(b?.id) - asNumber(a?.id);
    });
    const targetNote = notes.find(
      (item: any) =>
        clean(item?.topic).toLowerCase().includes("target wellness") ||
        clean(item?.action_plan).toLowerCase().includes("target nutrisi") ||
        clean(item?.action_plan).toLowerCase().includes("target langkah"),
    );
    const actionPlan = clean(targetNote?.action_plan);

    setCoachTargets({
      nutrition_max_calories:
        coachTargetFromText(actionPlan, /Target\s+Nutrisi\s*:\s*([0-9.,]+)/i) ||
        asNumber(
          participant?.nutrition_max_calories ||
            participant?.daily_calorie_target,
        ),
      workout_min_calories:
        coachTargetFromText(
          actionPlan,
          /Target\s+(?:Kalori\s+)?Workout\s*:\s*([0-9.,]+)/i,
        ) ||
        asNumber(
          participant?.workout_min_calories ||
            participant?.workout_calorie_target ||
            participant?.active_calorie_target,
        ),
      daily_step_target:
        coachTargetFromText(
          actionPlan,
          /Target\s+Langkah\s*:\s*([0-9.,]+)/i,
        ) ||
        asNumber(participant?.daily_step_target || participant?.step_target) ||
        8000,
      target_weight_kg:
        coachTargetFromText(actionPlan, /Target\s+BB\s*:\s*([0-9.,]+)/i) ||
        asNumber(participant?.target_weight_kg || participant?.target_weight),
    });
  }

  async function loadParticipantStreakV126M23() {
    if (!participantId) return null;

    const requestStreak = async () => {
      try {
        const response = await fetch(
          `/api/wellness/participant/streak?participant_id=${participantId}&t=${Date.now()}`,
          { cache: "no-store", credentials: "include" },
        );
        return await response.json().catch(() => null);
      } catch {
        return null;
      }
    };

    let result = await requestStreak();
    let verified = verifiedParticipantStreakV126M26(
      result,
      participantId,
    );

    if (!result?.ok || !verified) {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      result = await requestStreak();
      verified = verifiedParticipantStreakV126M26(
        result,
        participantId,
      );
    }

    // A failed refresh must never replace a valid initial streak with zero.
    if (result?.ok && verified) {
      setParticipantStreakV126M23(verified);
      setCoachTargets((previous) => ({
        ...previous,
        nutrition_max_calories:
          asNumber(result?.targets?.nutrition_max_calories) ||
          previous.nutrition_max_calories,
        workout_min_calories:
          asNumber(result?.targets?.workout_min_calories) ||
          previous.workout_min_calories,
      }));
    }

    return result;
  }

  async function loadDirectNutrition() {
    if (!participantId) return;

    setNutritionLoading(true);

    const result = await fetch(
      `/api/wellness/portal/nutrition-direct?participant_id=${participantId}&t=${Date.now()}`,
      { cache: "no-store" },
    )
      .then((response) => response.json())
      .catch(() => null);

    if (result?.ok) {
      setDirectNutrition(result);
    }

    await loadParticipantStreakV126M23();
    setNutritionLoading(false);
  }

  useEffect(() => {
    loadDirectNutrition();
    loadCoachTargets();
  }, [participantId]);

  useEffect(() => {
    void loadParticipantStreakV126M23();
  }, [participantId, workoutItems]);

  const latestClinical =
    Array.isArray(clinicalHistory) && clinicalHistory.length > 0
      ? clinicalHistory[0]
      : null;

  // V73: ringkasan harian harus hanya memakai log pada tanggal hari ini.
  // Riwayat terakhir tetap tersedia di tab History, tetapi tidak dibawa ke kartu hari ini.
  const nutritionSourceRows =
    Array.isArray(directNutrition?.logs) && directNutrition.logs.length > 0
      ? directNutrition.logs
      : Array.isArray(nutritionLogs)
        ? nutritionLogs
        : [];
  const todayKeyV73 = todayDate();
  const todayNutritionRowsV73 = nutritionSourceRows.filter(
    (item: any) => nutritionLogDateV73(item) === todayKeyV73,
  );
  const todayCalories = todayNutritionRowsV73.reduce(
    (sum: number, item: any) => sum + nutritionCaloriesValueV73(item),
    0,
  );
  const todayFoodCount = todayNutritionRowsV73.reduce(
    (sum: number, item: any) => {
      const foods = Array.isArray(item?.foods) ? item.foods.length : 0;
      return sum + Math.max(1, foods);
    },
    0,
  );
  const todayMealKeysV73 = new Set(
    todayNutritionRowsV73.map((item: any, index: number) =>
      nutritionMealKeyV73(item, index),
    ),
  );
  const todayRowCount = todayMealKeysV73.size;

  const mealLogs = todayNutritionRowsV73;
  const mealTitle = "Nutrisi Hari Ini";
  const mealSubtitle =
    todayNutritionRowsV73.length > 0
      ? `${fmtNumber(todayCalories, 0)} kkal dari ${fmtNumber(
          todayFoodCount,
          0,
        )} item makanan hari ini`
      : "Belum ada input nutrisi hari ini.";

  const nutritionTarget = asNumber(coachTargets.nutrition_max_calories);
  const workoutTarget = asNumber(coachTargets.workout_min_calories);
  const weightTarget = asNumber(coachTargets.target_weight_kg);
  const stepsTarget = asNumber(
    coachTargets.daily_step_target ||
      participant?.daily_step_target ||
      participant?.step_target ||
      8000,
  );
  const latestWeight = asNumber(
    latestClinical?.weight_kg || latestClinical?.weight || latestClinical?.bb,
  );
  const oldestClinical =
    Array.isArray(clinicalHistory) && clinicalHistory.length > 0
      ? clinicalHistory[clinicalHistory.length - 1]
      : null;
  const baselineWeight = asNumber(
    oldestClinical?.weight_kg ||
      oldestClinical?.weight ||
      oldestClinical?.bb ||
      latestWeight,
  );
  const mealProgress = progressPercent(todayRowCount, 3);
  const nutritionProgress =
    nutritionTarget > 0
      ? progressPercent(todayCalories, nutritionTarget)
      : mealProgress;
  const workoutProgress =
    workoutTarget > 0
      ? progressPercent(totals.workoutCalories || 0, workoutTarget)
      : 0;
  const stepsProgress = progressPercent(totals.steps || 0, stepsTarget);
  const weightProgress =
    weightTarget > 0
      ? weightTargetProgress(latestWeight, baselineWeight, weightTarget)
      : 0;
  const streakNutritionRowsV126M24 =
    Array.isArray(directNutrition?.logs) && directNutrition.logs.length > 0
      ? directNutrition.logs
      : Array.isArray(nutritionLogs)
        ? nutritionLogs
        : [];

  const participantMomentum = useMemo(
    () =>
      buildParticipantMomentumV66(
        streakNutritionRowsV126M24,
        workoutItems || [],
        workoutTarget,
      ),
    [
      JSON.stringify(streakNutritionRowsV126M24),
      JSON.stringify(workoutItems || []),
      workoutTarget,
    ],
  );

  const participantMomentumCanonicalV126M23 = useMemo(() => {
    const serverDays = Array.isArray(participantStreakV126M23?.days)
      ? participantStreakV126M23.days
      : [];

    if (serverDays.length !== 7) return participantMomentum;

    return {
      days: serverDays.map((day: any) => ({
        date: clean(day?.date),
        label: clean(day?.label).slice(0, 3),
        nutritionCount: asNumber(day?.nutrition_count),
        nutritionCalories: asNumber(day?.nutrition_calories),
        workoutCalories: asNumber(day?.workout_calories),
        steps: asNumber(day?.steps),
        success: Boolean(day?.success),
      })),
      currentStreak: asNumber(participantStreakV126M23?.current_streak),
      successDates: Array.isArray(participantStreakV126M23?.success_dates)
        ? participantStreakV126M23.success_dates.map(clean).filter(Boolean)
        : [],
    };
  }, [participantStreakV126M23, participantMomentum]);

  // WELLNESS_PARTICIPANT_CANONICAL_STREAK_UI_V126M23_1
  const googleFitSelectedV126M14 =
    clean(fitnessSettings?.fitness_source)
      .toLowerCase()
      .replace(/-/g, "_") === "google_fit";

  const googleFitActiveCaloriesUnavailable =
    googleFitSelectedV126M14 &&
    (workoutItems || []).some((item: any) => {
      if (!isGoogleFitDailyRow(item) || activityDateKey(item) !== todayKeyV73) {
        return false;
      }

      const raw = activityRawPayloadV72(item);
      const exactActiveCalories = asNumber(
        raw?.google_fit_active_calories_exact ??
          raw?.google_fit_active_calories,
      );
      const exactTotalCalories = googleFitTotalCaloriesValueV73(item);

      return (
        raw?.active_calories_available === false ||
        (!(exactActiveCalories > 0) && exactTotalCalories > 0)
      );
    });

  // WELLNESS_TOTAL_WORKOUT_DISPLAY_V126M31_2
  // Display totals use the merged participant workout history:
  // device (Google Fit / Health Connect) + manual workout.
  // Streak success and current streak remain server-canonical and unchanged.
  const participantMomentumDisplayV126M31 = useMemo(() => {
    const localByDate = new Map(
      (participantMomentum.days || []).map((day: any) => [day.date, day]),
    );
    const localActivityDates = new Set(
      (workoutItems || []).map((item: any) => activityDateKey(item)).filter(Boolean),
    );

    return {
      ...participantMomentumCanonicalV126M23,
      days: (participantMomentumCanonicalV126M23.days || []).map((day: any) => {
        const localDay = localByDate.get(day.date) as any;
        if (!localDay || !localActivityDates.has(day.date)) return day;

        return {
          ...day,
          workoutCalories: asNumber(localDay.workoutCalories),
          steps: asNumber(localDay.steps),
        };
      }),
    };
  }, [
    participantMomentumCanonicalV126M23,
    participantMomentum,
    JSON.stringify(workoutItems || []),
  ]);

  const todayWorkoutBreakdownV126M31 = useMemo(() => {
    const result = {
      googleFit: 0,
      healthConnect: 0,
      strava: 0,
      manual: 0,
      other: 0,
    };

    for (const item of workoutItems || []) {
      if (activityDateKey(item) !== todayKeyV73) continue;

      const raw = activityRawPayloadV72(item);
      const provider = clean(
        item?.source || item?.provider || item?.input_source || raw?.provider,
      )
        .toLowerCase()
        .replace(/-/g, "_");
      const calories = wellnessStreakWorkoutCalories(item);

      if (provider === "google_fit") result.googleFit += calories;
      else if (provider === "health_connect") result.healthConnect += calories;
      else if (provider === "strava") result.strava += calories;
      else if (!provider || provider === "manual" || provider === "google_sheet") {
        result.manual += calories;
      } else {
        result.other += calories;
      }
    }

    return result;
  }, [JSON.stringify(workoutItems || []), todayKeyV73]);

  const todayTotalWorkoutCaloriesV126M31 = asNumber(
    (participantMomentumDisplayV126M31.days || []).find(
      (day: any) => day.date === todayKeyV73,
    )?.workoutCalories,
  );

  const workoutSourceSubtitleV126M31 = [
    todayWorkoutBreakdownV126M31.googleFit > 0
      ? `Google Fit ${fmtNumber(todayWorkoutBreakdownV126M31.googleFit, 0)}`
      : "",
    todayWorkoutBreakdownV126M31.healthConnect > 0
      ? `Health Connect ${fmtNumber(todayWorkoutBreakdownV126M31.healthConnect, 0)}`
      : "",
    todayWorkoutBreakdownV126M31.strava > 0
      ? `Strava ${fmtNumber(todayWorkoutBreakdownV126M31.strava, 0)}`
      : "",
    todayWorkoutBreakdownV126M31.manual > 0
      ? `Manual ${fmtNumber(todayWorkoutBreakdownV126M31.manual, 0)}`
      : "",
    todayWorkoutBreakdownV126M31.other > 0
      ? `Lainnya ${fmtNumber(todayWorkoutBreakdownV126M31.other, 0)}`
      : "",
  ]
    .filter(Boolean)
    .join(" + ") || "Google Fit/device + workout manual";

  return (
    <section className="w-full max-w-full space-y-5 overflow-hidden">
      <CoachNoticeCenter participant={participant} />
      <div className="rounded-[2rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-4">
            <WellnessProfileAvatar
              actorType="participant"
              name={participant?.name || "Peserta"}
              size="lg"
            />
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
          </div>

          <button
            type="button"
            onClick={loadDirectNutrition}
            className="rounded-full bg-slate-950 px-5 py-3 text-xs font-black text-white"
          >
            {nutritionLoading ? "Memuat..." : "Refresh Nutrisi"}
          </button>
        </div>

        {googleFitActiveCaloriesUnavailable ? (
          <div className="mt-5 rounded-[1.5rem] border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold leading-5 text-blue-900">
            Google Fit mengirim kalori total yang dapat mencakup energi basal.
            Sesuai aturan program, kartu <strong>Total Kalori Workout</strong>
            menggabungkan Google Fit/device dan workout manual untuk dibandingkan
            dengan target Coach.
          </div>
        ) : null}

        <div className="mt-5">
          <WellnessMomentumDashboard
            days={participantMomentumDisplayV126M31.days}
            currentStreak={participantMomentumDisplayV126M31.currentStreak}
            successDates={participantMomentumDisplayV126M31.successDates}
            nutritionCount={todayRowCount}
            nutritionCalories={todayCalories}
            workoutCalories={todayTotalWorkoutCaloriesV126M31}
            workoutTitle="Total Kalori Workout"
            workoutSubtitle={workoutSourceSubtitleV126M31}
            workoutTargetEnabled
            steps={asNumber(totals.steps || 0)}
            nutritionTarget={nutritionTarget}
            workoutTarget={workoutTarget}
            stepsTarget={stepsTarget}
            currentWeight={latestWeight}
            baselineWeight={baselineWeight}
            targetWeight={weightTarget}
            bmi={latestClinical?.bmi || null}
            systolic={latestClinical?.systolic || null}
            diastolic={latestClinical?.diastolic || null}
            totalPoints={asNumber(pointSummary?.total_points || 0)}
            healthTalkCount={asNumber(pointSummary?.healthtalk_count || 0)}
            mode="participant"
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
            Source: Supabase {directNutrition.sources.supabase_rows || 0} row |
            Google Sheet {directNutrition.sources.google_sheet_rows || 0} row
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          {mealLogs.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <div className="text-base font-black text-slate-900">
                Belum ada food diary.
              </div>

              <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                Input nutrisi akan muncul di sini setelah data Google Sheet atau
                Supabase terbaca.
              </p>
            </div>
          ) : (
            mealLogs
              .slice(0, 6)
              .map((item: any, index: number) => (
                <PortalMealLogItemV34
                  key={`${item.id || index}-${index}`}
                  item={item}
                />
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
      0,
  );

  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");
  const [notificationPermission, setNotificationPermission] = useState("");
  const [noticeOpen, setNoticeOpen] = useState(false);

  const unreadNotes = notes.filter((note) => !note.is_read);
  const latestNote = notes.length > 0 ? notes[0] : null;
  const hasAlarm = unreadNotes.length > 0;
  const hasHighPriority = unreadNotes.some((note) => note.priority === "high");

  async function loadCoachNotes() {
    if (!participantId) return;

    setLoading(true);

    const result = await fetch(
      `/api/wellness/portal/coach-notes?participant_id=${participantId}`,
      { cache: "no-store" },
    )
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      setNotes(result.notes || []);

      if ((result.unread_count || 0) > 0) {
        setNoticeMessage(`${result.unread_count} catatan coach belum dibaca.`);
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

  // WELLNESS_PARTICIPANT_COACH_NOTICE_DROPDOWN_V64
  const noticeHeading = hasAlarm
    ? "Ada notice dari Coach"
    : notes.length > 0
      ? "Notice dari Coach"
      : "Notice dari Coach";
  const noticeSummary = hasAlarm
    ? `${unreadNotes.length} notice belum dibaca`
    : latestNote?.topic || "Ketuk untuk melihat catatan dan arahan Coach.";

  return (
    <section
      className={`overflow-hidden rounded-[1.5rem] border shadow-lg shadow-slate-200/50 ${
        hasAlarm
          ? hasHighPriority
            ? "border-rose-200 bg-rose-50"
            : "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-white"
      }`}
      data-wellness-coach-notice-dropdown="v64"
    >
      <button
        type="button"
        onClick={() => setNoticeOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5"
        aria-expanded={noticeOpen}
        aria-controls="wellness-coach-notice-content"
      >
        <span
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl ${
            hasAlarm ? "bg-rose-100 text-rose-700" : "bg-teal-50 text-teal-700"
          }`}
          aria-hidden="true"
        >
          🔔
          {hasAlarm ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white ring-2 ring-white">
              {unreadNotes.length > 99 ? "99+" : unreadNotes.length}
            </span>
          ) : null}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black text-slate-950 sm:text-base">
              {noticeHeading}
            </span>
            {hasAlarm ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-rose-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                Baru
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs font-bold text-slate-500 sm:text-sm">
            {noticeSummary}
          </span>
        </span>

        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-lg font-black text-slate-700 shadow-sm transition-transform ${
            noticeOpen ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          ⌄
        </span>
      </button>

      {noticeOpen ? (
        <div
          id="wellness-coach-notice-content"
          className="border-t border-black/5 bg-white/80 px-4 pb-4 pt-3 sm:px-5 sm:pb-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadCoachNotes}
              className="rounded-full bg-slate-100 px-3.5 py-2 text-xs font-black text-slate-700"
            >
              {loading ? "Memuat..." : "Refresh"}
            </button>

            <button
              type="button"
              onClick={enableBrowserNotification}
              className="rounded-full bg-slate-950 px-3.5 py-2 text-xs font-black text-white"
            >
              Aktifkan Notifikasi
            </button>

            {unreadNotes.length > 1 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="rounded-full bg-teal-600 px-3.5 py-2 text-xs font-black text-white"
              >
                Tandai Semua Dibaca
              </button>
            ) : null}
          </div>

          {noticeMessage ? (
            <div
              className={`mt-3 rounded-2xl px-3.5 py-2.5 text-xs font-black leading-5 ${
                hasAlarm
                  ? "bg-rose-50 text-rose-700"
                  : "bg-slate-50 text-slate-600"
              }`}
            >
              {noticeMessage}
            </div>
          ) : null}

          {notificationPermission &&
          notificationPermission !== "unsupported" ? (
            <div className="mt-2 text-[11px] font-bold text-slate-400">
              Status notifikasi: {notificationPermission}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center text-sm font-bold text-slate-400">
              Memuat notice Coach...
            </div>
          ) : notes.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center">
              <div className="text-sm font-black text-slate-900">
                Belum ada notice dari Coach.
              </div>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                Catatan dan target dari Coach akan muncul di sini.
              </p>
            </div>
          ) : (
            <div className="mt-3 grid gap-3">
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
            </div>
          )}

          <button
            type="button"
            onClick={() => setNoticeOpen(false)}
            className="mt-3 w-full rounded-2xl bg-slate-100 px-4 py-3 text-xs font-black text-slate-700"
          >
            Tutup Notice
          </button>
        </div>
      ) : null}
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
// WELLNESS_FOOD_AUTOCOMPLETE_V126M35
function normalizeFoodSuggestionTextV126M35(value: any) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function foodSuggestionScoreV126M35(item: any, rawQuery: string) {
  const query = normalizeFoodSuggestionTextV126M35(rawQuery);
  if (query.length < 2) return 0;

  const name = normalizeFoodSuggestionTextV126M35(
    item?.food_name || item?.name || item?.nama_makanan,
  );
  const category = normalizeFoodSuggestionTextV126M35(
    item?.category || item?.kategori,
  );
  const aliases = normalizeFoodSuggestionTextV126M35(
    item?.aliases || item?.alias || item?.sinonim,
  );
  const combined = [name, aliases, category].filter(Boolean).join(" ");

  if (name === query) return 120;
  if (name.startsWith(query)) return 110;
  if (name.includes(query)) return 100;
  if (query.startsWith(name)) return 95;
  if (aliases.startsWith(query)) return 90;
  if (aliases.includes(query)) return 85;
  if (category.includes(query)) return 70;

  const queryTokens = query.split(" ").filter(Boolean);
  const candidateTokens = combined.split(" ").filter(Boolean);
  const tokenMatch = queryTokens.every((queryToken) =>
    candidateTokens.some(
      (candidateToken) =>
        candidateToken.startsWith(queryToken) ||
        queryToken.startsWith(candidateToken),
    ),
  );

  return tokenMatch ? 60 : 0;
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
  saveNutrition: () => Promise<{ ok: boolean; message: string }>;
  logs: any[];
}) {
  const participantId = Number(
    participant?.id ||
      participant?.participant_id ||
      participant?.wellness_participant_id ||
      form?.participant_id ||
      form?.participantId ||
      form?.wellness_participant_id ||
      0,
  );

  const [foodMaster, setFoodMaster] = useState<any[]>([]);
  const [foodSuggestionOpen, setFoodSuggestionOpen] = useState(false);
  const [portionMap, setPortionMap] = useState<Record<string, string>>({});
  // WELLNESS_NUTRITION_QUANTITY_STEPPER_V126M11_1
  // Quantity is an additional multiplier. Existing portion choices remain unchanged.
  const [quantityMap, setQuantityMap] = useState<Record<string, number>>({});
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
  const [foodMasterLoading, setFoodMasterLoading] = useState(true);
  const [foodMasterMessage, setFoodMasterMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formNotice, setFormNotice] = useState("");
  const [nutritionHistoryOpen, setNutritionHistoryOpen] = useState(false);
  const [nutritionHistoryDate, setNutritionHistoryDate] = useState("");
  const dateFieldRef = useRef<HTMLInputElement | null>(null);
  const mealFieldRef = useRef<HTMLDivElement | null>(null);
  const foodFieldRef = useRef<HTMLTextAreaElement | null>(null);

  const foodText = clean(
    form.food_name ||
      form.foodName ||
      form.meal_text ||
      form.mealText ||
      form.makanan,
  );

  const activeFoodQueryV126M35 = useMemo(() => {
    const fragments = String(form.food_name || "").split(",");
    return clean(fragments[fragments.length - 1] || "");
  }, [form.food_name]);

  const foodSuggestionsV126M35 = useMemo(() => {
    if (activeFoodQueryV126M35.length < 2) return [];

    return (foodMaster || [])
      .map((item: any) => ({
        item,
        score: foodSuggestionScoreV126M35(item, activeFoodQueryV126M35),
      }))
      .filter((entry: any) => entry.score > 0)
      .sort((a: any, b: any) => {
        if (b.score !== a.score) return b.score - a.score;
        return clean(a.item?.food_name).localeCompare(clean(b.item?.food_name));
      })
      .slice(0, 8)
      .map((entry: any) => entry.item);
  }, [activeFoodQueryV126M35, foodMaster]);

  const mealChips = [
    { value: "Breakfast / Sarapan", label: "Sarapan" },
    { value: "Lunch / Makan Siang", label: "Makan Siang" },
    { value: "Dinner / Makan Malam", label: "Malam" },
    { value: "Snack", label: "Snack" },
  ];

   // WELLNESS_FOOD_MASTER_ON_DEMAND_V126M100_2
  // Do NOT download the entire food master into the participant browser.
  // The existing /reference/foods endpoint already supports q search.
  // We keep a small rolling cache only for foods the participant actually types.
  const foodSearchAbortV126M100_2 = useRef<AbortController | null>(null);
  const foodSearchMemoryV126M100_2 = useRef<Map<string, any[]>>(new Map());

  function mergeFoodMasterV126M100_2(rows: any[]) {
    if (!Array.isArray(rows) || rows.length === 0) return;

    setFoodMaster((current) => {
      const byKey = new Map<string, any>();

      for (const item of [...(current || []), ...rows]) {
        const key =
          clean(item?.id) ||
          clean(item?.food_name || item?.name).toLowerCase();

        if (key) byKey.set(key, item);
      }

      const next = Array.from(byKey.values()).slice(-1200);

      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(
            "wellness-food-search-cache-v126m100-2",
            JSON.stringify(next),
          );
        } catch {
          // Cache is optional.
        }
      }

      return next;
    });
  }

  async function loadFoodMaster() {
    setFoodMasterMessage("");

    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem("wellness-food-master-cache-v126k");
        window.sessionStorage.removeItem("wellness-food-master-cache-v82");

        const cached = window.sessionStorage.getItem(
          "wellness-food-search-cache-v126m100-2",
        );
        const cachedRows = cached ? JSON.parse(cached) : [];

        if (Array.isArray(cachedRows) && cachedRows.length > 0) {
          setFoodMaster(cachedRows.slice(-1200));
        }
      } catch {
        // Cache is optional.
      }
    }

    // Initial Nutrition render performs ZERO bulk food-page requests.
    setFoodMasterLoading(false);
  }

  async function searchFoodMasterV126M100_2(
    queries: string[],
    signal: AbortSignal,
  ) {
    const normalizedQueries = Array.from(
      new Set(
        (queries || [])
          .map((value) => clean(value))
          .filter((value) => value.length >= 2)
          .map((value) => value.slice(0, 120)),
      ),
    ).slice(-6);

    if (normalizedQueries.length === 0) {
      setFoodMasterLoading(false);
      return;
    }

    setFoodMasterLoading(true);
    setFoodMasterMessage("");

    try {
      const batches = await Promise.all(
        normalizedQueries.map(async (queryText) => {
          const cacheKey = queryText.toLowerCase();
          const memoryHit = foodSearchMemoryV126M100_2.current.get(cacheKey);

          if (Array.isArray(memoryHit)) return memoryHit;

          const response = await fetch(
            `/api/wellness/reference/foods?q=${encodeURIComponent(queryText)}&page=1&page_size=200`,
            {
              cache: "no-store",
              signal,
            },
          );

          const result = await response.json().catch(() => ({}));

          if (!response.ok || result?.ok === false) {
            throw new Error(
              result?.message ||
                `Master KaloriData untuk "${queryText}" gagal dimuat.`,
            );
          }

          const rows = Array.isArray(result?.foods)
            ? result.foods
            : Array.isArray(result?.data)
              ? result.data
              : [];

          foodSearchMemoryV126M100_2.current.set(cacheKey, rows);
          return rows;
        }),
      );

      if (!signal.aborted) {
        mergeFoodMasterV126M100_2(batches.flat());
      }
    } catch (error: any) {
      if (error?.name !== "AbortError" && !signal.aborted) {
        setFoodMasterMessage(
          error?.message ||
            "Master KaloriData belum dapat dicari.",
        );
      }
    } finally {
      if (!signal.aborted) setFoodMasterLoading(false);
    }
  }

    async function loadDirectNutrition() {
    if (!participantId) return;

    setLoadingHistory(true);

    const result = await fetch(
      `/api/wellness/portal/nutrition-direct?participant_id=${participantId}&t=${Date.now()}`,
      { cache: "no-store" },
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

    return () => {
      foodSearchAbortV126M100_2.current?.abort();
    };
  }, []);

  useEffect(() => {
    const fragments = String(foodText || "")
      .split(",")
      .map((value) => clean(value))
      .filter(Boolean);

    const searchable = fragments.filter((value) => value.length >= 2);

    if (searchable.length === 0) {
      foodSearchAbortV126M100_2.current?.abort();
      setFoodMasterLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      foodSearchAbortV126M100_2.current?.abort();

      const controller = new AbortController();
      foodSearchAbortV126M100_2.current = controller;

      void searchFoodMasterV126M100_2(
        searchable,
        controller.signal,
      );
    }, 280);

    return () => {
      window.clearTimeout(timer);
    };
  }, [foodText]);

  useEffect(() => {
    loadDirectNutrition();
  }, [participantId]);

  useEffect(() => {
    if (!foodText) {
      setPortionMap({});
      setQuantityMap({});
    }
  }, [foodText]);

  const parsedFoods = useMemo(() => {
    return buildAutoFoodBreakdownV29(
      foodText,
      foodMaster,
      portionMap,
      quantityMap,
    );
  }, [foodText, foodMaster, portionMap, quantityMap]);

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
      quantity: item.quantity,
      base_calories: item.base_calories,
      subtotal_calories: item.subtotal_calories,
      match_status: item.match_status,
    }));
  }, [parsedFoods]);

  useEffect(() => {
    const payloadText = JSON.stringify(breakdownPayload);
    const portionText = parsedFoods
      .map(
        (item) =>
          `${item.input_name} ${item.portion_fraction} x ${item.quantity}`,
      )
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

  // WELLNESS_NUTRITION_HISTORY_DROPDOWN_FILTER_V75
  // Riwayat memakai seluruh data yang tersedia. Filter tanggal hanya mengubah
  // tampilan dan tidak menghapus data historis.
  const nutritionHistorySource =
    Array.isArray(directNutrition?.logs) && directNutrition.logs.length > 0
      ? directNutrition.logs
      : Array.isArray(directNutrition?.latest_logs) &&
          directNutrition.latest_logs.length > 0
        ? directNutrition.latest_logs
        : Array.isArray(logs)
          ? logs
          : [];

  const sortedNutritionHistory = [...nutritionHistorySource].sort(
    (left: any, right: any) =>
      nutritionLogDateV73(right).localeCompare(nutritionLogDateV73(left)),
  );

  const historyLogs = nutritionHistoryDate
    ? sortedNutritionHistory.filter(
        (item: any) => nutritionLogDateV73(item) === nutritionHistoryDate,
      )
    : sortedNutritionHistory;

  const visibleHistoryLogs = nutritionHistoryDate
    ? historyLogs
    : historyLogs.slice(0, 8);

  async function submitNutritionSmart() {
    const errors: Record<string, string> = {};
    if (!clean(form.log_date)) errors.log_date = "Tanggal belum diisi.";
    if (!clean(form.meal_type)) errors.meal_type = "Waktu makan belum dipilih.";
    if (!foodText) errors.food_name = "Nama makanan belum diisi.";

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const missing = Object.values(errors);
      setFormNotice(`Data belum lengkap: ${missing.join(" ")}`);
      const firstKey = Object.keys(errors)[0];
      window.setTimeout(() => {
        if (firstKey === "log_date") dateFieldRef.current?.focus();
        if (firstKey === "meal_type") {
          mealFieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        if (firstKey === "food_name") foodFieldRef.current?.focus();
      }, 30);
      return;
    }

    setSavingSmart(true);
    setFormNotice("Menyimpan laporan nutrisi...");
    const result = await saveNutrition();
    setFormNotice(result.message);
    if (result.ok) {
      setFieldErrors({});
      setPortionMap({});
      setQuantityMap({});
      void loadDirectNutrition();
    }
    setSavingSmart(false);
  }

  function changePortion(key: string, value: string) {
    setPortionMap((previous) => ({
      ...previous,
      [key]: value,
    }));
    setFieldErrors((previous) => {
      const next = { ...previous };
      delete next.portion;
      return next;
    });
  }

  function changeQuantity(key: string, delta: number) {
    setQuantityMap((previous) => {
      const current = Math.max(1, Number(previous[key] || 1));
      const next = Math.min(99, Math.max(1, current + delta));

      return {
        ...previous,
        [key]: next,
      };
    });
  }

  function chooseFoodSuggestionV126M35(item: any) {
    const name = clean(item?.food_name || item?.name || item?.nama_makanan);
    if (!name) return;

    const completedItems = String(form.food_name || "")
      .split(",")
      .slice(0, -1)
      .map(clean)
      .filter(Boolean);

    completedItems.push(name);
    setValue("food_name", completedItems.join(", "));
    setFieldErrors((previous) => ({ ...previous, food_name: "" }));
    setFoodSuggestionOpen(false);
    window.setTimeout(() => foodFieldRef.current?.focus(), 0);
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
              Ketik makanan dengan koma. Sistem otomatis membuat breakdown dan
              estimasi kalori.
            </p>
          </div>

          <div className="shrink-0 rounded-[1.3rem] bg-teal-50 px-4 py-3 text-right">
            <div className="text-[10px] font-black uppercase tracking-wide text-teal-700/70">
              Estimasi
            </div>
            <div className="text-xl font-black text-teal-900">
              {fmtNumber(totalEstimatedCalories, 0)}
            </div>
            <div className="text-[10px] font-bold text-teal-700/70">kkal</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-2 text-xs font-black text-slate-700">
            <span className="flex items-center gap-2">
              Tanggal
              <span className="rounded-full bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-600">
                Required
              </span>
            </span>
            <input
              ref={dateFieldRef}
              type="date"
              value={form.log_date}
              onChange={(e) => {
                setValue("log_date", e.target.value);
                setFieldErrors((previous) => ({ ...previous, log_date: "" }));
              }}
              aria-invalid={Boolean(fieldErrors.log_date)}
              className={`${fieldClass} w-full text-sm ${
                fieldErrors.log_date ? "border-rose-400 ring-4 ring-rose-50" : ""
              }`}
            />
            {fieldErrors.log_date ? (
              <span className="text-[10px] font-bold text-rose-600">
                {fieldErrors.log_date}
              </span>
            ) : null}
          </label>

          <div
            ref={mealFieldRef}
            className={`grid gap-2 rounded-2xl ${
              fieldErrors.meal_type ? "border border-rose-300 bg-rose-50/40 p-3" : ""
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-black text-slate-700">
              Waktu Makan
              <span className="rounded-full bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-600">
                Required
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {mealChips.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setValue("meal_type", item.value);
                    setFieldErrors((previous) => ({ ...previous, meal_type: "" }));
                  }}
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
            {fieldErrors.meal_type ? (
              <span className="text-[10px] font-bold text-rose-600">
                {fieldErrors.meal_type}
              </span>
            ) : null}
          </div>

          <div className="grid gap-2 text-xs font-black text-slate-700">
            <span className="flex items-center gap-2">
              Nama Makanan
              <span className="rounded-full bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-600">
                Required
              </span>
            </span>
            <span className="rounded-xl bg-teal-50 px-3 py-2 text-[11px] font-bold leading-5 text-teal-800">
              Ketik minimal 2 huruf. Pilih referensi yang muncul atau lanjutkan input manual.
            </span>
            <div className="relative">
              <textarea
                ref={foodFieldRef}
                value={form.food_name}
                onFocus={() => setFoodSuggestionOpen(true)}
                onBlur={() =>
                  window.setTimeout(() => setFoodSuggestionOpen(false), 180)
                }
                onChange={(e) => {
                  setValue("food_name", e.target.value);
                  setFoodSuggestionOpen(true);
                  setFieldErrors((previous) => ({ ...previous, food_name: "" }));
                }}
                aria-invalid={Boolean(fieldErrors.food_name)}
                aria-autocomplete="list"
                className={`${fieldClass} min-h-[92px] w-full resize-none text-sm ${
                  fieldErrors.food_name ? "border-rose-400 ring-4 ring-rose-50" : ""
                }`}
                placeholder="Contoh: Nasi goreng, Ayam bakar"
              />

              {foodSuggestionOpen &&
              activeFoodQueryV126M35.length >= 2 &&
              foodSuggestionsV126M35.length > 0 ? (
                <div
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-teal-100 bg-white p-2 shadow-2xl shadow-slate-300/50"
                >
                  <div className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-teal-700">
                    Referensi makanan
                  </div>
                  {foodSuggestionsV126M35.map((item: any, index: number) => {
                    const name = clean(
                      item?.food_name || item?.name || item?.nama_makanan,
                    );
                    const category = clean(item?.category || item?.kategori);
                    const calories = Number(
                      item?.calories || item?.calorie || item?.kalori || 0,
                    );

                    return (
                      <button
                        key={`${name}-${item?.id || index}`}
                        type="button"
                        role="option"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => chooseFoodSuggestionV126M35(item)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-teal-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-slate-800">
                            {name}
                          </span>
                          <span className="mt-1 block truncate text-[10px] font-bold text-slate-400">
                            {category || "Referensi master makanan"}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-700">
                          {fmtNumber(calories, 0)} kkal/porsi
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {fieldErrors.food_name ? (
              <span className="text-[10px] font-bold text-rose-600">
                {fieldErrors.food_name}
              </span>
            ) : null}
          </div>

          {foodMasterLoading ? (
            <div className="rounded-2xl bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-700">
              Memuat Master KaloriData agar estimasi porsi akurat...
            </div>
          ) : foodMasterMessage ? (
            <div className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
              {foodMasterMessage}
            </div>
          ) : null}

          <CompactAutoFoodBreakdownV43
            foods={parsedFoods}
            onChangePortion={changePortion}
            onChangeQuantity={changeQuantity}
          />

          <label className="grid gap-2 text-xs font-black text-slate-700">
            Upload Foto
            <div className="flex items-center gap-3 rounded-[1.4rem] border border-dashed border-teal-200 bg-[#f4fbfa] p-3">
              <label className="shrink-0 cursor-pointer rounded-2xl bg-white px-4 py-3 text-xs font-black text-teal-700 shadow-sm">
                Pilih Foto
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setPhoto(event.target.files?.[0] || null)
                  }
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
            Peserta tidak perlu mengisi kalori manual. Sistem mencocokkan
            makanan dengan Master KaloriData.
          </div>

          {formNotice ? (
            <div
              className={`rounded-[1.3rem] px-4 py-3 text-xs font-black leading-5 ${
                /berhasil|tersimpan/i.test(formNotice)
                  ? "bg-emerald-50 text-emerald-800"
                  : /belum lengkap|gagal/i.test(formNotice)
                    ? "bg-rose-50 text-rose-700"
                    : "bg-blue-50 text-blue-800"
              }`}
              role="status"
            >
              {formNotice}
            </div>
          ) : null}

          <button
            type="button"
            onClick={submitNutritionSmart}
            disabled={savingSmart || foodMasterLoading}
            className="w-full rounded-[1.4rem] bg-teal-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-teal-100 disabled:opacity-50"
          >
            {savingSmart
              ? "Menyimpan..."
              : foodMasterLoading
                ? "Menyiapkan KaloriData..."
                : "Simpan Nutrisi"}
          </button>
        </div>
      </div>

      <div className="rounded-[1.8rem] border border-white bg-white p-4 shadow-lg shadow-slate-200/50">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setNutritionHistoryOpen((previous) => !previous)}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[1.4rem] bg-slate-50 px-4 py-4 text-left transition active:scale-[0.99]"
            aria-expanded={nutritionHistoryOpen}
          >
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Meal History
              </div>
              <div className="mt-1 truncate text-lg font-black text-slate-950">
                Riwayat Nutrisi
              </div>
              <div className="mt-1 text-[11px] font-bold text-slate-500">
                {nutritionHistoryDate
                  ? `${historyLogs.length} data pada tanggal terpilih`
                  : `${sortedNutritionHistory.length} data tersimpan`}
              </div>
            </div>

            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xl font-black text-slate-700 shadow-sm">
              {nutritionHistoryOpen ? "−" : "+"}
            </span>
          </button>

          <button
            type="button"
            onClick={loadDirectNutrition}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-base font-black text-teal-700"
            aria-label="Refresh riwayat nutrisi"
          >
            {loadingHistory ? "…" : "↻"}
          </button>
        </div>

        {nutritionHistoryOpen ? (
          <div className="mt-4">
            <div className="rounded-[1.4rem] border border-teal-100 bg-[#f4fbfa] p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="grid gap-2 text-[11px] font-black text-slate-700">
                  Filter Tanggal
                  <input
                    type="date"
                    value={nutritionHistoryDate}
                    onChange={(event) =>
                      setNutritionHistoryDate(event.target.value)
                    }
                    className={`${fieldClass} w-full bg-white text-sm`}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setNutritionHistoryDate("")}
                  disabled={!nutritionHistoryDate}
                  className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-teal-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Semua Tanggal
                </button>
              </div>

              {directNutrition?.sources ? (
                <p className="mt-3 text-[10px] font-bold leading-5 text-slate-500">
                  Google Sheet{" "}
                  {directNutrition.sources.google_sheet_rows || 0} data
                </p>
              ) : null}
            </div>

            <div className="mt-3 max-h-[30rem] space-y-3 overflow-y-auto pr-1">
              {visibleHistoryLogs.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-bold text-slate-400">
                  {nutritionHistoryDate
                    ? "Tidak ada input nutrisi pada tanggal tersebut."
                    : "Belum ada input nutrisi."}
                </div>
              ) : (
                visibleHistoryLogs.map((item: any, index: number) => (
                  <CompactNutritionHistoryItemV43
                    key={`${item.id || index}-${index}`}
                    item={item}
                  />
                ))
              )}
            </div>

            {!nutritionHistoryDate &&
            historyLogs.length > visibleHistoryLogs.length ? (
              <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-center text-[11px] font-bold text-slate-500">
                Menampilkan 8 data terbaru. Pilih tanggal untuk melihat data
                tertentu.
              </div>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNutritionHistoryOpen(true)}
            className="mt-3 w-full rounded-[1.3rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black text-slate-500"
          >
            Buka riwayat dan filter berdasarkan tanggal
          </button>
        )}
      </div>
    </section>
  );
}

function CompactAutoFoodBreakdownV43({
  foods,
  onChangePortion,
  onChangeQuantity,
}: {
  foods: any[];
  onChangePortion: (key: string, value: string) => void;
  onChangeQuantity?: (key: string, delta: number) => void; // WELLNESS_NUTRITION_QUANTITY_OPTIONAL_V126M11_4
}) {
  const total = foods.reduce(
    (sum, item) => sum + Number(item.subtotal_calories || 0),
    0,
  );

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
          <div className="flex items-center gap-2 text-xs font-black text-slate-950">
            Auto Breakdown
            <span className="rounded-full bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-600">
              Porsi Required
            </span>
          </div>
          <div className="text-[11px] font-bold text-slate-500">
            {foods.length} item makanan · kalori dihitung dari 1 porsi × porsi dipilih × jumlah
          </div>
        </div>

        <div className="rounded-full bg-white px-3 py-2 text-[11px] font-black text-teal-700">
          {fmtNumber(total, 0)} kkal
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {foods.map((item) => (
          <div
            key={item.key}
            className="rounded-[1.2rem] bg-white p-3 shadow-sm"
          >
            <div className="text-sm font-black text-slate-950">
              {item.input_name}
            </div>

            <div className="mt-1 text-[11px] font-bold leading-5 text-slate-500">
              {item.match_status === "matched"
                ? `${item.matched_name} | ${item.category || "Umum"} | 1 porsi ${fmtNumber(item.base_calories, 0)} kkal`
                : "Belum match di Master KaloriData"}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={item.portion_fraction}
                onChange={(event) =>
                  onChangePortion(item.key, event.target.value)
                }
                className="min-w-[9rem] flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-black text-slate-700 outline-none"
              >
                <option value="1/4">1/4 porsi</option>
                <option value="1/3">1/3 porsi</option>
                <option value="1/2">1/2 porsi</option>
                <option value="1">1 porsi</option>
              </select>

              {onChangeQuantity ? (
                <div
                  className="flex h-11 shrink-0 overflow-hidden rounded-2xl border border-slate-300 bg-white"
                  aria-label={`Jumlah ${item.input_name}`}
                >
                  <button
                    type="button"
                    onClick={() => onChangeQuantity(item.key, -1)}
                    disabled={Number(item.quantity || 1) <= 1}
                    aria-label={`Kurangi jumlah ${item.input_name}`}
                    className="grid h-full w-10 place-items-center bg-slate-700 text-lg font-black text-white transition active:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    -
                  </button>

                  <div className="grid min-w-11 place-items-center bg-white px-3 text-sm font-black text-slate-900">
                    {Number(item.quantity || 1)}
                  </div>

                  <button
                    type="button"
                    onClick={() => onChangeQuantity(item.key, 1)}
                    disabled={Number(item.quantity || 1) >= 99}
                    aria-label={`Tambah jumlah ${item.input_name}`}
                    className="grid h-full w-10 place-items-center bg-slate-700 text-lg font-black text-white transition active:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              ) : null}

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
  const photo = normalizeImageUrlV37
    ? normalizeImageUrlV37(item.photo_url)
    : clean(item.photo_url);
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
  const total = foods.reduce(
    (sum, item) => sum + Number(item.subtotal_calories || 0),
    0,
  );

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
                  onChange={(event) =>
                    onChangePortion(item.key, event.target.value)
                  }
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
  portionMap: Record<string, string>,
  quantityMap: Record<string, number> = {},
) { // WELLNESS_NUTRITION_QUANTITY_COMPAT_V126M11_2
  const tokens = splitFoodInputV29(foodText);
  const masterIndex = buildFoodMasterIndexV29(foodMaster);

  return tokens.map((token) => {
    const key = normalizeFoodTextV29(token);
    const matched = matchFoodMasterV29(token, masterIndex);
    const category = matched?.category || guessFoodCategoryV29(token);
    const defaultPortion = defaultPortionByCategoryV29(category);
    const portionFraction = portionMap[key] || defaultPortion;
    const multiplier = portionMultiplierV29(portionFraction);
    const quantity = Math.max(1, Number(quantityMap[key] || 1));
    const baseCalories = Number(matched?.calories || 0);
    const subtotal = Math.round(baseCalories * multiplier * quantity);

    return {
      key,
      input_name: token,
      matched_name: matched?.name || "",
      category,
      portion_fraction: portionFraction,
      portion_multiplier: multiplier,
      quantity,
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

    const names = [row.food_name, row.name, ...aliases]
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
  }>,
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
  const smartwatchModeV126M50B3 = form.calculation_mode === "smartwatch";
  // WELLNESS_MASTER_WORKOUT_LIVE_CALCULATION_V126M50B_4
  const [masterPreviewV126M50B4, setMasterPreviewV126M50B4] = useState<any>(null);
  const [masterPreviewLoadingV126M50B4, setMasterPreviewLoadingV126M50B4] = useState(false);
  const [masterPreviewErrorV126M50B4, setMasterPreviewErrorV126M50B4] = useState("");

  useEffect(() => {
    if (smartwatchModeV126M50B3) {
      setMasterPreviewV126M50B4(null);
      setMasterPreviewErrorV126M50B4("");
      setMasterPreviewLoadingV126M50B4(false);
      return;
    }

    const duration = Number(form.duration_minutes || 0);
    const activityType = clean(form.activity_type);
    const activityName = clean(form.activity_name);
    if (!activityType || !Number.isFinite(duration) || duration <= 0) {
      setMasterPreviewV126M50B4(null);
      setMasterPreviewErrorV126M50B4("");
      setMasterPreviewLoadingV126M50B4(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setMasterPreviewLoadingV126M50B4(true);
        setMasterPreviewErrorV126M50B4("");
        const params = new URLSearchParams({
          calculate: "master",
          activity_type: activityType,
          activity_name: activityName,
          duration_minutes: String(duration),
        });
        const distance = clean(form.distance_km);
        if (distance) params.set("distance_km", distance);

        const response = await fetch(
          `/api/wellness/participant/workout?${params.toString()}`,
          { cache: "no-store" },
        );
        const result = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok || result?.ok !== true) {
          setMasterPreviewV126M50B4(null);
          setMasterPreviewErrorV126M50B4(
            result?.message || "Perhitungan Master Workout belum tersedia.",
          );
          return;
        }
        setMasterPreviewV126M50B4(result);
      } catch (error: any) {
        if (!cancelled) {
          setMasterPreviewV126M50B4(null);
          setMasterPreviewErrorV126M50B4(
            error?.message || "Gagal menghitung preview Master Workout.",
          );
        }
      } finally {
        if (!cancelled) setMasterPreviewLoadingV126M50B4(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    smartwatchModeV126M50B3,
    form.activity_type,
    form.activity_name,
    form.duration_minutes,
    form.distance_km,
  ]);

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black">Input Workout Manual</h2>
      <p className="mt-1 text-sm font-bold text-slate-500">
        Sumber input tetap Manual Peserta. Pilih apakah kalori dihitung otomatis
        oleh sistem dari Master Workout atau diisi dari ringkasan smartwatch.
      </p>

      {/* WELLNESS_WORKOUT_CALCULATION_MODE_V126M50B_3 */}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <label className={`cursor-pointer rounded-2xl border p-4 ${!smartwatchModeV126M50B3 ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
          <div className="flex items-start gap-3">
            <input
              type="radio"
              name="workout-calculation-mode"
              checked={!smartwatchModeV126M50B3}
              onChange={() => setValue("calculation_mode", "manual_master")}
              className="mt-1 h-4 w-4 accent-emerald-600"
            />
            <div>
              <div className="text-sm font-black text-slate-900">Hitung otomatis dari Master Workout</div>
              <div className="mt-1 text-xs font-bold leading-5 text-slate-500">
                Sumber input tetap Manual. Kalori Aktif dihitung otomatis dari master aktivitas (kalori/km atau MET) dan data peserta.
              </div>
            </div>
          </div>
        </label>

        <label className={`cursor-pointer rounded-2xl border p-4 ${smartwatchModeV126M50B3 ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white"}`}>
          <div className="flex items-start gap-3">
            <input
              type="radio"
              name="workout-calculation-mode"
              checked={smartwatchModeV126M50B3}
              onChange={() => setValue("calculation_mode", "smartwatch")}
              className="mt-1 h-4 w-4 accent-sky-600"
            />
            <div>
              <div className="text-sm font-black text-slate-900">Ambil dari Smartwatch</div>
              <div className="mt-1 text-xs font-bold leading-5 text-slate-500">
                Isi angka sesuai ringkasan Mi Fitness, Garmin, Samsung Health, Apple Watch, atau perangkat lain.
              </div>
            </div>
          </div>
        </label>
      </div>

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
            placeholder="Contoh: Jalan pagi, Lari outdoor, gym upper body"
          />
        </Input>

        <Input label="Durasi — menit">
          <input
            type="number"
            min="0"
            value={form.duration_minutes}
            onChange={(e) => setValue("duration_minutes", e.target.value)}
            className={fieldClass}
            placeholder="menit"
          />
        </Input>

        {smartwatchModeV126M50B3 ? (
          <Input label="Durasi — detik">
            <input
              type="number"
              min="0"
              max="59"
              value={form.duration_seconds}
              onChange={(e) => setValue("duration_seconds", e.target.value)}
              className={fieldClass}
              placeholder="0-59"
            />
          </Input>
        ) : null}

        <Input label="Jarak">
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.distance_km}
            onChange={(e) => setValue("distance_km", e.target.value)}
            className={fieldClass}
            placeholder="km, opsional"
          />
        </Input>

        <Input label="Langkah">
          <input
            type="number"
            min="0"
            step="1"
            value={form.steps}
            onChange={(e) => setValue("steps", e.target.value)}
            className={fieldClass}
            placeholder="opsional"
          />
        </Input>

        {smartwatchModeV126M50B3 ? (
          <>
            <Input label="Kalori aktif (kkal) — dipakai target & grafik">
              <input
                type="number"
                min="0"
                step="1"
                value={form.active_calories}
                onChange={(e) => setValue("active_calories", e.target.value)}
                className={`${fieldClass} border-emerald-200 bg-emerald-50/40`}
                placeholder="Contoh: 152"
              />
            </Input>

            <Input label="Kalori total (kkal) — informasi">
              <input
                type="number"
                min="0"
                step="1"
                value={form.total_calories}
                onChange={(e) => setValue("total_calories", e.target.value)}
                className={fieldClass}
                placeholder="Contoh: 187"
              />
            </Input>

            <Input label="HR rata-rata (BPM)">
              <input
                type="number"
                min="0"
                step="1"
                value={form.average_heart_rate}
                onChange={(e) => setValue("average_heart_rate", e.target.value)}
                className={fieldClass}
                placeholder="Contoh: 148"
              />
            </Input>

            <Input label="HR maksimal (BPM)">
              <input
                type="number"
                min="0"
                step="1"
                value={form.max_heart_rate}
                onChange={(e) => setValue("max_heart_rate", e.target.value)}
                className={fieldClass}
                placeholder="Contoh: 169"
              />
            </Input>

            <Input label="Sumber / device">
              <input
                value={form.device_source}
                onChange={(e) => setValue("device_source", e.target.value)}
                className={fieldClass}
                placeholder="Contoh: Mi Fitness, Garmin, Samsung Health"
              />
            </Input>
          </>
        ) : null}

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

      {!smartwatchModeV126M50B3 ? (
        <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-wide text-emerald-700">
                Hasil Sistem · Read Only
              </div>
              <div className="mt-1 text-sm font-black text-slate-900">
                Kalori Aktif dari Master Workout
              </div>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
              <div className="text-2xl font-black text-emerald-700">
                {masterPreviewLoadingV126M50B4
                  ? "..."
                  : masterPreviewV126M50B4?.active_calories != null
                    ? `${Number(masterPreviewV126M50B4.active_calories).toLocaleString("id-ID")} kkal`
                    : "-"}
              </div>
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                dipakai target & grafik
              </div>
            </div>
          </div>

          {masterPreviewErrorV126M50B4 ? (
            <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
              {masterPreviewErrorV126M50B4}
            </div>
          ) : masterPreviewV126M50B4 ? (
            <div className="mt-4 grid gap-2 text-xs font-bold text-slate-600 md:grid-cols-2">
              <div>Sumber input: <b className="text-slate-900">Manual Peserta</b></div>
              <div>Master: <b className="text-slate-900">{masterPreviewV126M50B4.activity_reference_name || "Fallback MET existing"}</b></div>
              <div>Metode: <b className="text-slate-900">{masterPreviewV126M50B4.calorie_method || "-"}</b></div>
              <div>BB dipakai: <b className="text-slate-900">{masterPreviewV126M50B4.participant_weight_kg_used || "-"} kg</b></div>
              <div>MET: <b className="text-slate-900">{masterPreviewV126M50B4.met_used ?? "-"}</b></div>
              <div>Kalori/km: <b className="text-slate-900">{masterPreviewV126M50B4.calories_per_km_used ?? "-"}</b></div>
              {masterPreviewV126M50B4.warning ? (
                <div className="md:col-span-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
                  {masterPreviewV126M50B4.warning}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 text-xs font-bold text-emerald-900">
              Isi jenis aktivitas dan durasi untuk melihat hasil kalkulasi otomatis.
            </div>
          )}
          <div className="mt-3 text-[11px] font-bold leading-5 text-emerald-900">
            Nilai ini bukan field bebas. Saat Simpan Workout, backend menghitung ulang dari master agar hasil tersimpan tetap konsisten.
          </div>
        </div>
      ) : null}

      <div className={`mt-5 rounded-2xl p-4 text-xs font-bold leading-5 ${smartwatchModeV126M50B3 ? "bg-sky-50 text-sky-900" : "bg-emerald-50 text-emerald-900"}`}>
        {smartwatchModeV126M50B3 ? (
          <>Kalori Aktif dari smartwatch tetap menjadi nilai canonical workout untuk target, poin, total workout, dan grafik. Kalori Total serta HR hanya informasi perangkat.</>
        ) : (
          <>Sumber workout tetap Manual Peserta. Perhitungannya memakai Master Workout existing; Kalori Aktif hasil sistem tetap masuk ke fungsi target, poin, total workout, dan grafik yang sudah ada.</>
        )}
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
            Catat kehadiran seminar, edukasi kesehatan, atau aktivitas
            pembelajaran wellness.
          </p>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[250px_1fr] md:p-6">
          <div>
            <label className="block cursor-pointer rounded-[2rem] border border-dashed border-teal-200 bg-[#f4fbfa] p-5 text-center transition hover:bg-teal-50">
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(event) =>
                  setEvidence(event.target.files?.[0] || null)
                }
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
  const original =
    raw?.original_payload || raw?.original || raw?.diagnostic || {};

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
  return activityCaloriesValue(item);
}

// WELLNESS_NUTRITION_CANONICAL_DEDUPE_SAFE_DELETE_V126M1
function nutritionCanonicalRawV126M1(
  item: any,
) {
  const raw =
    item?.raw_payload;

  if (
    raw &&
    typeof raw === "object"
  ) {
    return raw;
  }

  if (
    typeof raw === "string"
  ) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  return {};
}

function nutritionCanonicalSubmissionV126M1(
  item: any,
) {
  const raw =
    nutritionCanonicalRawV126M1(
      item,
    );

  return clean(
    item?._submission_id ||
      item?.submission_id ||
      item?.submissionId ||
      raw?.submission_id ||
      raw?.submissionId ||
      raw?.google_sheet
        ?.submission_id ||
      raw?.google_sheet
        ?.submissionId,
  );
}

function nutritionCanonicalRowV126M1(
  item: any,
) {
  const raw =
    nutritionCanonicalRawV126M1(
      item,
    );

  const value =
    Number(
      item?._google_sheet_row_number ||
        item?.google_sheet_row_number ||
        item?.sheet_row_number ||
        item?.row_number ||
        item?._rowNumber ||
        raw?._rowNumber ||
        raw?.google_sheet
          ?.rowNumber ||
        raw?.google_sheet
          ?.row_number ||
        0,
    );

  return Number.isFinite(value) &&
    value > 0
    ? value
    : 0;
}

function nutritionCanonicalTextV126M1(
  value: any,
) {
  return clean(value)
    .toLowerCase()
    .replace(
      /[^a-z0-9\u00c0-\u024f\u1e00-\u1eff]+/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function nutritionCanonicalMealV126M1(
  item: any,
) {
  const text =
    nutritionCanonicalTextV126M1(
      item?.meal_type ||
        item?.meal_time ||
        item?.category,
    );

  if (
    text.includes("breakfast") ||
    text.includes("sarapan") ||
    text === "pagi"
  ) {
    return "breakfast";
  }

  if (
    text.includes("lunch") ||
    text.includes("siang")
  ) {
    return "lunch";
  }

  if (
    text.includes("dinner") ||
    text.includes("malam")
  ) {
    return "dinner";
  }

  if (
    text.includes("snack") ||
    text.includes("camilan")
  ) {
    return "snack";
  }

  return text;
}

function nutritionCanonicalTitleV126M1(
  item: any,
) {
  return nutritionCanonicalTextV126M1(
    item?.food_name ||
      item?.meal_text ||
      item?.detected_foods ||
      nutritionCanonicalRawV126M1(
        item,
      )?.["Add Options"],
  );
}

function nutritionCanonicalDateV126M1(
  item: any,
) {
  return nutritionLogDateV73(
    item,
  );
}

function nutritionCanonicalCaloriesV126M1(
  item: any,
) {
  return asNumber(
    item?.calories ??
      item?.total_calories ??
      item?.estimated_calories,
  );
}

function nutritionCanonicalTitlesMatchV126M1(
  left: string,
  right: string,
) {
  if (!left || !right) {
    return true;
  }

  return (
    left === right ||
    left.includes(right) ||
    right.includes(left)
  );
}

function nutritionCanonicalRowsMatchV126M1(
  left: any,
  right: any,
) {
  const leftSubmission =
    nutritionCanonicalSubmissionV126M1(
      left,
    );

  const rightSubmission =
    nutritionCanonicalSubmissionV126M1(
      right,
    );

  if (
    leftSubmission &&
    rightSubmission
  ) {
    return (
      leftSubmission ===
      rightSubmission
    );
  }

  if (
    nutritionCanonicalDateV126M1(
      left,
    ) !==
    nutritionCanonicalDateV126M1(
      right,
    )
  ) {
    return false;
  }

  const leftMeal =
    nutritionCanonicalMealV126M1(
      left,
    );

  const rightMeal =
    nutritionCanonicalMealV126M1(
      right,
    );

  if (
    leftMeal &&
    rightMeal &&
    leftMeal !== rightMeal
  ) {
    return false;
  }

  const leftCalories =
    nutritionCanonicalCaloriesV126M1(
      left,
    );

  const rightCalories =
    nutritionCanonicalCaloriesV126M1(
      right,
    );

  if (
    leftCalories > 0 &&
    rightCalories > 0 &&
    Math.abs(
      leftCalories -
        rightCalories,
    ) > 1
  ) {
    return false;
  }

  return nutritionCanonicalTitlesMatchV126M1(
    nutritionCanonicalTitleV126M1(
      left,
    ),
    nutritionCanonicalTitleV126M1(
      right,
    ),
  );
}

function canonicalNutritionHistoryV126M1(
  rows: any[] = [],
) {
  const sheetRows =
    (rows || []).filter(
      (item: any) =>
        clean(
          item?.source,
        ).toLowerCase() ===
        "google_sheet",
    );

  const supabaseRows =
    (rows || []).filter(
      (item: any) =>
        clean(
          item?.source,
        ).toLowerCase() ===
        "supabase",
    );

  const otherRows =
    (rows || []).filter(
      (item: any) =>
        ![
          "google_sheet",
          "supabase",
        ].includes(
          clean(
            item?.source,
          ).toLowerCase(),
        ),
    );

  const usedSupabase =
    new Set<number>();

  const merged =
    sheetRows.map(
      (
        sheet: any,
        sheetIndex: number,
      ) => {
        const supabaseIndex =
          supabaseRows.findIndex(
            (
              mirror: any,
              index: number,
            ) =>
              !usedSupabase.has(
                index,
              ) &&
              nutritionCanonicalRowsMatchV126M1(
                sheet,
                mirror,
              ),
          );

        if (
          supabaseIndex < 0
        ) {
          return {
            ...sheet,
            _canonical_source:
              "google_sheet",
            _google_sheet_row_number:
              nutritionCanonicalRowV126M1(
                sheet,
              ),
            _submission_id:
              nutritionCanonicalSubmissionV126M1(
                sheet,
              ),
          };
        }

        usedSupabase.add(
          supabaseIndex,
        );

        const mirror =
          supabaseRows[
            supabaseIndex
          ];

        return {
          ...mirror,
          ...sheet,
          id:
            mirror?.id ||
            sheet?.id ||
            `nutrition-${sheetIndex}`,
          source:
            "google_sheet_supabase",
          _canonical_source:
            "google_sheet_supabase",
          _supabase_id:
            Number(
              mirror?.id,
            ) || null,
          _google_sheet_row_number:
            nutritionCanonicalRowV126M1(
              sheet,
            ) ||
            nutritionCanonicalRowV126M1(
              mirror,
            ) ||
            null,
          _submission_id:
            nutritionCanonicalSubmissionV126M1(
              sheet,
            ) ||
            nutritionCanonicalSubmissionV126M1(
              mirror,
            ) ||
            null,
          photo_url:
            sheet?.photo_url ||
            mirror?.photo_url ||
            null,
        };
      },
    );

  supabaseRows.forEach(
    (
      row: any,
      index: number,
    ) => {
      if (
        usedSupabase.has(index)
      ) {
        return;
      }

      merged.push({
        ...row,
        _canonical_source:
          "supabase",
        _supabase_id:
          Number(row?.id) ||
          null,
        _google_sheet_row_number:
          nutritionCanonicalRowV126M1(
            row,
          ) ||
          null,
        _submission_id:
          nutritionCanonicalSubmissionV126M1(
            row,
          ) ||
          null,
      });
    },
  );

  return [
    ...merged,
    ...otherRows,
  ].sort(
    (
      left: any,
      right: any,
    ) =>
      clean(
        right?.created_at ||
          right?.updated_at ||
          right?.log_date,
      ).localeCompare(
        clean(
          left?.created_at ||
            left?.updated_at ||
            left?.log_date,
        ),
      ),
  );
}


// WELLNESS_NUTRITION_EDIT_MATCH_INPUT_FORM_V126M7
function nutritionMealValueV126M7(value: any) {
  const text = clean(value).toLowerCase();

  if (text.includes("breakfast") || text.includes("sarapan")) {
    return "Breakfast / Sarapan";
  }
  if (text.includes("lunch") || text.includes("siang")) {
    return "Lunch / Makan Siang";
  }
  if (text.includes("dinner") || text.includes("malam")) {
    return "Dinner / Makan Malam";
  }
  if (text.includes("snack") || text.includes("camilan")) {
    return "Snack";
  }

  return clean(value);
}

function nutritionEditSeedV126M7(item: any, raw: any) {
  const addOptions = clean(
    raw?.["Add Options"] ||
      item?.food_name ||
      item?.meal_text ||
      item?.title,
  );

  let foodName = clean(
    item?.original_food_name ||
      raw?.original_food_name ||
      raw?.food_name,
  );
  let portionText = clean(
    item?.portion ||
      item?.portion_breakdown ||
      raw?.portion ||
      raw?.portion_breakdown,
  );

  if (!foodName) {
    const separatorIndex = addOptions.lastIndexOf(" - ");
    const tail =
      separatorIndex >= 0
        ? clean(addOptions.slice(separatorIndex + 3))
        : "";

    if (
      separatorIndex > 0 &&
      /(?:^|[\s,;])(1\/4|1\/3|1\/2|1)(?:\s*porsi)?(?:$|[\s,;])/i.test(
        ` ${tail} `,
      )
    ) {
      foodName = clean(addOptions.slice(0, separatorIndex));
      portionText = portionText || tail;
    } else {
      foodName = addOptions;
    }
  }

  const portionMap: Record<string, string> = {};
  const portions = clean(portionText)
    .split(/,|;/)
    .map((value) => clean(value))
    .filter(Boolean);

  for (const portion of portions) {
    const match = portion.match(
      /^(.*?)(?:\s+)(1\/4|1\/3|1\/2|1)(?:\s*porsi)?$/i,
    );
    if (!match) continue;

    const key = normalizeFoodTextV29(match[1]);
    if (key) portionMap[key] = match[2];
  }

  const singleFraction = clean(
    item?.portion_fraction ||
      raw?.portion_fraction,
  );
  const singleFoodKey = normalizeFoodTextV29(foodName);
  if (
    singleFoodKey &&
    Object.keys(portionMap).length === 0 &&
    /^(1\/4|1\/3|1\/2|1)$/.test(singleFraction)
  ) {
    portionMap[singleFoodKey] = singleFraction;
  }

  return {
    food_name: foodName,
    portion: portionText,
    portionMap,
    meal_type: nutritionMealValueV126M7(
      item?.meal_type ||
        item?.meal_time ||
        raw?.["Waktu Makan"],
    ),
    existing_photo_url: clean(
      item?.photo_preview_url ||
        item?.photo_url ||
        raw?.["Preview Foto Makanan"] ||
        raw?.["Upload Foto Makanan"],
    ),
  };
}

function NutritionEditFormV126M7({
  form,
  setForm,
  photo,
  setPhoto,
  initialPortionMap,
  seedKey,
  saving,
  onCancel,
  onSave,
}: {
  form: any;
  setForm: (updater: any) => void;
  photo: File | null;
  setPhoto: (file: File | null) => void;
  initialPortionMap: Record<string, string>;
  seedKey: string;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [foodMaster, setFoodMaster] = useState<any[]>([]);
  const [portionMap, setPortionMap] = useState<Record<string, string>>({});
  const [foodMasterLoading, setFoodMasterLoading] = useState(true);
  const [foodMasterMessage, setFoodMasterMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mealChips = [
    { value: "Breakfast / Sarapan", label: "Sarapan" },
    { value: "Lunch / Makan Siang", label: "Makan Siang" },
    { value: "Dinner / Makan Malam", label: "Malam" },
    { value: "Snack", label: "Snack" },
  ];

  const foodText = clean(form?.food_name);
  const existingPhotoUrl = normalizeImageUrlV37(
    clean(form?.existing_photo_url),
  );

  useEffect(() => {
    setPortionMap(initialPortionMap || {});
    setPhoto(null);
    setFieldErrors({});
  }, [seedKey]);

  useEffect(() => {
    let active = true;

    async function loadFoodMasterV126M7() {
      setFoodMasterLoading(true);
      setFoodMasterMessage("");

      const cacheKey = "wellness-food-master-cache-v126k";

      if (typeof window !== "undefined") {
        try {
          const cached =
            window.sessionStorage.getItem(cacheKey);
          const cachedRows = cached
            ? JSON.parse(cached)
            : [];

          if (
            active &&
            Array.isArray(cachedRows) &&
            cachedRows.length > 0
          ) {
            setFoodMaster(cachedRows);
          }
        } catch {
          // Cache opsional.
        }
      }

      try {
        const firstResponse = await fetch(
          "/api/wellness/reference/foods?page=1&page_size=200",
          { cache: "no-store" },
        );
        const firstResult = await firstResponse
          .json()
          .catch(() => ({}));

        if (!firstResponse.ok || firstResult?.ok === false) {
          throw new Error(
            firstResult?.message ||
              "Master KaloriData gagal dimuat.",
          );
        }

        const firstRows = Array.isArray(firstResult?.foods)
          ? firstResult.foods
          : [];
        const totalPages = Math.max(
          Number(firstResult?.pagination?.total_pages || 1),
          1,
        );
        const remainingPages = Array.from(
          { length: Math.max(totalPages - 1, 0) },
          (_, index) => index + 2,
        );
        const pageResults = await Promise.all(
          remainingPages.map(async (page) => {
            const response = await fetch(
              `/api/wellness/reference/foods?page=${page}&page_size=200`,
              { cache: "no-store" },
            );
            const result = await response
              .json()
              .catch(() => ({}));

            if (!response.ok || result?.ok === false) {
              throw new Error(
                result?.message ||
                  `KaloriData halaman ${page} gagal dimuat.`,
              );
            }

            return Array.isArray(result?.foods)
              ? result.foods
              : [];
          }),
        );

        const rows = [firstRows, ...pageResults].flat();
        if (rows.length === 0) {
          throw new Error(
            "Master KaloriData belum memiliki data aktif.",
          );
        }

        if (!active) return;
        setFoodMaster(rows);

        if (typeof window !== "undefined") {
          try {
            window.sessionStorage.setItem(
              cacheKey,
              JSON.stringify(rows),
            );
          } catch {
            // Cache opsional.
          }
        }
      } catch (error: any) {
        if (active) {
          setFoodMasterMessage(
            error?.message ||
              "Master KaloriData belum dapat dimuat.",
          );
        }
      } finally {
        if (active) setFoodMasterLoading(false);
      }
    }

    loadFoodMasterV126M7();

    return () => {
      active = false;
    };
  }, []);

  const parsedFoods = useMemo(() => {
    return buildAutoFoodBreakdownV29(
      foodText,
      foodMaster,
      portionMap,
    );
  }, [foodText, foodMaster, portionMap]);

  const totalEstimatedCalories = parsedFoods.reduce(
    (sum, item) =>
      sum + Number(item.subtotal_calories || 0),
    0,
  );

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
      .map(
        (item) =>
          `${item.input_name} ${item.portion_fraction}`,
      )
      .join(", ");

    setForm((previous: any) => {
      const next = {
        ...previous,
        food_breakdown: payloadText,
        portion_breakdown: payloadText,
        estimated_calories: String(totalEstimatedCalories),
        calories: String(totalEstimatedCalories),
        portion: portionText,
        portion_group: "auto_breakdown",
        portion_fraction: "multi_food",
      };

      const unchanged =
        clean(previous?.food_breakdown) ===
          clean(next.food_breakdown) &&
        clean(previous?.portion_breakdown) ===
          clean(next.portion_breakdown) &&
        clean(previous?.estimated_calories) ===
          clean(next.estimated_calories) &&
        clean(previous?.calories) ===
          clean(next.calories) &&
        clean(previous?.portion) ===
          clean(next.portion) &&
        clean(previous?.portion_group) ===
          clean(next.portion_group) &&
        clean(previous?.portion_fraction) ===
          clean(next.portion_fraction);

      return unchanged ? previous : next;
    });
  }, [JSON.stringify(breakdownPayload), totalEstimatedCalories]);

  function changePortion(key: string, value: string) {
    setPortionMap((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function submitEditV126M7() {
    const errors: Record<string, string> = {};

    if (!clean(form?.log_date)) {
      errors.log_date = "Tanggal belum diisi.";
    }
    if (!clean(form?.meal_type)) {
      errors.meal_type = "Waktu makan belum dipilih.";
    }
    if (!foodText) {
      errors.food_name = "Nama makanan belum diisi.";
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    onSave();
  }

  return (
    <div className="mt-5">
      <div className="rounded-[1.8rem] border border-white bg-white p-4 shadow-lg shadow-slate-200/50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-teal-700/70">
              Food Diary
            </div>
            <h4 className="mt-2 text-2xl font-black leading-tight text-slate-950">
              Edit Nutrisi
            </h4>
            <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
              Ketik makanan dengan koma. Sistem otomatis membuat breakdown dan
              estimasi kalori.
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
            <span className="flex items-center gap-2">
              Tanggal
              <span className="rounded-full bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-600">
                Required
              </span>
            </span>
            <input
              type="date"
              value={form.log_date}
              onChange={(event) => {
                setForm((previous: any) => ({
                  ...previous,
                  log_date: event.target.value,
                }));
                setFieldErrors((previous) => ({
                  ...previous,
                  log_date: "",
                }));
              }}
              className={`${fieldClass} w-full text-sm ${
                fieldErrors.log_date
                  ? "border-rose-400 ring-4 ring-rose-50"
                  : ""
              }`}
            />
            {fieldErrors.log_date ? (
              <span className="text-[10px] font-bold text-rose-600">
                {fieldErrors.log_date}
              </span>
            ) : null}
          </label>

          <div
            className={`grid gap-2 rounded-2xl ${
              fieldErrors.meal_type
                ? "border border-rose-300 bg-rose-50/40 p-3"
                : ""
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-black text-slate-700">
              Waktu Makan
              <span className="rounded-full bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-600">
                Required
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {mealChips.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setForm((previous: any) => ({
                      ...previous,
                      meal_type: item.value,
                    }));
                    setFieldErrors((previous) => ({
                      ...previous,
                      meal_type: "",
                    }));
                  }}
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

            {fieldErrors.meal_type ? (
              <span className="text-[10px] font-bold text-rose-600">
                {fieldErrors.meal_type}
              </span>
            ) : null}
          </div>

          <label className="grid gap-2 text-xs font-black text-slate-700">
            <span className="flex items-center gap-2">
              Nama Makanan
              <span className="rounded-full bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-600">
                Required
              </span>
            </span>
            <span className="rounded-xl bg-teal-50 px-3 py-2 text-[11px] font-bold leading-5 text-teal-800">
              Cara pengisian: Nasi Putih, Sayur Sop, Es Campur
            </span>
            <textarea
              value={form.food_name}
              onChange={(event) => {
                setForm((previous: any) => ({
                  ...previous,
                  food_name: event.target.value,
                }));
                setFieldErrors((previous) => ({
                  ...previous,
                  food_name: "",
                }));
              }}
              className={`${fieldClass} min-h-[92px] w-full resize-none text-sm ${
                fieldErrors.food_name
                  ? "border-rose-400 ring-4 ring-rose-50"
                  : ""
              }`}
              placeholder="Nasi Putih, Sayur Sop, Es Campur"
            />
            {fieldErrors.food_name ? (
              <span className="text-[10px] font-bold text-rose-600">
                {fieldErrors.food_name}
              </span>
            ) : null}
          </label>

          {foodMasterLoading ? (
            <div className="rounded-2xl bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-700">
              Memuat Master KaloriData agar estimasi porsi akurat...
            </div>
          ) : foodMasterMessage ? (
            <div className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
              {foodMasterMessage}
            </div>
          ) : null}

          <CompactAutoFoodBreakdownV43
            foods={parsedFoods}
            onChangePortion={changePortion}
          />

          {existingPhotoUrl ? (
            <div className="grid gap-2 text-xs font-black text-slate-700">
              Foto Saat Ini
              <a
                href={existingPhotoUrl}
                target="_blank"
                rel="noreferrer"
                className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-slate-50"
              >
                <img
                  src={existingPhotoUrl}
                  alt="Foto nutrisi saat ini"
                  className="h-40 w-full object-cover"
                />
              </a>
            </div>
          ) : null}

          <label className="grid gap-2 text-xs font-black text-slate-700">
            Upload Foto
            <div className="flex items-center gap-3 rounded-[1.4rem] border border-dashed border-teal-200 bg-[#f4fbfa] p-3">
              <label className="shrink-0 cursor-pointer rounded-2xl bg-white px-4 py-3 text-xs font-black text-teal-700 shadow-sm">
                {existingPhotoUrl ? "Ganti Foto" : "Pilih Foto"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setPhoto(
                      event.target.files?.[0] || null,
                    )
                  }
                  className="hidden"
                />
              </label>

              <div className="min-w-0 flex-1 truncate text-xs font-bold text-slate-500">
                {photo
                  ? photo.name
                  : existingPhotoUrl
                    ? "Foto lama tetap digunakan"
                    : "Belum ada foto dipilih"}
              </div>
            </div>
          </label>

          <label className="grid gap-2 text-xs font-black text-slate-700">
            Catatan
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm((previous: any) => ({
                  ...previous,
                  notes: event.target.value,
                }))
              }
              className={`${fieldClass} min-h-[78px] w-full resize-none text-sm`}
              placeholder="Contoh: makan di luar, minuman manis, porsi besar, dll."
            />
          </label>

          <div className="rounded-[1.4rem] bg-teal-50 p-3 text-[11px] font-bold leading-5 text-teal-900">
            Peserta tidak perlu mengisi kalori manual. Sistem mencocokkan
            makanan dengan Master KaloriData.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="rounded-[1.4rem] bg-slate-100 px-4 py-4 text-sm font-black text-slate-700 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={submitEditV126M7}
              disabled={saving || foodMasterLoading}
              className="rounded-[1.4rem] bg-teal-600 px-4 py-4 text-sm font-black text-white shadow-lg shadow-teal-100 disabled:opacity-50"
            >
              {saving
                ? "Menyimpan..."
                : foodMasterLoading
                  ? "Menyiapkan KaloriData..."
                  : "Simpan Perubahan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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
      0,
  );

  const [openSection, setOpenSection] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loadingKey, setLoadingKey] = useState("");
  const [deletingKeyV126M, setDeletingKeyV126M] = useState("");
  const [editingItemV126M6, setEditingItemV126M6] = useState<any>(null);
  const [editingTypeV126M6, setEditingTypeV126M6] = useState<"nutrition" | "workout" | "">("");
  const [savingEditV126M6, setSavingEditV126M6] = useState(false);
  const [editingNutritionPhotoV126M7, setEditingNutritionPhotoV126M7] =
    useState<File | null>(null);
  const [
    editingNutritionPortionMapV126M7,
    setEditingNutritionPortionMapV126M7,
  ] = useState<Record<string, string>>({});
  const [editFormV126M6, setEditFormV126M6] = useState({
    log_date: "",
    meal_type: "",
    food_name: "",
    calories: "",
    portion: "",
    food_breakdown: "",
    portion_breakdown: "",
    estimated_calories: "",
    portion_group: "",
    portion_fraction: "",
    existing_photo_url: "",
    activity_type: "",
    calculation_mode: "manual_master",
    start_time: "",
    duration_minutes: "",
    duration_seconds: "",
    distance_km: "",
    steps: "",
    total_calories: "",
    average_heart_rate: "",
    max_heart_rate: "",
    device_source: "",
    notes: "",
  });
  const [editMasterPreviewV126M50B4, setEditMasterPreviewV126M50B4] = useState<any>(null);
  const [editMasterPreviewLoadingV126M50B4, setEditMasterPreviewLoadingV126M50B4] = useState(false);
  const [editMasterPreviewErrorV126M50B4, setEditMasterPreviewErrorV126M50B4] = useState("");

  useEffect(() => {
    if (
      editingTypeV126M6 !== "workout" ||
      editFormV126M6.calculation_mode === "smartwatch"
    ) {
      setEditMasterPreviewV126M50B4(null);
      setEditMasterPreviewErrorV126M50B4("");
      setEditMasterPreviewLoadingV126M50B4(false);
      return;
    }

    const duration = Number(editFormV126M6.duration_minutes || 0);
    const activityType = clean(editFormV126M6.activity_type);
    if (!activityType || !Number.isFinite(duration) || duration <= 0) {
      setEditMasterPreviewV126M50B4(null);
      setEditMasterPreviewErrorV126M50B4("");
      setEditMasterPreviewLoadingV126M50B4(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setEditMasterPreviewLoadingV126M50B4(true);
        setEditMasterPreviewErrorV126M50B4("");
        const params = new URLSearchParams({
          calculate: "master",
          activity_type: activityType,
          activity_name: activityType,
          duration_minutes: String(duration),
        });
        const distance = clean(editFormV126M6.distance_km);
        if (distance) params.set("distance_km", distance);

        const response = await fetch(
          `/api/wellness/participant/workout?${params.toString()}`,
          { cache: "no-store" },
        );
        const result = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok || result?.ok !== true) {
          setEditMasterPreviewV126M50B4(null);
          setEditMasterPreviewErrorV126M50B4(
            result?.message || "Perhitungan Master Workout belum tersedia.",
          );
          return;
        }
        setEditMasterPreviewV126M50B4(result);
      } catch (error: any) {
        if (!cancelled) {
          setEditMasterPreviewV126M50B4(null);
          setEditMasterPreviewErrorV126M50B4(
            error?.message || "Gagal menghitung preview Master Workout.",
          );
        }
      } finally {
        if (!cancelled) setEditMasterPreviewLoadingV126M50B4(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    editingTypeV126M6,
    editFormV126M6.calculation_mode,
    editFormV126M6.activity_type,
    editFormV126M6.duration_minutes,
    editFormV126M6.distance_km,
  ]);

  function historyDeleteRawPayloadV126M(item: any) {
    const raw = item?.raw_payload;

    if (!raw) return {};

    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }

    return typeof raw === "object" ? raw : {};
  }

  function historySubmissionIdV126M(item: any) {
    const raw = historyDeleteRawPayloadV126M(item);

    return clean(
      item?._submission_id ||
        item?.submission_id ||
        item?.submissionId ||
        raw?.submission_id ||
        raw?.submissionId ||
        raw?.["Submission ID"] ||
        raw?.google_sheet?.submission_id ||
        raw?.google_sheet?.submissionId,
    );
  }

  function historySheetRowV126M(item: any) {
    const raw = historyDeleteRawPayloadV126M(item);

    const value = Number(
      item?._google_sheet_row_number ||
        item?.google_sheet_row_number ||
        item?.sheet_row_number ||
        item?.row_number ||
        item?._rowNumber ||
        raw?._rowNumber ||
        raw?.__row_index ||
        raw?.google_sheet?.rowNumber ||
        raw?.google_sheet?.row_number ||
        0,
    );

    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function historyDeleteKeyV126M(type: "nutrition" | "workout", item: any) {
    return [
      type,
      historySubmissionIdV126M(item),
      historySheetRowV126M(item),
      clean(item?.id),
      clean(item?.log_date || item?.created_at),
    ].join(":");
  }

  function isManualWorkoutDeleteV126M(item: any) {
    if (!item || isDeviceDailyRow(item)) return false;

    const raw = historyDeleteRawPayloadV126M(item);
    const source = clean(
      item?.source ||
        item?.input_source ||
        raw?.source,
    ).toLowerCase();

    const externalId = clean(
      item?.external_activity_id ||
        item?.provider_activity_id,
    ).toLowerCase();

    return (
      source === "manual" ||
      externalId.startsWith("manual_") ||
      clean(raw?.submission_id).startsWith("workout-")
    );
  }


  // WELLNESS_HISTORY_EDIT_FOLLOWS_DELETE_V126M6
  function canEditHistoryV126M6(
    type: "nutrition" | "workout",
    item: any,
  ) {
    return type === "nutrition" || isManualWorkoutDeleteV126M(item);
  }

  // WELLNESS_SMARTWATCH_WORKOUT_EDITOR_V126M50B_1
  function workoutEditNumberFromTextV126M50B1(text: any, pattern: RegExp) {
    const match = clean(text).match(pattern);
    if (!match?.[1]) return "";
    const value = numberFromMixedV41(match[1]);
    return value > 0 || String(match[1]).trim() === "0" ? String(value) : "";
  }

  function workoutEditTextFromTextV126M50B1(text: any, pattern: RegExp) {
    const match = clean(text).match(pattern);
    return clean(match?.[1]);
  }

  function workoutEditNotesV126M50B1(item: any, raw: any) {
    const itemNotes = clean(item?.notes);
    if (itemNotes) return itemNotes;

    const direct = clean(raw?.notes || raw?.catatan);
    if (
      direct &&
      !/(?:^|[|·])\s*(?:Waktu mulai|Durasi|Kalori total|HR rata-rata|HR maksimal|Mode hitung|Sumber)\s*:/i.test(direct)
    ) {
      return direct;
    }

    const achievement = clean(
      item?.description ||
        raw?.[
          "Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)"
        ] ||
        direct,
    );

    return achievement
      .split(/\s*[|·]\s*/)
      .filter((part) => {
        const text = clean(part);
        if (!text) return false;
        return !(
          /^[\d.,]+\s*(?:langkah|steps?)$/i.test(text) ||
          /^[\d.,]+\s*km$/i.test(text) ||
          /^(?:Waktu mulai|Durasi|Kalori total|HR rata-rata|HR maksimal|Mode hitung|Sumber)\s*:/i.test(text)
        );
      })
      .join(" | ");
  }

  function openEditHistoryV126M6(
    type: "nutrition" | "workout",
    item: any,
  ) {
    if (!canEditHistoryV126M6(type, item)) return;

    const raw = historyDeleteRawPayloadV126M(item);
    const nutritionSeed =
      type === "nutrition"
        ? nutritionEditSeedV126M7(item, raw)
        : null;

    setEditingTypeV126M6(type);
    setEditingItemV126M6(item);
    setEditingNutritionPhotoV126M7(null);
    setEditingNutritionPortionMapV126M7(
      nutritionSeed?.portionMap || {},
    );
    setEditFormV126M6({
      log_date: clean(
        item?.log_date ||
          item?.date ||
          item?.created_at,
      ).slice(0, 10),
      meal_type:
        nutritionSeed?.meal_type ||
        clean(item?.meal_type || item?.meal_time),
      food_name:
        nutritionSeed?.food_name ||
        clean(item?.food_name || item?.meal_text),
      calories: clean(
        item?.calories ??
          item?.total_calories ??
          item?.estimated_calories ??
          raw?.["Kalori Makanan"] ??
          raw?.["Kalori Aktivitas"],
      ),
      portion: nutritionSeed?.portion || "",
      food_breakdown: "",
      portion_breakdown: "",
      estimated_calories: clean(
        item?.calories ??
          item?.total_calories ??
          item?.estimated_calories ??
          raw?.["Kalori Makanan"],
      ),
      portion_group: "auto_breakdown",
      portion_fraction: "multi_food",
      existing_photo_url:
        nutritionSeed?.existing_photo_url || "",
      activity_type: clean(
        item?.activity_name ||
          item?.activity_type ||
          raw?.["Jenis Workout/Aktifitas"],
      ),
      calculation_mode: (() => {
        const savedMode = clean(
          item?.calculation_mode ||
            raw?.calculation_mode ||
            raw?.workout_calculation_mode,
        ).toLowerCase();
        if (savedMode === "smartwatch") return "smartwatch";
        if (savedMode === "manual_master") return "manual_master";

        const source = clean(
          item?.device_source ||
            raw?.device_source ||
            workoutEditTextFromTextV126M50B1(
              item?.notes || item?.description || raw?.["Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)"],
              /(?:^|[|·])\s*Sumber\s*:\s*([^|·]+)/i,
            ),
        ).toLowerCase();
        const hasSmartwatchDetail = Boolean(
          item?.smartwatch_total_calories ||
            raw?.smartwatch_total_calories ||
            item?.average_heart_rate ||
            raw?.average_heart_rate ||
            item?.max_heart_rate ||
            raw?.max_heart_rate,
        );
        return hasSmartwatchDetail || (source && !source.includes("manual"))
          ? "smartwatch"
          : "manual_master";
      })(),
      start_time: clean(
        item?.start_time ||
          raw?.start_time ||
          workoutEditTextFromTextV126M50B1(
            item?.notes || item?.description || raw?.["Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)"],
            /(?:^|[|·])\s*Waktu mulai\s*:\s*([^|·]+)/i,
          ),
      ).slice(0, 5),
      duration_minutes: clean(
        Math.floor(
          asNumber(
            item?.duration_minutes ??
              raw?.duration_minutes ??
              raw?.["Berapa Menit anda melakukan nya ?"],
          ),
        ) || "",
      ),
      duration_seconds: clean(
        item?.duration_seconds ??
          raw?.duration_seconds ??
          (() => {
            const exact = workoutEditTextFromTextV126M50B1(
              item?.notes || item?.description || raw?.["Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)"],
              /(?:^|[|·])\s*Durasi\s*:\s*(\d{1,4}:\d{2})/i,
            );
            const match = exact.match(/^\d+:(\d{2})$/);
            return match?.[1] || "";
          })(),
      ),
      distance_km: clean(
        item?.distance_km ??
          raw?.distance_km ??
          workoutEditNumberFromTextV126M50B1(
            item?.notes || item?.description || raw?.["Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)"],
            /([\d.,]+)\s*km\b/i,
          ),
      ),
      steps: clean(
        item?.steps ??
          raw?.steps ??
          workoutEditNumberFromTextV126M50B1(
            item?.notes || item?.description || raw?.["Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)"],
            /([\d.,]+)\s*(?:langkah|steps?)\b/i,
          ),
      ),
      total_calories: clean(
        item?.smartwatch_total_calories ??
          raw?.smartwatch_total_calories ??
          workoutEditNumberFromTextV126M50B1(
            item?.notes || item?.description || raw?.["Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)"],
            /(?:^|[|·])\s*Kalori total\s*:\s*([\d.,]+)/i,
          ),
      ),
      average_heart_rate: clean(
        item?.average_heart_rate ??
          raw?.average_heart_rate ??
          workoutEditNumberFromTextV126M50B1(
            item?.notes || item?.description || raw?.["Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)"],
            /(?:^|[|·])\s*HR rata-rata\s*:\s*([\d.,]+)/i,
          ),
      ),
      max_heart_rate: clean(
        item?.max_heart_rate ??
          raw?.max_heart_rate ??
          workoutEditNumberFromTextV126M50B1(
            item?.notes || item?.description || raw?.["Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)"],
            /(?:^|[|·])\s*HR maksimal\s*:\s*([\d.,]+)/i,
          ),
      ),
      device_source: clean(
        (
          item?.device_source ??
            raw?.device_source ??
            workoutEditTextFromTextV126M50B1(
              item?.notes || item?.description || raw?.["Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)"],
              /(?:^|[|·])\s*Sumber\s*:\s*([^|·]+)/i,
            )
        ) || "Manual",
      ),
      notes:
        type === "workout"
          ? workoutEditNotesV126M50B1(item, raw)
          : clean(
              item?.notes ||
                item?.description ||
                raw?.notes ||
                raw?.catatan ||
                raw?.["Catatan Nutrisi"],
            ),
    });
  }

  function closeEditHistoryV126M6() {
    if (savingEditV126M6) return;
    setEditingItemV126M6(null);
    setEditingTypeV126M6("");
    setEditingNutritionPhotoV126M7(null);
    setEditingNutritionPortionMapV126M7({});
  }

  async function saveEditHistoryV126M6() {
    if (!editingItemV126M6 || !editingTypeV126M6) return;

    setSavingEditV126M6(true);

    try {
      const editRawV126M6 =
        historyDeleteRawPayloadV126M(
          editingItemV126M6,
        );
      const submissionId =
        historySubmissionIdV126M(
          editingItemV126M6,
        );
      const rowNumber =
        historySheetRowV126M(
          editingItemV126M6,
        );
      const expectedLogDate = clean(
        editingItemV126M6?.log_date ||
          editingItemV126M6?.date ||
          editingItemV126M6?.created_at,
      ).slice(0, 10);
      const expectedCalories =
        editingItemV126M6?.calories ??
        editingItemV126M6?.total_calories ??
        editingItemV126M6?.estimated_calories ??
        editRawV126M6?.["Kalori Makanan"] ??
        editRawV126M6?.["Kalori Aktivitas"] ??
        null;

      let response: Response;

      if (editingTypeV126M6 === "nutrition") {
        const body = new FormData();

        function appendField(
          key: string,
          value: any,
        ) {
          if (
            value === null ||
            value === undefined
          ) {
            return;
          }
          body.append(key, String(value));
        }

        appendField(
          "submission_id",
          submissionId,
        );
        appendField(
          "google_sheet_row_number",
          rowNumber || "",
        );
        appendField(
          "log_date",
          editFormV126M6.log_date,
        );
        appendField(
          "meal_type",
          editFormV126M6.meal_type,
        );
        appendField(
          "food_name",
          editFormV126M6.food_name,
        );
        appendField(
          "portion",
          editFormV126M6.portion,
        );
        appendField(
          "food_breakdown",
          editFormV126M6.food_breakdown,
        );
        appendField(
          "portion_breakdown",
          editFormV126M6.portion_breakdown,
        );
        appendField(
          "estimated_calories",
          editFormV126M6.estimated_calories ||
            editFormV126M6.calories,
        );
        appendField(
          "calories",
          editFormV126M6.calories,
        );
        appendField(
          "portion_group",
          editFormV126M6.portion_group,
        );
        appendField(
          "portion_fraction",
          editFormV126M6.portion_fraction,
        );
        appendField(
          "notes",
          editFormV126M6.notes,
        );
        appendField(
          "expected_log_date",
          expectedLogDate,
        );
        appendField(
          "expected_meal_type",
          editingItemV126M6?.meal_type ||
            editingItemV126M6?.meal_time ||
            editRawV126M6?.["Waktu Makan"] ||
            "",
        );
        appendField(
          "expected_food_name",
          editingItemV126M6?.food_name ||
            editingItemV126M6?.meal_text ||
            editRawV126M6?.["Add Options"] ||
            "",
        );
        appendField(
          "expected_calories",
          expectedCalories,
        );

        if (editingNutritionPhotoV126M7) {
          const compressedPhoto =
            await compressNutritionPhotoV126M2(
              editingNutritionPhotoV126M7,
            );
          body.append(
            "photo",
            compressedPhoto,
          );
        }

        response = await fetch(
          "/api/wellness/participant/nutrition",
          {
            method: "PATCH",
            body,
          },
        );
      } else {
        const payload: any = {
          id:
            editingItemV126M6?._supabase_id ||
            editingItemV126M6?.id ||
            null,
          mirror_id:
            editingItemV126M6?._supabase_id ||
            null,
          submission_id:
            submissionId || null,
          google_sheet_row_number:
            rowNumber || null,
          source:
            editingItemV126M6?._canonical_source ||
            editingItemV126M6?.source ||
            editRawV126M6?.source ||
            null,
          title:
            editingItemV126M6?.activity_name ||
            editingItemV126M6?.activity_type ||
            null,
          log_date:
            editFormV126M6.log_date,
          calories:
            editFormV126M6.calories,
          notes:
            editFormV126M6.notes,
          activity_type:
            editFormV126M6.activity_type,
          activity_name:
            editFormV126M6.activity_type,
          calculation_mode:
            editFormV126M6.calculation_mode,
          duration_minutes:
            editFormV126M6.duration_minutes,
          duration_seconds:
            editFormV126M6.duration_seconds,
          start_time:
            editFormV126M6.start_time,
          distance_km:
            editFormV126M6.distance_km,
          steps:
            editFormV126M6.steps,
          active_calories:
            editFormV126M6.calories,
          total_calories:
            editFormV126M6.total_calories,
          average_heart_rate:
            editFormV126M6.average_heart_rate,
          max_heart_rate:
            editFormV126M6.max_heart_rate,
          device_source:
            editFormV126M6.device_source,
          expected_log_date:
            expectedLogDate,
          expected_calories:
            expectedCalories,
          expected_activity_type:
            editingItemV126M6?.activity_type ||
            editingItemV126M6?.activity_name ||
            null,
          expected_duration_minutes:
            editingItemV126M6?.duration_minutes ??
            editRawV126M6?.duration_minutes ??
            editRawV126M6?.[
              "Berapa Menit anda melakukan nya ?"
            ] ??
            null,
        };

        response = await fetch(
          "/api/wellness/participant/workout",
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );
      }

      const result =
        await readApiResponseV126M2(
          response,
        );

      if (
        !response.ok ||
        result?.ok === false
      ) {
        throw new Error(
          result?.message ||
            result?.detail ||
            "Data belum berhasil diperbarui.",
        );
      }

      // WELLNESS_WORKOUT_EDIT_PERSISTENCE_V126M50B_6
      // Keep the just-saved values on screen immediately. B.5 reloaded history
      // while Sheet read-back could still contain the pre-edit row, causing the
      // UI to jump back to the old values. The API now aligns the mirror first;
      // the portal also applies the returned canonical log optimistically.
      if (
        editingTypeV126M6 ===
        "nutrition"
      ) {
        void loadNutritionHistory();
      } else {
        const savedWorkoutV126M50B6 = result?.log;
        if (savedWorkoutV126M50B6) {
          setDirectWorkoutV126M6((previous: any) => {
            const currentLogs = Array.isArray(previous?.logs)
              ? previous.logs
              : [];
            const targetSubmissionId = clean(submissionId);
            const targetRowNumber = Number(rowNumber || 0);
            let replaced = false;

            const nextLogs = currentLogs.map((item: any) => {
              const raw = historyDeleteRawPayloadV126M(item);
              const itemSubmissionId = clean(
                historySubmissionIdV126M(item),
              );
              const itemRowNumber = Number(
                historySheetRowV126M(item) ||
                  raw?.google_sheet?.rowNumber ||
                  raw?.google_sheet?.row_number ||
                  0,
              );
              const matches = Boolean(
                (targetSubmissionId &&
                  itemSubmissionId === targetSubmissionId) ||
                  (targetRowNumber > 0 &&
                    itemRowNumber === targetRowNumber),
              );
              if (!matches) return item;
              replaced = true;
              return {
                ...item,
                ...savedWorkoutV126M50B6,
                raw_payload: {
                  ...(raw || {}),
                  ...(savedWorkoutV126M50B6?.raw_payload || {}),
                },
              };
            });

            if (!replaced) {
              nextLogs.unshift(savedWorkoutV126M50B6);
            }

            return {
              ...(previous || {}),
              ok: true,
              logs: nextLogs,
            };
          });
          setWorkoutHistoryLoadedV126M6(true);
        }

        if (result?.verification_pending) {
          window.setTimeout(() => {
            void loadWorkoutHistoryV126M6();
          }, 2200);
          window.setTimeout(() => {
            void loadWorkoutHistoryV126M6();
          }, 5200);
        } else {
          void loadWorkoutHistoryV126M6();
        }
      }

      if (refresh) {
        void Promise.resolve(refresh()).catch(() => null);
      }

      setEditingItemV126M6(null);
      setEditingTypeV126M6("");
      setEditingNutritionPhotoV126M7(null);
      setEditingNutritionPortionMapV126M7({});
      window.alert(
        result?.message ||
          "Data berhasil diperbarui.",
      );
    } catch (error: any) {
      window.alert(
        error?.message ||
          "Data belum berhasil diperbarui.",
      );
    } finally {
      setSavingEditV126M6(false);
    }
  }

  async function deleteHistoryItemV126M(
    type: "nutrition" | "workout",
    item: any,
  ) {
    const label =
      type === "nutrition"
        ? item?.food_name || item?.meal_text || "makanan ini"
        : item?.activity_name || item?.activity_type || "workout ini";

    const confirmed = window.confirm(
      `Hapus ${label}? Data nutrisi akan dihapus dari Google Sheet.`,
    );

    if (!confirmed) return;

    const deleteKey = historyDeleteKeyV126M(type, item);

    if (deletingKeyV126M === deleteKey) return;

    setDeletingKeyV126M(deleteKey);

    try {
      const response = await fetch(
        `/api/wellness/participant/${type}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id:
              item?._supabase_id ||
              item?.id ||
              null,
            mirror_id:
              item?._supabase_id ||
              null,
            submission_id:
              historySubmissionIdV126M(item) ||
              null,
            google_sheet_row_number:
              historySheetRowV126M(item) ||
              null,
            log_date:
              clean(
                item?.log_date ||
                  item?.date ||
                  item?.created_at,
              ).slice(0, 10) ||
              null,
            meal_type:
              item?.meal_type ||
              item?.meal_time ||
              null,
            calories:
              item?.calories ??
              item?.total_calories ??
              item?.estimated_calories ??
              null,
            source:
              item?._canonical_source ||
              item?.source ||
              null,
            title:
              item?.food_name ||
              item?.meal_text ||
              item?.activity_name ||
              item?.activity_type ||
              null,
          }),
        },
      );

      const result = await readApiResponseV126M2(response);

      if (!response.ok || result?.ok === false) {
        throw new Error(
          result?.detail ||
            result?.message ||
            "Data belum berhasil dihapus.",
        );
      }

      if (
        type === "nutrition" &&
        result?.deleted_any !== true
      ) {
        throw new Error(
          result?.message ||
            "Data tidak ditemukan sehingga belum ada yang dihapus.",
        );
      }

      if (type === "nutrition") {
        await loadNutritionHistory();

        if (refresh) {
          await Promise.resolve(refresh());
        }
      } else {
        await loadWorkoutHistoryV126M6();
        if (refresh) {
          await Promise.resolve(refresh());
        }
      }

      window.alert(
        result?.message ||
          (type === "nutrition"
            ? "Riwayat nutrisi berhasil dihapus."
            : "Riwayat workout berhasil dihapus."),
      );
    } catch (error: any) {
      window.alert(
        error?.message ||
          "Data belum berhasil dihapus.",
      );
    } finally {
      setDeletingKeyV126M("");
    }
  }

  const [workoutHistoryLoadedV126M6, setWorkoutHistoryLoadedV126M6] = useState(false);
  const [directWorkoutV126M6, setDirectWorkoutV126M6] = useState<any>({
    ok: false,
    logs: [],
  });

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
      { cache: "no-store" },
    )
      .then((response) => response.json())
      .catch(() => null);

    if (result?.ok) {
      setDirectNutrition(result);
      setNutritionLoaded(true);
    }

    setLoadingKey("");
  }

  async function loadWorkoutHistoryV126M6() {
    if (!participantId) return;

    setLoadingKey("workout");

    const result = await fetch(
      `/api/wellness/participant/workout?t=${Date.now()}`,
      { cache: "no-store" },
    )
      .then((response) => response.json())
      .catch(() => null);

    if (result?.ok) {
      setDirectWorkoutV126M6(result);
      setWorkoutHistoryLoadedV126M6(true);
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

    if (key === "workout" && !workoutHistoryLoadedV126M6) {
      await loadWorkoutHistoryV126M6();
      return;
    }

    if (key === "healthtalk" && refresh) {
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
    setStartDate(jakartaDateFromAny(past));
    setEndDate(todayDate());
  }

  function clearFilter() {
    setStartDate("");
    setEndDate("");
  }

  const rawNutrition =
    canonicalNutritionHistoryV126M1(
      nutritionLoaded
        ? directNutrition?.logs || []
        : nutritionLogs || [],
    );

  const deviceWorkoutSourceRows = workoutLogs || workoutItems || [];
  const sheetWorkoutSourceRows = workoutHistoryLoadedV126M6
    ? directWorkoutV126M6?.logs || []
    : [];
  const workoutSourceRows = workoutHistoryLoadedV126M6
    ? [
        ...deviceWorkoutSourceRows.filter((item: any) => isDeviceDailyRow(item)),
        ...sheetWorkoutSourceRows,
      ]
    : deviceWorkoutSourceRows;
  const rawWorkout = normalizeWorkoutItemsForHistoryV72(workoutSourceRows);
  const rawWorkoutMetrics = normalizeWorkoutItemsForMetrics(workoutSourceRows);
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

  const workoutMetrics = filterHistoryByDateV37(
    rawWorkoutMetrics,
    startDate,
    endDate,
    ["log_date", "created_at", "updated_at", "date"],
  );

  const selectedDeviceRows = new Set(
    workoutMetrics
      .filter((item: any) => isDeviceDailyRow(item))
      .map((item: any) => workoutHistorySelectionKeyV72(item)),
  );

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

  const workoutCalories = workoutMetrics.reduce((sum: number, item: any) => {
    return sum + activityCaloriesValue(item);
  }, 0);

  const workoutSteps = workoutMetrics.reduce((sum: number, item: any) => {
    return sum + activityStepsValue(item);
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
              Buka dropdown sesuai kebutuhan. Data nutrisi akan diretrieve saat
              dropdown dibuka.
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
            {rawNutrition.length} submission nutrisi · sumber Google Sheet
          </div>
        ) : null}

        {nutrition.length === 0 ? (
          <EmptyHistoryCardV37
            text={
              nutritionLoaded
                ? "Belum ada input nutrisi pada periode ini."
                : "Klik dropdown untuk memuat data nutrisi."
            }
          />
        ) : (
          <div className="space-y-3">
            {nutrition.slice(0, 30).map((item: any, index: number) => (
              <HistoryMealItemV37
                key={`${item.id || index}-${index}`}
                item={item}
                deleting={
                  deletingKeyV126M ===
                  historyDeleteKeyV126M("nutrition", item)
                }
                onEdit={() => openEditHistoryV126M6("nutrition", item)}
                onDelete={() =>
                  deleteHistoryItemV126M("nutrition", item)
                }
              />
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
            {workout.slice(0, 30).map((item: any, index: number) => {
              const daily = isDeviceDailyRow(item);
              const selected =
                !daily ||
                selectedDeviceRows.has(workoutHistorySelectionKeyV72(item));

              return (
                <HistoryGenericItemV37
                  key={`${item.id || index}-${index}`}
                  title={
                    item.activity_name ||
                    item.activity_type ||
                    item.source ||
                    "Workout"
                  }
                  subtitle={formatDateTextV37(
                    item.log_date || item.created_at || item.updated_at,
                  )}
                  note={historyWorkoutNoteV73(item)}
                  status={
                    daily
                      ? selected
                        ? isGoogleFitDailyRow(item)
                          ? "Dipakai untuk steps & grafik — data exact Last Sync"
                          : "Dipakai untuk total & grafik"
                        : isGoogleFitDailyRow(item)
                          ? "Tidak dipakai — total Google Fit termasuk kalori istirahat"
                          : "Tidak dipakai — sumber lain yang aktif"
                      : ""
                  }
                  statusTone={selected ? "primary" : "secondary"}
                  deleting={
                    deletingKeyV126M ===
                    historyDeleteKeyV126M("workout", item)
                  }
                  onEdit={
                    isManualWorkoutDeleteV126M(item)
                      ? () => openEditHistoryV126M6("workout", item)
                      : undefined
                  }
                  onDelete={
                    isManualWorkoutDeleteV126M(item)
                      ? () =>
                          deleteHistoryItemV126M(
                            "workout",
                            item,
                          )
                      : undefined
                  }
                />
              );
            })}
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
                subtitle={formatDateTextV37(
                  item.event_date || item.log_date || item.created_at,
                )}
                note={item.notes || item.description || "-"}
              />
            ))}
          </div>
        )}
      </HistoryAccordionCardV37>

      {editingItemV126M6 ? (
        <HistoryEditModalShellV126M8_2
          onClose={closeEditHistoryV126M6}
        >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">
                  Edit Google Sheet
                </div>
                <h3 className="mt-1 text-xl font-black text-slate-950">
                  {editingTypeV126M6 === "nutrition"
                    ? "Edit Data Nutrisi"
                    : "Edit Data Workout"}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeEditHistoryV126M6}
                className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-lg font-black text-slate-700"
              >
                ×
              </button>
            </div>

            {editingTypeV126M6 === "nutrition" ? (
              <NutritionEditFormV126M7
                form={editFormV126M6}
                setForm={setEditFormV126M6}
                photo={editingNutritionPhotoV126M7}
                setPhoto={setEditingNutritionPhotoV126M7}
                initialPortionMap={
                  editingNutritionPortionMapV126M7
                }
                seedKey={historyDeleteKeyV126M(
                  "nutrition",
                  editingItemV126M6,
                )}
                saving={savingEditV126M6}
                onCancel={closeEditHistoryV126M6}
                onSave={saveEditHistoryV126M6}
              />
            ) : (
              <>
                <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-xs font-bold leading-5 text-sky-900">
                  Sumber input workout tetap Manual Peserta. <b>Master Workout</b> menghitung kalori otomatis; <b>Smartwatch</b> memakai angka dari perangkat.
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className={`cursor-pointer rounded-2xl border p-4 ${editFormV126M6.calculation_mode !== "smartwatch" ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="edit-workout-calculation-mode"
                        checked={editFormV126M6.calculation_mode !== "smartwatch"}
                        onChange={() =>
                          setEditFormV126M6((previous) => ({
                            ...previous,
                            calculation_mode: "manual_master",
                          }))
                        }
                        className="mt-1 h-4 w-4 accent-emerald-600"
                      />
                      <div>
                        <div className="text-sm font-black text-slate-900">Hitung otomatis dari Master Workout</div>
                        <div className="mt-1 text-xs font-bold leading-5 text-slate-500">Kalori aktif dihitung ulang otomatis dari master saat disimpan.</div>
                      </div>
                    </div>
                  </label>

                  <label className={`cursor-pointer rounded-2xl border p-4 ${editFormV126M6.calculation_mode === "smartwatch" ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white"}`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="edit-workout-calculation-mode"
                        checked={editFormV126M6.calculation_mode === "smartwatch"}
                        onChange={() =>
                          setEditFormV126M6((previous) => ({
                            ...previous,
                            calculation_mode: "smartwatch",
                            device_source:
                              clean(previous.device_source).toLowerCase().includes("manual")
                                ? "Smartwatch"
                                : previous.device_source || "Smartwatch",
                          }))
                        }
                        className="mt-1 h-4 w-4 accent-sky-600"
                      />
                      <div>
                        <div className="text-sm font-black text-slate-900">Ambil dari Smartwatch</div>
                        <div className="mt-1 text-xs font-bold leading-5 text-slate-500">Kalori, HR, langkah, jarak, dan device dapat diisi sesuai ringkasan perangkat.</div>
                      </div>
                    </div>
                  </label>
                </div>

                {editFormV126M6.calculation_mode !== "smartwatch" ? (
                  <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Hasil Sistem · Read Only</div>
                        <div className="mt-1 text-xs font-black text-slate-900">Kalori Aktif dari Master Workout</div>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2 text-lg font-black text-emerald-700 shadow-sm">
                        {editMasterPreviewLoadingV126M50B4
                          ? "..."
                          : editMasterPreviewV126M50B4?.active_calories != null
                            ? `${Number(editMasterPreviewV126M50B4.active_calories).toLocaleString("id-ID")} kkal`
                            : "-"}
                      </div>
                    </div>
                    {editMasterPreviewErrorV126M50B4 ? (
                      <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                        {editMasterPreviewErrorV126M50B4}
                      </div>
                    ) : editMasterPreviewV126M50B4 ? (
                      <div className="mt-3 grid gap-1 text-[11px] font-bold text-slate-600 md:grid-cols-2">
                        <div>Sumber input: <b className="text-slate-900">Manual Peserta</b></div>
                        <div>Master: <b className="text-slate-900">{editMasterPreviewV126M50B4.activity_reference_name || "Fallback MET existing"}</b></div>
                        <div>Metode: <b className="text-slate-900">{editMasterPreviewV126M50B4.calorie_method || "-"}</b></div>
                        <div>BB: <b className="text-slate-900">{editMasterPreviewV126M50B4.participant_weight_kg_used || "-"} kg</b></div>
                        {editMasterPreviewV126M50B4.warning ? (
                          <div className="md:col-span-2 mt-1 rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
                            {editMasterPreviewV126M50B4.warning}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] font-bold text-emerald-900">Isi aktivitas dan durasi untuk menghitung ulang.</div>
                    )}
                    <div className="mt-2 text-[11px] font-bold leading-5 text-emerald-900">
                      Saat Simpan & Verifikasi, backend menghitung ulang dari master. Nilai lama tidak dipakai sebagai input bebas.
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="block text-xs font-black text-slate-600">
                    Tanggal
                    <input
                      type="date"
                      value={editFormV126M6.log_date}
                      onChange={(event) =>
                        setEditFormV126M6((previous) => ({
                          ...previous,
                          log_date: event.target.value,
                        }))
                      }
                      className={`${fieldClass} mt-2 w-full`}
                    />
                  </label>

                  <label className="block text-xs font-black text-slate-600">
                    Waktu mulai
                    <input
                      type="time"
                      value={editFormV126M6.start_time}
                      onChange={(event) =>
                        setEditFormV126M6((previous) => ({
                          ...previous,
                          start_time: event.target.value,
                        }))
                      }
                      className={`${fieldClass} mt-2 w-full`}
                    />
                  </label>

                  <label className="block text-xs font-black text-slate-600 md:col-span-2">
                    Jenis workout / aktivitas
                    <input
                      value={editFormV126M6.activity_type}
                      onChange={(event) =>
                        setEditFormV126M6((previous) => ({
                          ...previous,
                          activity_type: event.target.value,
                        }))
                      }
                      placeholder="Contoh: Lari outdoor, Treadmill, Bersepeda"
                      className={`${fieldClass} mt-2 w-full`}
                    />
                  </label>

                  <label className="block text-xs font-black text-slate-600">
                    Durasi — menit
                    <input
                      type="number"
                      min="0"
                      value={editFormV126M6.duration_minutes}
                      onChange={(event) =>
                        setEditFormV126M6((previous) => ({
                          ...previous,
                          duration_minutes: event.target.value,
                        }))
                      }
                      className={`${fieldClass} mt-2 w-full`}
                    />
                  </label>

                  <label className="block text-xs font-black text-slate-600">
                    Durasi — detik
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={editFormV126M6.duration_seconds}
                      onChange={(event) =>
                        setEditFormV126M6((previous) => ({
                          ...previous,
                          duration_seconds: event.target.value,
                        }))
                      }
                      className={`${fieldClass} mt-2 w-full`}
                    />
                  </label>

                  <label className="block text-xs font-black text-slate-600">
                    Jarak (km)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editFormV126M6.distance_km}
                      onChange={(event) =>
                        setEditFormV126M6((previous) => ({
                          ...previous,
                          distance_km: event.target.value,
                        }))
                      }
                      className={`${fieldClass} mt-2 w-full`}
                    />
                  </label>

                  <label className="block text-xs font-black text-slate-600">
                    Langkah
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={editFormV126M6.steps}
                      onChange={(event) =>
                        setEditFormV126M6((previous) => ({
                          ...previous,
                          steps: event.target.value,
                        }))
                      }
                      className={`${fieldClass} mt-2 w-full`}
                    />
                  </label>

                  {editFormV126M6.calculation_mode === "smartwatch" ? (
                    <>
                      <label className="block text-xs font-black text-emerald-700">
                        Kalori aktif (kkal) — dipakai target
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={editFormV126M6.calories}
                          onChange={(event) =>
                            setEditFormV126M6((previous) => ({
                              ...previous,
                              calories: event.target.value,
                            }))
                          }
                          className={`${fieldClass} mt-2 w-full border-emerald-200 bg-emerald-50/40`}
                        />
                      </label>

                      <label className="block text-xs font-black text-slate-600">
                        Kalori total (kkal) — informasi
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={editFormV126M6.total_calories}
                          onChange={(event) =>
                            setEditFormV126M6((previous) => ({
                              ...previous,
                              total_calories: event.target.value,
                            }))
                          }
                          className={`${fieldClass} mt-2 w-full`}
                        />
                      </label>

                      <label className="block text-xs font-black text-slate-600">
                        HR rata-rata (BPM)
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={editFormV126M6.average_heart_rate}
                          onChange={(event) =>
                            setEditFormV126M6((previous) => ({
                              ...previous,
                              average_heart_rate: event.target.value,
                            }))
                          }
                          className={`${fieldClass} mt-2 w-full`}
                        />
                      </label>

                      <label className="block text-xs font-black text-slate-600">
                        HR maksimal (BPM)
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={editFormV126M6.max_heart_rate}
                          onChange={(event) =>
                            setEditFormV126M6((previous) => ({
                              ...previous,
                              max_heart_rate: event.target.value,
                            }))
                          }
                          className={`${fieldClass} mt-2 w-full`}
                        />
                      </label>

                      <label className="block text-xs font-black text-slate-600 md:col-span-2">
                        Sumber / device
                        <input
                          value={editFormV126M6.device_source}
                          onChange={(event) =>
                            setEditFormV126M6((previous) => ({
                              ...previous,
                              device_source: event.target.value,
                            }))
                          }
                          placeholder="Contoh: Mi Fitness, Garmin, Samsung Health, Manual"
                          className={`${fieldClass} mt-2 w-full`}
                        />
                      </label>

                    </>
                  ) : null}

                  <label className="block text-xs font-black text-slate-600 md:col-span-2">
                    Catatan
                    <textarea
                      value={editFormV126M6.notes}
                      onChange={(event) =>
                        setEditFormV126M6((previous) => ({
                          ...previous,
                          notes: event.target.value,
                        }))
                      }
                      rows={3}
                      className={`${fieldClass} mt-2 w-full`}
                    />
                  </label>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={closeEditHistoryV126M6}
                    disabled={savingEditV126M6}
                    className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={saveEditHistoryV126M6}
                    disabled={savingEditV126M6}
                    className="rounded-2xl bg-teal-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                  >
                    {savingEditV126M6 ? "Memverifikasi..." : "Simpan & Verifikasi"}
                  </button>
                </div>
              </>
            )}
        </HistoryEditModalShellV126M8_2>
      ) : null}

      {clinical.length > 0 ? (
        <HistoryAccordionCardV37
          title="History Klinis"
          subtitle={`${clinical.length} data`}
          open={openSection === "clinical"}
          loading={false}
          onClick={() =>
            setOpenSection(openSection === "clinical" ? "" : "clinical")
          }
        >
          <div className="space-y-3">
            {clinical.slice(0, 20).map((item: any, index: number) => (
              <HistoryGenericItemV37
                key={`${item.id || index}-${index}`}
                title={formatDateTextV37(
                  item.exam_date || item.log_date || item.created_at,
                )}
                subtitle={`BMI ${item.bmi || item.imt || "-"} | Tensi ${
                  item.systolic
                    ? `${item.systolic}/${item.diastolic || "-"}`
                    : "-"
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


// WELLNESS_EDIT_BUTTON_MODAL_WEBVIEW_V126M8_2
// Stable edit overlay for Android WebView: mount only after the client is ready,
// track the visual viewport, lock background scrolling, and keep all taps inside
// an explicit top-level portal.
function HistoryEditModalShellV126M8_2({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const [viewportFrame, setViewportFrame] = useState({
    top: 0,
    height: 0,
  });

  useEffect(() => {
    const updateViewportFrame = () => {
      const viewport = window.visualViewport;
      const top = Math.max(
        0,
        Number(viewport?.pageTop ?? window.scrollY ?? 0),
      );
      const height = Math.max(
        320,
        Number(viewport?.height ?? window.innerHeight ?? 0),
      );

      setViewportFrame({ top, height });
    };

    updateViewportFrame();

    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    window.addEventListener("resize", updateViewportFrame);
    window.visualViewport?.addEventListener(
      "resize",
      updateViewportFrame,
    );
    window.visualViewport?.addEventListener(
      "scroll",
      updateViewportFrame,
    );

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      window.removeEventListener("resize", updateViewportFrame);
      window.visualViewport?.removeEventListener(
        "resize",
        updateViewportFrame,
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        updateViewportFrame,
      );
    };
  }, []);

  if (
    typeof document === "undefined" ||
    viewportFrame.height <= 0
  ) {
    return null;
  }

  return createPortal(
    <div
      data-wellness-history-edit-modal="v126m8-2"
      style={{
        position: "absolute",
        top: `${viewportFrame.top}px`,
        left: 0,
        right: 0,
        height: `${viewportFrame.height}px`,
        zIndex: 2147483600,
        pointerEvents: "auto",
        background: "rgba(15, 23, 42, 0.55)",
      }}
    >
      <button
        type="button"
        aria-label="Tutup edit"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          width: "100%",
          height: "100%",
          border: 0,
          padding: 0,
          background: "transparent",
          pointerEvents: "auto",
          touchAction: "manipulation",
        }}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Edit riwayat wellness"
        className="absolute inset-0 z-10 overflow-y-auto overscroll-contain bg-white px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] shadow-2xl md:inset-4 md:m-auto md:max-h-[92vh] md:max-w-2xl md:rounded-[2rem] md:p-6"
        style={{
          pointerEvents: "auto",
          WebkitOverflowScrolling: "touch",
          transform: "translateZ(0)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>,
    document.body,
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
          <div className="text-2xl font-black text-slate-950">{title}</div>

          <div className="mt-2 text-sm font-bold leading-5 text-slate-500">
            {loading ? "Memuat data..." : subtitle}
          </div>
        </div>

        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-slate-50 text-xl font-black text-slate-700">
          {open ? "-" : "+"}
        </div>
      </button>

      {open ? <div className="mt-5">{children}</div> : null}
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
  status = "",
  statusTone = "primary",
  onEdit,
  onDelete,
  deleting = false,
}: {
  title: string;
  subtitle: string;
  note: string;
  status?: string;
  statusTone?: "primary" | "secondary";
  onEdit?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  return (
    <div className="rounded-[1.7rem] bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-black text-slate-950">{title}</div>
          <div className="mt-1 text-xs font-bold text-slate-400">
            {subtitle}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {status ? (
            <span
              className={`rounded-full px-3 py-1 text-[10px] font-black ${
                statusTone === "primary"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {status}
            </span>
          ) : null}

          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              title="Edit data"
              aria-label="Edit data"
              data-wellness-edit-button="workout"
              data-wellness-edit-syntax="WELLNESS_EDIT_BUTTON_SYNTAX_REPAIR_V126M8_3_1"
              className="grid h-10 w-10 place-items-center rounded-full border border-amber-200 bg-white text-amber-600 transition hover:bg-amber-50 active:bg-amber-100"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" />
              </svg>
            </button>
          ) : null}

          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              title="Hapus workout"
              aria-label="Hapus workout"
              className="grid h-10 w-10 place-items-center rounded-full border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50"
            >
              {deleting ? (
                <span className="text-[10px] font-black">...</span>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6"
                  />
                </svg>
              )}
            </button>
          ) : null}
        </div>
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

function HistoryMealItemV37({
  item,
  onEdit,
  onDelete,
  deleting = false,
}: {
  item: any;
  onEdit?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const photo = normalizeImageUrlV37(item.photo_url);
  const sourceLabel =
    item.source ===
      "google_sheet_supabase"
      ? "Google Sheet + Supabase"
      : item.source ===
          "google_sheet"
        ? "Google Sheet"
        : item.source ===
            "supabase"
          ? "Supabase"
          : item.source ||
            "Food log";

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
            {formatDateTextV37(item.log_date || item.created_at)} |{" "}
            {item.meal_time || item.meal_type || "-"}
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

        <div className="flex shrink-0 items-center gap-2">
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              title="Edit makanan"
              aria-label="Edit makanan"
              data-wellness-edit-button="nutrition"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-amber-200 bg-white text-amber-600 transition hover:bg-amber-50 active:bg-amber-100"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" />
              </svg>
            </button>
          ) : null}

          {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            title="Hapus makanan"
            aria-label="Hapus makanan"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50"
          >
            {deleting ? (
              <span className="text-[10px] font-black">...</span>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6"
                />
              </svg>
            )}
          </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function filterHistoryByDateV37(
  items: any[],
  startDate: string,
  endDate: string,
  keys: string[],
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
    const localDate = jakartaDateFromAny(item?.[key]);
    if (localDate) return localDate;
  }

  return "";
}

function formatDateTextV37(value: any) {
  const raw = clean(value);
  if (!raw) return "-";
  return jakartaDateFromAny(raw) || raw.slice(0, 10);
}
function DevicesTab({
  healthConnectConnected,
  googleFitConnected,
  healthConnectLastSyncAt,
  googleFitLastSyncAt,
  googleFitLastSyncSnapshot,
  fitnessSettings,
  syncing,
  syncProvider,
}: {
  healthConnectConnected: boolean;
  googleFitConnected: boolean;
  healthConnectLastSyncAt: string;
  googleFitLastSyncAt: string;
  googleFitLastSyncSnapshot: any;
  fitnessSettings: any;
  syncing: string;
  // WELLNESS_GOOGLEFIT_MANUAL_BACKFILL_30D_V126M98_2_4
  syncProvider: (
    provider: "strava" | "google-fit",
    options?: { silent?: boolean; days?: number },
  ) => void;
}) {
  // WELLNESS_PARTICIPANT_SINGLE_FITNESS_SOURCE_UI_V79F
  const enabled = fitnessSettings?.fitness_enabled === true;
  const source = clean(fitnessSettings?.fitness_source || "none")
    .toLowerCase()
    .replace(/-/g, "_");
  const sourceLabel =
    source === "health_connect"
      ? "Health Connect"
      : source === "google_fit"
        ? "Google Fit"
        : "Belum dipilih";
  const connectedProviders = Array.isArray(
    fitnessSettings?.connected_providers,
  )
    ? fitnessSettings.connected_providers
    : [];
  const hasMultiple =
    fitnessSettings?.has_multiple_active_providers === true ||
    connectedProviders.filter((item: any) =>
      ["health_connect", "google_fit"].includes(clean(item).toLowerCase()),
    ).length > 1;
  const healthSelected = enabled && source === "health_connect";
  const googleSelected = enabled && source === "google_fit";

  return (
    <section className="space-y-5">
      <div className="rounded-[1.5rem] border border-sky-100 bg-sky-50 p-4 text-sky-950">
        <div className="text-[10px] font-black uppercase tracking-[0.15em] text-sky-700">
          Sumber Fitness Aktif
        </div>
        <div className="mt-1 text-xl font-black">
          {enabled ? sourceLabel : "Fitness App Nonaktif"}
        </div>
        <div className="mt-2 text-xs font-bold leading-5 text-sky-800">
          Dashboard, grafik, target workout, dan ranking hanya menggunakan satu
          sumber yang dipilih Admin. Data Health Connect dan Google Fit tidak
          dijumlahkan.
        </div>
      </div>

      {hasMultiple ? (
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
          ⚠️ Hanya boleh memilih satu aplikasi fitness. Hubungi Admin untuk
          menonaktifkan salah satu koneksi.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <div
          className={`rounded-[2rem] border bg-white p-6 shadow-sm ${
            healthSelected
              ? "border-emerald-300 ring-4 ring-emerald-100"
              : "border-slate-200"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">Health Connect</h2>
              <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                Steps, kalori aktivitas, jarak, dan durasi dari Android.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-2 text-xs font-black ${
                healthSelected
                  ? "bg-emerald-600 text-white"
                  : healthConnectConnected
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {healthSelected
                ? "Sumber Aktif"
                : healthConnectConnected
                  ? "Connected"
                  : "Belum sync"}
            </span>
          </div>

          {!enabled ? (
            <div className="mt-5 rounded-3xl bg-slate-100 p-4 text-xs font-bold leading-5 text-slate-600">
              Fitness App dinonaktifkan oleh Admin.
            </div>
          ) : !healthSelected ? (
            <div className="mt-5 rounded-3xl bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-900">
              Health Connect tidak dipakai untuk capaian karena sumber aktif saat
              ini adalah {sourceLabel}.
            </div>
          ) : (
            <div className="mt-5 rounded-3xl bg-emerald-50 p-4 text-xs font-bold leading-5 text-emerald-900">
              Buka aplikasi Harmony Health Connect di HP Android, lalu klik Sync
              Hari Ini. Nilai yang dipakai adalah active calories.
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Last Sync
            </div>
            <div className="mt-1 break-words text-sm font-black text-slate-900">
              {formatFitnessLastSync(healthConnectLastSyncAt)}
            </div>
          </div>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-full bg-emerald-600 px-5 py-3 text-xs font-black text-white shadow-lg shadow-emerald-100"
          >
            Refresh Portal
          </button>
        </div>

        <div
          className={`rounded-[2rem] border bg-white p-6 shadow-sm ${
            googleSelected
              ? "border-blue-300 ring-4 ring-blue-100"
              : "border-slate-200"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">Google Fit</h2>
              <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
                Steps dan aktivitas harian dari akun Google.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-2 text-xs font-black ${
                googleSelected
                  ? "bg-blue-600 text-white"
                  : googleFitConnected
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {googleSelected && googleFitConnected
                ? "Aktif · Connected"
                : googleSelected
                  ? "Dipilih · Belum terhubung"
                  : googleFitConnected
                    ? "Connected"
                    : "Not connected"}
            </span>
          </div>

          {googleSelected && !googleFitConnected ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-800">
              Google Fit sudah dipilih sebagai sumber, tetapi token koneksi belum tersimpan. Tekan Reconnect Google Fit dan kembali ke portal setelah izin selesai.
            </div>
          ) : null}

          <div className="mt-5 rounded-3xl bg-blue-50 p-4 text-xs font-bold leading-5 text-blue-950">
            <div>
              Tombol Sync menggunakan koneksi Google Fit yang sudah tersimpan
              di server. Setelah akun terhubung satu kali, sinkronisasi berikutnya
              tidak perlu memilih email kembali.
            </div>
            <div className="mt-1">
              Kalori yang disinkronkan adalah total Google Fit termasuk energi
              istirahat/basal. Kalori aktif tidak ditebak atau diestimasi.
            </div>
          </div>

          {!enabled ? (
            <div className="mt-4 rounded-2xl bg-slate-100 p-3 text-xs font-bold text-slate-600">
              Fitness App dinonaktifkan oleh Admin.
            </div>
          ) : !googleSelected ? (
            <div className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900">
              Google Fit tidak dipakai untuk capaian karena sumber aktif saat ini
              adalah {sourceLabel}.
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-500">
              Last Sync Google Fit
            </div>
            <div className="mt-1 break-words text-sm font-black text-blue-950">
              {syncing === "google-fit"
                ? "Sedang memperbarui..."
                : formatFitnessLastSync(googleFitLastSyncAt)}
            </div>

            {googleFitLastSyncSnapshot ? (
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-blue-100 pt-3">
                <div className="rounded-xl bg-white/80 px-3 py-2">
                  <div className="text-[9px] font-black uppercase tracking-wide text-blue-400">
                    Steps saat sync
                  </div>
                  <div className="mt-1 text-base font-black text-blue-950">
                    {fmtNumber(googleFitLastSyncSnapshot.steps || 0, 0)}
                  </div>
                </div>
                <div className="rounded-xl bg-white/80 px-3 py-2">
                  <div className="text-[9px] font-black uppercase tracking-wide text-blue-400">
                    Kalori total saat sync
                  </div>
                  <div className="mt-1 text-base font-black text-blue-950">
                    {fmtNumber(
                      googleFitLastSyncSnapshot.total_calories || 0,
                      0,
                    )} kkal
                  </div>
                </div>
                <div className="col-span-2 break-all rounded-xl bg-white/60 px-3 py-2 text-[9px] font-bold leading-4 text-blue-700">
                  Sumber steps: {clean(
                    googleFitLastSyncSnapshot.step_data_source_id ||
                      "estimated_steps",
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {googleSelected ? (
              <a
                href="/api/wellness/integrations/google-fit/connect"
                className="rounded-full bg-blue-600 px-5 py-3 text-xs font-black text-white shadow-lg shadow-blue-100"
              >
                {googleFitConnected ? "Ganti Akun Google Fit" : "Konek Google Fit"}
              </a>
            ) : (
              <span className="rounded-full bg-slate-100 px-5 py-3 text-xs font-black text-slate-500">
                Pilih melalui Portal Admin
              </span>
            )}

            <button
              type="button"
              onClick={() => syncProvider("google-fit", { days: 30 })}
              disabled={
                !googleSelected ||
                !googleFitConnected ||
                syncing === "google-fit"
              }
              className="rounded-full bg-slate-900 px-5 py-3 text-xs font-black text-white disabled:opacity-40"
            >
              {syncing === "google-fit"
                ? "Sync..."
                : "Sync Google Fit"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
function ProfileTab({
  participant,
  integrations,
  fitnessSettings,
  logout,
}: {
  participant: any;
  integrations: any[];
  fitnessSettings: any;
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
    <div className="space-y-5">
      <WellnessProfilePanel
        actorType="participant"
        actor={participant}
        title={participant?.name || "Profil Peserta"}
      />
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black">Data Peserta</h2>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <ProfileRow label="Participant ID" value={participantId} />
          <ProfileRow label="Nama" value={participant?.name} />
          <ProfileRow label="Kode Karyawan" value={participant?.code} />

          <ProfileRow
            label="Asal Perusahaan"
            value={
              participant?.company_name ||
              participant?.company ||
              participant?.nama_perusahaan ||
              "-"
            }
          />

          <ProfileRow
            label="Login Terakhir"
            value={
              participant?.last_login_at
                ? new Date(
                    participant.last_login_at,
                  ).toLocaleString(
                    "id-ID",
                    {
                      timeZone:
                        "Asia/Jakarta",
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )
                : "Belum tersedia"
            }
          />

          <ProfileRow label="Gender" value={participant?.gender} />
          <ProfileRow
            label="Email"
            value={participant?.portal_email || participant?.email}
          />
          <ProfileRow
            label="Nomor HP"
            value={participant?.portal_phone || participant?.phone}
          />
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
            Masukkan angka ini pada aplikasi Harmony Health Connect di HP
            Android, bukan Kode Karyawan.
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <div className="rounded-3xl bg-sky-50 p-4">
            <div className="text-sm font-black text-sky-950">
              Session Wellness
            </div>
            <div className="mt-2 text-xs font-bold text-sky-700">
              {fitnessSettings?.session_enabled === false
                ? "Dinonaktifkan Admin"
                : "Aktif"}
            </div>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4">
            <div className="text-sm font-black text-slate-900">
              Fitness Source
            </div>
            <div className="mt-2 text-xs font-bold text-slate-500">
              {fitnessSettings?.fitness_enabled
                ? clean(fitnessSettings?.fitness_source) === "health_connect"
                  ? "Health Connect"
                  : clean(fitnessSettings?.fitness_source) === "google_fit"
                    ? "Google Fit"
                    : "Belum dipilih"
                : "Nonaktif"}
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-3xl bg-slate-50 p-4">
          <div className="text-sm font-black text-slate-900">
            Device Connected
          </div>
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
    </div>
  );
}
function ProfileRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-black text-slate-900">{fmt(value)}</div>
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
      item?.date,
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

  return Array.from(unique.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
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
        <BloodPressureChart
          systolic={systolicSeries}
          diastolic={diastolicSeries}
        />
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
          {latest
            ? `${fmtNumber(latest.value, 1)}${unit ? ` ${unit}` : ""}`
            : "-"}
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
        <SmoothSvgChart
          series={systolic.slice(-8)}
          height={105}
          showLabels={false}
        />
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-500">
        <span className="h-3 w-3 rounded-full bg-teal-500" />
        Tren sistolik utama
      </div>
    </div>
  );
}

function SimpleSvgLine({
  series,
}: {
  series: Array<{ date: string; value: number }>;
}) {
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

      <path d={areaPath} fill="#14b8a6" fillOpacity="0.10" />

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
