$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"
$out = "C:\Users\Lenovo\Documents\mcu_system_nextjs\wrong_card_source_report_v40.txt"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

$lines = Get-Content $path -Encoding UTF8

function Get-FunctionNameBeforeLine {
    param([int]$LineIndex)

    for ($i = $LineIndex; $i -ge 0; $i--) {
        if ($lines[$i] -match '^\s*function\s+([A-Za-z0-9_]+)\s*\(') {
            return $matches[1]
        }

        if ($lines[$i] -match '^\s*const\s+([A-Za-z0-9_]+)\s*=\s*\(') {
            return $matches[1]
        }
    }

    return "UNKNOWN"
}

function Add-Context {
    param(
        [System.Collections.Generic.List[string]]$Report,
        [string]$Title,
        [int]$LineIndex
    )

    $fn = Get-FunctionNameBeforeLine -LineIndex $LineIndex
    $start = [Math]::Max(0, $LineIndex - 25)
    $end = [Math]::Min($lines.Count - 1, $LineIndex + 35)

    $Report.Add("")
    $Report.Add("============================================================")
    $Report.Add($Title)
    $Report.Add("MATCH LINE: " + ($LineIndex + 1))
    $Report.Add("NEAREST FUNCTION: " + $fn)
    $Report.Add("CONTEXT: " + ($start + 1) + " - " + ($end + 1))
    $Report.Add("============================================================")

    for ($j = $start; $j -le $end; $j++) {
        $prefix = "   "
        if ($j -eq $LineIndex) {
            $prefix = ">>>"
        }

        $Report.Add($prefix + ($j + 1).ToString().PadLeft(5) + " | " + $lines[$j])
    }
}

$report = New-Object System.Collections.Generic.List[string]

$report.Add("WRONG CARD SOURCE REPORT V40")
$report.Add("File: $path")
$report.Add("Generated: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))
$report.Add("")

$patterns = @(
    "CALORIES IN",
    "Calories In",
    "0 input nutrisi hari ini",
    "input nutrisi hari ini",
    "WORKOUT CALORIES",
    "Workout Calories",
    "hari ini dari manual/device",
    "BMI / TENSI",
    "Today Wellness",
    "Refresh Nutrisi",
    "Portal Individu Peserta",
    "Portal peserta aktif",
    "foodCalories",
    "foodCount",
    "today_calories",
    "today_count",
    "nutrition-direct",
    "HomeTab",
    "ParticipantPortalMenu",
    "activeTab === `"home`"",
    "activeTab === `"nutrition`"",
    "activeTab === `"history`""
)

foreach ($pattern in $patterns) {
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i].Contains($pattern)) {
            Add-Context -Report $report -Title ("PATTERN: " + $pattern) -LineIndex $i
        }
    }
}

$report.Add("")
$report.Add("============================================================")
$report.Add("SUMMARY OF FUNCTION DEFINITIONS")
$report.Add("============================================================")

for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s*function\s+([A-Za-z0-9_]+)\s*\(') {
        $report.Add(($i + 1).ToString().PadLeft(5) + " | " + $matches[1])
    }
}

$report.Add("")
$report.Add("============================================================")
$report.Add("SUMMARY OF JSX ACTIVE TAB CALLS")
$report.Add("============================================================")

for ($i = 0; $i -lt $lines.Count; $i++) {
    if (
        $lines[$i].Contains("activeTab ===") -or
        $lines[$i].Contains("<HomeTab") -or
        $lines[$i].Contains("<NutritionTab") -or
        $lines[$i].Contains("<HistoryTab") -or
        $lines[$i].Contains("<WorkoutTab") -or
        $lines[$i].Contains("<HealthtalkTab")
    ) {
        $fn = Get-FunctionNameBeforeLine -LineIndex $i
        $report.Add(($i + 1).ToString().PadLeft(5) + " | " + $fn + " | " + $lines[$i].Trim())
    }
}

Set-Content -Path $out -Value ($report -join "`r`n") -Encoding UTF8

Write-Host ""
Write-Host "DONE"
Write-Host "Report dibuat di:"
Write-Host $out
Write-Host ""
Write-Host "Buka report:"
Write-Host "notepad wrong_card_source_report_v40.txt"