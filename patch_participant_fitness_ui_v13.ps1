$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "PATCH PARTICIPANT FITNESS UI V13"
Write-Host "File: $path"

$text = Get-Content $path -Raw -Encoding UTF8

function Find-MatchingBraceEnd {
    param(
        [string]$Text,
        [int]$OpenBraceIndex
    )

    $depth = 0

    for ($i = $OpenBraceIndex; $i -lt $Text.Length; $i++) {
        $ch = $Text[$i]

        if ($ch -eq "{") {
            $depth++
        }

        if ($ch -eq "}") {
            $depth--
            if ($depth -eq 0) {
                return $i + 1
            }
        }
    }

    return -1
}

function Replace-Function {
    param(
        [string]$Text,
        [string]$FunctionName,
        [string]$Replacement
    )

    $funIndex = $Text.IndexOf("function " + $FunctionName + "(")

    if ($funIndex -lt 0) {
        throw "Function tidak ditemukan: $FunctionName"
    }

    $openBrace = $Text.IndexOf("{", $funIndex)

    if ($openBrace -lt 0) {
        throw "Open brace tidak ditemukan untuk: $FunctionName"
    }

    $end = Find-MatchingBraceEnd -Text $Text -OpenBraceIndex $openBrace

    if ($end -lt 0) {
        throw "Close brace tidak ditemukan untuk: $FunctionName"
    }

    return $Text.Substring(0, $funIndex) + $Replacement + $Text.Substring($end)
}

# =========================
# 1. Fix return utama page.tsx kalau masih salah
# =========================

$badReturn = @'
return (
    <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-orange-400 via-orange-500 to-amber-500 p-6 text-white shadow-xl shadow-orange-100 md:p-8">
'@

$goodReturn = @'
return (
    <main className="min-h-screen bg-[#eef7f6] pb-28 pt-16 text-slate-900 md:bg-[#f5fbfb] md:pb-0 md:pt-0">
'@

if ($text.Contains($badReturn)) {
    $text = $text.Replace($badReturn, $goodReturn)
    Write-Host "OK - top-level return fixed"
}

# Update background dan hero class yang mungkin masih lama
$text = $text.Replace(
    'bg-gradient-to-r from-blue-700 via-indigo-600 to-emerald-500 p-6 text-white shadow-xl shadow-blue-100',
    'bg-gradient-to-br from-[#9fded8] via-[#b9dff4] to-[#cbd8f6] p-6 text-slate-900 shadow-xl shadow-sky-100'
)

$text = $text.Replace(
    'bg-gradient-to-br from-orange-400 via-orange-500 to-amber-500 p-6 text-white shadow-xl shadow-orange-100',
    'bg-gradient-to-br from-[#9fded8] via-[#b9dff4] to-[#cbd8f6] p-6 text-slate-900 shadow-xl shadow-sky-100'
)

$text = $text.Replace('text-white/70', 'text-slate-600')
$text = $text.Replace('text-white/75', 'text-slate-600')
$text = $text.Replace('text-white/90', 'text-slate-700')

# =========================
# 2. Replace SummaryCard
# =========================

$summaryCard = @'
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
'@

$text = Replace-Function -Text $text -FunctionName "SummaryCard" -Replacement $summaryCard
Write-Host "OK - SummaryCard replaced"

# =========================
# 3. Replace HomeTab + helper components
# =========================

$homeTab = @'
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
  const firstName = clean(participant?.name).split(" ")[0] || "Peserta";
  const initials = participantInitials(participant?.name);

  const stepsScore = Math.min(40, (asNumber(totals.steps) / 8000) * 40);
  const workoutScore = Math.min(35, (asNumber(totals.workoutMinutes) / 45) * 35);
  const nutritionScore = Math.min(25, (asNumber(totals.foodCount) / 3) * 25);
  const wellnessScore = Math.max(0, Math.min(100, Math.round(stepsScore + workoutScore + nutritionScore)));

  const deviceStatus = healthConnectConnected
    ? "Health Connect aktif"
    : googleFitConnected
      ? "Google Fit aktif"
      : "Device belum sync";

  const chartSeries = [
    { date: "S", value: Math.max(12, wellnessScore * 0.42) },
    { date: "M", value: Math.max(18, wellnessScore * 0.55) },
    { date: "T", value: Math.max(16, wellnessScore * 0.48) },
    { date: "W", value: Math.max(22, wellnessScore * 0.66) },
    { date: "T", value: Math.max(20, wellnessScore * 0.58) },
    { date: "F", value: Math.max(28, wellnessScore * 0.88) },
    { date: "S", value: Math.max(24, wellnessScore * 0.72) },
  ];

  return (
    <section className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="overflow-hidden rounded-[2.4rem] border border-white/80 bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-teal-100 to-sky-100 text-base font-black text-teal-800">
                {initials}
              </div>

              <div>
                <div className="text-sm font-black text-slate-950">
                  Hello, {firstName}
                </div>
                <div className="mt-0.5 text-xs font-bold text-slate-400">
                  Wellness summary hari ini
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("profile")}
              className="relative grid h-12 w-12 place-items-center rounded-full bg-slate-50 text-sm font-black text-slate-700"
            >
              i
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500" />
            </button>
          </div>

          <WellnessDayStrip />

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <MetricSoftCard
              label="Workout Time"
              value={`${fmtNumber(totals.workoutMinutes, 0)}`}
              unit="min"
              note={`${fmtNumber(totals.workoutCalories, 0)} kkal terbakar`}
              tone="sky"
            />

            <MetricSoftCard
              label="Nutrition"
              value={`${fmtNumber(totals.foodCount, 0)}`}
              unit="log"
              note={`${fmtNumber(totals.foodCalories, 0)} kkal masuk`}
              tone="lime"
            />
          </div>

          <div className="mt-5 rounded-[2rem] bg-slate-50 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <WellnessProgressRing value={wellnessScore} />
                <div>
                  <div className="text-sm font-black text-slate-900">
                    Daily wellness points
                  </div>
                  <div className="mt-1 text-3xl font-black text-slate-950">
                    {fmtNumber(
                      asNumber(totals.steps) +
                        asNumber(totals.workoutCalories) +
                        asNumber(totals.foodCount) * 120,
                      0
                    )}
                  </div>
                  <div className="mt-1 text-xs font-bold text-slate-400">
                    Score {wellnessScore}% dari aktivitas hari ini
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-700"
              >
                Detail
              </button>
            </div>

            <div className="mt-5">
              <SoftTrendChart series={chartSeries} height={120} />
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[2.4rem] border border-white/80 bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  Today Activity
                </div>
                <h2 className="mt-2 text-3xl font-black text-slate-950">
                  {fmtNumber(totals.steps, 0)}
                </h2>
                <div className="mt-1 text-sm font-bold text-slate-500">
                  steps hari ini
                </div>
              </div>

              <div className="grid h-16 w-16 place-items-center rounded-3xl bg-teal-50 text-xl font-black text-teal-700">
                {Math.min(99, Math.round(asNumber(totals.steps) / 100))}
              </div>
            </div>

            <div className="mt-5 rounded-[2rem] bg-gradient-to-br from-[#c5eef3] to-[#c8e4f7] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="rounded-full bg-white/60 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">
                    Device
                  </div>
                  <div className="mt-4 text-xl font-black text-slate-950">
                    {deviceStatus}
                  </div>
                  <div className="mt-1 text-xs font-bold leading-5 text-slate-600">
                    Sync Health Connect dari aplikasi Harmony Health untuk update steps dan calories.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab("devices")}
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white text-lg font-black text-slate-800"
                >
                  &gt;
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[2.4rem] border border-white/80 bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-slate-950">
                Quick Actions
              </h3>
              <div className="rounded-full bg-slate-50 px-3 py-2 text-xs font-black text-slate-400">
                MVP
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <ActionFitnessCard
                code="N"
                title="Input Nutrisi"
                subtitle="Foto makanan dan porsi"
                tone="peach"
                onClick={() => setActiveTab("nutrition")}
              />

              <ActionFitnessCard
                code="W"
                title="Input Workout"
                subtitle="Durasi, steps, dan bukti aktivitas"
                tone="blue"
                onClick={() => setActiveTab("workout")}
              />

              <ActionFitnessCard
                code="H"
                title="Health Talk"
                subtitle="Catat seminar dan bukti edukasi"
                tone="green"
                onClick={() => setActiveTab("healthtalk")}
              />

              <ActionFitnessCard
                code="D"
                title="Connect Device"
                subtitle="Health Connect dan Google Fit"
                tone="slate"
                onClick={() => setActiveTab("devices")}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="rounded-[2.4rem] border border-white/80 bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-950">
                Nutrition Diary
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                Ringkasan makanan yang sudah dicatat hari ini.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("nutrition")}
              className="rounded-full bg-teal-600 px-5 py-3 text-xs font-black text-white shadow-lg shadow-teal-100"
            >
              Add Meal
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {nutritionLogs.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400 md:col-span-2">
                Belum ada input nutrisi hari ini.
              </div>
            ) : (
              nutritionLogs.slice(0, 4).map((item, index) => (
                <NutritionMiniCard key={`${item.id || index}-${index}`} item={item} />
              ))
            )}
          </div>
        </div>

        <div className="rounded-[2.4rem] border border-white/80 bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
          <h3 className="text-xl font-black text-slate-950">
            Health Snapshot
          </h3>

          <div className="mt-4 space-y-3">
            <SnapshotRow label="Health Connect" value={healthConnectConnected ? "Connected" : "Belum sync"} />
            <SnapshotRow label="Google Fit" value={googleFitConnected ? "Connected" : "Not connected"} />
            <SnapshotRow label="Food Log" value={`${fmtNumber(totals.foodCount, 0)} input`} />
            <SnapshotRow label="Workout Log" value={`${fmtNumber(totals.workoutCount, 0)} activity`} />
          </div>
        </div>
      </div>

      <HealthProgressSection clinicalHistory={clinicalHistory} participant={participant} />
    </section>
  );
}

function participantInitials(name: any) {
  const parts = clean(name)
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return "HH";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function WellnessDayStrip() {
  const today = new Date();
  const days = Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - 3 + index);

    return {
      label: date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 3).toUpperCase(),
      day: date.getDate(),
      active: index === 3,
    };
  });

  return (
    <div className="mt-6 grid grid-cols-7 gap-2">
      {days.map((item, index) => (
        <div key={`${item.label}-${index}`} className="text-center">
          <div className="text-[10px] font-black text-slate-400">{item.label}</div>
          <div
            className={`mx-auto mt-2 grid h-9 w-9 place-items-center rounded-full text-xs font-black ${
              item.active
                ? "bg-[#f8bfae] text-slate-900"
                : "bg-slate-50 text-slate-600"
            }`}
          >
            {item.day}
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricSoftCard({
  label,
  value,
  unit,
  note,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  note: string;
  tone: "sky" | "lime";
}) {
  const cls =
    tone === "sky"
      ? "bg-[#cdeef7] text-slate-900"
      : "bg-[#d8efb6] text-slate-900";

  return (
    <div className={`rounded-[2rem] p-5 ${cls}`}>
      <div className="text-sm font-black">{label}</div>
      <div className="mt-4 flex items-end gap-2">
        <div className="text-4xl font-black">{value}</div>
        <div className="pb-1 text-sm font-black opacity-70">{unit}</div>
      </div>
      <div className="mt-2 text-xs font-bold leading-5 opacity-70">{note}</div>
    </div>
  );
}

function WellnessProgressRing({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));
  const radius = 27;
  const circumference = 2 * Math.PI * radius;
  const dash = (safeValue / 100) * circumference;

  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 72 72" className="h-20 w-20 -rotate-90">
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="rgba(148,163,184,0.18)"
          strokeWidth="7"
        />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          className="text-teal-500"
        />
      </svg>

      <div className="absolute inset-0 grid place-items-center text-sm font-black text-slate-900">
        {safeValue}%
      </div>
    </div>
  );
}

function ActionFitnessCard({
  code,
  title,
  subtitle,
  tone,
  onClick,
}: {
  code: string;
  title: string;
  subtitle: string;
  tone: "peach" | "blue" | "green" | "slate";
  onClick: () => void;
}) {
  const toneClass: Record<string, string> = {
    peach: "bg-[#ffe1d2] text-slate-900",
    blue: "bg-[#c8e8f7] text-slate-900",
    green: "bg-[#d9efcc] text-slate-900",
    slate: "bg-slate-100 text-slate-900",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[1.8rem] p-4 text-left transition hover:-translate-y-0.5 ${toneClass[tone]}`}
    >
      <div className="flex items-center gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/70 text-sm font-black">
          {code}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-black">{title}</div>
          <div className="mt-1 text-xs font-bold leading-5 opacity-70">
            {subtitle}
          </div>
        </div>

        <div className="grid h-9 w-9 place-items-center rounded-full bg-white/60 text-sm font-black">
          &gt;
        </div>
      </div>
    </button>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
      <div className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="text-sm font-black text-slate-900">{value}</div>
    </div>
  );
}

function SoftTrendChart({
  series,
  height = 110,
}: {
  series: Array<{ date: string; value: number }>;
  height?: number;
}) {
  return <SmoothSvgChart series={series} height={height} showLabels />;
}
'@

$text = Replace-Function -Text $text -FunctionName "HomeTab" -Replacement $homeTab
Write-Host "OK - HomeTab replaced"

# =========================
# 4. Replace MiniLineChart
# =========================

$miniLineChart = @'
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
'@

$text = Replace-Function -Text $text -FunctionName "MiniLineChart" -Replacement $miniLineChart
Write-Host "OK - MiniLineChart replaced"

# =========================
# 5. Replace BloodPressureChart
# =========================

$bpChart = @'
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

      <div className="mt-3 flex gap-2 text-xs font-bold text-slate-500">
        <span className="h-3 w-3 rounded-full bg-teal-500" />
        Tren sistolik utama
      </div>
    </div>
  );
}
'@

$text = Replace-Function -Text $text -FunctionName "BloodPressureChart" -Replacement $bpChart
Write-Host "OK - BloodPressureChart replaced"

# =========================
# 6. Replace SimpleSvgLine with SmoothSvgChart
# =========================

$simpleSvg = @'
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
        className="h-24 rounded-2xl border border-dashed border-slate-200 bg-white"
        style={{ height }}
      />
    );
  }

  const width = 320;
  const paddingX = 16;
  const paddingTop = 10;
  const paddingBottom = showLabels ? 24 : 12;
  const values = series.map((item) => Number(item.value)).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;

  const points = series.map((item, index) => {
    const x =
      paddingX +
      (index / Math.max(series.length - 1, 1)) * (width - paddingX * 2);

    const y =
      height -
      paddingBottom -
      ((Number(item.value) - min) / spread) * (height - paddingTop - paddingBottom);

    return { x, y, label: item.date, value: Number(item.value) };
  });

  const smoothPath = buildSmoothPath(points);
  const areaPath = `${smoothPath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full overflow-visible"
      role="img"
      aria-label="Grafik tren"
    >
      <defs>
        <linearGradient id="smoothChartFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      <path d={areaPath} fill="url(#smoothChartFill)" className="text-teal-500" />

      <path
        d={smoothPath}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-teal-500"
      />

      {points.map((point, index) => (
        <circle
          key={`${point.x}-${point.y}-${index}`}
          cx={point.x}
          cy={point.y}
          r={index === points.length - 1 ? 5 : 3.2}
          className={index === points.length - 1 ? "fill-white stroke-teal-500" : "fill-teal-500"}
          strokeWidth={index === points.length - 1 ? 4 : 0}
        />
      ))}

      <circle cx={last.x} cy={last.y} r="9" className="fill-teal-500/10" />

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
'@

$text = Replace-Function -Text $text -FunctionName "SimpleSvgLine" -Replacement $simpleSvg
Write-Host "OK - Smooth chart replaced"

Set-Content -Path $path -Value $text -Encoding UTF8

Write-Host "DONE - PARTICIPANT FITNESS UI V13"