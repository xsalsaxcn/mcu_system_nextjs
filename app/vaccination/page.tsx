"use client";

import VaccinationWorkspaceMenu from "@/components/VaccinationWorkspaceMenu";

// VACCINATION_PORTAL_ENTRY_V150

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
  // VACCINATION_VALIDATION_MENU_V149
  { title: "Tim Validasi", href: "/vaccination/validation", desc: "Print label, validasi akhir, dan penyelesaian status peserta vaksinasi.", tag: "Validasi", stage: "Pelaksanaan" },
  { title: "Dashboard Vaksinasi", href: "/vaccination/dashboard", desc: "Filter sudah/belum vaksin, dokter/petugas, dan export data.", tag: "Report", stage: "Pelaporan" },
  { title: "History Company Service", href: "/vaccination/company-history", desc: "Database per perusahaan untuk melihat peserta dan benefit atau layanan yang sudah diambil.", tag: "Database", stage: "Pelaporan" },
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
  // VACCINATION_WORKSPACE_DRAWER_V151_3
  const stages = ["Persiapan", "Pelaksanaan", "Pelaporan", "Reminder"] as const;
  const totalMenu = menuItems.length;

  return (
    <main className="min-h-screen bg-slate-100/70">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-600 text-sm font-black text-white shadow-sm">H</div>
            <div>
              <div className="text-lg font-black tracking-tight text-slate-900">Harmony Health App</div>
              <div className="text-xs font-semibold text-slate-500">Vaccination Operational Workspace</div>
            </div>
          </div>
          <VaccinationWorkspaceMenu />
        </div>
      </section>

      <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-8">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Operational Overview</div>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Vaksinasi Perusahaan</h1>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Navigasi modul dipusatkan di tombol hamburger Menu Vaksinasi. Workflow dan fungsi existing tetap sama.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700">
                {totalMenu} menu aktif
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4 lg:p-8">
            {stages.map((stage) => {
              const count = menuItems.filter((item) => item.stage === stage).length;
              return (
                <div key={stage} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Stage</div>
                      <div className="mt-1 text-lg font-black text-slate-900">{stage}</div>
                    </div>
                    <div className="grid h-10 min-w-10 place-items-center rounded-xl bg-slate-100 px-3 text-base font-black text-slate-700">{count}</div>
                  </div>
                  <div className="mt-4 text-sm font-medium leading-6 text-slate-500">{stageNotes[stage]}</div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-6 py-6 lg:px-8">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="text-sm font-black text-slate-900">Navigasi lebih ringkas</div>
                <div className="mt-2 text-sm font-medium leading-6 text-slate-500">
                  Klik <span className="font-black text-slate-800">☰ Menu Vaksinasi</span>. Drawer dari kiri akan menampilkan dropdown Persiapan, Pelaksanaan, Pelaporan, dan Reminder seperti dashboard enterprise.
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="text-sm font-black text-slate-900">UI only</div>
                <div className="mt-2 text-sm font-medium leading-6 text-slate-500">
                  Perubahan hanya tampilan dan navigasi halaman utama Vaksinasi. Tidak mengubah transaksi, database, Administer, Inventory, Sticker, maupun Label.
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
