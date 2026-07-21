$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\api\wellness\participant\nutrition\route.ts"

if (!(Test-Path $path)) {
    throw "route.ts nutrition tidak ditemukan"
}

Write-Host "FIX NUTRITION PORTION SCOPE V24"

$lines = Get-Content $path -Encoding UTF8

if (($lines -join "`n").Contains("PORTION_SCOPE_FALLBACK_V24")) {
    Write-Host "SKIP - fallback V24 sudah ada"
    exit 0
}

$lastImportIndex = -1

for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].TrimStart().StartsWith("import ")) {
        $lastImportIndex = $i
    }
}

$fallbackLines = @(
    "",
    "// PORTION_SCOPE_FALLBACK_V24",
    "// Fallback untuk helper function lama yang berada di luar scope POST.",
    "// Nilai porsi sebenarnya tetap dikirim dari body POST dan/atau raw_payload.",
    'const portionGroup = "";',
    'const portionFraction = "";',
    "const portionMultiplier = 0;",
    ""
)

$out = New-Object System.Collections.Generic.List[string]

for ($i = 0; $i -lt $lines.Count; $i++) {
    $out.Add($lines[$i])

    if ($i -eq $lastImportIndex) {
        foreach ($line in $fallbackLines) {
            $out.Add($line)
        }
    }
}

if ($lastImportIndex -lt 0) {
    Write-Host "WARNING - tidak ada import. Fallback ditaruh di awal file."
    $out = New-Object System.Collections.Generic.List[string]
    foreach ($line in $fallbackLines) {
        $out.Add($line)
    }
    foreach ($line in $lines) {
        $out.Add($line)
    }
}

Set-Content -Path $path -Value ($out -join "`r`n") -Encoding UTF8

Write-Host "OK - fallback variable ditambahkan setelah import terakhir"
Write-Host "DONE - FIX NUTRITION PORTION SCOPE V24"