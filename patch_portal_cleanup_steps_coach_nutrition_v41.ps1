$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "PATCH PORTAL CLEANUP STEPS COACH NUTRITION V41"
Write-Host "Patch ini memperbaiki display layer saja."
Write-Host "Tidak mengubah API, Google Sheet, Supabase, Google Fit, atau Health Connect."

$text = Get-Content $path -Raw -Encoding UTF8

# ============================================================
# 1. Remove source hero and message card from portal page
# ============================================================

$heroPattern = '(?s)\s*<section className="overflow-hidden rounded-\[2rem\] bg-gradient-to-br from-teal-400 via-sky-400 to-blue-500 p-6 text-white shadow-xl shadow-sky-100 md:p-8">.*?</section>\s*<section className="mt-5 rounded-\[2rem\] border border-slate-200 bg-white p-5 shadow-sm">.*?</section>'

$newText = [regex]::Replace($text, $heroPattern, "`r`n", 1)

if ($newText -ne $text) {
    $text = $newText
    Write-Host "OK - source hero Portal Individu Peserta dan message card removed"
} else {
    Write-Host "INFO - hero/message exact block tidak ditemukan atau sudah terhapus"
}

# Remove old DOM hide mount if still present
$text = $text.Replace("<HideOldInvalidSummaryCardV39 />", "")
$text = $text.Replace("<HideOldInvalidSummaryCardV38 />", "")
$text = $text.Replace("<HideParticipantIntroCardsV37 />", "")

# ============================================================
# 2. Restore CoachNoticeCenter in HomeTab
# ============================================================

$homeStart = $text.IndexOf("function HomeTab(")
if ($homeStart -lt 0) {
    throw "function HomeTab tidak ditemukan"
}

$homeEnd = $text.IndexOf("function PortalMetricCard", $homeStart)
if ($homeEnd -lt 0) {
    $homeEnd = $text.IndexOf("function HomeMetricCard", $homeStart)
}
if ($homeEnd -lt 0) {
    $homeEnd = $text.IndexOf("function HomeMealLogItem", $homeStart)
}
if ($homeEnd -lt 0) {
    throw "Akhir HomeTab tidak ditemukan"
}

$beforeHome = $text.Substring(0, $homeStart)
$homeBlock = $text.Substring($homeStart, $homeEnd - $homeStart)
$afterHome = $text.Substring($homeEnd)

if ($homeBlock.Contains("<CoachNoticeCenter participant={participant} />")) {
    Write-Host "SKIP - CoachNoticeCenter sudah ada di HomeTab"
} else {
    $homeBlock = $homeBlock.Replace(
        '<section className="w-full max-w-full space-y-5 overflow-hidden">',
        '<section className="w-full max-w-full space-y-5 overflow-hidden">' + "`r`n      <CoachNoticeCenter participant={participant} />"
    )
    Write-Host "OK - CoachNoticeCenter restored in HomeTab"
}

$text = $beforeHome + $homeBlock + $afterHome

# ============================================================
# 3. Add robust workout history value helpers
# ============================================================

if (!$text.Contains("function historyStepsValueV41(")) {
    $insertBefore = $text.IndexOf("function HistoryTab(")

    if ($insertBefore -lt 0) {
        throw "function HistoryTab tidak ditemukan untuk insert helper"
    }

    $helper = @'

function parseRawPayloadV41(item: any) {
  const raw = item?.raw_payload;

  if (!raw) return {};

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  if (typeof raw === "object") return raw;

  return {};
}

function numberFromMixedV41(value: any) {
  if (value === null || value === undefined) return 0;

  const text = String(value)
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

function firstPositiveNumberV41(values: any[]) {
  for (const value of values) {
    const n = numberFromMixedV41(value);
    if (n > 0) return n;
  }

  return 0;
}

function numberFromTextPatternV41(text: any, pattern: RegExp) {
  const raw = clean(text);
  const match = raw.match(pattern);

  if (!match?.[1]) return 0;

  return numberFromMixedV41(match[1]);
}

function historyStepsValueV41(item: any) {
  const raw = parseRawPayloadV41(item);
  const original = raw?.original_payload || raw?.original || raw?.diagnostic || {};

  const direct = firstPositiveNumberV41([
    item?.steps,
    item?.total_steps,
    item?.step_count,
    item?.health_connect_steps,
    item?.google_fit_steps,
    raw?.steps,
    raw?.total_steps,
    raw?.step_count,
    raw?.health_connect_steps,
    raw?.google_fit_steps,
    raw?.activity_steps,
    original?.steps,
    original?.total_steps,
    original?.step_count,
    original?.health_connect_steps,
    original?.google_fit_steps,
  ]);

  if (direct > 0) return direct;

  return (
    numberFromTextPatternV41(item?.activity_name, /([0-9][0-9.,]*)\s*steps/i) ||
    numberFromTextPatternV41(item?.activity_type, /([0-9][0-9.,]*)\s*steps/i) ||
    numberFromTextPatternV41(item?.notes, /([0-9][0-9.,]*)\s*steps/i) ||
    0
  );
}

function historyCaloriesValueV41(item: any) {
  const raw = parseRawPayloadV41(item);
  const original = raw?.original_payload || raw?.original || raw?.diagnostic || {};

  return firstPositiveNumberV41([
    item?.calories,
    item?.total_calories,
    item?.calorie,
    item?.kcal,
    raw?.calories,
    raw?.total_calories,
    raw?.calorie,
    raw?.kcal,
    raw?.active_calories,
    original?.calories,
    original?.total_calories,
    original?.active_calories,
  ]);
}

'@

    $text = $text.Substring(0, $insertBefore) + $helper + $text.Substring($insertBefore)
    Write-Host "OK - history workout helpers inserted"
} else {
    Write-Host "SKIP - history workout helpers already exist"
}

# Replace workout history display direct fields with robust helper
$text = $text.Replace(
    'note={`${fmtNumber(item.calories || item.total_calories || 0)} kkal | ${fmtNumber(item.steps || item.total_steps || 0)} steps`}',
    'note={`${fmtNumber(historyCaloriesValueV41(item), 0)} kkal | ${fmtNumber(historyStepsValueV41(item), 0)} steps`}'
)

$text = $text.Replace(
    'note={`${fmtNumber(item.calories || item.total_calories || 0)} kkal | ${fmtNumber(item.steps || item.total_steps || 0)} steps`}',
    'note={`${fmtNumber(historyCaloriesValueV41(item), 0)} kkal | ${fmtNumber(historyStepsValueV41(item), 0)} steps`}'
)

Write-Host "OK - History Workout display now uses raw_payload/activity_name step parser"

# ============================================================
# 4. Fix mojibake separators
# ============================================================

$text = $text.Replace("Â€¢", "|")
$text = $text.Replace("â€¢", "|")
$text = $text.Replace("Ã¢â‚¬Â¢", "|")
$text = $text.Replace("•", "|")

Write-Host "OK - mojibake bullet separators normalized"

# ============================================================
# 5. Compact Nutrition UI and prevent horizontal overflow
# ============================================================

$text = $text.Replace(
    'className="min-h-screen overflow-x-hidden bg-[#f4fbfa] pb-28 pt-16 text-slate-900 md:bg-[#f6fbff] md:pb-0 md:pt-0"',
    'className="min-h-screen overflow-x-hidden bg-[#f4fbfa] pb-28 pt-16 text-slate-900 md:bg-[#f6fbff] md:pb-0 md:pt-0"'
)

$text = $text.Replace(
    'className="min-h-screen bg-[#f4fbfa] pb-28 pt-16 text-slate-900 md:bg-[#f6fbff] md:pb-0 md:pt-0"',
    'className="min-h-screen overflow-x-hidden bg-[#f4fbfa] pb-28 pt-16 text-slate-900 md:bg-[#f6fbff] md:pb-0 md:pt-0"'
)

# Remove two-column nutrition/workflow grid that causes WebView overflow
$text = $text.Replace('grid gap-5 lg:grid-cols-[1fr_390px]', 'grid gap-4')
$text = $text.Replace('grid gap-5 md:grid-cols-[250px_1fr]', 'grid gap-4')
$text = $text.Replace('grid gap-5 md:grid-cols-[320px_1fr]', 'grid gap-4')
$text = $text.Replace('grid gap-5 md:grid-cols-[1fr_380px]', 'grid gap-4')

# Compact very large headings
$text = $text.Replace(
    'text-3xl font-black leading-tight text-slate-950 md:text-4xl',
    'text-2xl font-black leading-tight text-slate-950 md:text-3xl'
)

$text = $text.Replace(
    'text-3xl font-black text-slate-950',
    'text-2xl font-black text-slate-950'
)

# Compact padding and upload thumbnail
$text = $text.Replace('p-6 md:p-7', 'p-5 md:p-6')
$text = $text.Replace('h-28 w-28', 'h-20 w-20')
$text = $text.Replace('rounded-[2.4rem]', 'rounded-[2rem]')
$text = $text.Replace('rounded-[2.3rem]', 'rounded-[2rem]')

Write-Host "OK - nutrition UI compacted and overflow reduced"

# ============================================================
# 6. Validation
# ============================================================

Set-Content -Path $path -Value $text -Encoding UTF8

Write-Host ""
Write-Host "VALIDATION"
Write-Host "Hero source:"
Select-String -Path $path -Pattern "Portal Individu Peserta" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}

Write-Host ""
Write-Host "Old parent calories source:"
Select-String -Path $path -Pattern "totals.foodCalories" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}

Write-Host ""
Write-Host "Coach notice:"
Select-String -Path $path -Pattern "CoachNoticeCenter participant" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}

Write-Host ""
Write-Host "Workout step helper:"
Select-String -Path $path -Pattern "historyStepsValueV41" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}

Write-Host ""
Write-Host "DONE - PATCH PORTAL CLEANUP STEPS COACH NUTRITION V41"