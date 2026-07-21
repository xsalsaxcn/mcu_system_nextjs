$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "FIX MISSING FITNESS HELPERS V28"
Write-Host "Patch ini hanya menambahkan helper UI yang hilang."
Write-Host "Tidak mengubah data, API, Google Sheet, Supabase, Google Fit, atau Health Connect."

$text = Get-Content $path -Raw -Encoding UTF8

if ($text.Contains("FITNESS_HELPERS_V28")) {
    Write-Host "SKIP - helper V28 sudah ada"
    exit 0
}

$insertBefore = $text.IndexOf("function CoachNoticeCenter(")

if ($insertBefore -lt 0) {
    $insertBefore = $text.IndexOf("function NutritionTab(")
}

if ($insertBefore -lt 0) {
    throw "Tidak menemukan posisi insert sebelum CoachNoticeCenter atau NutritionTab"
}

$helpers = @'

// FITNESS_HELPERS_V28
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
          <linearGradient id="fitnessLineGradientV28" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#4fb3ad" />
            <stop offset="55%" stopColor="#51a7d9" />
            <stop offset="100%" stopColor="#6f8fd8" />
          </linearGradient>

          <linearGradient id="fitnessAreaGradientV28" x1="0" x2="0" y1="0" y2="1">
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

        <path d={area} fill="url(#fitnessAreaGradientV28)" />

        <path
          d={line}
          fill="none"
          stroke="url(#fitnessLineGradientV28)"
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

'@

$updated = $text.Substring(0, $insertBefore) + $helpers + $text.Substring($insertBefore)

Set-Content -Path $path -Value $updated -Encoding UTF8

Write-Host "OK - missing fitness helper components inserted"
Write-Host "DONE - FIX MISSING FITNESS HELPERS V28"