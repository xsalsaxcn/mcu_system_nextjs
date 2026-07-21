$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "FIX HISTORYTAB PROPS V36"
Write-Host "Patch ini hanya memperbaiki type props HistoryTab."
Write-Host "Tidak mengubah data, API, Google Sheet, Supabase, Google Fit, atau Health Connect."

$text = Get-Content $path -Raw -Encoding UTF8

$oldSignature = @'
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
'@

$newSignature = @'
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
'@

if ($text.Contains($oldSignature)) {
    $text = $text.Replace($oldSignature, $newSignature)
    Write-Host "OK - HistoryTab signature updated"
} else {
    throw "Signature HistoryTab exact tidak ditemukan"
}

$text = $text.Replace(
    "const workout = workoutLogs || [];",
    "const workout = workoutLogs || workoutItems || [];"
)

$text = $text.Replace(
    "const healthTalk = healthTalkLogs || [];",
    "const healthTalk = healthTalkLogs || healthtalkLogs || [];"
)

Set-Content -Path $path -Value $text -Encoding UTF8

Write-Host "OK - workoutItems dan healthtalkLogs alias accepted"
Write-Host "DONE - FIX HISTORYTAB PROPS V36"