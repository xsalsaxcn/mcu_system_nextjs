"use client";

import { useEffect, useMemo, useState } from "react";

type Track = "A" | "B";

type QueueEntry = {
  id: number;
  participant_id: number;
  a_queue_number?: string;
  a_queue_sequence?: number;
  a_status?: string;
  a_finished_at?: string;
  a_cancelled_at?: string;
  a_cancel_reason?: string;
  b_queue_number?: string;
  b_queue_sequence?: number;
  b_status?: string;
  b_finished_at?: string;
  b_cancelled_at?: string;
  b_cancel_reason?: string;
  updated_at?: string;
  participant?: {
    id: number;
    name?: string;
    mcu_id?: string;
    external_id?: string;
    nik?: string;
    employee_nik?: string;
    department?: string;
  } | null;
};

type PendingParticipant = {
  id: number;
  name?: string;
  mcu_id?: string;
  external_id?: string;
  nik?: string;
  employee_nik?: string;
  department?: string;
  informed_at?: string | null;
  informed_by?: string | null;
};

function statusLabel(value: any) {
  const s = String(value || "").toUpperCase();
  if (s === "WAITING") return "Menunggu";
  if (s === "CALLED") return "Dipanggil";
  if (s === "IN_PROGRESS") return "Proses";
  if (s === "DONE") return "Selesai";
  if (s === "SKIPPED") return "Skipped";
  if (s === "CANCELLED") return "Cancel";
  return s || "-";
}

function statusClass(value: any) {
  const s = String(value || "").toUpperCase();
  if (s === "WAITING") return "bg-orange-100 text-orange-700";
  if (["CALLED", "IN_PROGRESS"].includes(s)) return "bg-blue-100 text-blue-700";
  if (s === "DONE") return "bg-emerald-100 text-emerald-700";
  if (s === "SKIPPED") return "bg-amber-100 text-amber-800";
  if (s === "CANCELLED") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function fieldFor(track: Track, field: "status" | "number" | "sequence") {
  const prefix = track === "A" ? "a" : "b";
  if (field === "status") return `${prefix}_status` as keyof QueueEntry;
  if (field === "number") return `${prefix}_queue_number` as keyof QueueEntry;
  return `${prefix}_queue_sequence` as keyof QueueEntry;
}

export default function McuOperatorQueuePage({ params }: { params: { token: string } }) {
  const token = String(params?.token || "");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantSort, setParticipantSort] = useState<"name" | "uninformed" | "informed">("uninformed");
  // MCU_OPERATOR_EXPORT_CANCEL_REASON_V461
  const [cancelTarget, setCancelTarget] = useState<{ track: Track; entryId: number; queueNo: string; name: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const entries: QueueEntry[] = data?.entries || [];
  const pendingParticipants: PendingParticipant[] = data?.pending_participants || [];
  const trackAName = String(data?.queue_session?.track_a_name || "Lab Darah");
  const trackBName = String(data?.queue_session?.track_b_name || "Rontgen");

  const uninformedParticipantCount = useMemo(
    () => pendingParticipants.filter((row) => !row.informed_at).length,
    [pendingParticipants],
  );
  const visibleParticipants = useMemo(() => {
    const term = participantSearch.trim().toLowerCase();
    let rows = pendingParticipants.filter((row) => {
      if (!term) return true;
      return [row.name, row.nik, row.employee_nik, row.mcu_id, row.external_id, row.department]
        .some((value) => String(value || "").toLowerCase().includes(term));
    });
    if (participantSort === "uninformed") rows = rows.filter((row) => !row.informed_at);
    if (participantSort === "informed") rows = rows.filter((row) => Boolean(row.informed_at));
    return [...rows].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "id", { sensitivity: "base" }),
    );
  }, [pendingParticipants, participantSearch, participantSort]);

  async function load(silent = false) {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/mcu/operator-queue?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal memuat dashboard Operator.");
      setData(json);
      setError("");
    } catch (err: any) {
      setError(err?.message || "Gagal memuat dashboard Operator.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 4000);
    return () => window.clearInterval(timer);
  }, [token]);

  function speakCall(track: Track, entry: any) {
    if (!voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const number = String(track === "A" ? entry?.a_queue_number : entry?.b_queue_number || "");
    const label = track === "A" ? trackAName : trackBName;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(`Nomor antrean ${number}. ${label}. Silakan menuju ${label}.`);
      utterance.lang = "id-ID";
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Voice tidak mengganggu queue.
    }
  }

  async function action(actionName: string, track?: Track, entryId?: number, participantId?: number, extra: Record<string, any> = {}) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/mcu/operator-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionName, track, entry_id: entryId, participant_id: participantId, token, ...extra }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal memperbarui antrian.");
      setMessage(json.message || "Data diperbarui.");
      if ((actionName === "call-next" || actionName === "recall") && json.entry && track) {
        speakCall(track, json.entry);
      }
      await load(true);
      return true;
    } catch (err: any) {
      setError(err?.message || "Gagal memperbarui antrian.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function csvValue(value: any) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportQueueCsv() {
    const rows: any[][] = [];
    (["A", "B"] as Track[]).forEach((track) => {
      const prefix = track === "A" ? "a" : "b";
      const service = track === "A" ? trackAName : trackBName;
      entries.forEach((entry: any) => {
        const queueNo = String(entry?.[`${prefix}_queue_number`] || "").trim();
        if (!queueNo) return;
        const status = String(entry?.[`${prefix}_status`] || "").toUpperCase();
        const lastUpdate = status === "DONE"
          ? entry?.[`${prefix}_finished_at`]
          : status === "CANCELLED"
            ? entry?.[`${prefix}_cancelled_at`]
            : entry?.updated_at;
        const reason = status === "CANCELLED" ? String(entry?.[`${prefix}_cancel_reason`] || "") : "";
        rows.push([
          data?.company?.name || "",
          data?.package?.name || "",
          track,
          service,
          queueNo,
          entry?.participant?.name || "",
          entry?.participant?.employee_nik || "",
          entry?.participant?.nik || "",
          entry?.participant?.mcu_id || entry?.participant?.external_id || "",
          entry?.participant?.department || "",
          statusLabel(status),
          formatLastUpdate(lastUpdate),
          reason,
        ]);
      });
    });

    const header = ["Perusahaan", "Paket", "Kode", "Layanan", "Nomor Antrian", "Nama Peserta", "NIK Karyawan", "NIK/Identitas", "No MCU", "Department", "Status", "Last Update", "Alasan Cancel"];
    const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(csvValue).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const cleanName = String(data?.company?.name || "MCU").replace(/[^a-z0-9_-]+/gi, "_");
    a.href = url;
    a.download = `Antrian_MCU_${cleanName}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function submitCancel() {
    if (!cancelTarget) return;
    const reason = cancelReason.trim();
    if (!reason) {
      setError("Alasan cancel wajib diisi.");
      return;
    }
    const ok = await action("cancel", cancelTarget.track, cancelTarget.entryId, undefined, { cancel_reason: reason });
    if (ok) {
      setCancelTarget(null);
      setCancelReason("");
    }
  }

  function rowsForTrack(track: Track) {
    const statusKey = fieldFor(track, "status");
    const seqKey = fieldFor(track, "sequence");
    return [...entries]
      .filter((row) => String(row[statusKey] || "").toUpperCase() !== "CANCELLED")
      .sort((a, b) => Number(a[seqKey] || 999999) - Number(b[seqKey] || 999999));
  }

  function current(track: Track) {
    const statusKey = fieldFor(track, "status");
    return rowsForTrack(track).find((r) => ["CALLED", "IN_PROGRESS"].includes(String(r[statusKey] || "").toUpperCase())) || null;
  }

  function nextWaiting(track: Track) {
    const statusKey = fieldFor(track, "status");
    return rowsForTrack(track).find((r) => String(r[statusKey] || "").toUpperCase() === "WAITING") || null;
  }

  function formatLastUpdate(value?: string | null) {
    if (!value) return "-";
    try {
      return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
    } catch {
      return String(value);
    }
  }

  function TrackPanel({ track, label, accent }: { track: Track; label: string; accent: "blue" | "violet" }) {
    const statusKey = fieldFor(track, "status");
    const numberKey = fieldFor(track, "number");
    const rows = rowsForTrack(track);
    const activeRows = rows.filter((r) => !["SKIPPED", "DONE", "CANCELLED"].includes(String(r[statusKey] || "").toUpperCase()));
    const skippedRows = rows.filter((r) => String(r[statusKey] || "").toUpperCase() === "SKIPPED");
    // MCU_OPERATOR_FINISHED_HISTORY_V458
    const finishedAtKey = (track === "A" ? "a_finished_at" : "b_finished_at") as keyof QueueEntry;
    const cancelledAtKey = (track === "A" ? "a_cancelled_at" : "b_cancelled_at") as keyof QueueEntry;
    const cancelReasonKey = (track === "A" ? "a_cancel_reason" : "b_cancel_reason") as keyof QueueEntry;
    const historyRows = [...entries]
      .filter((r) => ["DONE", "CANCELLED"].includes(String(r[statusKey] || "").toUpperCase()))
      .sort((a, b) => {
        const aStatus = String(a[statusKey] || "").toUpperCase();
        const bStatus = String(b[statusKey] || "").toUpperCase();
        const aTime = String(a[aStatus === "CANCELLED" ? cancelledAtKey : finishedAtKey] || "");
        const bTime = String(b[bStatus === "CANCELLED" ? cancelledAtKey : finishedAtKey] || "");
        const timeDiff = new Date(bTime || 0).getTime() - new Date(aTime || 0).getTime();
        if (timeDiff) return timeDiff;
        return Number(b[fieldFor(track, "sequence")] || 0) - Number(a[fieldFor(track, "sequence")] || 0);
      });
    const currentRow = current(track);
    const nextRow = nextWaiting(track);
    const waitingCount = rows.filter((r) => String(r[statusKey] || "").toUpperCase() === "WAITING").length;
    const doneCount = rows.filter((r) => String(r[statusKey] || "").toUpperCase() === "DONE").length;
    const buttonClass = accent === "blue" ? "bg-blue-600 hover:bg-blue-700" : "bg-violet-600 hover:bg-violet-700";
    const numberClass = accent === "blue" ? "text-blue-700" : "text-violet-700";

    return (
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className={`text-lg font-black ${numberClass}`}>{track} · {label}</div><div className="text-xs font-semibold text-slate-500">Antrian berjalan independen.</div></div>
          <button disabled={busy} onClick={() => action("call-next", track)} className={`rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-50 ${buttonClass}`}>Panggil Berikutnya {track}</button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">Dipanggil</div><div className={`mt-1 text-3xl font-black ${numberClass}`}>{currentRow ? String(currentRow[numberKey] || "-") : "-"}</div><div className="truncate text-xs font-bold text-slate-700">{currentRow?.participant?.name || "-"}</div></div>
          <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">Berikutnya</div><div className="mt-1 text-3xl font-black text-slate-900">{nextRow ? String(nextRow[numberKey] || "-") : "-"}</div><div className="truncate text-xs font-bold text-slate-700">{nextRow?.participant?.name || "-"}</div></div>
          <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">Menunggu</div><div className="mt-1 text-3xl font-black text-red-700">{waitingCount}</div></div>
          <div className="rounded-xl border bg-emerald-50 p-3"><div className="text-xs font-bold text-emerald-700">Selesai</div><div className="mt-1 text-3xl font-black text-emerald-700">{doneCount}</div></div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3 text-left">No</th><th className="p-3 text-left">Nama</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Aksi</th></tr></thead>
            <tbody className="divide-y">
              {activeRows.length ? activeRows.map((row) => {
                const status = String(row[statusKey] || "").toUpperCase();
                return <tr key={`${track}-${row.id}`}><td className={`p-3 text-xl font-black ${numberClass}`}>{String(row[numberKey] || "-")}</td><td className="p-3"><div className="font-black text-slate-900">{row.participant?.name || "-"}</div><div className="text-xs text-slate-500">{row.participant?.mcu_id || row.participant?.external_id || "-"}</div></td><td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusClass(status)}`}>{statusLabel(status)}</span></td><td className="p-3"><div className="flex flex-wrap gap-1.5"><button disabled={busy} onClick={() => action("recall", track, row.id)} className="rounded-lg border px-2.5 py-1 text-xs font-bold">Call</button><button disabled={busy} onClick={() => action("start", track, row.id)} className="rounded-lg border px-2.5 py-1 text-xs font-bold">Start</button><button disabled={busy} onClick={() => action("finish", track, row.id)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Done</button><button disabled={busy} onClick={() => action("skip", track, row.id)} className="rounded-lg border px-2.5 py-1 text-xs font-bold">Skip</button><button disabled={busy} onClick={() => { setCancelTarget({ track, entryId: row.id, queueNo: String(row[numberKey] || "-"), name: String(row.participant?.name || "-") }); setCancelReason(""); }} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">Cancel</button></div></td></tr>;
              }) : <tr><td colSpan={4} className="p-6 text-center text-sm font-semibold text-slate-500">Belum ada peserta pada antrian ini.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="flex items-center justify-between"><div className="text-sm font-black text-amber-900">Skipped {track}</div><div className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-black text-amber-900">{skippedRows.length}</div></div>{skippedRows.length ? <div className="mt-2 space-y-2">{skippedRows.map((row) => <div key={`skip-${track}-${row.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2"><div className="text-sm font-bold text-slate-800">{String(row[numberKey] || "-")} · {row.participant?.name || "-"}</div><button disabled={busy} onClick={() => action("reactivate", track, row.id)} className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-black text-white">Aktifkan</button></div>)}</div> : <div className="mt-2 text-xs font-semibold text-amber-700">Belum ada antrian skipped.</div>}</div>

        <div className="mt-4 overflow-hidden rounded-xl border bg-white">
          <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2.5">
            <div className="text-sm font-black text-slate-800">History {track}: Selesai / Cancel</div>
            <div className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-black text-slate-700">{historyRows.length}</div>
          </div>
          <div className="max-h-[260px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3 text-left">No</th>
                  <th className="p-3 text-left">Nama</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Update</th>
                  <th className="p-3 text-left">Alasan Cancel</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {historyRows.length ? historyRows.map((row) => {
                  const historyStatus = String(row[statusKey] || "").toUpperCase();
                  const historyTime = row[historyStatus === "CANCELLED" ? cancelledAtKey : finishedAtKey] as string | undefined;
                  return (
                    <tr key={`history-${track}-${row.id}`}>
                      <td className={`p-3 font-black ${numberClass}`}>{String(row[numberKey] || "-")}</td>
                      <td className="p-3">
                        <div className="font-black text-slate-900">{row.participant?.name || "-"}</div>
                        <div className="text-xs text-slate-500">{row.participant?.mcu_id || row.participant?.external_id || row.participant?.employee_nik || "-"}</div>
                      </td>
                      <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusClass(historyStatus)}`}>{statusLabel(historyStatus)}</span></td>
                      <td className="p-3 text-xs font-bold text-slate-600">{formatLastUpdate(historyTime)}</td>
                      <td className="max-w-[220px] whitespace-normal p-3 text-xs font-semibold text-slate-600">{historyStatus === "CANCELLED" ? String(row[cancelReasonKey] || "-") : "-"}</td>
                    </tr>
                  );
                }) : <tr><td colSpan={5} className="p-5 text-center text-sm font-semibold text-slate-500">Belum ada peserta selesai / cancel.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }

  if (loading) return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-7xl rounded-2xl border bg-white p-6 font-semibold text-slate-500">Memuat dashboard Operator Antrian...</div></main>;
  if (error && !data) return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-6 font-bold text-red-700">{error}</div></main>;

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div><div className="text-2xl font-black text-slate-900">Operator Antrian MCU</div><div className="mt-1 text-sm text-slate-500">Akses khusus operator untuk perusahaan dan paket ini.</div><div className="mt-3 text-sm font-black text-slate-800">{data?.company?.name || "-"} · {data?.package?.name || "-"}</div></div>
            <div className="flex flex-wrap gap-2"><button onClick={() => setVoiceEnabled((v) => !v)} className="rounded-xl border bg-white px-4 py-2 text-sm font-black text-slate-700">{voiceEnabled ? "🔊 Voice ON" : "🔇 Voice OFF"}</button><button onClick={exportQueueCsv} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">Export CSV</button>{data?.public_url ? <a target="_blank" href={data.public_url} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-black text-blue-700">Public Queue</a> : null}</div>
          </div>
          {error ? <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}
          {message ? <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</div> : null}
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-xl font-black text-slate-900">List Peserta Hari H</div><div className="mt-1 text-sm text-slate-500">Klik <b>Informed</b> setelah peserta sudah dihubungi. Pada tampilan default, peserta otomatis hilang setelah statusnya menjadi <b>Sudah di Informed</b>.</div></div><div className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-700">{uninformedParticipantCount} peserta belum di informed</div></div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_240px]"><input className="w-full rounded-xl border px-3 py-2 text-sm" value={participantSearch} onChange={(e) => setParticipantSearch(e.target.value)} placeholder="Cari nama, NIK, No MCU..." /><select className="w-full rounded-xl border px-3 py-2 text-sm" value={participantSort} onChange={(e) => setParticipantSort(e.target.value as any)}><option value="uninformed">Belum diinfokan dulu</option><option value="informed">Informed dulu</option><option value="name">Nama A - Z</option></select></div>
          <div className="mt-4 max-h-[440px] overflow-auto rounded-2xl border"><table className="min-w-full text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3 text-left">Nama Peserta</th><th className="p-3 text-left">NIK / No MCU</th><th className="p-3 text-left">Status Informasi</th><th className="p-3 text-left">Last Update</th><th className="p-3 text-left">Aksi</th></tr></thead><tbody className="divide-y">{visibleParticipants.length ? visibleParticipants.map((row) => <tr key={row.id} className={row.informed_at ? "bg-emerald-50/40" : "bg-white"}><td className="p-3"><div className="font-black text-slate-900">{row.name || "-"}</div><div className="text-xs text-slate-500">{row.department || "-"}</div></td><td className="p-3 text-xs font-semibold text-slate-600"><div>NIK: {row.nik || row.employee_nik || "-"}</div><div>MCU: {row.mcu_id || row.external_id || "-"}</div></td><td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${row.informed_at ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{row.informed_at ? "Sudah di Informed" : "Belum di Informed"}</span></td><td className="p-3"><div className="text-xs font-bold text-slate-700">{formatLastUpdate(row.informed_at)}</div><div className="mt-1 text-[11px] text-slate-500">{row.informed_by ? `oleh ${row.informed_by}` : "-"}</div></td><td className="p-3"><button disabled={busy || Boolean(row.informed_at)} onClick={() => action("informed", undefined, undefined, row.id)} className={`rounded-lg px-3 py-1.5 text-xs font-black disabled:opacity-50 ${row.informed_at ? "border border-emerald-200 bg-white text-emerald-700" : "bg-emerald-600 text-white"}`}>{row.informed_at ? "Sudah Informed" : "Informed"}</button></td></tr>) : <tr><td colSpan={5} className="p-8 text-center text-sm font-semibold text-slate-500">Tidak ada peserta yang perlu diinformasikan.</td></tr>}</tbody></table></div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2"><TrackPanel track="A" label={trackAName} accent="blue" /><TrackPanel track="B" label={trackBName} accent="violet" /></div>
      </div>

      {cancelTarget ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-lg rounded-2xl border bg-white p-5 shadow-2xl">
            <div className="text-xl font-black text-slate-900">Cancel Antrian {cancelTarget.track}</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">{cancelTarget.queueNo} · {cancelTarget.name}</div>
            <label className="mt-4 block text-sm font-black text-slate-700">Alasan Cancel <span className="text-red-600">*</span></label>
            <textarea autoFocus rows={4} maxLength={500} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Contoh: peserta tidak hadir, menolak pemeriksaan, reschedule, atau alasan lain..." className="mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-red-400" />
            <div className="mt-1 text-right text-xs font-semibold text-slate-400">{cancelReason.length}/500</div>
            <div className="mt-5 flex justify-end gap-2">
              <button disabled={busy} onClick={() => { setCancelTarget(null); setCancelReason(""); }} className="rounded-xl border px-4 py-2 text-sm font-black text-slate-700">Batal</button>
              <button disabled={busy || !cancelReason.trim()} onClick={submitCancel} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Simpan & Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
