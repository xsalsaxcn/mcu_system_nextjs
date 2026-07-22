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
    <main className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,#e5fbf8_0,#f6fafc_42%,#eef4f8_100%)] px-4 pb-[calc(28px+env(safe-area-inset-bottom,0px))] pt-[calc(24px+env(safe-area-inset-top,0px))] text-slate-950 sm:py-10">
      <section className="mx-auto max-w-xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl">
        <header className="bg-gradient-to-br from-[#042e66] via-[#0b4b91] to-[#138c8c] px-6 py-7 text-white">
          <div className="flex items-center gap-4">
            <img
              src="/wellness-pwa/apple-touch-icon.png"
              alt="Harmony Wellness"
              width={72}
              height={72}
              className="h-[72px] w-[72px] rounded-[22px] shadow-lg ring-2 ring-white/20"
            />
            <div>
              <p className="m-0 text-xs font-black uppercase tracking-[0.16em] text-blue-100">
                Harmony Health
              </p>
              <h1 className="mt-1 text-2xl font-black leading-tight">
                Pasang Wellness di iPhone
              </h1>
              <p className="mt-2 text-sm font-semibold leading-5 text-blue-50">
                Tambahkan ke Home Screen dan buka seperti aplikasi tanpa App Store.
              </p>
            </div>
          </div>
        </header>

        <div className="space-y-5 p-5 sm:p-7">
          {standalone ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold leading-6 text-emerald-800">
              Harmony Wellness sudah dibuka dalam mode aplikasi di perangkat ini.
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
                Pada menu seperti di gambar, tekan <strong>Share</strong> terlebih dahulu. Opsi <strong>Add to Home Screen</strong> muncul pada panel Share berikutnya, bukan pada menu awal Safari.
              </div>

              <ol className="space-y-3">
                {[
                  "Pastikan halaman dibuka langsung menggunakan Safari, bukan browser di dalam WhatsApp.",
                  "Tekan tombol More, lalu pilih Share. Pada layout Safari tertentu, tekan ikon Share langsung di toolbar.",
                  "Pada panel Share, geser ke bawah lalu pilih Add to Home Screen atau Tambahkan ke Layar Utama.",
                  "Jika opsi belum ada, pilih Edit Actions di bagian paling bawah lalu aktifkan Add to Home Screen.",
                  "Aktifkan Open as Web App atau Buka sebagai App Web, kemudian tekan Add atau Tambah.",
                  "Buka ikon Harmony Wellness dari Home Screen. Aplikasi akan masuk ke halaman pilihan portal.",
                ].map((step, index) => (
                  <li
                    key={step}
                    className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#042e66] text-sm font-black text-white">
                      {index + 1}
                    </span>
                    <p className="m-0 pt-1 text-sm font-bold leading-6 text-slate-700">
                      {step}
                    </p>
                  </li>
                ))}
              </ol>
            </>
          )}

          <div className="rounded-2xl bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-950">
            Ikon Wellness sudah disiapkan untuk Home Screen. Setelah terpasang, aplikasi membuka Main Screen berisi pilihan Peserta, Coach, Perusahaan, dan Admin.
          </div>

          <Link
            href="/wellness"
            className="inline-flex min-h-13 w-full items-center justify-center rounded-2xl bg-[#042e66] px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-100 transition hover:bg-[#073a7c]"
          >
            Kembali ke Pilihan Portal
          </Link>
        </div>
      </section>
    </main>
  );
}
