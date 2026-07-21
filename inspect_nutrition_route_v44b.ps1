$ErrorActionPreference = "Stop"

$route = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\api\wellness\participant\nutrition\route.ts"
$out = "C:\Users\Lenovo\Documents\mcu_system_nextjs\nutrition_route_report_v44b.txt"

if (!(Test-Path $route)) {
    throw "route nutrition tidak ditemukan: $route"
}

$lines = Get-Content $route -Encoding UTF8
$report = New-Object System.Collections.Generic.List[string]

function Add-Context {
    param(
        [string]$Title,
        [int]$Index
    )

    $start = [Math]::Max(0, $Index - 25)
    $end = [Math]::Min($lines.Count - 1, $Index + 35)

    $report.Add("")
    $report.Add("============================================================")
    $report.Add($Title)
    $report.Add("MATCH LINE: " + ($Index + 1))
    $report.Add("CONTEXT: " + ($start + 1) + " - " + ($end + 1))
    $report.Add("============================================================")

    for ($i = $start; $i -le $end; $i++) {
        $prefix = "   "
        if ($i -eq $Index) {
            $prefix = ">>>"
        }

        $report.Add($prefix + ($i + 1).ToString().PadLeft(5) + " | " + $lines[$i])
    }
}

$report.Add("NUTRITION ROUTE REPORT V44B")
$report.Add("File: $route")
$report.Add("Generated: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))
$report.Add("")

$patterns = @(
    "export async function POST",
    "formData",
    ".formData",
    "request.formData",
    "req.formData",
    "await request.json",
    "await req.json",
    "const body",
    "const payload",
    "const data",
    "totalCalories",
    "calories:",
    "total_calories:",
    "estimated_calories",
    "food_breakdown",
    "portion_breakdown",
    "raw_payload",
    "Google Sheet",
    "webhook",
    "WELLNESS_GOOGLE_SHEET_WEBHOOK_URL",
    "fetch("
)

foreach ($pattern in $patterns) {
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i].Contains($pattern)) {
            Add-Context -Title ("PATTERN: " + $pattern) -Index $i
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

    if ($lines[$i] -match '^\s*export\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(') {
        $report.Add(($i + 1).ToString().PadLeft(5) + " | export async " + $matches[1])
    }
}

Set-Content -Path $out -Value ($report -join "`r`n") -Encoding UTF8

Write-Host ""
Write-Host "DONE"
Write-Host "Report dibuat di:"
Write-Host $out
Write-Host ""
Write-Host "Buka report:"
Write-Host "notepad nutrition_route_report_v44b.txt"