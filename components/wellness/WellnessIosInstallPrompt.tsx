"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const DISMISS_KEY = "harmony_wellness_ios_install_prompt_dismissed";

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

function isIosDevice() {
  if (typeof navigator === "undefined") return false;

  const userAgent = navigator.userAgent || "";
  const classicIos = /iPad|iPhone|iPod/i.test(userAgent);
  const ipadDesktopMode =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

  return classicIos || ipadDesktopMode;
}

function isStandaloneMode() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as NavigatorWithStandalone).standalone)
  );
}

export default function WellnessIosInstallPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isIosDevice() || isStandaloneMode()) return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;

    const timer = window.setTimeout(() => setVisible(true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <aside
      aria-label="Pasang Harmony Wellness di iPhone"
      className="fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom,0px))] z-[120] mx-auto max-w-md rounded-[24px] border border-blue-100 bg-white/95 p-4 shadow-2xl backdrop-blur"
    >
      <div className="flex items-start gap-3">
        <img
          src="/wellness-pwa/apple-touch-icon.png"
          alt="Harmony Wellness"
          width={52}
          height={52}
          className="h-[52px] w-[52px] rounded-2xl"
        />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-black text-slate-950">
            Pasang Harmony Wellness di iPhone
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
            Buka seperti aplikasi melalui Safari tanpa App Store.
          </p>
          <div className="mt-3 flex gap-2">
            <Link
              href="/wellness/install-ios"
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#042e66] px-4 text-xs font-black text-white"
            >
              Lihat cara pasang
            </Link>
            <button
              type="button"
              className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
              onClick={() => {
                window.localStorage.setItem(DISMISS_KEY, "1");
                setVisible(false);
              }}
            >
              Nanti
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
