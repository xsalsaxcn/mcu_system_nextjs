"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";

type Track = "A" | "B";

type CompanyOption = {
  id: number;
  name: string;
  package_ids?: number[];
};

type QueueSessionOption = {
  id: number;
  company_id: number;
  package_id: number;
  company_name?: string;
  package_name?: string;
  session_name?: string | null;
  location?: string | null;
  session_date?: string | null;
  track_a_name?: string;
  track_b_name?: string;
  is_active?: number;
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

export default function McuQueuePage() {
  return (
    <AuthGate>
      {() => <McuQueueContent />}
    </AuthGate>
  );
}

// MCU_QUEUE_COMPANY_PACKAGE_SELECTOR_V435
function McuQueueContent() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [queueSessions, setQueueSessions] = useState<QueueSessionOption[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [queueSessionId, setQueueSessionId] = useState("");
  const [optionsReady, setOptionsReady] = useState(false);
  const [participantSearch, setParticipantSearch] = useState("");
  // MCU_CORPORATE_DAYH_INFORMED_SORT_V514_1
  const [participantSort, setParticipantSort] = useState<
    "name" | "uninformed" | "informed" | "updated"
  >("uninformed");
  // MCU_ADMIN_QUEUE_HISTORY_EDIT_V465
  const [historyEditTarget, setHistoryEditTarget] = useState<{ mode: "edit" | "cancel"; track: Track; entryId: number; queueNo: string; name: string; currentStatus: string } | null>(null);
  const [historyEditStatus, setHistoryEditStatus] = useState("WAITING");
  const [historyCancelReason, setHistoryCancelReason] = useState("");

  const filteredSessions = useMemo(
    () =>
      queueSessions
        .filter(
          (row) =>
            String(row.company_id) === String(companyId) &&
            Number(row.is_active || 0) === 1,
        )
        .sort((a, b) => {
          const ad = String(a.session_date || "9999-12-31");
          const bd = String(b.session_date || "9999-12-31");
          return ad.localeCompare(bd) || Number(a.id) - Number(b.id);
        }),
    [queueSessions, companyId],
  );

  function sessionOptionLabel(row: QueueSessionOption) {
    const date = row.session_date
      ? new Intl.DateTimeFormat("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(new Date(`${row.session_date}T00:00:00`))
      : "Tanggal belum diatur";

    return `${date} · ${row.location || "Legacy"} · ${row.package_name || "Paket MCU"}`;
  }


  const entries: QueueEntry[] = data?.entries || [];
  const pendingParticipants: PendingParticipant[] = data?.pending_participants || [];
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

    const byName = (a: PendingParticipant, b: PendingParticipant) =>
      String(a.name || "").localeCompare(
        String(b.name || ""),
        "id",
        { sensitivity: "base" },
      );

    // V514.1: dropdown is SORT only, never a filter.
    // Informed participants remain visible until they register / receive queue.
    return [...rows].sort((a, b) => {
      if (participantSort === "uninformed") {
        const aInformed = Boolean(a.informed_at);
        const bInformed = Boolean(b.informed_at);
        if (aInformed != bInformed) return aInformed ? 1 : -1;
        return byName(a, b);
      }

      if (participantSort === "informed") {
        const aInformed = Boolean(a.informed_at);
        const bInformed = Boolean(b.informed_at);
        if (aInformed != bInformed) return aInformed ? -1 : 1;

        const aTime = a.informed_at ? new Date(a.informed_at).getTime() : 0;
        const bTime = b.informed_at ? new Date(b.informed_at).getTime() : 0;
        return bTime - aTime || byName(a, b);
      }

      if (participantSort === "updated") {
        const aTime = a.informed_at ? new Date(a.informed_at).getTime() : 0;
        const bTime = b.informed_at ? new Date(b.informed_at).getTime() : 0;
        return bTime - aTime || byName(a, b);
      }

      return byName(a, b);
    });
  }, [pendingParticipants, participantSearch, participantSort]);
  const trackAName = String(data?.queue_session?.track_a_name || "Lab Darah");
  const trackBName = String(data?.queue_session?.track_b_name || "Rontgen");

  async function loadOptions() {
    try {
      const res = await fetch("/api/mcu/session", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(
          json.message || "Gagal memuat daftar perusahaan MCU.",
        );
      }

      const nextCompanies: CompanyOption[] = json.companies || [];
      const nextSessions: QueueSessionOption[] = json.queue_sessions || [];

      setCompanies(nextCompanies);
      setQueueSessions(nextSessions);

      const urlSessionId =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("session_id")
          : "";

      const requested = urlSessionId
        ? nextSessions.find(
            (row) =>
              String(row.id) === String(urlSessionId) &&
              Number(row.is_active || 0) === 1,
          )
        : null;

      if (requested) {
        setCompanyId(String(requested.company_id));
        setPackageId(String(requested.package_id));
        setQueueSessionId(String(requested.id));
      } else {
        const preferredCompanyId = String(
          json.session?.company_id || nextCompanies?.[0]?.id || "",
        );

        const candidate =
          nextSessions.find(
            (row) =>
              String(row.company_id) === preferredCompanyId &&
              Number(row.is_active || 0) === 1,
          ) ||
          nextSessions.find(
            (row) => Number(row.is_active || 0) === 1,
          ) ||
          null;

        if (candidate) {
          setCompanyId(String(candidate.company_id));
          setPackageId(String(candidate.package_id));
          setQueueSessionId(String(candidate.id));
        } else {
          setCompanyId(preferredCompanyId);
          setPackageId("");
          setQueueSessionId("");
        }
      }

      setOptionsReady(true);
    } catch (err: any) {
      setError(
        err?.message || "Gagal memuat daftar perusahaan MCU.",
      );
      setOptionsReady(true);
      setLoading(false);
    }
  }


  async function load(
    silent = false,
    overrideCompanyId?: string,
    overridePackageId?: string,
    overrideQueueSessionId?: string,
  ) {
    const cid = String((overrideCompanyId ?? companyId) || "");
    const pid = String((overridePackageId ?? packageId) || "");
    const sid = String(
      (overrideQueueSessionId ?? queueSessionId) || "",
    );

    if (!cid || !pid || !sid) {
      setData(null);
      if (!silent) setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    try {
      const query = new URLSearchParams({
        company_id: cid,
        package_id: pid,
        queue_session_id: sid,
      });
      const res = await fetch(`/api/mcu/queue?${query.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal memuat Antrian MCU.");
      setData(json);
      setError("");
    } catch (err: any) {
      setData(null);
      setError(err?.message || "Gagal memuat Antrian MCU.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    if (
      !optionsReady ||
      !companyId ||
      !packageId ||
      !queueSessionId
    ) {
      setData(null);
      if (optionsReady) setLoading(false);
      return;
    }

    load(false, companyId, packageId, queueSessionId);
    const timer = window.setInterval(
      () => load(true, companyId, packageId, queueSessionId),
      5000,
    );
    return () => window.clearInterval(timer);
  }, [optionsReady, companyId, packageId, queueSessionId]);

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
      // Voice tidak boleh mengganggu alur queue.
    }
  }

  async function action(actionName: string, track?: Track, entryId?: number, extra: Record<string, any> = {}) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/mcu/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionName, track, entry_id: entryId, company_id: Number(companyId), package_id: Number(packageId), ...extra }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal memperbarui antrian.");
      setMessage(json.message || "Antrian diperbarui.");
      if ((actionName === "call-next" || actionName === "recall") && json.entry && track) {
        speakCall(track, json.entry);
      }
      await load(true, companyId, packageId);
      return true;
    } catch (err: any) {
      setError(err?.message || "Gagal memperbarui antrian.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function markInformed(participantId: number) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/mcu/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "informed",
          participant_id: participantId,
          company_id: Number(companyId),
          package_id: Number(packageId),
          queue_session_id: Number(queueSessionId),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal menyimpan status informed.");
      setMessage(json.message || "Status informed tersimpan.");
      await load(true, companyId, packageId, queueSessionId);
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan status informed.");
    } finally {
      setBusy(false);
    }
  }

  // MCU_CORPORATE_SESSION_TEST_RESET_BUTTON_V511
  async function resetSessionTesting() {
    if (!queueSessionId) return;

    const sessionLabel = [
      data?.queue_session?.location,
      data?.queue_session?.session_date,
    ]
      .filter(Boolean)
      .join(" · ");

    const confirmed =
      typeof window === "undefined"
        ? false
        : window.confirm(
            `RESET TESTING SESSION${sessionLabel ? `\n${sessionLabel}` : ""}\n\n` +
              "Yang akan direset:\n" +
              "• status Informed\n" +
              "• Registrasi Ulang Session ini\n" +
              "• nomor & seluruh status antrean A/B\n" +
              "• history Done / Skip / Cancel Session ini\n\n" +
              "Yang TETAP AMAN:\n" +
              "• Database Existing / peserta\n" +
              "• roster assignment ke Session\n" +
              "• Session MCU\n" +
              "• Session/lokasi lain\n\n" +
              "Lanjutkan reset?",
          );

    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/mcu/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset-session-test",
          company_id: Number(companyId),
          package_id: Number(packageId),
          queue_session_id: Number(queueSessionId),
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.message || "Gagal mereset testing Session MCU.");
      }

      setParticipantSearch("");
      setParticipantSort("uninformed");
      setMessage(json.message || "Testing Session berhasil direset.");
      await load(true, companyId, packageId, queueSessionId);
    } catch (err: any) {
      setError(err?.message || "Gagal mereset testing Session MCU.");
    } finally {
      setBusy(false);
    }
  }

  async function generateOperatorLink() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/mcu/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate-operator-link",
          company_id: Number(companyId),
          package_id: Number(packageId),
          queue_session_id: Number(queueSessionId),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal membuat link Operator.");
      const relativeUrl = String(json.operator_url || "");
      const fullUrl = relativeUrl && typeof window !== "undefined" ? `${window.location.origin}${relativeUrl}` : relativeUrl;
      if (fullUrl && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(fullUrl).catch(() => undefined);
      }
      setMessage(`${json.message || "Link Operator berhasil dibuat."}${fullUrl ? " Link sudah dicopy." : ""}`);
      await load(true, companyId, packageId, queueSessionId);
    } catch (err: any) {
      setError(err?.message || "Gagal membuat link Operator.");
    } finally {
      setBusy(false);
    }
  }

  function openHistoryEdit(row: QueueEntry, track: Track, mode: "edit" | "cancel") {
    const statusKey = fieldFor(track, "status");
    const numberKey = fieldFor(track, "number");
    const currentStatus = String(row[statusKey] || "WAITING").toUpperCase();
    const reasonKey = (track === "A" ? "a_cancel_reason" : "b_cancel_reason") as keyof QueueEntry;
    setHistoryEditTarget({
      mode,
      track,
      entryId: row.id,
      queueNo: String(row[numberKey] || "-"),
      name: String(row.participant?.name || "-"),
      currentStatus,
    });
    setHistoryEditStatus(mode === "cancel" ? "CANCELLED" : currentStatus);
    setHistoryCancelReason(mode === "cancel" || currentStatus === "CANCELLED" ? String(row[reasonKey] || "") : "");
  }

  async function submitHistoryEdit() {
    if (!historyEditTarget) return;
    const status = String(historyEditStatus || "").toUpperCase();
    const actionMap: Record<string, string> = {
      WAITING: "waiting",
      CALLED: "recall",
      IN_PROGRESS: "start",
      DONE: "finish",
      SKIPPED: "skip",
      CANCELLED: "cancel",
    };
    const actionName = actionMap[status];
    if (!actionName) {
      setError("Status koreksi tidak dikenali.");
      return;
    }
    const reason = historyCancelReason.trim();
    if (status === "CANCELLED" && !reason) {
      setError("Alasan cancel wajib diisi.");
      return;
    }
    const ok = await action(actionName, historyEditTarget.track, historyEditTarget.entryId, status === "CANCELLED" ? { cancel_reason: reason } : {});
    if (ok) {
      setHistoryEditTarget(null);
      setHistoryEditStatus("WAITING");
      setHistoryCancelReason("");
    }
  }

  function formatLastUpdate(value?: string | null) {
    if (!value) return "-";
    try {
      return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value));
    } catch {
      return String(value);
    }
  }

  function rowsForTrack(track: Track) {
    const statusKey = fieldFor(track, "status");
    const seqKey = fieldFor(track, "sequence");
    return [...entries]
      .filter((row) => String(row[statusKey] || "").toUpperCase() !== "CANCELLED")
      .sort((a, b) => Number(a[seqKey] || 999999) - Number(b[seqKey] || 999999));
  }

  function stats(track: Track) {
    const statusKey = fieldFor(track, "status");
    const rows = rowsForTrack(track);
    return {
      waiting: rows.filter((r) => String(r[statusKey] || "").toUpperCase() === "WAITING").length,
      active: rows.filter((r) => ["CALLED", "IN_PROGRESS"].includes(String(r[statusKey] || "").toUpperCase())).length,
      skipped: rows.filter((r) => String(r[statusKey] || "").toUpperCase() === "SKIPPED").length,
      done: rows.filter((r) => String(r[statusKey] || "").toUpperCase() === "DONE").length,
    };
  }

  function current(track: Track) {
    const statusKey = fieldFor(track, "status");
    return rowsForTrack(track).find((r) => ["CALLED", "IN_PROGRESS"].includes(String(r[statusKey] || "").toUpperCase())) || null;
  }

  function nextWaiting(track: Track) {
    const statusKey = fieldFor(track, "status");
    return rowsForTrack(track).find((r) => String(r[statusKey] || "").toUpperCase() === "WAITING") || null;
  }

  function TrackPanel({ track, label, accent }: { track: Track; label: string; accent: "blue" | "violet" }) {
    const statusKey = fieldFor(track, "status");
    const numberKey = fieldFor(track, "number");
    const rows = rowsForTrack(track);
    const activeRows = rows.filter((r) => !["SKIPPED", "DONE", "CANCELLED"].includes(String(r[statusKey] || "").toUpperCase()));
    const skippedRows = rows.filter((r) => String(r[statusKey] || "").toUpperCase() === "SKIPPED");
    // MCU_ADMIN_QUEUE_HISTORY_V463
    const finishedAtKey = (track === "A" ? "a_finished_at" : "b_finished_at") as keyof QueueEntry;
    const cancelledAtKey = (track === "A" ? "a_cancelled_at" : "b_cancelled_at") as keyof QueueEntry;
    const cancelReasonKey = (track === "A" ? "a_cancel_reason" : "b_cancel_reason") as keyof QueueEntry;
    const historyRows = [...entries]
      .filter((r) => ["DONE", "CANCELLED"].includes(String(r[statusKey] || "").toUpperCase()))
      .sort((a, b) => {
        const as = String(a[statusKey] || "").toUpperCase();
        const bs = String(b[statusKey] || "").toUpperCase();
        const at = String(a[as === "CANCELLED" ? cancelledAtKey : finishedAtKey] || "");
        const bt = String(b[bs === "CANCELLED" ? cancelledAtKey : finishedAtKey] || "");
        const d = new Date(bt || 0).getTime() - new Date(at || 0).getTime();
        if (d) return d;
        return Number(b[fieldFor(track, "sequence")] || 0) - Number(a[fieldFor(track, "sequence")] || 0);
      });
    const summary = stats(track);
    const currentRow = current(track);
    const nextRow = nextWaiting(track);
    const buttonClass = accent === "blue" ? "bg-blue-600 hover:bg-blue-700" : "bg-violet-600 hover:bg-violet-700";
    const numberClass = accent === "blue" ? "text-blue-700" : "text-violet-700";

    return (
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className={`text-lg font-black ${numberClass}`}>{track} · {label}</div>
            <div className="text-xs font-semibold text-slate-500">Antrian berjalan independen.</div>
          </div>
          <button disabled={busy} onClick={() => action("call-next", track)} className={`rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-50 ${buttonClass}`}>
            Panggil Berikutnya {track}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">Dipanggil</div><div className={`mt-1 text-3xl font-black ${numberClass}`}>{currentRow ? String(currentRow[numberKey] || "-") : "-"}</div><div className="truncate text-xs font-bold text-slate-700">{currentRow?.participant?.name || "-"}</div></div>
          <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">Berikutnya</div><div className="mt-1 text-3xl font-black text-slate-900">{nextRow ? String(nextRow[numberKey] || "-") : "-"}</div><div className="truncate text-xs font-bold text-slate-700">{nextRow?.participant?.name || "-"}</div></div>
          <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">Menunggu</div><div className="mt-1 text-3xl font-black text-red-700">{summary.waiting}</div></div>
          <div className="rounded-xl border bg-emerald-50 p-3"><div className="text-xs font-bold text-emerald-700">Selesai</div><div className="mt-1 text-3xl font-black text-emerald-700">{summary.done}</div></div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3 text-left">No</th><th className="p-3 text-left">Nama</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Aksi</th></tr></thead>
            <tbody className="divide-y">
              {activeRows.length ? activeRows.map((row) => {
                const status = String(row[statusKey] || "").toUpperCase();
                return (
                  <tr key={`${track}-${row.id}`}>
                    <td className={`p-3 text-xl font-black ${numberClass}`}>{String(row[numberKey] || "-")}</td>
                    <td className="p-3"><div className="font-black text-slate-900">{row.participant?.name || "-"}</div><div className="text-xs text-slate-500">{row.participant?.mcu_id || row.participant?.external_id || "-"}</div></td>
                    <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusClass(status)}`}>{statusLabel(status)}</span></td>
                    <td className="p-3"><div className="flex flex-wrap gap-1.5">
                      <button disabled={busy} onClick={() => action("recall", track, row.id)} className="rounded-lg border px-2.5 py-1 text-xs font-bold">Call</button>
                      <button disabled={busy} onClick={() => action("start", track, row.id)} className="rounded-lg border px-2.5 py-1 text-xs font-bold">Start</button>
                      <button disabled={busy} onClick={() => action("finish", track, row.id)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Done</button>
                      <button disabled={busy} onClick={() => action("skip", track, row.id)} className="rounded-lg border px-2.5 py-1 text-xs font-bold">Skip</button>
                      <button disabled={busy} onClick={() => openHistoryEdit(row, track, "cancel")} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">Cancel</button>
                    </div></td>
                  </tr>
                );
              }) : <tr><td colSpan={4} className="p-6 text-center text-sm font-semibold text-slate-500">Belum ada peserta pada antrian ini.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center justify-between"><div className="text-sm font-black text-amber-900">Skipped {track}</div><div className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-black text-amber-900">{skippedRows.length}</div></div>
          {skippedRows.length ? <div className="mt-2 space-y-2">{skippedRows.map((row) => <div key={`skip-${track}-${row.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2"><div className="text-sm font-bold text-slate-800">{String(row[numberKey] || "-")} · {row.participant?.name || "-"}</div><button disabled={busy} onClick={() => action("reactivate", track, row.id)} className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-black text-white">Aktifkan</button></div>)}</div> : <div className="mt-2 text-xs font-semibold text-amber-700">Belum ada antrian skipped.</div>}
        </div>
      

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
                  <th className="p-3 text-left">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {historyRows.length ? historyRows.map((row) => {
                  const historyStatus = String(row[statusKey] || "").toUpperCase();
                  const historyTime = row[historyStatus === "CANCELLED" ? cancelledAtKey : finishedAtKey] as string | undefined;
                  const cancelReason = String(row[cancelReasonKey] || "").trim();
                  return (
                    <tr key={`history-${track}-${row.id}`}>
                      <td className={`p-3 font-black ${numberClass}`}>{String(row[numberKey] || "-")}</td>
                      <td className="p-3">
                        <div className="font-black text-slate-900">{row.participant?.name || "-"}</div>
                        <div className="text-xs text-slate-500">{row.participant?.mcu_id || row.participant?.external_id || row.participant?.employee_nik || "-"}</div>
                      </td>
                      <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusClass(historyStatus)}`}>{statusLabel(historyStatus)}</span></td>
                      <td className="p-3 text-xs font-bold text-slate-600">{formatLastUpdate(historyTime)}</td>
                      <td className="p-3 text-xs font-semibold text-slate-600">{historyStatus === "CANCELLED" ? (cancelReason || "-") : "-"}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button disabled={busy} onClick={() => openHistoryEdit(row, track, "edit")} className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">Edit</button>
                          <button disabled={busy} onClick={() => openHistoryEdit(row, track, "cancel")} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-black text-red-700">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  );
                }) : <tr><td colSpan={6} className="p-5 text-center text-sm font-semibold text-slate-500">Belum ada peserta selesai / cancel.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
</section>
    );
  }

  if (!optionsReady && loading) return <div className="card p-6 text-sm font-semibold text-slate-500">Memuat Antrian MCU...</div>;

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-2xl font-black text-slate-900">Antrian MCU Corporate</div>
            <div className="mt-1 text-sm text-slate-500">Pilih perusahaan dan Session lokasi/tanggal. Peserta Registrasi Ulang otomatis masuk ke antrean Session aktif tanpa sinkron manual.</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-xl bg-blue-100 px-3 py-2 text-xs font-black text-blue-800">A · {trackAName}</span>
              <span className="rounded-xl bg-violet-100 px-3 py-2 text-xs font-black text-violet-800">B · {trackBName}</span>
              <span className={`rounded-xl px-3 py-2 text-xs font-black ${voiceEnabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{voiceEnabled ? "🔊 Voice ON" : "🔇 Voice OFF"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800"
              title="Peserta yang Registrasi Ulang pada Session ini otomatis masuk Antrian MCU."
            >
              Auto Queue · Session Aktif
            </div>
            <button onClick={() => setVoiceEnabled((v) => !v)} className="rounded-xl border bg-white px-4 py-2 text-sm font-black text-slate-700">{voiceEnabled ? "Matikan Suara" : "Aktifkan Suara"}</button>
            {data?.public_url ? <a target="_blank" href={data.public_url} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-blue-700">Public Queue · {data?.company?.name || "Perusahaan"}</a> : null}
            {data?.operator_url ? <a target="_blank" href={data.operator_url} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800">Buka Operator · {data?.company?.name || "Perusahaan"}</a> : null}
            <button disabled={busy || !companyId || !packageId || !queueSessionId} onClick={generateOperatorLink} className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-black text-emerald-800 disabled:opacity-50">{data?.operator_url ? "Reset Link Operator" : "Generate Link Operator"}</button>
            <button
              disabled={busy || !companyId || !packageId || !queueSessionId}
              onClick={resetSessionTesting}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-black text-red-700 disabled:opacity-50"
              title="Reset hanya status testing pada Session MCU yang sedang dipilih. Roster/import tidak dihapus."
            >
              Reset Testing Session
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border bg-slate-50 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Perusahaan</label>
              <select
                className="input"
                value={companyId}
                onChange={(e) => {
                  const nextCompanyId = e.target.value;
                  const firstSession = queueSessions.find(
                    (row) =>
                      String(row.company_id) ===
                        String(nextCompanyId) &&
                      Number(row.is_active || 0) === 1,
                  );

                  setCompanyId(nextCompanyId);
                  setPackageId(
                    firstSession
                      ? String(firstSession.package_id)
                      : "",
                  );
                  setQueueSessionId(
                    firstSession ? String(firstSession.id) : "",
                  );
                  setData(null);
                  setMessage("");
                  setError("");
                }}
              >
                <option value="">- Pilih Perusahaan -</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Session MCU / Lokasi</label>
              <select
                className="input"
                value={queueSessionId}
                disabled={!companyId}
                onChange={(e) => {
                  const sid = e.target.value;
                  const selected = queueSessions.find(
                    (row) => String(row.id) === String(sid),
                  );
                  setQueueSessionId(sid);
                  setPackageId(
                    selected ? String(selected.package_id) : "",
                  );
                  setData(null);
                  setMessage("");
                  setError("");
                }}
              >
                <option value="">- Pilih Session -</option>
                {filteredSessions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {sessionOptionLabel(row)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {companyId && !filteredSessions.length ? (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              Belum ada Session lokasi/tanggal aktif untuk perusahaan ini.
              Buat terlebih dahulu dari menu Session MCU Corporate.
            </div>
          ) : null}

          {data?.queue_session ? (
            <div className="mt-3 grid gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-semibold text-blue-900 sm:grid-cols-4">
              <div>
                <span className="text-blue-600">Perusahaan</span>
                <div className="mt-1 font-black">{data?.company?.name || "-"}</div>
              </div>
              <div>
                <span className="text-blue-600">Lokasi</span>
                <div className="mt-1 font-black">{data.queue_session.location || "Legacy / belum diatur"}</div>
              </div>
              <div>
                <span className="text-blue-600">Tanggal</span>
                <div className="mt-1 font-black">{data.queue_session.session_date || "Belum diatur"}</div>
              </div>
              <div>
                <span className="text-blue-600">Paket</span>
                <div className="mt-1 font-black">{data?.package?.name || "-"}</div>
              </div>
            </div>
          ) : null}
        </div>

        {error ? <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</div> : null}
      </section>

      {companyId && packageId && queueSessionId && data ? (
        <>
          <section className="card p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xl font-black text-slate-900">List Peserta Hari H</div>
                <div className="mt-1 text-sm text-slate-500">
                  Peserta tetap ada di list walaupun sudah <b>Informed</b>.
                  Peserta baru keluar setelah <b>Registrasi Ulang / mengambil nomor antrean</b>
                  pada Session ini.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-black text-blue-700">
                  {pendingParticipants.length} belum registrasi/antrian
                </div>
                <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-700">
                  {uninformedParticipantCount} belum di informed
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_240px]">
              <input className="input" value={participantSearch} onChange={(e) => setParticipantSearch(e.target.value)} placeholder="Cari nama, NIK, No MCU, departemen..." />
              <select className="input" value={participantSort} onChange={(e) => setParticipantSort(e.target.value as any)}>
                <option value="uninformed">Belum di Informed dulu</option>
                <option value="informed">Sudah di Informed dulu</option>
                <option value="updated">Last Update terbaru</option>
                <option value="name">Nama A - Z</option>
              </select>
            </div>

            <div className="mt-4 max-h-[460px] overflow-auto rounded-2xl border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-3 text-left">Nama Peserta</th>
                    <th className="p-3 text-left">NIK / No MCU</th>
                    <th className="p-3 text-left">Status Informasi</th>
                    <th className="p-3 text-left">Last Update</th>
                    <th className="p-3 text-left">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleParticipants.length ? visibleParticipants.map((row) => (
                    <tr key={`pending-${row.id}`} className={row.informed_at ? "bg-emerald-50/40" : "bg-white"}>
                      <td className="p-3">
                        <div className="font-black text-slate-900">{row.name || "-"}</div>
                        <div className="text-xs text-slate-500">{row.department || "-"}</div>
                      </td>
                      <td className="p-3 text-xs font-semibold text-slate-600">
                        <div>NIK Karyawan: {row.employee_nik || row.nik || "-"}</div>
                        <div>MCU: {row.mcu_id || row.external_id || "-"}</div>
                      </td>
                      <td className="p-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${row.informed_at ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                          {row.informed_at ? "Sudah di Informed" : "Belum di Informed"}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="text-xs font-bold text-slate-700">{formatLastUpdate(row.informed_at)}</div>
                        {row.informed_by ? <div className="mt-1 text-[11px] text-slate-500">oleh {row.informed_by}</div> : null}
                      </td>
                      <td className="p-3">
                        <button disabled={busy || Boolean(row.informed_at)} onClick={() => markInformed(row.id)} className={`rounded-lg px-3 py-1.5 text-xs font-black disabled:cursor-not-allowed ${row.informed_at ? "border border-slate-200 bg-slate-100 text-slate-400" : "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"}`}>
                          {row.informed_at ? "Sudah Informed" : "Informed"}
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="p-8 text-center text-sm font-semibold text-slate-500">Tidak ada peserta pada tampilan ini.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <TrackPanel track="A" label={trackAName} accent="blue" />
            <TrackPanel track="B" label={trackBName} accent="violet" />
          </div>

          <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
            Peserta masuk ke antrian setelah <b>Registrasi Ulang MCU Corporate</b>. Tombol Sinkronkan dipakai untuk peserta yang sudah registrasi sebelum fitur antrian dipasang. Public Queue di atas adalah <b>satu layar gabungan A + B</b> untuk perusahaan dan paket yang sedang dipilih.
          </section>
        </>
      ) : (
        <section className="card p-6 text-center text-sm font-semibold text-slate-500">
          Pilih perusahaan dan paket pemeriksaan untuk menampilkan antrian.
        </section>
      )}

      {historyEditTarget ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-lg rounded-2xl border bg-white p-5 shadow-2xl">
            <div className="text-xl font-black text-slate-900">
              {historyEditTarget.mode === "cancel" ? `Cancel Antrian ${historyEditTarget.track}` : `Edit Status Antrian ${historyEditTarget.track}`}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-500">{historyEditTarget.queueNo} · {historyEditTarget.name}</div>

            {historyEditTarget.mode === "edit" ? (
              <div className="mt-4">
                <label className="block text-sm font-black text-slate-700">Status</label>
                <select value={historyEditStatus} onChange={(e) => { setHistoryEditStatus(e.target.value); if (e.target.value !== "CANCELLED") setHistoryCancelReason(""); }} className="mt-2 w-full rounded-xl border px-3 py-2 text-sm font-bold outline-none focus:border-blue-400">
                  <option value="WAITING">Menunggu / Kembalikan ke antrian</option>
                  <option value="CALLED">Dipanggil</option>
                  <option value="IN_PROGRESS">Proses</option>
                  <option value="DONE">Selesai</option>
                  <option value="SKIPPED">Skipped</option>
                  <option value="CANCELLED">Cancel</option>
                </select>
              </div>
            ) : null}

            {historyEditStatus === "CANCELLED" ? (
              <div className="mt-4">
                <label className="block text-sm font-black text-slate-700">Alasan Cancel <span className="text-red-600">*</span></label>
                <textarea autoFocus rows={4} maxLength={500} value={historyCancelReason} onChange={(e) => setHistoryCancelReason(e.target.value)} placeholder="Contoh: salah pilih peserta, peserta tidak hadir, menolak pemeriksaan, reschedule, atau alasan lain..." className="mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-red-400" />
                <div className="mt-1 text-right text-xs font-semibold text-slate-400">{historyCancelReason.length}/500</div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-800">
                Koreksi status tidak mengubah nomor antrian. Jika dikembalikan ke Menunggu, peserta muncul lagi di tabel antrian aktif pada nomor yang sama.
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button disabled={busy} onClick={() => { setHistoryEditTarget(null); setHistoryEditStatus("WAITING"); setHistoryCancelReason(""); }} className="rounded-xl border px-4 py-2 text-sm font-black text-slate-700">Batal</button>
              <button disabled={busy || (historyEditStatus === "CANCELLED" && !historyCancelReason.trim())} onClick={submitHistoryEdit} className={`rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-50 ${historyEditStatus === "CANCELLED" ? "bg-red-600" : "bg-blue-600"}`}>
                {historyEditStatus === "CANCELLED" ? "Simpan & Cancel" : "Simpan Perubahan"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
