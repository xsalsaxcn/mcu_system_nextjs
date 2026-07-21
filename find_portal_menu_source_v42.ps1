$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"
$out = "C:\Users\Lenovo\Documents\mcu_system_nextjs\portal_menu_source_report_v42.txt"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

$lines = Get-Content $path -Encoding UTF8
$report = New-Object System.Collections.Generic.List[string]

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
        [string]$Title,
        [int]$LineIndex
    )

    $fn = Get-FunctionNameBeforeLine -LineIndex $LineIndex
    $start = [Math]::Max(0, $LineIndex - 20)
    $end = [Math]::Min($lines.Count - 1, $LineIndex + 35)

    $report.Add("")
    $report.Add("============================================================")
    $report.Add($Title)
    $report.Add("MATCH LINE: " + ($LineIndex + 1))
    $report.Add("NEAREST FUNCTION: " + $fn)
    $report.Add("CONTEXT: " + ($start + 1) + " - " + ($end + 1))
    $report.Add("============================================================")

    for ($j = $start; $j -le $end; $j++) {
        $prefix = "   "
        if ($j -eq $LineIndex) {
            $prefix = ">>>"
        }

        $report.Add($prefix + ($j + 1).ToString().PadLeft(5) + " | " + $lines[$j])
    }
}

$report.Add("PORTAL MENU SOURCE REPORT V42")
$report.Add("File: $path")
$report.Add("Generated: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))

$patterns = @(
    "type PortalTab",
    "PortalTab =",
    "ParticipantPortalMenu",
    "activeTab ===",
    "setActiveTab",
    "HomeTab",
    "NutritionTab",
    "WorkoutTab",
    "HealthtalkTab",
    "HistoryTab",
    "DevicesTab",
    "ProfileTab",
    "nutrition-direct",
    "workoutItems",
    "clinicalHistory",
    "healthConnectConnected",
    "googleFitConnected"
)

foreach ($pattern in $patterns) {
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i].Contains($pattern)) {
            Add-Context -Title ("PATTERN: " + $pattern) -LineIndex $i
        }
    }
}

$report.Add("")
$report.Add("============================================================")
$report.Add("FUNCTION DEFINITIONS")
$report.Add("============================================================")

for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s*function\s+([A-Za-z0-9_]+)\s*\(') {
        $report.Add(($i + 1).ToString().PadLeft(5) + " | " + $matches[1])
    }
}

Set-Content -Path $out -Value ($report -join "`r`n") -Encoding UTF8

Write-Host ""
Write-Host "DONE"
Write-Host "Report dibuat di:"
Write-Host $out
Write-Host ""
Write-Host "Buka report:"
Write-Host "notepad portal_menu_source_report_v42.txt"