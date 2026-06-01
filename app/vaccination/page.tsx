"use client";

import HarmonyMenu from "@/components/HarmonyMenu";

type MenuItem = {
  title: string;
  href: string;
  desc: string;
  tag: string;
  stage: "Persiapan" | "Pelaksanaan" | "Pelaporan" | "Reminder";
};

const stageNotes: Record<MenuItem["stage"], string> = {
  Persiapan: "Siapkan produk vaksin, lot number, stok awal, harga, lokasi, tanggal, dan slot session.",
  Pelaksanaan: "Kelola registrasi, nomor antrian, status tindakan dokter, administered, dan cetak stiker vaksin.",
  Pelaporan: "Pantau stok awal, tambahan stok, terpakai, sisa sistem, sisa fisik, selisih, dan export data.",
  Reminder: "Pantau reminder terkirim/gagal dan siapkan pengiriman manual bila dibutuhkan.",
};

const menuItems: MenuItem[] = [
  { title: "Master Vaksin & Lot", href: "/vaccination/master", desc: "Input master vaksin, harga produk, kategori harga, stok, dan lot number.", tag: "Master", stage: "Persiapan" },
  { title: "Session Vaksin", href: "/vaccination/session", desc: "Buat event perusahaan, pilih database corporate/vaksinasi, dan set multi-vaksin.", tag: "Setup", stage: "Persiapan" },
  { title: "Registrasi Vaksin", href: "/vaccination/register", desc: "Check-in peserta, rilis nomor antrian, NIK, payment note, dan export per stage.", tag: "Frontdesk", stage: "Pelaksanaan" },
  { title: "Antrian Vaksin", href: "/vaccination/queue", desc: "Panggil nomor antrian berjalan dan monitor status menunggu/dokter/selesai.", tag: "Queue", stage: "Pelaksanaan" },
  { title: "Administered / Medis", href: "/vaccination/administer", desc: "Input dokter, vaksin, lot number, Done, dan print sticker label.", tag: "Medis", stage: "Pelaksanaan" },
  { title: "Dashboard Vaksinasi", href: "/vaccination/dashboard", desc: "Filter sudah/belum vaksin, dokter/petugas, dan export data.", tag: "Report", stage: "Pelaporan" },
  { title: "Inventory", href: "/vaccination/inventory", desc: "Lihat stok awal, tambahan stok, terpakai, sisa, selisih fisik, dan keterangan.", tag: "Stock", stage: "Pelaporan" },
  { title: "Reminder Status", href: "/vaccination/reminder", desc: "Pantau Sent, Failed dengan alasan, incoming reminder, dan manual reminder.", tag: "Soon", stage: "Reminder" },
];

const stageColors: Record<MenuItem["stage"], string> = {
  Persiapan: "border-blue-200 bg-blue-50 text-blue-800",
  Pelaksanaan: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Pelaporan: "border-amber-200 bg-amber-50 text-amber-800",
  Reminder: "border-purple-200 bg-purple-50 text-purple-800",
};

export default function VaccinationPage() {
  const stages = ["Persiapan", "Pelaksanaan", "Pelaporan", "Reminder"] as const;

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <div>
            <div className="text-2xl font-black tracking-tight text-slate-900">Harmony Health App</div>
            <div className="text-sm font-medium text-slate-500">Vaksinasi Perusahaan</div>
          </div>
          <HarmonyMenu />
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-slate-900 p-8 text-white">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-3xl font-black">Vaksinasi Perusahaan</div>
                <p className="mt-2 max-w-3xl text-sm font-medium text-emerald-50">
                  Flow existing tetap dipakai: persiapan produk/session, registrasi, antrian, administered, inventory, sticker, dan pelaporan.
                </p>
                <div className="mt-4 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white">
                  Vaccination Workflow Only · MCU Corporate & CAPASKA tidak disentuh
                </div>
              </div>

              <a href="/dashboard" className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-emerald-700 shadow-sm transition hover:bg-emerald-50">
                Dashboard Operasional
              </a>
            </div>
          </div>
        </section>

        <section className="grid gap-5">
          {stages.map((stage) => {
            const items = menuItems.filter((item) => item.stage === stage);
            return (
              <div key={stage} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-xl font-black text-slate-900">Stage {stage}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-500">{stageNotes[stage]}</div>
                  </div>
                  <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black ${stageColors[stage]}`}>{items.length} menu</span>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => (
                    <a key={item.href} href={item.href} className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-black text-slate-900 group-hover:text-emerald-700">{item.title}</div>
                          <div className="mt-2 text-sm font-medium leading-6 text-slate-500">{item.desc}</div>
                        </div>
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                          {item.tag}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
