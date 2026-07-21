$ErrorActionPreference = "Stop"

$path = "C:\Users\Lenovo\Documents\mcu_system_nextjs\app\wellness\portal\page.tsx"

if (!(Test-Path $path)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "REMOVE PARENT SUMMARY GRID V40"
Write-Host "Patch ini menghapus SummaryCard lama di parent page."
Write-Host "Tidak mengubah API, Google Sheet, Supabase, Google Fit, atau Health Connect."

$text = Get-Content $path -Raw -Encoding UTF8

$oldBlock = @'
            <section className="grid gap-4 md:grid-cols-4">
              <SummaryCard
                label="Calories In"
                value={`${fmtNumber(totals.foodCalories, 0)} kkal`}
                note={
                  totals.pendingCalories > 0
                    ? `${totals.foodCount} input, ${totals.pendingCalories} belum match master`
                    : `${totals.foodCount} input nutrisi hari ini`
                }
                tone="blue"
              />

              <SummaryCard
                label="Workout Calories"
                value={`${fmtNumber(totals.workoutCalories, 0)} kkal`}
                note={`${fmtNumber(totals.workoutMinutes, 1)} menit aktivitas hari ini`}
                tone="emerald"
              />

              <SummaryCard
                label="Steps"
                value={fmtNumber(totals.steps, 0)}
                note="hari ini dari manual/device bila tersedia"
                tone="amber"
              />

              <SummaryCard
                label="BMI / Tensi"
                value={lastClinical?.bmi ? fmtNumber(lastClinical.bmi, 1) : "-"}
                note={
                  lastClinical?.systolic
                    ? `${lastClinical.systolic}/${lastClinical.diastolic || "-"} mmHg`
                    : "data klinis terakhir"
                }
                tone="slate"
              />
            </section>

'@

if ($text.Contains($oldBlock)) {
    $text = $text.Replace($oldBlock, "")
    Write-Host "OK - exact parent SummaryCard grid removed"
} else {
    Write-Host "Exact block tidak ditemukan, pakai regex targeted."

    $pattern = '(?s)\s*<section className="grid gap-4 md:grid-cols-4">\s*<SummaryCard\s*label="Calories In"\s*value=\{`\$\{fmtNumber\(totals\.foodCalories,\s*0\)\} kkal`\}.*?</section>\s*(?=\{activeTab === "home")'

    $newText = [regex]::Replace($text, $pattern, "`r`n", 1)

    if ($newText -eq $text) {
        throw "Gagal hapus parent SummaryCard grid. Pattern tidak match."
    }

    $text = $newText
    Write-Host "OK - parent SummaryCard grid removed by regex"
}

Set-Content -Path $path -Value $text -Encoding UTF8

Write-Host ""
Write-Host "VALIDATION"
Write-Host "Search old totals.foodCalories SummaryCard:"
Select-String -Path $path -Pattern "totals.foodCalories" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}

Write-Host ""
Write-Host "Search correct nutrition-direct:"
Select-String -Path $path -Pattern "nutrition-direct" -SimpleMatch | ForEach-Object {
    Write-Host ($_.LineNumber.ToString() + ": " + $_.Line.Trim())
}

Write-Host ""
Write-Host "DONE - REMOVE PARENT SUMMARY GRID V40"