"use client";

import { useEffect, useMemo, useState } from "react";
import { canVaccinationAccess, isVaccinationRole, vaccinationRoleLabel } from "@/lib/vaccination/access";
import type { SessionUser } from "@/lib/shared/types";

const MODULES = [
  { permission: "dashboard", label: "Dashboard Vaksinasi", href: "/vaccination/dashboard", icon: "DB", text: "Monitoring peserta, progress dan report." },
  { permission: "master", label: "Master Vaksin & Lot", href: "/vaccination/master", icon: "MV", text: "Master produk, lot, harga dan stock." },
  { permission: "session", label: "Session Vaksinasi", href: "/vaccination/session", icon: "SV", text: "Setup event, lokasi, tanggal dan vaksin session." },
  { permission: "register", label: "Registrasi Vaksin", href: "/vaccination/register", icon: "RG", text: "Check-in peserta dan rilis nomor antrian." },
  { permission: "queue", label: "Antrian Vaksin", href: "/vaccination/queue", icon: "AQ", text: "Monitor dan panggil antrian berjalan." },
  { permission: "administer", label: "Administered / Medis", href: "/vaccination/administer", icon: "MD", text: "Proses tindakan dokter dan pencatatan vaksin." },
  { permission: "validation", label: "Tim Validasi", href: "/vaccination/validation", icon: "TV", text: "Print label dan validasi akhir." },
  { permission: "inventory", label: "Inventory Vaksin", href: "/vaccination/inventory", icon: "IV", text: "Stock, IN/OUT, audit dan export." },
  { permission: "inventory", label: "Alokasi Stock Session", href: "/vaccination/portal/stock", icon: "AS", text: "Dedikasi lot untuk session dan threshold low stock." },
  { permission: "users", label: "Role Tim Vaksinasi", href: "/vaccination/portal/users", icon: "UR", text: "Assign role khusus untuk tim vaksinasi." },
] as const;

function clean(value: any) {
  return String(value ?? "").trim();
}

export default function VaccinationPortalPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [message, setMessage] = useState("Memuat Portal Vaksinasi...");

  async function load() {
    setLoading(true);
    try {
      const me = await fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json());
      if (!me.ok || !me.user) {
        window.location.href = "/login";
        return;
      }
      setUser(me.user);
      const alertJson = await fetch("/api/vaccination/stock-alerts", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
      setAlerts(alertJson.alerts || []);
      setMessage(alertJson.migration_required ? "Portal aktif. Jalankan SQL V150 untuk mengaktifkan dedicated stock dan bell low-stock." : "Portal Vaksinasi siap digunakan.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const modules = useMemo(() => {
    if (!user) return [];
    return MODULES.filter((item) => canVaccinationAccess(user, item.permission as any));
  }, [user]);

  if (loading) return <div className="min-h-screen bg-slate-50 p-8 text-slate-600">Memuat Portal Vaksinasi...</div>;
  if (!user) return null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <section className="mx-auto max-w-7xl overflow-hidden rounded-[28px] bg-gradient-to-br from-blue-950 via-blue-800 to-emerald-600 p-6 text-white shadow-xl md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-100">Harmony Health - Vaccination Portal</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Portal Operasional Vaksinasi</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-blue-100">Dedicated workspace untuk Session, Frontdesk, Medis, Tim Validasi, Inventory dan Reporting.</p>
            <div className="mt-4 inline-flex rounded-full bg-white/15 px-3 py-1.5 text-xs font-black">{clean(user.name || user.username)} - {vaccinationRoleLabel(user)}</div>
          </div>

          <div className="relative flex gap-2">
            <button type="button" onClick={() => setBellOpen((v) => !v)} className="relative rounded-2xl bg-white/15 px-4 py-3 text-sm font-black hover:bg-white/25">
              Bell Stock
              {alerts.length ? <span className="absolute -right-2 -top-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white">{alerts.length}</span> : null}
            </button>
            <button type="button" onClick={load} className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-900">Refresh</button>
          </div>
        </div>

        {bellOpen ? (
          <div className="mt-5 rounded-2xl bg-white p-4 text-slate-900 shadow-xl">
            <div className="font-black">Notifikasi Stock Session</div>
            <div className="mt-1 text-xs text-slate-500">Alert muncul jika sisa alokasi session kurang dari atau sama dengan threshold.</div>
            <div className="mt-3 grid gap-2">
              {alerts.map((alert) => (
                <div key={alert.id} className={`rounded-xl border p-3 text-sm ${alert.severity === "critical" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                  <div className="font-black">{alert.vaccine_name} - Lot {alert.lot_number}</div>
                  <div className="mt-1 text-xs">{alert.session_name} - {alert.company_name} - {alert.location}</div>
                  <div className="mt-1 text-xs font-black">Sisa {alert.remaining_qty} dari alokasi {alert.allocated_qty} - threshold {alert.low_stock_threshold}</div>
                </div>
              ))}
              {!alerts.length ? <div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">Tidak ada stock session yang berada di bawah threshold.</div> : null}
            </div>
          </div>
        ) : null}
      </section>

      <div className="mx-auto mt-4 max-w-7xl rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{message}</div>

      <section className="mx-auto mt-5 grid max-w-7xl gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((item) => (
          <a key={item.href} href={item.href} className="group rounded-3xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-sm font-black text-blue-700">{item.icon}</div>
              <span className="text-xs font-black text-slate-400">OPEN</span>
            </div>
            <div className="mt-4 text-lg font-black text-slate-950 group-hover:text-blue-700">{item.label}</div>
            <div className="mt-1 text-sm leading-5 text-slate-500">{item.text}</div>
          </a>
        ))}
      </section>

      {isVaccinationRole(user) ? (
        <div className="mx-auto mt-5 max-w-7xl rounded-2xl border bg-white p-4 text-xs text-slate-500">Menu ditampilkan berdasarkan role vaksinasi. Role yang tidak memiliki izin tidak ditampilkan pada portal.</div>
      ) : null}
    </main>
  );
}
