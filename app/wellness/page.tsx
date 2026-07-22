import Link from "next/link";

const portals = [
  {
    title: "Peserta",
    description: "Input nutrisi, workout, Health Talk, serta pantau progres pribadi.",
    href: "/wellness/portal",
    icon: "👤",
    tone: "from-teal-500 to-emerald-500",
    soft: "bg-teal-50 text-teal-800",
  },
  {
    title: "Coach",
    description: "Pantau kepatuhan harian, kirim reminder, dan buka detail peserta.",
    href: "/wellness/coach",
    icon: "🧭",
    tone: "from-violet-500 to-indigo-600",
    soft: "bg-violet-50 text-violet-800",
  },
  {
    title: "Perusahaan",
    description: "Lihat ringkasan program, ranking kelompok, dan capaian perusahaan.",
    href: "/wellness/company",
    icon: "🏢",
    tone: "from-sky-500 to-blue-600",
    soft: "bg-sky-50 text-sky-800",
  },
  {
    title: "Admin",
    description: "Kelola program Wellness, peserta, monitoring, ranking, dan laporan.",
    href: "/wellness/admin",
    icon: "⚙️",
    tone: "from-slate-800 to-slate-950",
    soft: "bg-slate-100 text-slate-800",
  },
] as const;

export default function WellnessHomePage() {
  return (
    <main className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,#e5fbf8_0,#f5fafc_38%,#eef4f8_100%)] px-4 pb-[calc(28px+env(safe-area-inset-bottom,0px))] pt-[calc(28px+env(safe-area-inset-top,0px))] text-slate-950 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <section className="overflow-hidden rounded-[2.25rem] border border-white/80 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="bg-gradient-to-br from-[#042e66] via-[#0b4b91] to-[#159b8f] px-6 pb-8 pt-7 text-white sm:px-9 sm:pb-10 sm:pt-9">
            <div className="flex flex-col items-center text-center">
              <img
                src="/wellness-pwa/apple-touch-icon.png"
                alt="Harmony Health Wellness"
                width={96}
                height={96}
                className="h-24 w-24 rounded-[1.8rem] shadow-2xl ring-4 ring-white/20"
              />
              <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-cyan-100">
                Harmony Health
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Wellness Portal
              </h1>
              <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-blue-50 sm:text-base">
                Pilih portal sesuai peran dan akses Anda.
              </p>
            </div>
          </div>

          <div className="p-5 sm:p-8">
            <div className="mb-5 rounded-2xl border border-teal-100 bg-teal-50/80 px-4 py-3 text-center text-sm font-bold leading-6 text-teal-900">
              Satu aplikasi Wellness untuk peserta, coach, perusahaan, dan administrator.
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {portals.map((portal) => (
                <Link
                  key={portal.title}
                  href={portal.href}
                  className="group relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-teal-100"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${portal.tone} text-2xl shadow-lg`}
                      aria-hidden="true"
                    >
                      {portal.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-xl font-black text-slate-950">
                          {portal.title}
                        </h2>
                        <span className="text-lg font-black text-slate-300 transition group-hover:translate-x-1 group-hover:text-teal-600">
                          →
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                        {portal.description}
                      </p>
                      <span
                        className={`mt-4 inline-flex rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wide ${portal.soft}`}
                      >
                        Buka Portal
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-6 flex flex-col items-center gap-3 border-t border-slate-100 pt-5 text-center">
              <p className="text-xs font-semibold leading-5 text-slate-500">
                Gunakan akses yang telah diberikan untuk masing-masing portal.
              </p>
              <Link
                href="/wellness/install-ios"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-5 text-xs font-black text-slate-700 transition hover:bg-slate-100"
              >
                Panduan pasang di iPhone
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
