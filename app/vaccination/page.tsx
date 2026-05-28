"use client";

const menuItems = [
  { title: "Master Vaksin", href: "/vaccination/master", desc: "Input daftar vaksin, aturan next dose, dan lot number." },
  { title: "Session Vaksinasi", href: "/vaccination/session", desc: "Buat event vaksinasi perusahaan dan QR antrian publik." },
  { title: "Registrasi Vaksin", href: "/vaccination/register", desc: "Registrasi peserta dan generate nomor antrian." },
  { title: "Antrian Vaksin", href: "/vaccination/queue", desc: "Panggil nomor antrian berjalan untuk operator." },
  { title: "Administered / Medis", href: "/vaccination/administer", desc: "Pilih vaksin + lot number, klik Done, lalu print sticker." },
];

export default function VaccinationPage() {
  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Vaksinasi Perusahaan</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">Modul registrasi vaksin, antrian QR, input administered, lot number, next dose, dan print sticker label.</p>
          </div>
          <a href="/" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">Dashboard Utama</a>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {menuItems.map((item) => (
            <a key={item.href} href={item.href} className="rounded-xl border bg-slate-50 p-4 transition hover:bg-slate-100">
              <div className="font-semibold text-slate-900">{item.title}</div>
              <div className="mt-1 text-sm text-slate-600">{item.desc}</div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
