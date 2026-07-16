"use client";

// WELLNESS_WORKOUT_LOG_RESPONSIVE_HEALTH_CONNECT_V423
// WELLNESS_WORKOUT_LOG_ACTIVE_CALORIE_GUARD_V70
// Fix:
// - History Workout membaca steps dari Health Connect.
// - Membaca calories, duration, distance dari Google Fit / Health Connect / manual.
// - Menampilkan source badge lebih rapi.
// - Tidak mengubah logic simpan data, hanya tampilan history.

function clean(value: any) {
  return String(value ?? "").trim();
}

function asNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtNumber(value: any, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";

  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
}

function fmtDate(value: any) {
  const text = clean(value);
  if (!text) return "-";

  const dateOnly = text.slice(0, 10);
  const parts = dateOnly.split("-");

  if (parts.length !== 3) return dateOnly;

  const monthMap: Record<string, string> = {
    "01": "Jan",
    "02": "Feb",
    "03": "Mar",
    "04": "Apr",
    "05": "Mei",
    "06": "Jun",
    "07": "Jul",
    "08": "Agu",
    "09": "Sep",
    "10": "Okt",
    "11": "Nov",
    "12": "Des",
  };

  return `${parts[2]} ${monthMap[parts[1]] || parts[1]} ${parts[0]}`;
}

function fmtTime(value: any) {
  const text = clean(value);
  if (!text) return "-";

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return text.replace("T", " ").slice(0, 16);
}

function sourceLabel(item: any) {
  const source = clean(item?.source || item?.input_source || item?.provider).toLowerCase();

  if (source === "health_connect" || source === "health-connect") return "Health Connect";
  if (source === "google_fit" || source === "google-fit") return "Google Fit";
  if (source === "strava") return "Strava";
  if (source === "manual") return "Manual";

  const rawProvider = clean(item?.raw_payload?.provider).toLowerCase();
  if (rawProvider === "health_connect") return "Health Connect";
  if (rawProvider === "google_fit") return "Google Fit";

  return clean(item?.source || item?.provider || "Manual");
}

function badgeClass(item: any) {
  const label = sourceLabel(item).toLowerCase();

  if (label.includes("health connect")) {
    return "bg-emerald-50 text-emerald-700";
  }

  if (label.includes("google fit")) {
    return "bg-blue-50 text-blue-700";
  }

  if (label.includes("strava")) {
    return "bg-orange-50 text-orange-700";
  }

  return "bg-slate-50 text-slate-600";
}

function activityDate(item: any) {
  return (
    clean(item?.log_date).slice(0, 10) ||
    clean(item?.date).slice(0, 10) ||
    clean(item?.tanggal).slice(0, 10) ||
    clean(item?.started_at).slice(0, 10) ||
    clean(item?.created_at).slice(0, 10)
  );
}

function activityName(item: any) {
  const raw = item?.raw_payload || {};

  return (
    clean(item?.activity_name) ||
    clean(item?.nama_activities) ||
    clean(item?.activity_type) ||
    clean(raw?.name) ||
    clean(raw?.sport_type) ||
    clean(raw?.sync_mode) ||
    "Aktivitas"
  );
}

function activityType(item: any) {
  const raw = item?.raw_payload || {};

  return (
    clean(item?.activity_type) ||
    clean(item?.jenis) ||
    clean(raw?.provider) ||
    clean(raw?.type) ||
    clean(raw?.sport_type) ||
    sourceLabel(item)
  );
}

function activityDuration(item: any) {
  const raw = item?.raw_payload || {};

  return asNumber(
    item?.duration_minutes ??
      item?.total_duration_minutes ??
      item?.elapsed_minutes ??
      raw?.health_connect_active_minutes ??
      raw?.google_fit_active_minutes ??
      raw?.active_minutes ??
      raw?.duration_minutes
  );
}

function isDailyDeviceRow(item: any) {
  const source = clean(item?.source || item?.input_source || item?.provider).toLowerCase();
  const externalId = clean(item?.external_activity_id || item?.provider_activity_id).toLowerCase();
  const syncMode = clean(item?.raw_payload?.sync_mode).toLowerCase();
  const name = clean(item?.activity_name || item?.activity_type).toLowerCase();

  if (source === "google_fit" || source === "google-fit") {
    return externalId.includes("google_fit_daily_") || name.includes("google fit daily") || syncMode === "aggregate_daily";
  }

  if (source === "health_connect" || source === "health-connect") {
    return externalId.includes("health_connect_daily_") || name.includes("health connect daily") || syncMode === "daily_aggregate";
  }

  return false;
}

function activityCalories(item: any) {
  const raw = item?.raw_payload || {};
  const sanitized = asNumber(raw?.sanitized_active_calories);
  if (sanitized > 0) return sanitized;

  const stored = asNumber(
    item?.calories ??
      item?.total_calories ??
      item?.activity_calories ??
      item?.calories_burned ??
      raw?.health_connect_calories ??
      raw?.health_connect_calories_original ??
      raw?.health_connect_active_calories ??
      raw?.google_fit_calories_expended ??
      raw?.calories ??
      raw?.active_calories ??
      raw?.calories_burned
  );

  if (!isDailyDeviceRow(item)) return stored;

  const steps = activitySteps(item);
  const minutes = activityDuration(item);
  const distanceRaw = activityDistance(item);
  const estimatedDistance = steps > 0 ? steps * 0.0007 : distanceRaw;
  const minDistance = Math.max(0.05, steps * 0.00025);
  const maxDistance = Math.max(0.3, steps * 0.0015);
  const distance =
    steps > 0 && distanceRaw >= minDistance && distanceRaw <= maxDistance
      ? distanceRaw
      : estimatedDistance;

  if (steps > 0) {
    return Math.max(1, Math.round(Math.min(distance * 70 * 0.53, steps * 0.1)));
  }

  if (minutes > 0) return Math.min(1200, Math.max(1, Math.round(minutes * 4.2)));

  return stored > 0 && stored <= 1200 ? stored : 0;
}

function activityDistance(item: any) {
  const raw = item?.raw_payload || {};

  return asNumber(
    item?.distance_km ??
      item?.total_distance_km ??
      raw?.health_connect_distance_km ??
      raw?.google_fit_distance_km ??
      raw?.distance_km ??
      (raw?.distance ? Number(raw.distance) / 1000 : null)
  );
}

function activitySteps(item: any) {
  const raw = item?.raw_payload || {};

  return asNumber(
    item?.steps ??
      item?.total_steps ??
      raw?.health_connect_steps ??
      raw?.google_fit_steps ??
      raw?.steps ??
      raw?.total_steps
  );
}

function activityTime(item: any) {
  return (
    clean(item?.started_at) ||
    clean(item?.start_date_local) ||
    clean(item?.raw_payload?.start_date_local) ||
    clean(item?.raw_payload?.health_connect_last_sync_at) ||
    clean(item?.raw_payload?.google_fit_last_sync_at) ||
    clean(item?.updated_at) ||
    clean(item?.created_at) ||
    clean(item?.log_date)
  );
}

function sortKey(item: any) {
  const raw =
    clean(item?.started_at) ||
    clean(item?.updated_at) ||
    clean(item?.created_at) ||
    clean(item?.log_date) ||
    clean(item?.date);

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.getTime();

  return 0;
}

export default function WorkoutLogResponsive({ items }: { items: any[] }) {
  const rows = Array.isArray(items) ? [...items] : [];

  const sorted = rows.sort((a, b) => {
    const timeDiff = sortKey(b) - sortKey(a);
    if (timeDiff !== 0) return timeDiff;

    return String(activityDate(b)).localeCompare(String(activityDate(a)));
  });

  if (!sorted.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
        Belum ada history workout.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sorted.map((item, index) => {
        const name = activityName(item);
        const date = activityDate(item);
        const type = activityType(item);
        const duration = activityDuration(item);
        const distance = activityDistance(item);
        const calories = activityCalories(item);
        const steps = activitySteps(item);
        const source = sourceLabel(item);

        return (
          <div
            key={`${item?.id || item?.external_activity_id || index}-${index}`}
            className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-black text-slate-950">
                  {name}
                </div>
                <div className="mt-1 text-xs font-bold text-slate-500">
                  {fmtDate(date)}
                </div>
              </div>

              <div
                className={`rounded-full px-4 py-2 text-xs font-black ${badgeClass(item)}`}
              >
                {source}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <InfoBox label="Jenis" value={type} />
              <InfoBox label="Durasi" value={`${fmtNumber(duration, 1)} menit`} />
              <InfoBox label="Jarak" value={`${fmtNumber(distance, 2)} km`} />
              <InfoBox label="Kalori" value={`${fmtNumber(calories, 0)} kkal`} />
              <InfoBox label="Steps" value={fmtNumber(steps, 0)} />
              <InfoBox label="Waktu" value={fmtTime(activityTime(item))} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-black text-slate-900">
        {clean(value) || "-"}
      </div>
    </div>
  );
}