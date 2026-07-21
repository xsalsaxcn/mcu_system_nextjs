$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "PATCH HOME NUTRITION + MOBILE V33"
Write-Host "Patch ini hanya memperbaiki tampilan Home, Meal Log, dan mobile width."
Write-Host "Tidak mengubah input, Google Sheet, Supabase table, Google Fit, atau Health Connect."

$text = Get-Content $path -Raw -Encoding UTF8

$start = $text.IndexOf("function HomeTab(")
if ($start -lt 0) {
    throw "function HomeTab tidak ditemukan"
}

$end = $text.IndexOf("function CoachNoticeCenter(", $start)
if ($end -lt 0) {
    $end = $text.IndexOf("function NutritionTab(", $start)
}
if ($end -lt 0) {
    throw "akhir HomeTab tidak ditemukan"
}

$newHome = @'
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

      <div className="rounded-[2.3rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-teal-700/70">
              Today Wellness
            </div>

            <h2 className="mt-2 text-3xl font-black text-slate-950">
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
          <HomeMetricCardV33
            label="Calories In"
            value={`${fmtNumber(todayCalories, 0)} kkal`}
            note={`${fmtNumber(todayFoodCount, 0)} item dari ${fmtNumber(todayRowCount, 0)} input hari ini`}
            tone="sky"
          />

          <HomeMetricCardV33
            label="Workout Calories"
            value={`${fmtNumber(totals.workoutCalories || 0)} kkal`}
            note={`${fmtNumber(totals.workoutMinutes || 0, 1)} menit aktivitas hari ini`}
            tone="teal"
          />

          <HomeMetricCardV33
            label="Steps"
            value={fmtNumber(totals.steps || 0)}
            note="hari ini dari manual/device bila tersedia"
            tone="peach"
          />

          <HomeMetricCardV33
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

      <div className="rounded-[2.3rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
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
              <HomeMealLogItemV33 key={`${item.id || index}-${index}`} item={item} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function HomeMetricCardV33({
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

function normalizeImageUrlV33(value: any) {
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

function HomeMealLogItemV33({ item }: { item: any }) {
  const photo = normalizeImageUrlV33(item.photo_url);
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

'@

$updated = $text.Substring(0, $start) + $newHome + $text.Substring($end)

# Mobile width hardening
$updated = $updated.Replace(
  'className="min-h-screen bg-[#f4fbfa] pb-28 pt-16 text-slate-900 md:bg-[#f6fbff] md:pb-0 md:pt-0"',
  'className="min-h-screen overflow-x-hidden bg-[#f4fbfa] pb-28 pt-16 text-slate-900 md:bg-[#f6fbff] md:pb-0 md:pt-0"'
)

$updated = $updated.Replace(
  '"rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"',
  '"w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"'
)

Set-Content -Path $path -Value $updated -Encoding UTF8

Write-Host "OK - Home nutrition and mobile width patched"
Write-Host "DONE - PATCH HOME NUTRITION + MOBILE V33"