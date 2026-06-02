$ErrorActionPreference = 'Stop'
$p = 'app\globals.css'
if (!(Test-Path $p)) {
  throw "app\globals.css not found. Run this script from the project root."
}
$marker = '/* mobile portrait hamburger drawer fix v74 */'
$s = Get-Content $p -Raw
if ($s -notmatch [regex]::Escape($marker)) {
  $css = @'

/* mobile portrait hamburger drawer fix v74 */
@media (max-width: 768px) and (orientation: portrait) {
  html,
  body,
  #__next {
    width: 100% !important;
    max-width: 100% !important;
    overflow-x: hidden !important;
  }

  body:has(.mobile-menu-open),
  body:has([data-harmony-menu-open="true"]) {
    overflow: hidden !important;
  }

  /* Highest priority for mobile menu overlay */
  .fixed.inset-0,
  [class*="fixed"][class*="inset-0"] {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100dvh !important;
    max-width: 100vw !important;
    max-height: 100dvh !important;
    z-index: 2147483000 !important;
    overflow: hidden !important;
    isolation: isolate !important;
  }

  /* Backdrop behind drawer */
  .fixed.inset-0 > button.absolute.inset-0,
  .fixed.inset-0 > div.absolute.inset-0,
  .fixed.inset-0 > .absolute.inset-0,
  [class*="fixed"][class*="inset-0"] > button[class*="absolute"][class*="inset-0"],
  [class*="fixed"][class*="inset-0"] > div[class*="absolute"][class*="inset-0"] {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100dvh !important;
    z-index: 0 !important;
    background: rgba(15, 23, 42, 0.68) !important;
    backdrop-filter: blur(2px) !important;
    -webkit-backdrop-filter: blur(2px) !important;
  }

  /* Drawer panel should sit above backdrop and be fully visible */
  .fixed.inset-0 > aside,
  .fixed.inset-0 > nav,
  .fixed.inset-0 > div:not(.absolute),
  .fixed.inset-0 [role="dialog"],
  .fixed.inset-0 [data-harmony-menu],
  .fixed.inset-0 [data-menu],
  .fixed.inset-0 [data-drawer],
  .fixed.inset-0 .mobile-menu,
  .fixed.inset-0 .hamburger-menu,
  .fixed.inset-0 .menu-drawer,
  .fixed.inset-0 .drawer,
  [class*="fixed"][class*="inset-0"] > aside,
  [class*="fixed"][class*="inset-0"] > nav,
  [class*="fixed"][class*="inset-0"] > div:not([class*="absolute"]) {
    position: fixed !important;
    top: max(8px, env(safe-area-inset-top)) !important;
    left: 8px !important;
    right: 8px !important;
    bottom: max(8px, env(safe-area-inset-bottom)) !important;
    width: auto !important;
    max-width: none !important;
    min-width: 0 !important;
    height: auto !important;
    max-height: none !important;
    z-index: 2147483647 !important;
    margin: 0 !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    overscroll-behavior: contain !important;
    -webkit-overflow-scrolling: touch !important;
    opacity: 1 !important;
    filter: none !important;
    transform: none !important;
  }

  /* Keep actual drawer text sharp; blur only backdrop */
  .fixed.inset-0 > aside *,
  .fixed.inset-0 > nav *,
  .fixed.inset-0 > div:not(.absolute) *,
  .fixed.inset-0 [role="dialog"] *,
  .fixed.inset-0 [data-harmony-menu] *,
  .fixed.inset-0 [data-menu] *,
  .fixed.inset-0 [data-drawer] *,
  .fixed.inset-0 .mobile-menu *,
  .fixed.inset-0 .hamburger-menu *,
  .fixed.inset-0 .menu-drawer *,
  .fixed.inset-0 .drawer * {
    opacity: 1 !important;
    filter: none !important;
    text-shadow: none !important;
  }

  /* Prevent dashboard/card layers from covering menu */
  header,
  main,
  section,
  .card,
  [class*="rounded-"] {
    transform: none;
  }
}
'@
  Add-Content -Path $p -Value $css -Encoding UTF8
  Write-Host 'Applied mobile portrait hamburger drawer fix v74 to app\globals.css'
} else {
  Write-Host 'mobile portrait hamburger drawer fix v74 already exists in app\globals.css'
}
