$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "PATCH PORTAL HOME + HISTORY DIRECT V34"
Write-Host "Patch ini hanya mengganti tampilan Home dan History agar membaca nutrition-direct."
Write-Host "Tidak mengubah input, Google Sheet, Supabase table, Google Fit, atau Health Connect."

$text = Get-Content $path -Raw -Encoding UTF8

function Replace-BlockBetweenFunctions {
    param(
        [string]$Text,
        [string]$StartFunction,
        [string[]]$NextFunctions,
        [string]$Replacement
    )

    $start = $Text.IndexOf("function " + $StartFunction + "(")

    if ($start -lt 0) {
        throw "function $StartFunction tidak ditemukan"
    }

    $end = -1

    foreach ($fn in $NextFunctions) {
        $candidate = $Text.IndexOf("function " + $fn + "(", $start + 1)

        if ($candidate -gt 0) {
            if ($end -lt 0 -or $candidate -lt $end) {
                $end = $candidate
            }
        }
    }

    if ($end -lt 0) {
        throw "Akhir function $StartFunction tidak ditemukan"
    }

    return $Text.Substring(0, $start) + $Replacement + $Text.Substring($end)
}

$homeBlock = @'
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

'@

$historyBlock = @'
function HistoryTab({
  participant,
  nutritionLogs,
  workoutLogs,
  healthTalkLogs,
  clinicalHistory,
}: {
  participant?: any;
  nutritionLogs?: any[];
  workoutLogs?: any[];
  healthTalkLogs?: any[];
  clinicalHistory?: any[];
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

  const [loadingNutrition, setLoadingNutrition] = useState(false);

  async function loadDirectNutritionHistory() {
    if (!participantId) return;

    setLoadingNutrition(true);

    const result = await fetch(
      `/api/wellness/portal/nutrition-direct?participant_id=${participantId}&t=${Date.now()}`,
      { cache: "no-store" }
    )
      .then((response) => response.json())
      .catch(() => null);

    if (result?.ok) {
      setDirectNutrition(result);
    }

    setLoadingNutrition(false);
  }

  useEffect(() => {
    loadDirectNutritionHistory();
  }, [participantId]);

  const nutrition =
    directNutrition?.logs?.length > 0
      ? directNutrition.logs
      : nutritionLogs || [];

  const workout = workoutLogs || [];
  const healthTalk = healthTalkLogs || [];
  const clinical = clinicalHistory || [];

  return (
    <section className="w-full max-w-full space-y-5 overflow-hidden">
      <div className="rounded-[2.4rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-teal-700/70">
              Participant History
            </div>

            <h2 className="mt-2 text-3xl font-black text-slate-950">
              History Peserta
            </h2>

            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
              Riwayat nutrisi dibaca langsung dari Google Sheet dan Supabase.
            </p>
          </div>

          <button
            type="button"
            onClick={loadDirectNutritionHistory}
            className="rounded-full bg-slate-950 px-5 py-3 text-xs font-black text-white"
          >
            {loadingNutrition ? "Memuat..." : "Refresh History"}
          </button>
        </div>

        {directNutrition?.sources ? (
          <div className="mt-4 rounded-[1.4rem] bg-slate-50 px-4 py-3 text-[11px] font-bold leading-5 text-slate-500">
            Nutrition source: Supabase {directNutrition.sources.supabase_rows || 0} row | Google Sheet{" "}
            {directNutrition.sources.google_sheet_rows || 0} row
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <PortalMetricCardV34
            label="Nutrition"
            value={`${nutrition.length}`}
            note={`${fmtNumber(directNutrition?.today_calories || 0)} kkal hari ini`}
            tone="sky"
          />

          <PortalMetricCardV34
            label="Workout"
            value={`${workout.length}`}
            note="activity logs"
            tone="teal"
          />

          <PortalMetricCardV34
            label="Health Talk"
            value={`${healthTalk.length}`}
            note="edukasi"
            tone="peach"
          />

          <PortalMetricCardV34
            label="Clinical"
            value={`${clinical.length}`}
            note="MCU/progress"
            tone="slate"
          />
        </div>
      </div>

      <div className="rounded-[2.4rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
        <h3 className="text-2xl font-black text-slate-950">
          History Nutrisi
        </h3>

        <div className="mt-5 space-y-3">
          {nutrition.length === 0 ? (
            <div className="rounded-[1.8rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
              Belum ada input nutrisi.
            </div>
          ) : (
            nutrition.slice(0, 20).map((item: any, index: number) => (
              <PortalMealLogItemV34 key={`${item.id || index}-${index}`} item={item} />
            ))
          )}
        </div>
      </div>

      <div className="rounded-[2.4rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
        <h3 className="text-2xl font-black text-slate-950">
          History Workout
        </h3>

        <div className="mt-5 space-y-3">
          {workout.length === 0 ? (
            <div className="rounded-[1.8rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
              Belum ada input workout.
            </div>
          ) : (
            workout.slice(0, 20).map((item: any, index: number) => (
              <GenericHistoryCardV34
                key={`${item.id || index}-${index}`}
                title={item.activity_name || item.activity_type || "Workout"}
                subtitle={item.log_date || item.created_at || "-"}
                note={`${fmtNumber(item.calories || item.total_calories || 0)} kkal | ${fmtNumber(item.steps || item.total_steps || 0)} steps`}
              />
            ))
          )}
        </div>
      </div>

      <div className="rounded-[2.4rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
        <h3 className="text-2xl font-black text-slate-950">
          History Health Talk
        </h3>

        <div className="mt-5 space-y-3">
          {healthTalk.length === 0 ? (
            <div className="rounded-[1.8rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
              Belum ada input Health Talk.
            </div>
          ) : (
            healthTalk.slice(0, 20).map((item: any, index: number) => (
              <GenericHistoryCardV34
                key={`${item.id || index}-${index}`}
                title={item.title || item.topic || "Health Talk"}
                subtitle={item.event_date || item.log_date || item.created_at || "-"}
                note={item.notes || item.description || "-"}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function GenericHistoryCardV34({
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
      <div className="text-sm font-black text-slate-950">{title}</div>
      <div className="mt-1 text-xs font-bold text-slate-400">{subtitle}</div>
      <div className="mt-3 text-sm font-bold leading-6 text-slate-600">{note}</div>
    </div>
  );
}

'@

$text = Replace-BlockBetweenFunctions -Text $text -StartFunction "HomeTab" -NextFunctions @("CoachNoticeCenter", "NutritionTab") -Replacement $homeBlock
$text = Replace-BlockBetweenFunctions -Text $text -StartFunction "HistoryTab" -NextFunctions @("DevicesTab", "ProfileTab", "MiniLineChart", "BloodPressureChart") -Replacement $historyBlock

# Pastikan caller HistoryTab menerima participant
$text = $text -replace '<HistoryTab(?![^>]*participant=)', '<HistoryTab participant={participant}'

# Pastikan main tidak overflow horizontal
$text = $text.Replace(
  'className="min-h-screen bg-[#f4fbfa] pb-28 pt-16 text-slate-900 md:bg-[#f6fbff] md:pb-0 md:pt-0"',
  'className="min-h-screen overflow-x-hidden bg-[#f4fbfa] pb-28 pt-16 text-slate-900 md:bg-[#f6fbff] md:pb-0 md:pt-0"'
)

Set-Content -Path $path -Value $text -Encoding UTF8

Write-Host "OK - HomeTab diganti direct nutrition"
Write-Host "OK - HistoryTab diganti direct nutrition"
Write-Host "DONE - PATCH PORTAL HOME + HISTORY DIRECT V34"