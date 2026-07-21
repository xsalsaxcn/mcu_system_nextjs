$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "REPAIR CHART FUNCTIONS V15"

$text = Get-Content $path -Raw -Encoding UTF8

$start = $text.IndexOf("function MiniLineChart(")

if ($start -lt 0) {
    throw "function MiniLineChart tidak ditemukan"
}

$newTail = @'
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
'@

$fixed = $text.Substring(0, $start) + $newTail

Set-Content -Path $path -Value $fixed -Encoding UTF8

Write-Host "OK - chart functions bagian bawah file diganti total"
Write-Host "DONE - REPAIR CHART FUNCTIONS V15"