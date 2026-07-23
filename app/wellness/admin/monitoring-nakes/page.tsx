"use client";

import { useEffect, useMemo, useState } from "react";

// WELLNESS_ADMIN_MONITORING_NAKES_V115
// Read-only dashboard menggunakan /api/wellness/dashboard existing.
// Tidak menulis atau mengubah data pemeriksaan.

type RiskFilter = "all" | "high" | "medium" | "low" | "unclassified";

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberOrNull(value: any): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(String(value).replace(",", "."));

  return Number.isFinite(parsed) ? parsed : null;
}

function fmt(value: any, digits = 1) {
  const parsed = numberOrNull(value);

  if (parsed === null) return "-";

  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: digits,
  }).format(parsed);
}

function initials(name: any) {
  const words = clean(name).split(/\s+/).filter(Boolean);

  return (
    `${words[0]?.[0] || "P"}${words[1]?.[0] || ""}`.toUpperCase()
  );
}

function formatDate(value: any) {
  const text = clean(value);

  if (!text) return "Belum ada";

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return text.slice(0, 10);
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function riskLevel(item: any): Exclude<RiskFilter, "all"> {
  const level = clean(item?.risk_level).toLowerCase();
  const flag = clean(item?.flag).toLowerCase();
  const label = clean(
    item?.risk_label ||
      item?.risk_group_name ||
      item?.compliance_status,
  ).toLowerCase();

  if (
    level === "high" ||
    flag === "red" ||
    item?.need_followup ||
    /tinggi|high|red|drop risk|tidak aktif/.test(label)
  ) {
    return "high";
  }

  if (
    level === "medium" ||
    flag === "yellow" ||
    /sedang|medium|yellow|dipantau/.test(label)
  ) {
    return "medium";
  }

  if (
    level === "low" ||
    flag === "green" ||
    /rendah|low|green|baik|patuh/.test(label)
  ) {
    return "low";
  }

  return "unclassified";
}

function riskLabel(level: Exclude<RiskFilter, "all">) {
  if (level === "high") return "RISIKO TINGGI";
  if (level === "medium") return "PERLU PERHATIAN";
  if (level === "low") return "TERKENDALI";

  return "BELUM DINILAI";
}

function riskTone(level: Exclude<RiskFilter, "all">) {
  if (level === "high") {
    return {
      pill: "border-rose-200 bg-rose-50 text-rose-700",
      solid: "bg-rose-600 text-white",
      soft: "bg-rose-50 text-rose-800",
      dot: "bg-rose-500",
    };
  }

  if (level === "medium") {
    return {
      pill: "border-orange-200 bg-orange-50 text-orange-700",
      solid: "bg-orange-500 text-white",
      soft: "bg-orange-50 text-orange-800",
      dot: "bg-orange-500",
    };
  }

  if (level === "low") {
    return {
      pill: "border-emerald-200 bg-emerald-50 text-emerald-700",
      solid: "bg-emerald-600 text-white",
      soft: "bg-emerald-50 text-emerald-800",
      dot: "bg-emerald-500",
    };
  }

  return {
    pill: "border-slate-200 bg-slate-50 text-slate-600",
    solid: "bg-slate-500 text-white",
    soft: "bg-slate-50 text-slate-700",
    dot: "bg-slate-400",
  };
}

function participantHasCheckup(item: any) {
  return Boolean(
    Number(item?.history_logs_count || 0) > 0 ||
      Number(item?.mini_mcu_logs_count || 0) > 0 ||
      clean(item?.latest_history_date) ||
      clean(item?.latest_mini_mcu_date),
  );
}

function chartPoints(item: any, key: string) {
  const points = item?.parameter_charts?.[key];

  return Array.isArray(points) ? points : [];
}

function chartValues(
  points: any[],
  valueKey = "value",
) {
  return points
    .map((point) => numberOrNull(point?.[valueKey]))
    .filter((value): value is number => value !== null);
}

function LineChart({
  points,
  valueKey = "value",
  secondaryKey,
  primaryStroke = "#0d9488",
  secondaryStroke = "#3b82f6",
}: {
  points: any[];
  valueKey?: string;
  secondaryKey?: string;
  primaryStroke?: string;
  secondaryStroke?: string;
}) {
  const primary = chartValues(points, valueKey);
  const secondary = secondaryKey
    ? chartValues(points, secondaryKey)
    : [];

  const allValues = [...primary, ...secondary];

  if (!allValues.length) {
    return (
      <div className="flex h-32 items-center justify-center rounded-2xl bg-slate-50 text-xs font-bold text-slate-300">
        Belum ada data grafik
      </div>
    );
  }

  const width = 420;
  const height = 130;
  const paddingX = 18;
  const paddingY = 14;

  const minimum = Math.min(...allValues);
  const maximum = Math.max(...allValues);
  const range = maximum - minimum || 1;

  function makePoints(values: number[]) {
    return values
      .map((value, index) => {
        const x =
          values.length <= 1
            ? width / 2
            : paddingX +
              (index / (values.length - 1)) *
                (width - paddingX * 2);

        const y =
          paddingY +
          ((maximum - value) / range) *
            (height - paddingY * 2);

        return `${x},${y}`;
      })
      .join(" ");
  }

  const primaryPoints = makePoints(primary);
  const secondaryPoints = makePoints(secondary);

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-32 w-full"
        role="img"
        aria-label="Grafik perkembangan kesehatan"
      >
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={paddingX}
            x2={width - paddingX}
            y1={height * ratio}
            y2={height * ratio}
            stroke="#e2e8f0"
            strokeWidth="1"
            strokeDasharray="4 5"
          />
        ))}

        {primary.length ? (
          <polyline
            points={primaryPoints}
            fill="none"
            stroke={primaryStroke}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {secondary.length ? (
          <polyline
            points={secondaryPoints}
            fill="none"
            stroke={secondaryStroke}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {primaryPoints
          .split(" ")
          .filter(Boolean)
          .map((point, index) => {
            const [x, y] = point.split(",");

            return (
              <circle
                key={`primary-${index}`}
                cx={x}
                cy={y}
                r="4"
                fill="white"
                stroke={primaryStroke}
                strokeWidth="3"
              />
            );
          })}

        {secondaryPoints
          .split(" ")
          .filter(Boolean)
          .map((point, index) => {
            const [x, y] = point.split(",");

            return (
              <circle
                key={`secondary-${index}`}
                cx={x}
                cy={y}
                r="4"
                fill="white"
                stroke={secondaryStroke}
                strokeWidth="3"
              />
            );
          })}
      </svg>

      <div className="mt-1 flex justify-between gap-3 text-[9px] font-bold text-slate-400">
        <span>
          {points[0]?.label ||
            formatDate(points[0]?.date)}
        </span>

        <span>
          {points[points.length - 1]?.label ||
            formatDate(points[points.length - 1]?.date)}
        </span>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  note,
  icon,
  tone,
}: {
  label: string;
  value: any;
  note: string;
  icon: string;
  tone: string;
}) {
  return (
    <div
      className={`rounded-[1.4rem] border p-4 shadow-sm ${tone}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] opacity-65">
            {label}
          </div>

          <div className="mt-1 text-3xl font-black">
            {fmt(value, 0)}
          </div>

          <div className="mt-1 text-[10px] font-bold opacity-65">
            {note}
          </div>
        </div>

        <div className="text-2xl">{icon}</div>
      </div>
    </div>
  );
}

function ClinicalMetric({
  label,
  baseline,
  current,
  unit,
  delta,
  tone,
}: {
  label: string;
  baseline: any;
  current: any;
  unit?: string;
  delta?: any;
  tone: string;
}) {
  const deltaNumber = numberOrNull(delta);

  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-white p-3.5">
      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className={`text-xl font-black ${tone}`}>
            {fmt(current)}
            {unit ? (
              <span className="ml-1 text-[9px] font-bold text-slate-400">
                {unit}
              </span>
            ) : null}
          </div>

          <div className="mt-1 text-[9px] font-bold text-slate-400">
            Baseline: {fmt(baseline)}
            {unit ? ` ${unit}` : ""}
          </div>
        </div>

        {deltaNumber !== null ? (
          <div
            className={`rounded-full px-2 py-1 text-[9px] font-black ${
              deltaNumber < 0
                ? "bg-emerald-50 text-emerald-700"
                : deltaNumber > 0
                  ? "bg-orange-50 text-orange-700"
                  : "bg-slate-100 text-slate-500"
            }`}
          >
            {deltaNumber > 0 ? "+" : ""}
            {fmt(deltaNumber)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  points,
  valueKey = "value",
  secondaryKey,
  primaryStroke,
  secondaryStroke,
}: {
  title: string;
  subtitle: string;
  points: any[];
  valueKey?: string;
  secondaryKey?: string;
  primaryStroke?: string;
  secondaryStroke?: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-950">
            {title}
          </div>

          <div className="mt-1 text-[10px] font-bold text-slate-400">
            {subtitle}
          </div>
        </div>

        <span className="rounded-full bg-slate-50 px-2 py-1 text-[9px] font-black text-slate-500">
          {points.length} data
        </span>
      </div>

      <div className="mt-4">
        <LineChart
          points={points}
          valueKey={valueKey}
          secondaryKey={secondaryKey}
          primaryStroke={primaryStroke}
          secondaryStroke={secondaryStroke}
        />
      </div>
    </div>
  );
}

export default function AdminMonitoringNakesPage() {
  const [data, setData] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(
    "Memuat hasil pemeriksaan NAKES...",
  );

  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] =
    useState<RiskFilter>("all");
  const [companyFilter, setCompanyFilter] =
    useState("all");
  const [selectedId, setSelectedId] =
    useState<number | null>(null);

  async function load() {
    setLoading(true);
    setMessage("Memuat hasil pemeriksaan NAKES...");

    const result = await fetch(
      `/api/wellness/dashboard?t=${Date.now()}`,
      {
        cache: "no-store",
        credentials: "include",
      },
    )
      .then(async (response) => ({
        ...(await response.json().catch(() => ({}))),
        http_status: response.status,
      }))
      .catch((error) => ({
        ok: false,
        http_status: 0,
        message:
          error?.message || "Tidak dapat terhubung ke server.",
      }));

    if (!result?.ok) {
      setData(null);
      setRows([]);
      setMessage(
        result?.message ||
          "Hasil pemeriksaan NAKES gagal dimuat.",
      );
      setLoading(false);
      return;
    }

    const nextRows = Array.isArray(result?.rows)
      ? result.rows
      : [];

    setData(result);
    setRows(nextRows);
    setMessage("Monitoring NAKES aktif.");

    setSelectedId((current) => {
      if (
        current &&
        nextRows.some(
          (item: any) =>
            Number(item?.participant_id || item?.id || 0) ===
            current,
        )
      ) {
        return current;
      }

      const firstWithCheckup =
        nextRows.find(participantHasCheckup) ||
        nextRows[0];

      return firstWithCheckup
        ? Number(
            firstWithCheckup?.participant_id ||
              firstWithCheckup?.id ||
              0,
          )
        : null;
    });

    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const companies = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((item) => clean(item?.company_name))
            .filter(Boolean),
        ),
      ).sort((left, right) =>
        left.localeCompare(right, "id"),
      ),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const keyword = clean(query).toLowerCase();

    const riskOrder: Record<
      Exclude<RiskFilter, "all">,
      number
    > = {
      high: 0,
      medium: 1,
      unclassified: 2,
      low: 3,
    };

    return rows
      .filter((item) => {
        const level = riskLevel(item);

        const matchesKeyword =
          !keyword ||
          [
            item?.name,
            item?.code,
            item?.company_name,
            item?.group_name,
            item?.risk_label,
          ]
            .map((value) => clean(value).toLowerCase())
            .join(" ")
            .includes(keyword);

        const matchesRisk =
          riskFilter === "all" || level === riskFilter;

        const matchesCompany =
          companyFilter === "all" ||
          clean(item?.company_name) === companyFilter;

        return (
          matchesKeyword &&
          matchesRisk &&
          matchesCompany
        );
      })
      .sort((left, right) => {
        const riskDifference =
          riskOrder[riskLevel(left)] -
          riskOrder[riskLevel(right)];

        if (riskDifference !== 0) {
          return riskDifference;
        }

        const dateDifference = clean(
          right?.latest_history_date ||
            right?.latest_mini_mcu_date,
        ).localeCompare(
          clean(
            left?.latest_history_date ||
              left?.latest_mini_mcu_date,
          ),
        );

        if (dateDifference !== 0) {
          return dateDifference;
        }

        return clean(left?.name).localeCompare(
          clean(right?.name),
          "id",
        );
      });
  }, [rows, query, riskFilter, companyFilter]);

  const selectedParticipant =
    rows.find(
      (item) =>
        Number(item?.participant_id || item?.id || 0) ===
        selectedId,
    ) || null;

  const examinedCount = rows.filter(
    participantHasCheckup,
  ).length;

  const highRiskCount = rows.filter(
    (item) => riskLevel(item) === "high",
  ).length;

  const mediumRiskCount = rows.filter(
    (item) => riskLevel(item) === "medium",
  ).length;

  const selectedRisk = selectedParticipant
    ? riskLevel(selectedParticipant)
    : "unclassified";

  const selectedRiskTone = riskTone(selectedRisk);

  const bpBaseline =
    numberOrNull(selectedParticipant?.baseline_sbp) !== null ||
    numberOrNull(selectedParticipant?.baseline_dbp) !== null
      ? `${fmt(
          selectedParticipant?.baseline_sbp,
          0,
        )}/${fmt(
          selectedParticipant?.baseline_dbp,
          0,
        )}`
      : "-";

  const bpCurrent =
    numberOrNull(selectedParticipant?.sbp) !== null ||
    numberOrNull(selectedParticipant?.dbp) !== null
      ? `${fmt(selectedParticipant?.sbp, 0)}/${fmt(
          selectedParticipant?.dbp,
          0,
        )}`
      : "-";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fbfc_0%,#f2f7fa_45%,#f8fafc_100%)] pb-10 text-slate-950">
      <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-5 lg:px-7">
        <header className="rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <a
                href="/wellness/admin"
                className="flex h-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
              >
                ← Admin
              </a>

              <div className="min-w-0">
                <div className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">
                  Harmony Health Admin
                </div>

                <h1 className="truncate text-lg font-black text-slate-950 sm:text-xl">
                  Monitoring NAKES
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href="/wellness/nakes-input"
                className="hidden rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-800 sm:block"
              >
                Form Input NAKES
              </a>

              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white shadow-sm disabled:cursor-wait disabled:opacity-60"
              >
                {loading ? "Memuat..." : "↻ Sync Data"}
              </button>
            </div>
          </div>
        </header>

        <section className="mt-4 overflow-hidden rounded-[1.65rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                Monitoring Klinis
              </div>

              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                Kemajuan Kesehatan Peserta
              </h2>

              <p className="mt-2 max-w-3xl text-xs font-bold leading-5 text-slate-500 sm:text-sm">
                Pantau hasil pemeriksaan NAKES, perbandingan
                baseline–terbaru, status risiko, dan grafik
                perkembangan kesehatan peserta.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[720px]">
              <input
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                placeholder="Cari nama, kode, grup..."
                className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
              />

              <select
                value={companyFilter}
                onChange={(event) =>
                  setCompanyFilter(event.target.value)
                }
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
              >
                <option value="all">
                  Semua Perusahaan
                </option>

                {companies.map((company) => (
                  <option
                    key={company}
                    value={company}
                  >
                    {company}
                  </option>
                ))}
              </select>

              <select
                value={riskFilter}
                onChange={(event) =>
                  setRiskFilter(
                    event.target.value as RiskFilter,
                  )
                }
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
              >
                <option value="all">
                  Semua Risiko
                </option>
                <option value="high">
                  Risiko Tinggi
                </option>
                <option value="medium">
                  Perlu Perhatian
                </option>
                <option value="low">
                  Terkendali
                </option>
                <option value="unclassified">
                  Belum Dinilai
                </option>
              </select>
            </div>
          </div>

          <div
            className={`mt-3 text-[10px] font-bold ${
              /gagal|unauthorized|session/i.test(message)
                ? "text-rose-600"
                : "text-slate-400"
            }`}
          >
            {message}
          </div>
        </section>

        <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Total Peserta"
            value={rows.length}
            note="Peserta dalam scope Admin"
            icon="👥"
            tone="border-emerald-100 bg-emerald-50 text-emerald-950"
          />

          <SummaryCard
            label="Pemeriksaan NAKES"
            value={examinedCount}
            note="Memiliki history pemeriksaan"
            icon="🩺"
            tone="border-sky-100 bg-sky-50 text-sky-950"
          />

          <SummaryCard
            label="Perlu Perhatian"
            value={mediumRiskCount}
            note="Memerlukan evaluasi berkala"
            icon="⚠️"
            tone="border-orange-100 bg-orange-50 text-orange-950"
          />

          <SummaryCard
            label="Risiko Tinggi"
            value={highRiskCount}
            note="Prioritas intervensi"
            icon="❤️"
            tone="border-rose-100 bg-rose-50 text-rose-950"
          />
        </section>

        <section className="mt-4 grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-[1.55rem] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black">
                    Daftar Peserta
                  </h3>

                  <div className="mt-1 text-[10px] font-bold text-slate-400">
                    {filteredRows.length} peserta tampil
                  </div>
                </div>

                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[9px] font-black text-slate-500">
                  READ ONLY
                </span>
              </div>
            </div>

            <div className="max-h-[820px] divide-y divide-slate-100 overflow-y-auto">
              {loading ? (
                <div className="space-y-3 p-4">
                  {[1, 2, 3, 4].map((item) => (
                    <div
                      key={item}
                      className="h-24 animate-pulse rounded-2xl bg-slate-100"
                    />
                  ))}
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="p-10 text-center text-xs font-bold text-slate-400">
                  Tidak ada peserta yang sesuai dengan
                  filter.
                </div>
              ) : (
                filteredRows.map((item, index) => {
                  const participantId = Number(
                    item?.participant_id ||
                      item?.id ||
                      0,
                  );

                  const level = riskLevel(item);
                  const tone = riskTone(level);
                  const active =
                    participantId === selectedId;

                  return (
                    <button
                      key={
                        participantId ||
                        `${item?.code}-${index}`
                      }
                      type="button"
                      onClick={() =>
                        setSelectedId(participantId)
                      }
                      className={`block w-full p-3 text-left transition ${
                        active
                          ? "bg-emerald-50/70"
                          : "bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div
                        className={`rounded-[1.2rem] border p-3 ${
                          active
                            ? "border-emerald-300 bg-white shadow-sm"
                            : "border-transparent"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-sm font-black text-white">
                            {initials(item?.name)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="break-words text-sm font-black leading-5">
                              {item?.name ||
                                "Peserta Wellness"}
                            </div>

                            <div className="mt-1 break-words text-[10px] font-bold leading-4 text-slate-400">
                              {item?.code || "-"} ·{" "}
                              {item?.group_name || "-"}
                            </div>

                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span
                                className={`rounded-full border px-2 py-1 text-[8px] font-black ${tone.pill}`}
                              >
                                {riskLabel(level)}
                              </span>

                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-black text-slate-500">
                                {formatDate(
                                  item?.latest_history_date ||
                                    item?.latest_mini_mcu_date,
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {!selectedParticipant ? (
            <section className="rounded-[1.55rem] border border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
              <div className="text-4xl">🩺</div>

              <div className="mt-4 text-lg font-black">
                Pilih peserta
              </div>

              <p className="mt-2 text-xs font-bold text-slate-400">
                Pilih salah satu peserta untuk melihat hasil
                pemeriksaan NAKES.
              </p>
            </section>
          ) : (
            <div className="space-y-4">
              <section className="rounded-[1.55rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-xl font-black text-white">
                      {initials(
                        selectedParticipant?.name,
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-xl font-black">
                          {selectedParticipant?.name}
                        </h3>

                        <span
                          className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${selectedRiskTone.pill}`}
                        >
                          {riskLabel(selectedRisk)}
                        </span>
                      </div>

                      <div className="mt-1 break-words text-xs font-bold text-slate-500">
                        {selectedParticipant?.code ||
                          "-"}{" "}
                        ·{" "}
                        {selectedParticipant?.company_name ||
                          "-"}{" "}
                        ·{" "}
                        {selectedParticipant?.group_name ||
                          "-"}
                      </div>

                      <div className="mt-2 text-[10px] font-bold text-slate-400">
                        Pemeriksaan terakhir:{" "}
                        {formatDate(
                          selectedParticipant?.latest_history_date ||
                            selectedParticipant?.latest_mini_mcu_date,
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    className={`rounded-[1.2rem] px-4 py-3 ${selectedRiskTone.soft}`}
                  >
                    <div className="text-[9px] font-black uppercase tracking-[0.12em] opacity-70">
                      Status Risiko
                    </div>

                    <div className="mt-1 text-sm font-black">
                      {selectedParticipant?.risk_label ||
                        selectedParticipant?.compliance_status ||
                        riskLabel(selectedRisk)}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.55rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black">
                      Ringkasan Hasil Pemeriksaan
                    </h3>

                    <div className="mt-1 text-[10px] font-bold text-slate-400">
                      Baseline dibandingkan hasil terbaru
                      dari backend.
                    </div>
                  </div>

                  <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[9px] font-black text-emerald-700">
                    READ ONLY
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <ClinicalMetric
                    label="Berat Badan"
                    baseline={
                      selectedParticipant?.baseline_weight_kg
                    }
                    current={
                      selectedParticipant?.current_weight_kg
                    }
                    delta={
                      selectedParticipant?.weight_delta_kg
                    }
                    unit="kg"
                    tone="text-emerald-700"
                  />

                  <ClinicalMetric
                    label="BMI"
                    baseline={
                      selectedParticipant?.baseline_bmi
                    }
                    current={selectedParticipant?.bmi}
                    delta={
                      selectedParticipant?.bmi_delta
                    }
                    tone="text-violet-700"
                  />

                  <ClinicalMetric
                    label="Lingkar Perut"
                    baseline={
                      selectedParticipant?.baseline_waist_cm
                    }
                    current={
                      selectedParticipant?.waist_cm
                    }
                    delta={
                      selectedParticipant?.waist_delta_cm
                    }
                    unit="cm"
                    tone="text-orange-700"
                  />

                  <ClinicalMetric
                    label="Tekanan Darah"
                    baseline={bpBaseline}
                    current={bpCurrent}
                    unit="mmHg"
                    tone="text-sky-700"
                  />

                  <ClinicalMetric
                    label="HbA1c"
                    baseline={
                      selectedParticipant?.baseline_hba1c
                    }
                    current={
                      selectedParticipant?.hba1c
                    }
                    delta={
                      selectedParticipant?.hba1c_delta
                    }
                    unit="%"
                    tone="text-rose-700"
                  />

                  <ClinicalMetric
                    label="Gula Darah"
                    baseline={
                      selectedParticipant?.baseline_glucose
                    }
                    current={
                      selectedParticipant?.glucose
                    }
                    delta={
                      selectedParticipant?.glucose_delta
                    }
                    unit="mg/dL"
                    tone="text-blue-700"
                  />
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <ChartCard
                  title="Berat Badan"
                  subtitle="Perubahan berat badan"
                  points={chartPoints(
                    selectedParticipant,
                    "weight_kg",
                  )}
                  primaryStroke="#10b981"
                />

                <ChartCard
                  title="BMI"
                  subtitle="Perubahan indeks massa tubuh"
                  points={chartPoints(
                    selectedParticipant,
                    "bmi",
                  )}
                  primaryStroke="#8b5cf6"
                />

                <ChartCard
                  title="Lingkar Perut"
                  subtitle="Perubahan lingkar perut"
                  points={chartPoints(
                    selectedParticipant,
                    "waist_cm",
                  )}
                  primaryStroke="#f97316"
                />

                <ChartCard
                  title="Tekanan Darah"
                  subtitle="Sistolik dan diastolik"
                  points={chartPoints(
                    selectedParticipant,
                    "blood_pressure",
                  )}
                  valueKey="sbp"
                  secondaryKey="dbp"
                  primaryStroke="#ef4444"
                  secondaryStroke="#3b82f6"
                />

                <ChartCard
                  title="HbA1c"
                  subtitle="Perubahan HbA1c"
                  points={chartPoints(
                    selectedParticipant,
                    "hba1c",
                  )}
                  primaryStroke="#f43f5e"
                />

                <ChartCard
                  title="Gula Darah"
                  subtitle="Perubahan gula darah"
                  points={chartPoints(
                    selectedParticipant,
                    "glucose",
                  )}
                  primaryStroke="#0ea5e9"
                />
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[1.5rem] border border-orange-100 bg-orange-50 p-4 text-orange-950 shadow-sm">
                  <div className="text-[9px] font-black uppercase tracking-[0.14em] text-orange-600">
                    Temuan Risiko
                  </div>

                  <div className="mt-3 space-y-2">
                    {Array.isArray(
                      selectedParticipant?.risk_flags,
                    ) &&
                    selectedParticipant.risk_flags.length ? (
                      selectedParticipant.risk_flags.map(
                        (flag: any, index: number) => (
                          <div
                            key={`${flag}-${index}`}
                            className="rounded-xl bg-white/70 px-3 py-2 text-xs font-bold"
                          >
                            • {flag}
                          </div>
                        ),
                      )
                    ) : (
                      <div className="text-xs font-bold text-orange-700">
                        Belum ada temuan risiko khusus.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50 p-4 text-emerald-950 shadow-sm">
                  <div className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-600">
                    Status Monitoring
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-white/70 p-3">
                      <div className="text-[9px] font-black text-slate-400">
                        HISTORY NAKES
                      </div>

                      <div className="mt-1 text-xl font-black">
                        {fmt(
                          selectedParticipant?.history_logs_count,
                          0,
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white/70 p-3">
                      <div className="text-[9px] font-black text-slate-400">
                        MINI MCU
                      </div>

                      <div className="mt-1 text-xl font-black">
                        {fmt(
                          selectedParticipant?.mini_mcu_logs_count,
                          0,
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl bg-white/70 p-3 text-xs font-bold leading-5 text-emerald-800">
                    {selectedParticipant?.compliance_status ||
                      "Status kepatuhan belum tersedia."}
                  </div>
                </div>
              </section>
            </div>
          )}
        </section>

        <footer className="mt-6 text-center text-[10px] font-bold text-slate-400">
          Harmony Health · Monitoring NAKES · Read-only
        </footer>
      </div>
    </main>
  );
}
