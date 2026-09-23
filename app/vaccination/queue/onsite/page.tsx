"use client";

import { useEffect, useMemo, useState } from "react";
import QRCodeImage from "@/components/QRCodeImage";

function sessionLabel(session: any) {
  return [session?.session_name || "Session", session?.location, session?.session_date]
    .filter(Boolean)
    .join(" · ");
}

function statusBadge(status: any) {
  const value = String(status || "").toUpperCase();
  if (value === "CALLED" || value === "IN_PROGRESS") return "bg-blue-100 text-blue-700";
  if (value === "SKIPPED") return "bg-amber-100 text-amber-800";
  if (value === "DONE") return "bg-emerald-100 text-emerald-700";
  return "bg-red-100 text-red-700";
}

function csvCell(value: any) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

export default function VaccinationOnsiteQueuePage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState("Pilih session lalu aktifkan Mode Onsite Rolling QR 60 detik.");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
    fetch("/api/vaccination/sessions", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) {
          setSessions(json.sessions || []);
          if (json.sessions?.[0]?.id) setSessionId(String(json.sessions[0].id));
        }
      });
  }, []);

  async function load(id = sessionId) {
    if (!id) return;
    const json = await fetch(`/api/vaccination/onsite-queue?session_id=${encodeURIComponent(id)}&t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json());
    if (!json.ok) {
      setError(json.message || "Gagal mengambil onsite queue.");
      return;
    }
    setData(json);
    setError("");
  }

  useEffect(() => {
    if (!sessionId) return;
    void load(sessionId);
    const timer = window.setInterval(() => void load(sessionId), 2500);
    return () => window.clearInterval(timer);
  }, [sessionId]);

  async function post(payload: any) {
    setBusy(true);
    setError("");
    try {
      const json = await fetch("/api/vaccination/onsite-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());
      if (!json.ok) {
        setError(json.message || "Action gagal.");
        return null;
      }
      setMessage(json.message || "Berhasil.");
      await load();
      return json;
    } finally {
      setBusy(false);
    }
  }

  const entries = Array.isArray(data?.entries) ? data.entries : [];
  const waiting = useMemo(() => entries.filter((x: any) => x.queue_status === "WAITING"), [entries]);
  const active = useMemo(() => entries.filter((x: any) => ["CALLED", "IN_PROGRESS"].includes(x.queue_status)), [entries]);
  const skipped = useMemo(() => entries.filter((x: any) => x.queue_status === "SKIPPED"), [entries]);
  const done = useMemo(() => entries.filter((x: any) => x.queue_status === "DONE"), [entries]);

  const scanUrl = data?.rolling?.scan_path && origin ? `${origin}${data.rolling.scan_path}` : "";

  function exportWaiting() {
    if (!waiting.length) return;
    const header = ["No Antrean", "Nama Lengkap", "NIK Karyawan", "No HP", "Status"];
    const rows = waiting.map((entry: any) => [
      entry.queue_number,
      entry.participant_name,
      entry.employee_id,
      entry.phone || "",
      entry.queue_status,
    ]);
    const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeSession = String(data?.session?.session_name || "onsite-queue").replace(/[^a-z0-9_-]+/gi, "_");
    link.href = url;
    link.download = `waiting_${safeSession}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const nextButtonLabel = waiting.length
    ? active.length
      ? "Selesaikan Nomor Aktif & Panggil Berikutnya"
      : "Panggil Nomor Berikutnya"
    : active.length
      ? "Selesaikan Antrean Aktif"
      : "Tidak Ada Antrean Menunggu";

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl rounded-3xl border bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-950">Antrian Vaksin — Onsite Rolling QR</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">Mode walk-in onsite. QR aktif 60 detik dan dapat dipakai banyak peserta selama window yang sama. Peserta isi Nama Lengkap + NIK Karyawan + No HP, lalu langsung mendapat nomor antrean. Satu NIK Karyawan hanya mendapat satu nomor per event.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href="/vaccination/queue" className="rounded-xl border px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">Mode Existing</a>
              <span className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white">Mode Onsite Rolling QR</span>
            </div>
          </div>
          <a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_170px_auto] lg:items-end">
            <label className="block">
              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Session / Event</div>
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="w-full rounded-xl border bg-white px-3 py-3 text-sm font-bold">
                <option value="">Pilih session</option>
                {sessions.map((session) => <option key={session.id} value={session.id}>{sessionLabel(session)}</option>)}
              </select>
            </label>
            <div>
              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Rolling QR</div>
              <div className="rounded-xl border bg-white px-3 py-3 text-sm font-black text-violet-700">60 detik</div>
            </div>
            <button disabled={!sessionId || busy} onClick={() => post({ action: "ensure-event", sessionId: Number(sessionId), intervalSeconds: 60, queuePrefix: "Q" })} className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Aktifkan Mode Onsite</button>
          </div>
        </section>

        {data?.event ? (
          <>
            <section className="mt-6 grid gap-5 xl:grid-cols-[380px_1fr]">
              <div className="rounded-3xl border border-violet-200 bg-violet-50 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-violet-600">QR Onsite Dinamis</div>
                    <div className="mt-1 text-lg font-black text-slate-950">Scan sekali → langsung dapat antrean</div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${data.event.status === "OPEN" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>{data.event.status}</span>
                </div>
                <div className="mt-5 flex justify-center rounded-3xl bg-white p-5 shadow-sm">
                  {scanUrl ? <QRCodeImage value={scanUrl} size={300} /> : <div className="flex h-[300px] w-[300px] items-center justify-center text-sm text-slate-400">QR tidak aktif</div>}
                </div>
                <div className="mt-4 text-center text-sm font-black text-violet-800">QR berganti dalam ± {data?.rolling?.expires_in ?? "-"} detik</div>
                <div className="mt-1 text-center text-xs font-semibold text-slate-500">Satu QR aktif dapat dipakai banyak peserta selama window 60 detik. Peserta yang sudah berhasil membuka form mendapat waktu 10 menit untuk submit.</div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button disabled={busy || data.event.status === "OPEN"} onClick={() => post({ action: "set-event-status", eventId: data.event.id, status: "OPEN" })} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Buka Queue</button>
                  <button disabled={busy || data.event.status === "CLOSED"} onClick={() => post({ action: "set-event-status", eventId: data.event.id, status: "CLOSED" })} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40">Tutup Queue</button>
                </div>
              </div>

              <div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border bg-white p-4"><div className="text-xs font-bold text-slate-500">Dipanggil</div><div className="mt-2 text-4xl font-black text-blue-700">{data.event.current_queue_number || "-"}</div></div>
                  <div className="rounded-2xl border bg-white p-4"><div className="text-xs font-bold text-slate-500">Waiting</div><div className="mt-2 text-4xl font-black text-red-700">{waiting.length}</div></div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="text-xs font-bold text-amber-700">Skipped</div><div className="mt-2 text-4xl font-black text-amber-700">{skipped.length}</div></div>
                  <div className="rounded-2xl border bg-white p-4"><div className="text-xs font-bold text-slate-500">Done</div><div className="mt-2 text-4xl font-black text-emerald-700">{done.length}</div></div>
                </div>
                <button disabled={busy || (!waiting.length && !active.length)} onClick={() => post({ action: "call-next", eventId: data.event.id })} className="mt-4 w-full rounded-2xl bg-blue-600 px-5 py-4 text-base font-black text-white disabled:opacity-40">{nextButtonLabel}</button>

                <section className="mt-4 rounded-2xl border bg-white p-4">
                  <h2 className="font-black text-slate-950">Antrean Aktif</h2>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {active.map((entry: any) => (
                      <div key={entry.id} className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-3xl font-black text-blue-700">{entry.queue_number}</div>
                            <div className="font-bold text-slate-950">{entry.participant_name}</div>
                            <div className="text-xs text-slate-500">{entry.employee_id}{entry.phone ? ` · ${entry.phone}` : ""}</div>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-black ${statusBadge(entry.queue_status)}`}>DIPANGGIL</span>
                        </div>
                        <button onClick={() => post({ action: "skip", eventId: data.event.id, entryId: entry.id })} className="mt-3 rounded-lg bg-amber-600 px-3 py-2 text-xs font-black text-white">Skip</button>
                      </div>
                    ))}
                    {!active.length ? <div className="text-sm text-slate-500">Belum ada nomor aktif.</div> : null}
                  </div>
                  <p className="mt-3 text-xs font-semibold text-slate-500">Tidak ada tahap Process. Saat tombol Panggil Nomor Berikutnya ditekan, nomor yang sedang aktif otomatis menjadi DONE lalu nomor berikutnya dipanggil.</p>
                </section>
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-amber-900">Skipped</h2>
                  <p className="text-xs font-semibold text-amber-700">Nomor skipped tidak ikut Call Next. Jika orangnya datang, klik Aktifkan Kembali. Nomor lama dipertahankan dan kembali ke Waiting.</p>
                </div>
                <div className="rounded-full bg-amber-200 px-3 py-1 text-sm font-black text-amber-900">{skipped.length}</div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {skipped.map((entry: any) => (
                  <div key={entry.id} className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3"><div><div className="text-2xl font-black text-amber-800">{entry.queue_number}</div><div className="font-bold text-slate-950">{entry.participant_name}</div><div className="text-xs text-slate-500">{entry.employee_id}{entry.phone ? ` · ${entry.phone}` : ""}</div></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">SKIPPED</span></div>
                    <button disabled={busy} onClick={() => post({ action: "reactivate", eventId: data.event.id, entryId: entry.id })} className="mt-4 w-full rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40">Aktifkan Kembali</button>
                  </div>
                ))}
                {!skipped.length ? <div className="text-sm font-semibold text-amber-700">Belum ada antrean skipped.</div> : null}
              </div>
            </section>

            <section className="mt-6 overflow-hidden rounded-2xl border bg-white">
              <div className="flex flex-col gap-3 border-b bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="font-black">Waiting Queue <span className="text-slate-500">({waiting.length})</span></div>
                <button disabled={!waiting.length} onClick={exportWaiting} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Export Waiting</button>
              </div>
              <div className="max-h-[520px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3 text-left">No</th><th className="p-3 text-left">Nama</th><th className="p-3 text-left">NIK Karyawan</th><th className="p-3 text-left">No HP</th><th className="p-3 text-left">Aksi</th></tr></thead>
                  <tbody className="divide-y">{waiting.map((entry: any) => <tr key={entry.id}><td className="p-3 text-xl font-black">{entry.queue_number}</td><td className="p-3 font-bold">{entry.participant_name}</td><td className="p-3">{entry.employee_id}</td><td className="p-3 text-xs">{entry.phone || "-"}</td><td className="p-3"><button onClick={() => post({ action: "skip", eventId: data.event.id, entryId: entry.id })} className="rounded-lg border px-3 py-1 text-xs font-bold text-amber-700">Skip</button></td></tr>)}</tbody>
                </table>
              </div>
            </section>

            <details className="mt-6 overflow-hidden rounded-2xl border bg-white">
              <summary className="cursor-pointer border-b bg-emerald-50 px-4 py-3 font-black text-emerald-900">Peserta Selesai / Done ({done.length}) — klik untuk buka tabel</summary>
              <div className="max-h-[520px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3 text-left">No</th><th className="p-3 text-left">Nama</th><th className="p-3 text-left">NIK Karyawan</th><th className="p-3 text-left">No HP</th><th className="p-3 text-left">Selesai</th></tr></thead>
                  <tbody className="divide-y">{done.map((entry: any) => <tr key={entry.id}><td className="p-3 text-xl font-black text-emerald-700">{entry.queue_number}</td><td className="p-3 font-bold">{entry.participant_name}</td><td className="p-3">{entry.employee_id}</td><td className="p-3 text-xs">{entry.phone || "-"}</td><td className="p-3 text-xs">{entry.finished_at ? new Date(entry.finished_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</td></tr>)}</tbody>
                </table>
                {!done.length ? <div className="p-4 text-sm text-slate-500">Belum ada peserta selesai.</div> : null}
              </div>
            </details>
          </>
        ) : null}
      </div>
    </main>
  );
}
