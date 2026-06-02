$ErrorActionPreference = "Stop"

$root = Get-Location
$appShell = Join-Path $root "components\AppShell.tsx"
$globals = Join-Path $root "app\globals.css"

if (!(Test-Path $appShell)) {
  throw "components\AppShell.tsx tidak ditemukan. Jalankan script dari root project mcu_system_nextjs."
}

Copy-Item $appShell "$appShell.bak_mobile_menu_v72" -Force
if (Test-Path $globals) {
  Copy-Item $globals "$globals.bak_mobile_menu_v72" -Force
}

$s = Get-Content $appShell -Raw

# Make wrapper safe for menu stacking.
$s = $s -replace 'function MenuDrawer\(\{ groups \}: \{ groups: typeof adminMenuGroups \}\) \{([\s\S]*?)return \(\s*<div className="relative">', 'function MenuDrawer({ groups }: { groups: typeof adminMenuGroups }) {$1return (`n    <div className="relative z-[9999]">'

# Put backdrop below the drawer but above page content.
$s = $s -replace 'className="fixed inset-0 z-40 cursor-default bg-slate-950/20 backdrop-blur-\[1px\]"', 'className="fixed inset-0 z-[9998] cursor-default bg-slate-950/70 backdrop-blur-sm"'
$s = $s -replace 'className="fixed inset-0 z-40 cursor-default bg-black/10"', 'className="fixed inset-0 z-[9998] cursor-default bg-slate-950/70 backdrop-blur-sm"'

# Replace the old absolute desktop dropdown with a mobile fullscreen drawer and desktop dropdown fallback.
$s = $s -replace 'className="absolute right-0 z-50 mt-3 w-\[390px\] max-w-\[calc\(100vw-32px\)\] overflow-hidden rounded-\[28px\] border border-slate-200 bg-white shadow-2xl"', 'className="fixed inset-0 z-[9999] h-dvh w-screen overflow-hidden rounded-none border-0 bg-white shadow-2xl md:absolute md:inset-auto md:right-0 md:mt-3 md:h-auto md:w-[390px] md:max-w-[calc(100vw-32px)] md:rounded-[28px] md:border md:border-slate-200"'
$s = $s -replace 'className="absolute right-0 z-50 mt-3 w-\[360px\] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"', 'className="fixed inset-0 z-[9999] h-dvh w-screen overflow-hidden rounded-none border-0 bg-white shadow-2xl md:absolute md:inset-auto md:right-0 md:mt-3 md:h-auto md:w-[360px] md:rounded-3xl md:border md:border-slate-200"'

# Make menu body fill the mobile viewport and scroll properly.
$s = $s -replace 'className="max-h-\[72vh\] overflow-auto bg-slate-50 p-3"', 'className="h-[calc(100dvh-92px)] overflow-y-auto overflow-x-hidden bg-slate-50 p-4 pb-10 md:h-auto md:max-h-[72vh] md:p-3"'
$s = $s -replace 'className="max-h-\[70vh\] overflow-auto p-3"', 'className="h-[calc(100dvh-92px)] overflow-y-auto overflow-x-hidden p-4 pb-10 md:h-auto md:max-h-[70vh] md:p-3"'

# Make header area in drawer easier on mobile.
$s = $s -replace 'className="bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-950 px-5 py-5 text-white"', 'className="sticky top-0 z-10 bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-950 px-6 py-6 text-white md:static md:px-5 md:py-5"'
$s = $s -replace 'className="border-b border-slate-100 bg-slate-50 px-5 py-4"', 'className="sticky top-0 z-10 border-b border-slate-100 bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-950 px-6 py-6 text-white md:static md:bg-slate-50 md:px-5 md:py-4 md:text-slate-900"'

Set-Content -Path $appShell -Value $s -Encoding UTF8

if (Test-Path $globals) {
  $g = Get-Content $globals -Raw
  $marker = "/* mobile menu component fallback v72 */"
  if ($g -notmatch [regex]::Escape($marker)) {
    $css = @'

/* mobile menu component fallback v72 */
html,
body {
  max-width: 100%;
  overflow-x: hidden;
}

@media (max-width: 768px) {
  html,
  body {
    max-width: 100%;
    overflow-x: hidden !important;
  }

  header {
    z-index: 50;
  }

  main,
  section,
  form,
  input,
  select,
  textarea,
  button {
    max-width: 100%;
  }
}
'@
    Add-Content -Path $globals -Value $css -Encoding UTF8
  }
}

Write-Host "Mobile hamburger menu fix v72 applied." -ForegroundColor Green
Write-Host "Backups created:" -ForegroundColor Cyan
Write-Host "- components\AppShell.tsx.bak_mobile_menu_v72"
if (Test-Path $globals) { Write-Host "- app\globals.css.bak_mobile_menu_v72" }
