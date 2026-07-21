$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "FIX HOME CONSUMES NUTRITION DIRECT V27"
Write-Host "Patch ini hanya mengganti HomeTab agar membaca nutrition-direct."
Write-Host "Tidak mengubah insert nutrisi, Google Sheet, Supabase table, Google Fit, atau Health Connect."

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
    throw "Akhir HomeTab tidak ditemukan"
}

$newHomeTab = @'
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
    today_calories: 0,
    has_today_data: false,
    sources: null,
  });

  const [directNutritionLoading, setDirectNutritionLoading] = useState(false);

  async function loadDirectNutrition() {
    if (!participantId) return;

    setDirectNutritionLoading(true);

    const result = await fetch(
      `/api/wellness/portal/nutrition-direct?participant_id=${participantId}&t=${Date.now()}`,
      {
        cache: "no-store",
      }
    )
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result?.ok) {
      setDirectNutrition(result);
    }

    setDirectNutritionLoading(false);
  }

  useEffect(() => {
    loadDirectNutrition();
  }, [participantId]);

  const latestClinical =
    Array.isArray(clinicalHistory) && clinicalHistory.length > 0
      ? clinicalHistory[0]
      : null;

  const todayCalories =
    directNutrition?.ok && Number.isFinite(Number(directNutrition.today_calories))
      ? Number(directNutrition.today_calories)
      : Number(totals.foodCalories || 0);

  const todayFoodCount =
    directNutrition?.ok && Number.isFinite(Number(directNutrition.today_count))
      ? Number(directNutrition.today_count)
      : Number(totals.foodCount || 0);

  const mealLogs =
    directNutrition?.today_logs?.length > 0
      ? directNutrition.today_logs
      : directNutrition?.latest_logs?.length > 0
        ? directNutrition.latest_logs
        : nutritionLogs || [];

  const mealLogTitle =
    directNutrition?.today_logs?.length > 0
      ? "Nutrisi Hari Ini"
      : directNutrition?.latest_logs?.length > 0
        ? "Riwayat Nutrisi Terakhir"
        : "Nutrisi Hari Ini";

  const mealLogSubtitle =
    directNutrition?.today_logs?.length > 0
      ? `${fmtNumber(todayCalories, 0)} kkal dari ${fmtNumber(todayFoodCount, 0)} input hari ini`
      : directNutrition?.latest_logs?.length > 0
        ? "Belum ada input hari ini. Menampilkan data terakhir dari Google Sheet/Supabase."
        : "Belum ada input nutrisi.";

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

  const stepsProgress = Math.min(
    100,
    Math.round((Number(totals.steps || 0) / stepsTarget) * 100)
  );

  const workoutProgress = Math.min(
    100,
    Math.round((Number(totals.workoutMinutes || 0) / workoutTarget) * 100)
  );

  const nutritionProgress = Math.min(
    100,
    Math.round((todayFoodCount / nutritionTarget) * 100)
  );

  const activeProgress = Math.max(
    stepsProgress,
    workoutProgress,
    nutritionProgress
  );

  const deviceLabel =
    healthConnectConnected || googleFitConnected
      ? "Device connected"
      : "Device belum sync";

  return (
    <section className="space-y-5">
      <CoachNoticeCenter participant={participant} />

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
                </p>
              </div>

              <button
                type="button"
                onClick={loadDirectNutrition}
                className="hidden rounded-full bg-white/70 px-4 py-3 text-xs font-black text-slate-600 shadow-sm md:block"
              >
                {directNutritionLoading ? "Loading..." : "Refresh Nutrisi"}
              </button>
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
                value={`${fmtNumber(todayFoodCount, 0)} log`}
                note={`${fmtNumber(todayCalories, 0)} kkal in`}
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
                  text={`${fmtNumber(todayFoodCount, 0)} / ${nutritionTarget} log`}
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
              value={`${fmtNumber(todayCalories, 0)} kkal`}
              note={`${fmtNumber(todayFoodCount, 0)} input hari ini`}
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

        <HomeNutritionDirectCardV27
          title={mealLogTitle}
          subtitle={mealLogSubtitle}
          logs={mealLogs}
          loading={directNutritionLoading}
          sources={directNutrition?.sources}
          onRefresh={loadDirectNutrition}
          onInput={() => setActiveTab("nutrition")}
        />
      </div>
    </section>
  );
}

function HomeNutritionDirectCardV27({
  title,
  subtitle,
  logs,
  loading,
  sources,
  onRefresh,
  onInput,
}: {
  title: string;
  subtitle: string;
  logs: any[];
  loading: boolean;
  sources: any;
  onRefresh: () => void;
  onInput: () => void;
}) {
  return (
    <div className="rounded-[2.3rem] border border-slate-100 bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
            Meal Log
          </div>

          <h3 className="mt-2 text-2xl font-black text-slate-950">
            {title}
          </h3>

          <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
            {subtitle}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"
          >
            {loading ? "..." : "Refresh"}
          </button>

          <button
            type="button"
            onClick={onInput}
            className="rounded-full bg-teal-50 px-4 py-2 text-xs font-black text-teal-700"
          >
            + Input
          </button>
        </div>
      </div>

      {sources ? (
        <div className="mt-4 rounded-[1.4rem] bg-slate-50 px-4 py-3 text-[11px] font-bold leading-5 text-slate-500">
          Source: Supabase {sources.supabase_rows || 0} row | Google Sheet{" "}
          {sources.google_sheet_rows || 0} row
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {logs.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <div className="text-base font-black text-slate-900">
              Belum ada food diary.
            </div>

            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
              Input nutrisi akan muncul di sini setelah data dari Google Sheet atau Supabase terbaca.
            </p>

            <button
              type="button"
              onClick={onInput}
              className="mt-4 rounded-full bg-teal-600 px-5 py-3 text-xs font-black text-white shadow-lg shadow-teal-100"
            >
              Input Nutrisi
            </button>
          </div>
        ) : (
          logs.slice(0, 6).map((item, index) => (
            <HomeMealLogItemV27 key={`${item.id || index}-${index}`} item={item} />
          ))
        )}
      </div>
    </div>
  );
}

function HomeMealLogItemV27({ item }: { item: any }) {
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

'@

$updated = $text.Substring(0, $start) + $newHomeTab + $text.Substring($end)

Set-Content -Path $path -Value $updated -Encoding UTF8

Write-Host "OK - HomeTab now consumes /api/wellness/portal/nutrition-direct"
Write-Host "DONE - FIX HOME CONSUMES NUTRITION DIRECT V27"