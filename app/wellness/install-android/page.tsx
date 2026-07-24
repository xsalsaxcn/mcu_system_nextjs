// HARMONY_ANDROID_CHROME_INSTALL_V127
export const metadata = {
  title: "Install Harmony Health Android",
  description: "Download dan install Harmony Health melalui Google Chrome.",
};

const apkUrl = "/downloads/HarmonyHealth.apk";

export default function InstallAndroidPage() {
  return (
    <main className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,#e5fbf8_0,#f8fafc_45%,#eef4f8_100%)] px-4 py-8 text-slate-950">
      <section className="mx-auto max-w-xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl">
        <header className="bg-gradient-to-br from-[#042e66] via-[#0b4b91] to-[#138c8c] px-6 py-8 text-white">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.6rem] bg-white/15 text-4xl font-black shadow-xl ring-4 ring-white/15">
              H
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100">
                Harmony Health
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">
                Install Android
              </h1>
              <p className="mt-2 text-sm font-semibold leading-6 text-blue-50">
                Download aplikasi melalui Google Chrome, lalu install langsung di HP Android.
              </p>
            </div>
          </div>
        </header>

        <div className="space-y-5 p-5 sm:p-8">
          <div className="rounded-3xl border border-teal-100 bg-teal-50 p-5">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">
              Versi tersedia
            </div>
            <div className="mt-2 text-2xl font-black text-teal-950">
              Harmony Health 2.7 (17)
            </div>
            <div className="mt-1 text-sm font-bold text-teal-800">
              Ukuran file sekitar 36.9 MB
            </div>
          </div>

          <a
            href={apkUrl}
            download
            className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#005956] px-5 text-center text-base font-black text-white shadow-lg shadow-teal-100 transition active:scale-[0.99]"
          >
            Download &amp; Install Harmony Health
          </a>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-lg font-black">Cara instalasi</h2>
            <ol className="mt-4 space-y-3 text-sm font-semibold leading-6 text-slate-700">
              <li><strong>1.</strong> Buka halaman ini menggunakan Google Chrome di HP Android.</li>
              <li><strong>2.</strong> Tekan <strong>Download &amp; Install Harmony Health</strong>.</li>
              <li><strong>3.</strong> Setelah selesai diunduh, buka file <strong>HarmonyHealth.apk</strong>.</li>
              <li><strong>4.</strong> Bila diminta, izinkan Chrome untuk <strong>Install unknown apps / Izinkan dari sumber ini</strong>.</li>
              <li><strong>5.</strong> Tekan <strong>Install</strong> atau <strong>Update</strong>.</li>
            </ol>
          </div>

          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold leading-6 text-amber-950">
            Aplikasi tidak perlu dihapus sebelum update. Gunakan tombol <strong>Update</strong> agar Participant ID, login, dan pengaturan yang sudah tersimpan tetap aman.
          </div>

          <div className="break-all rounded-2xl bg-slate-950 px-4 py-3 text-[10px] font-semibold leading-5 text-slate-300">
            SHA-256: dab276f9eb8f9e5aa53616a61bbb6b6d6424fc0a1d4afe1cc2a1e68479acff7a
          </div>

          <a
            href="/wellness"
            className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700"
          >
            Kembali ke Harmony Wellness
          </a>
        </div>
      </section>
    </main>
  );
}
