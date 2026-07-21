$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "REPAIR PORTAL FITNESS UI V14"

$text = Get-Content $path -Raw -Encoding UTF8

# Fix return utama kalau masih pernah rusak
$badReturn = @'
return (
    <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-orange-400 via-orange-500 to-amber-500 p-6 text-white shadow-xl shadow-orange-100 md:p-8">
'@

$goodReturn = @'
return (
    <main className="min-h-screen bg-[#f4fbfa] pb-28 pt-16 text-slate-900 md:bg-[#f6fbff] md:pb-0 md:pt-0">
'@

if ($text.Contains($badReturn)) {
    $text = $text.Replace($badReturn, $goodReturn)
    Write-Host "OK - return utama fixed"
}

$text = $text.Replace(
  'bg-gradient-to-r from-blue-700 via-indigo-600 to-emerald-500 p-6 text-white shadow-xl shadow-blue-100',
  'bg-gradient-to-br from-teal-400 via-sky-400 to-blue-500 p-6 text-white shadow-xl shadow-sky-100'
)

$text = $text.Replace(
  'bg-gradient-to-br from-orange-400 via-orange-500 to-amber-500',
  'bg-gradient-to-br from-teal-400 via-sky-400 to-blue-500'
)

$start = $text.IndexOf("function SummaryCard(")
if ($start -lt 0) {
    throw "function SummaryCard tidak ditemukan"
}

$end = $text.IndexOf("function NutritionTab(", $start)
if ($end -lt 0) {
    throw "function NutritionTab tidak ditemukan setelah SummaryCard"
}

$newBlock = @'
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

'@

$repaired = $text.Substring(0, $start) + $newBlock + $text.Substring($end)

Set-Content -Path $path -Value $repaired -Encoding UTF8

Write-Host "OK - blok SummaryCard sampai sebelum NutritionTab diganti total"
Write-Host "DONE - REPAIR PORTAL FITNESS UI V14"