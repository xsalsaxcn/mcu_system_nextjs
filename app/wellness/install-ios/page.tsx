"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

function detectStandalone() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as NavigatorWithStandalone).standalone)
  );
}

export default function InstallIosPage() {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(detectStandalone());
  }, []);

  return (
    <main className="mx-auto min-h-[100dvh] max-w-xl px-4 py-6 sm:py-10">
      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-xl">
        <header className="bg-gradient-to-br from-[#042e66] via-[#0b4b91] to-[#138c8c] px-6 py-7 text-white">
          <div className="flex items-center gap-4">
            <img
              src="/wellness-pwa/apple-touch-icon.png"
              alt="Harmony Wellness"
              width={72}
              height={72}
              className="h-[72px] w-[72px] rounded-[22px] shadow-lg"
            />
            <div>
              <p className="m-0 text-xs font-black uppercase tracking-[0.16em] text-blue-100">
                Harmony Health
              </p>
              <h1 className="mt-1 text-2xl font-black leading-tight">
                Pasang Wellness di iPhone
              </h1>
              <p className="mt-2 text-sm font-semibold leading-5 text-blue-50">
                Gunakan Safari dan buka sebagai Web App. Tidak perlu App Store.
              </p>
            </div>
          </div>
        </header>

        <div className="space-y-5 p-5 sm:p-7">
          {standalone ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
              Harmony Wellness sudah dibuka dalam mode aplikasi di perangkat ini.
            </div>
          ) : (
            <ol className="space-y-3">
              {[
                "Buka halaman ini menggunakan Safari di iPhone.",
                "Tekan tombol Bagikan pada toolbar Safari.",
                "Pilih Tambahkan ke Layar Utama.",
                "Aktifkan Buka sebagai App Web, lalu tekan Tambah.",
                "Buka ikon Harmony Wellness dari Home Screen.",
              ].map((step, index) => (
                <li
                  key={step}
                  className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#042e66] text-sm font-black text-white">
                    {index + 1}
                  </span>
                  <p className="m-0 pt-1 text-sm font-bold leading-6 text-slate-700">
                    {step}
                  </p>
                </li>
              ))}
            </ol>
          )}

          <div className="rounded-2xl bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-950">
            Setelah terpasang, portal dibuka dalam tampilan standalone dengan ikon
            sendiri dan area layar yang menyesuaikan safe area iPhone.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/wellness"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#042e66] px-5 text-sm font-black text-white"
            >
              Buka Wellness
            </Link>
            <Link
              href="/wellness/portal"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-black text-slate-700"
            >
              Portal Peserta
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
