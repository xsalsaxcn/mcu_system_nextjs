$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "PATCH PORTAL HISTORY DROPDOWN V37"
Write-Host "Patch ini hanya mengubah tampilan portal peserta dan History accordion."
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

# ============================================================
# 1. Hide top intro hero cards globally
# ============================================================

if (!$text.Contains("function HideParticipantIntroCardsV37(")) {
    $insertBeforeHome = $text.IndexOf("function HomeTab(")

    if ($insertBeforeHome -lt 0) {
        throw "function HomeTab tidak ditemukan untuk insert HideParticipantIntroCardsV37"
    }

    $hideComponent = @'

function HideParticipantIntroCardsV37() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const patterns = [
      "WELLNESS PARTICIPANT PORTAL",
      "Portal Individu Peserta",
      "Portal peserta aktif. Silakan input",
    ];

    function hideCardFromTextNode(textNode: Node) {
      const raw = textNode.textContent || "";

      if (!patterns.some((pattern) => raw.includes(pattern))) {
        return;
      }

      let current = textNode.parentElement;
      let level = 0;

      while (current && level < 10) {
        const content = current.textContent || "";
        const className = current.getAttribute("class") || "";
        const looksLikeCard =
          className.includes("rounded") ||
          className.includes("shadow") ||
          className.includes("gradient") ||
          className.includes("bg-");

        if (
          looksLikeCard &&
          content.length < 900 &&
          !content.includes("Calories In") &&
          !content.includes("Workout Calories") &&
          !content.includes("History Nutrisi")
        ) {
          current.style.display = "none";
          current.setAttribute("data-hidden-by", "HideParticipantIntroCardsV37");
          return;
        }

        current = current.parentElement;
        level++;
      }
    }

    function scan() {
      if (!document.body) return;

      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT
      );

      const nodes: Node[] = [];
      let node = walker.nextNode();

      while (node) {
        nodes.push(node);
        node = walker.nextNode();
      }

      nodes.forEach(hideCardFromTextNode);
    }

    scan();

    const observer = new MutationObserver(() => {
      scan();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  return null;
}

'@

    $text = $text.Substring(0, $insertBeforeHome) + $hideComponent + $text.Substring($insertBeforeHome)
    Write-Host "OK - HideParticipantIntroCardsV37 inserted"
} else {
    Write-Host "SKIP - HideParticipantIntroCardsV37 already exists"
}

if (!$text.Contains("<HideParticipantIntroCardsV37 />")) {
    $mainMatch = [regex]::Match($text, "<main\b[^>]*>")

    if ($mainMatch.Success) {
        $insertPos = $mainMatch.Index + $mainMatch.Length
        $text = $text.Substring(0, $insertPos) + "`r`n      <HideParticipantIntroCardsV37 />" + $text.Substring($insertPos)
        Write-Host "OK - HideParticipantIntroCardsV37 mounted after main"
    } else {
        Write-Host "WARNING - main tag tidak ditemukan, hide component belum dimount global"
    }
} else {
    Write-Host "SKIP - HideParticipantIntroCardsV37 already mounted"
}

# ============================================================
# 2. Replace HistoryTab with accordion/dropdown lazy retrieve
# ============================================================

$historyBlock = @'
function HistoryTab({
  participant,
  nutritionLogs,
  workoutLogs,
  workoutItems,
  healthTalkLogs,
  healthtalkLogs,
  clinicalHistory,
  refresh,
}: {
  participant?: any;
  nutritionLogs?: any[];
  workoutLogs?: any[];
  workoutItems?: any[];
  healthTalkLogs?: any[];
  healthtalkLogs?: any[];
  clinicalHistory?: any[];
  refresh?: () => any;
}) {
  const participantId = Number(
    participant?.id ||
      participant?.participant_id ||
      participant?.wellness_participant_id ||
      0
  );

  const [openSection, setOpenSection] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loadingKey, setLoadingKey] = useState("");

  const [nutritionLoaded, setNutritionLoaded] = useState(false);
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

  async function loadNutritionHistory() {
    if (!participantId) return;

    setLoadingKey("nutrition");

    const result = await fetch(
      `/api/wellness/portal/nutrition-direct?participant_id=${participantId}&t=${Date.now()}`,
      { cache: "no-store" }
    )
      .then((response) => response.json())
      .catch(() => null);

    if (result?.ok) {
      setDirectNutrition(result);
      setNutritionLoaded(true);
    }

    setLoadingKey("");
  }

  async function openDropdown(key: "nutrition" | "workout" | "healthtalk") {
    if (openSection === key) {
      setOpenSection("");
      return;
    }

    setOpenSection(key);

    if (key === "nutrition" && !nutritionLoaded) {
      await loadNutritionHistory();
      return;
    }

    if ((key === "workout" || key === "healthtalk") && refresh) {
      setLoadingKey(key);
      await Promise.resolve(refresh());
      setLoadingKey("");
    }
  }

  function setTodayFilter() {
    const today = todayDate();
    setStartDate(today);
    setEndDate(today);
  }

  function setLast7DaysFilter() {
    const now = new Date();
    const past = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    setStartDate(past.toISOString().slice(0, 10));
    setEndDate(todayDate());
  }

  function clearFilter() {
    setStartDate("");
    setEndDate("");
  }

  const rawNutrition =
    nutritionLoaded && directNutrition?.logs?.length > 0
      ? directNutrition.logs
      : nutritionLogs || [];

  const rawWorkout = workoutLogs || workoutItems || [];
  const rawHealthTalk = healthTalkLogs || healthtalkLogs || [];
  const rawClinical = clinicalHistory || [];

  const nutrition = filterHistoryByDateV37(rawNutrition, startDate, endDate, [
    "log_date",
    "created_at",
    "updated_at",
  ]);

  const workout = filterHistoryByDateV37(rawWorkout, startDate, endDate, [
    "log_date",
    "created_at",
    "updated_at",
    "date",
  ]);

  const healthTalk = filterHistoryByDateV37(rawHealthTalk, startDate, endDate, [
    "event_date",
    "log_date",
    "created_at",
    "updated_at",
  ]);

  const clinical = filterHistoryByDateV37(rawClinical, startDate, endDate, [
    "exam_date",
    "log_date",
    "created_at",
    "updated_at",
  ]);

  const nutritionCalories = nutrition.reduce((sum: number, item: any) => {
    return sum + Number(item.calories || item.total_calories || 0);
  }, 0);

  const workoutCalories = workout.reduce((sum: number, item: any) => {
    return sum + Number(item.calories || item.total_calories || 0);
  }, 0);

  const workoutSteps = workout.reduce((sum: number, item: any) => {
    return sum + Number(item.steps || item.total_steps || 0);
  }, 0);

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
              Buka dropdown sesuai kebutuhan. Data nutrisi akan diretrieve saat dropdown dibuka.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (openSection === "nutrition") loadNutritionHistory();
              if (openSection !== "nutrition" && refresh) refresh();
            }}
            className="rounded-full bg-slate-950 px-5 py-3 text-xs font-black text-white"
          >
            {loadingKey ? "Memuat..." : "Refresh"}
          </button>
        </div>

        <div className="mt-5 rounded-[1.8rem] bg-slate-50 p-4">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">
            Filter Tanggal
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto_auto]">
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className={fieldClass}
            />

            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className={fieldClass}
            />

            <button
              type="button"
              onClick={setTodayFilter}
              className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-700"
            >
              Hari Ini
            </button>

            <button
              type="button"
              onClick={setLast7DaysFilter}
              className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-700"
            >
              7 Hari
            </button>

            <button
              type="button"
              onClick={clearFilter}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black text-white"
            >
              Semua
            </button>
          </div>
        </div>
      </div>

      <HistoryAccordionCardV37
        title="History Nutrisi"
        subtitle={
          nutritionLoaded
            ? `${nutrition.length} log | ${fmtNumber(nutritionCalories, 0)} kkal`
            : "Klik untuk retrieve data nutrisi"
        }
        open={openSection === "nutrition"}
        loading={loadingKey === "nutrition"}
        onClick={() => openDropdown("nutrition")}
      >
        {directNutrition?.sources ? (
          <div className="mb-4 rounded-[1.4rem] bg-slate-50 px-4 py-3 text-[11px] font-bold leading-5 text-slate-500">
            Source: Supabase {directNutrition.sources.supabase_rows || 0} row | Google Sheet{" "}
            {directNutrition.sources.google_sheet_rows || 0} row
          </div>
        ) : null}

        {nutrition.length === 0 ? (
          <EmptyHistoryCardV37 text={nutritionLoaded ? "Belum ada input nutrisi pada periode ini." : "Klik dropdown untuk memuat data nutrisi."} />
        ) : (
          <div className="space-y-3">
            {nutrition.slice(0, 30).map((item: any, index: number) => (
              <HistoryMealItemV37 key={`${item.id || index}-${index}`} item={item} />
            ))}
          </div>
        )}
      </HistoryAccordionCardV37>

      <HistoryAccordionCardV37
        title="History Workout"
        subtitle={`${workout.length} log | ${fmtNumber(workoutCalories, 0)} kkal | ${fmtNumber(workoutSteps, 0)} steps`}
        open={openSection === "workout"}
        loading={loadingKey === "workout"}
        onClick={() => openDropdown("workout")}
      >
        {workout.length === 0 ? (
          <EmptyHistoryCardV37 text="Belum ada input workout pada periode ini." />
        ) : (
          <div className="space-y-3">
            {workout.slice(0, 30).map((item: any, index: number) => (
              <HistoryGenericItemV37
                key={`${item.id || index}-${index}`}
                title={item.activity_name || item.activity_type || item.source || "Workout"}
                subtitle={formatDateTextV37(item.log_date || item.created_at || item.updated_at)}
                note={`${fmtNumber(item.calories || item.total_calories || 0)} kkal | ${fmtNumber(item.steps || item.total_steps || 0)} steps`}
              />
            ))}
          </div>
        )}
      </HistoryAccordionCardV37>

      <HistoryAccordionCardV37
        title="History Health Talk"
        subtitle={`${healthTalk.length} log`}
        open={openSection === "healthtalk"}
        loading={loadingKey === "healthtalk"}
        onClick={() => openDropdown("healthtalk")}
      >
        {healthTalk.length === 0 ? (
          <EmptyHistoryCardV37 text="Belum ada input Health Talk pada periode ini." />
        ) : (
          <div className="space-y-3">
            {healthTalk.slice(0, 30).map((item: any, index: number) => (
              <HistoryGenericItemV37
                key={`${item.id || index}-${index}`}
                title={item.title || item.topic || "Health Talk"}
                subtitle={formatDateTextV37(item.event_date || item.log_date || item.created_at)}
                note={item.notes || item.description || "-"}
              />
            ))}
          </div>
        )}
      </HistoryAccordionCardV37>

      {clinical.length > 0 ? (
        <HistoryAccordionCardV37
          title="History Klinis"
          subtitle={`${clinical.length} data`}
          open={openSection === "clinical"}
          loading={false}
          onClick={() => setOpenSection(openSection === "clinical" ? "" : "clinical")}
        >
          <div className="space-y-3">
            {clinical.slice(0, 20).map((item: any, index: number) => (
              <HistoryGenericItemV37
                key={`${item.id || index}-${index}`}
                title={formatDateTextV37(item.exam_date || item.log_date || item.created_at)}
                subtitle={`BMI ${item.bmi || item.imt || "-"} | Tensi ${
                  item.systolic ? `${item.systolic}/${item.diastolic || "-"}` : "-"
                }`}
                note={item.summary || item.notes || item.risk_category || "-"}
              />
            ))}
          </div>
        </HistoryAccordionCardV37>
      ) : null}
    </section>
  );
}

function HistoryAccordionCardV37({
  title,
  subtitle,
  open,
  loading,
  onClick,
  children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  loading: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[2.4rem] border border-white bg-white p-5 shadow-xl shadow-slate-200/60 md:p-6">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div>
          <div className="text-2xl font-black text-slate-950">
            {title}
          </div>

          <div className="mt-2 text-sm font-bold leading-5 text-slate-500">
            {loading ? "Memuat data..." : subtitle}
          </div>
        </div>

        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-slate-50 text-xl font-black text-slate-700">
          {open ? "-" : "+"}
        </div>
      </button>

      {open ? (
        <div className="mt-5">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function EmptyHistoryCardV37({ text }: { text: string }) {
  return (
    <div className="rounded-[1.8rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
      {text}
    </div>
  );
}

function HistoryGenericItemV37({
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
      <div className="text-sm font-black text-slate-950">
        {title}
      </div>
      <div className="mt-1 text-xs font-bold text-slate-400">
        {subtitle}
      </div>
      <div className="mt-3 text-sm font-bold leading-6 text-slate-600">
        {note}
      </div>
    </div>
  );
}

function normalizeImageUrlV37(value: any) {
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

function HistoryMealItemV37({ item }: { item: any }) {
  const photo = normalizeImageUrlV37(item.photo_url);
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
            {formatDateTextV37(item.log_date || item.created_at)} | {item.meal_time || item.meal_type || "-"}
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

function filterHistoryByDateV37(
  items: any[],
  startDate: string,
  endDate: string,
  keys: string[]
) {
  return (items || []).filter((item) => {
    const dateText = extractDateFromItemV37(item, keys);

    if (!dateText) return true;
    if (startDate && dateText < startDate) return false;
    if (endDate && dateText > endDate) return false;

    return true;
  });
}

function extractDateFromItemV37(item: any, keys: string[]) {
  for (const key of keys) {
    const raw = clean(item?.[key]);

    if (!raw) continue;

    const iso = raw.match(/\d{4}-\d{2}-\d{2}/);
    if (iso) return iso[0];

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return "";
}

function formatDateTextV37(value: any) {
  const raw = clean(value);

  if (!raw) return "-";

  const iso = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return raw.slice(0, 10);
}

'@

$text = Replace-BlockBetweenFunctions -Text $text -StartFunction "HistoryTab" -NextFunctions @("DevicesTab", "ProfileTab", "MiniLineChart", "BloodPressureChart") -Replacement $historyBlock

# Pastikan caller HistoryTab menerima participant
$text = $text -replace '<HistoryTab(?![^>]*participant=)', '<HistoryTab participant={participant}'

# Main overflow guard
$text = $text.Replace(
  'className="min-h-screen bg-[#f4fbfa] pb-28 pt-16 text-slate-900 md:bg-[#f6fbff] md:pb-0 md:pt-0"',
  'className="min-h-screen overflow-x-hidden bg-[#f4fbfa] pb-28 pt-16 text-slate-900 md:bg-[#f6fbff] md:pb-0 md:pt-0"'
)

Set-Content -Path $path -Value $text -Encoding UTF8

Write-Host "OK - HistoryTab sekarang accordion/dropdown dengan filter tanggal"
Write-Host "OK - intro hero cards akan di-hide global"
Write-Host "DONE - PATCH PORTAL HISTORY DROPDOWN V37"