"use client";

// VACCINATION_REMINDER_MANUAL_SEND_V152_1

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const STATUS_STYLE: Record<string, string> = {
  SENT: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PENDING: "bg-blue-50 text-blue-700 border-blue-200",
  SENDING: "bg-cyan-50 text-cyan-700 border-cyan-200",
  FAILED: "bg-rose-50 text-rose-700 border-rose-200",
  SKIPPED: "bg-amber-50 text-amber-800 border-amber-200",
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function fmtDate(value: any) {
  const text = clean(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text || "-";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function stageLabel(value: any) {
  const stage = clean(value).toUpperCase();
  if (stage === "H7") return "H-7";
  if (stage === "H3") return "H-3";
  if (stage === "H1") return "H-1";
  if (stage === "H0") return "Hari H";
  return stage || "-";
}

function StatCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number | string;
  note: string;
  tone: "green" | "red" | "blue" | "purple";
}) {
  const tones = {
    green: "bg-emerald-50 border-emerald-100 text-emerald-700",
    red: "bg-rose-50 border-rose-100 text-rose-700",
    blue: "bg-sky-50 border-sky-100 text-sky-700",
    purple: "bg-violet-50 border-violet-100 text-violet-700",
  };
  return (
    <div className={`rounded-2xl border p-5 ${tones[tone]}`}>
      <div className="text-xs font-black tracking-wide">{label}</div>
      <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-medium text-slate-500">{note}</div>
    </div>
  );
}

export default function VaccinationReminderPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [manualSending, setManualSending] = useState(false);
  const [manualMessage, setManualMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/vaccination/reminder/summary", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }
      setData(payload);
    } catch (e: any) {
      setError(String(e?.message || e || "Gagal memuat reminder."));
    } finally {
      setLoading(false);
    }
  }

  async function sendManualReminder() {
    if (manualSending) return;

    const confirmed = window.confirm(
      "Kirim reminder manual sekarang? Sistem hanya akan mengirim reminder yang sudah due hari ini atau tertunda, bukan reminder masa depan.",
    );
    if (!confirmed) return;

    setManualSending(true);
    setManualMessage("");
    setError("");

    try {
      const response = await fetch("/api/vaccination/reminder/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      const delivery = payload?.delivery || payload?.data?.delivery || {};
      const sync = payload?.sync || payload?.data?.sync || {};
      const sent = Number(delivery?.sent || 0);
      const failed = Number(delivery?.failed || 0);
      const skipped = Number(delivery?.skipped || 0);
      const claimed = Number(delivery?.claimed || 0);
      const schedules = Number(sync?.schedules || 0);

      setManualMessage(
        `Manual reminder selesai · diproses ${claimed} · sent ${sent} · failed ${failed} · skipped ${skipped} · schedule aktif ${schedules}.`,
      );
      await load();
    } catch (e: any) {
      setError(String(e?.message || e || "Gagal menjalankan reminder manual."));
    } finally {
      setManualSending(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const upcoming = useMemo(() => data?.upcoming || [], [data]);

  return (
    <main className="min-h-screen bg-[#f4f8fb] p-4 text-slate-900 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-black tracking-[0.12em] text-emerald-700">AUTOMATIC EMAIL REMINDER</div>
              <h1 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">Reminder Vaksinasi</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Sistem otomatis membaca Next Dose dari vaksinasi saat ini dan History Service,
                lalu mengirim email H-7, H-3, H-1, dan Hari H. Admin tidak perlu membuka aplikasi agar reminder berjalan.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={sendManualReminder}
                disabled={manualSending}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {manualSending ? "Mengirim Reminder..." : "Kirim Reminder Manual"}
              </button>
              <button
                onClick={load}
                disabled={loading || manualSending}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Refresh
              </button>
              <Link
                href="/vaccination"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold shadow-sm hover:bg-slate-50"
              >
                ☰ Menu Vaksinasi
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="SENT" value={data?.summary?.sent ?? 0} note="Email berhasil dikirim" tone="green" />
            <StatCard
              label="FAILED / SKIPPED"
              value={(data?.summary?.failed ?? 0) + (data?.summary?.skipped ?? 0)}
              note={`${data?.summary?.failed ?? 0} failed · ${data?.summary?.skipped ?? 0} data belum siap`}
              tone="red"
            />
            <StatCard
              label="INCOMING REMINDER"
              value={data?.summary?.incoming ?? 0}
              note="Reminder akan datang dalam 60 hari"
              tone="blue"
            />
            <StatCard
              label="DUE TODAY"
              value={data?.summary?.dueToday ?? 0}
              note="Reminder yang perlu diproses hari ini"
              tone="purple"
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold text-slate-500">AUTOMATION</div>
              <div className="mt-1 text-sm font-black">H-7 · H-3 · H-1 · Hari H</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold text-slate-500">SCHEDULER</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-black">
                <span className={`h-2.5 w-2.5 rounded-full ${data?.automation?.cronConfigured ? "bg-emerald-500" : "bg-rose-500"}`} />
                {data?.automation?.cronConfigured ? "08:00 WIB · Otomatis aktif" : "CRON_SECRET belum aktif"}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold text-slate-500">EMAIL SMTP</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-black">
                <span className={`h-2.5 w-2.5 rounded-full ${data?.automation?.smtpConfigured ? "bg-emerald-500" : "bg-rose-500"}`} />
                {data?.automation?.smtpConfigured ? "Siap mengirim email" : "SMTP belum lengkap"}
              </div>
            </div>
          </div>

          {manualMessage ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              {manualMessage}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black">Reminder Akan Datang</h2>
              <p className="text-sm text-slate-500">
                Sumber: vaksinasi saat ini + History Service. Anak/tanggungan menggunakan email parent yang terhubung.
              </p>
            </div>
            <div className="text-xs font-bold text-slate-400">{loading ? "Memuat..." : `${upcoming.length} schedule ditampilkan`}</div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1050px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Peserta</th>
                  <th className="px-4 py-3">Perusahaan</th>
                  <th className="px-4 py-3">Layanan</th>
                  <th className="px-4 py-3">Next Dose</th>
                  <th className="px-4 py-3">Reminder</th>
                  <th className="px-4 py-3">Penerima Email</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {upcoming.map((row: any) => {
                  const status = clean(row.status).toUpperCase();
                  return (
                    <tr key={row.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-bold">{row.participant_name || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.company_name || "-"}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold">{row.vaccine_name || "-"}</div>
                        <div className="mt-1 text-[11px] font-semibold text-slate-400">
                          {row.source_type === "HISTORY_SERVICE" ? "History Service" : "Current Record"}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold">{fmtDate(row.next_due_date)}</td>
                      <td className="px-4 py-3">
                        <div className="font-black text-[#042E66]">{stageLabel(row.reminder_stage)}</div>
                        <div className="text-xs text-slate-500">{fmtDate(row.reminder_date)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{row.recipient_name || row.participant_name || "-"}</div>
                        <div className="max-w-[240px] truncate text-xs text-slate-500">{row.recipient_email || "-"}</div>
                        {row.recipient_type === "PARENT" ? (
                          <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-violet-600">Via Parent</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${STATUS_STYLE[status] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                          {status || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{row.error_message || "-"}</td>
                    </tr>
                  );
                })}
                {!loading && !upcoming.length ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-sm font-semibold text-slate-400">
                      Belum ada reminder akan datang.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">Cara Kerja Otomatis</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {[
              ["1", "Baca Next Dose", "Current vaccination dan History Service dibaca otomatis setiap hari."],
              ["2", "Buat Jadwal", "Sistem membuat H-7, H-3, H-1, dan Hari H tanpa input admin."],
              ["3", "Kirim Email", "Scheduler server berjalan walaupun tidak ada admin yang membuka aplikasi."],
              ["4", "Audit Status", "SENT, FAILED, SKIPPED, waktu kirim, dan alasan gagal tetap tercatat."],
            ].map(([number, title, desc]) => (
              <div key={number} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#042E66] text-xs font-black text-white">{number}</div>
                <div className="mt-3 font-black">{title}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{desc}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
