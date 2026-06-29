"use client";

// WELLNESS_WORKOUT_LOG_RESPONSIVE_V384
// Mobile: card layout, no horizontal slide.
// Desktop: full table layout.

type ActivityItem = Record<string, any>;

type Props = {
  items?: ActivityItem[];
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function toNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatDate(value: any) {
  const text = clean(value);
  if (!text) return "-";

  const dateText = text.length >= 10 ? text.slice(0, 10) : text;
  const date = new Date(dateText);

  if (Number.isNaN(date.getTime())) return dateText;

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: any) {
  const text = clean(value);
  if (!text) return "-";

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return formatDate(text);

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatNumber(value: any, digits = 0) {
  const n = toNumber(value);
  if (n === null) return "-";

  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
}

function getDate(item: ActivityItem) {
  return (
    item.log_date ||
    item.date ||
    item.started_at ||
    item.start_date_local ||
    item.start_date ||
    item.created_at ||
    null
  );
}

function getStartedAt(item: ActivityItem) {
  return (
    item.started_at ||
    item.start_date_local ||
    item.start_date ||
    item.created_at ||
    null
  );
}

function getName(item: ActivityItem) {
  return (
    clean(item.activity_name) ||
    clean(item.name) ||
    clean(item.title) ||
    clean(item.sport_type) ||
    clean(item.activity_type) ||
    "Workout"
  );
}

function getType(item: ActivityItem) {
  return (
    clean(item.activity_type) ||
    clean(item.sport_type) ||
    clean(item.type) ||
    clean(item.workout_type) ||
    "-"
  );
}

function getSource(item: ActivityItem) {
  return (
    clean(item.source) ||
    clean(item.provider) ||
    clean(item.input_source) ||
    "manual"
  );
}

function getDurationMinutes(item: ActivityItem) {
  const direct =
    toNumber(item.duration_minutes) ??
    toNumber(item.total_duration_minutes) ??
    toNumber(item.minutes);

  if (direct !== null) return direct;

  const movingTime = toNumber(item.moving_time);
  if (movingTime !== null) return movingTime / 60;

  const elapsedTime = toNumber(item.elapsed_time);
  if (elapsedTime !== null) return elapsedTime / 60;

  return null;
}

function getDistanceKm(item: ActivityItem) {
  const direct =
    toNumber(item.distance_km) ??
    toNumber(item.total_distance_km) ??
    toNumber(item.km);

  if (direct !== null) return direct;

  const distance = toNumber(item.distance);
  if (distance === null) return null;

  if (distance > 100) return distance / 1000;

  return distance;
}

function getCalories(item: ActivityItem) {
  return (
    toNumber(item.calories) ??
    toNumber(item.total_calories) ??
    toNumber(item.kcal) ??
    null
  );
}

function getExternalId(item: ActivityItem) {
  return (
    clean(item.external_activity_id) ||
    clean(item.provider_activity_id) ||
    clean(item.id) ||
    "-"
  );
}

function sourceBadgeClass(source: string) {
  const text = source.toLowerCase();

  if (text.includes("strava")) {
    return "bg-orange-50 text-orange-700 ring-orange-100";
  }

  if (text.includes("google")) {
    return "bg-blue-50 text-blue-700 ring-blue-100";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function WorkoutMobileCard({
  item,
  index,
}: {
  item: ActivityItem;
  index: number;
}) {
  const source = getSource(item);
  const badgeClass = sourceBadgeClass(source);

  const duration = getDurationMinutes(item);
  const distance = getDistanceKm(item);
  const calories = getCalories(item);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-slate-950">
            {getName(item)}
          </div>

          <div className="mt-1 text-xs font-semibold text-slate-500">
            {formatDate(getDate(item))}
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black capitalize ring-1 ${badgeClass}`}
        >
          {source}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-slate-50 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Jenis
          </div>
          <div className="mt-1 truncate text-sm font-black text-slate-900">
            {getType(item)}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Durasi
          </div>
          <div className="mt-1 text-sm font-black text-slate-900">
            {duration !== null ? `${formatNumber(duration, 1)} menit` : "-"}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Jarak
          </div>
          <div className="mt-1 text-sm font-black text-slate-900">
            {distance !== null ? `${formatNumber(distance, 2)} km` : "-"}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Kalori
          </div>
          <div className="mt-1 text-sm font-black text-slate-900">
            {calories !== null
              ? `${formatNumber(Math.round(calories), 0)} kkal`
              : "-"}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-slate-50 p-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Waktu Aktivitas
        </div>
        <div className="mt-1 text-xs font-bold text-slate-700">
          {formatDateTime(getStartedAt(item))}
        </div>
      </div>
    </div>
  );
}

export default function WorkoutLogResponsive({ items = [] }: Props) {
  const rows = Array.isArray(items) ? items : [];

  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <div className="text-sm font-black text-slate-800">
          Belum ada data workout.
        </div>

        <div className="mt-1 text-xs font-semibold text-slate-500">
          Data akan muncul setelah peserta mengisi aktivitas manual atau melakukan
          Sync Strava.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="space-y-3 md:hidden">
        {rows.map((item, index) => (
          <WorkoutMobileCard
            key={`${getExternalId(item)}-${index}`}
            item={item}
            index={index}
          />
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-3xl border border-slate-200 bg-white md:block">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Workout</th>
              <th className="px-4 py-3">Jenis</th>
              <th className="px-4 py-3">Durasi</th>
              <th className="px-4 py-3">Jarak</th>
              <th className="px-4 py-3">Kalori</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Waktu Aktivitas</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((item, index) => {
              const source = getSource(item);
              const duration = getDurationMinutes(item);
              const distance = getDistanceKm(item);
              const calories = getCalories(item);

              return (
                <tr
                  key={`${getExternalId(item)}-${index}`}
                  className="border-b border-slate-100 last:border-b-0"
                >
                  <td className="px-4 py-3 font-bold text-slate-700">
                    {formatDate(getDate(item))}
                  </td>

                  <td className="max-w-[240px] px-4 py-3">
                    <div className="truncate font-black text-slate-950">
                      {getName(item)}
                    </div>

                    <div className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                      ID: {getExternalId(item)}
                    </div>
                  </td>

                  <td className="px-4 py-3 font-semibold text-slate-700">
                    {getType(item)}
                  </td>

                  <td className="px-4 py-3 font-semibold text-slate-700">
                    {duration !== null ? `${formatNumber(duration, 1)} menit` : "-"}
                  </td>

                  <td className="px-4 py-3 font-semibold text-slate-700">
                    {distance !== null ? `${formatNumber(distance, 2)} km` : "-"}
                  </td>

                  <td className="px-4 py-3 font-black text-slate-950">
                    {calories !== null
                      ? `${formatNumber(Math.round(calories), 0)} kkal`
                      : "-"}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${sourceBadgeClass(
                        source
                      )}`}
                    >
                      {source}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-xs font-semibold text-slate-500">
                    {formatDateTime(getStartedAt(item))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}