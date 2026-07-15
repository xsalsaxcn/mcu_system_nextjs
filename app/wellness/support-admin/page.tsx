"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import WellnessQuickNav from "@/components/wellness/WellnessQuickNav";
import {
  formatSupportBytes,
  prepareSupportAttachment,
  uploadSupportAttachment,
} from "@/components/wellness/supportFiles";

// WELLNESS_SUPPORT_ADMIN_INBOX_V61
// Admin inbox backed by Google Sheet + Google Drive.

function clean(value: any) {
  return String(value ?? "").trim();
}

function formatTime(value: any) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusTone(status: string) {
  if (status === "Selesai") return "bg-emerald-100 text-emerald-800";
  if (status === "Ditangani") return "bg-sky-100 text-sky-800";
  return "bg-amber-100 text-amber-800";
}

function Attachment({ message }: { message: any }) {
  const url = clean(message.attachment_url || message.attachmentUrl);
  const preview = clean(message.attachment_preview_url || message.attachmentPreviewUrl || url);
  const type = clean(message.attachment_type || message.attachmentType).toLowerCase();
  const name = clean(message.attachment_name || message.attachmentName) || "Attachment";
  const size = Number(message.attachment_size || message.attachmentSize || 0);
  if (!url) return null;

  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-2xl border border-slate-100 bg-white">
      {type.startsWith("image/") ? (
        <img src={preview} alt={name} loading="lazy" className="max-h-56 w-full object-cover" />
      ) : (
        <div className="flex items-center gap-3 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-xl">📄</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-black">{name}</div>
            <div className="mt-1 text-xs font-bold text-slate-500">{formatSupportBytes(size)}</div>
          </div>
        </div>
      )}
    </a>
  );
}

export default function WellnessSupportAdminPage() {
  const [threads, setThreads] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [selected, setSelected] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  async function loadThreads() {
    setLoading(true);
    const params = new URLSearchParams({ mode: "threads", status, query, limit: "60" });
    const result = await fetch(`/api/wellness/support?${params.toString()}`, { cache: "no-store" })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      setThreads(result.threads || []);
      setSummary(result.summary || {});
      setNotice("");
    } else {
      setNotice(result.message || "Inbox support tidak dapat dimuat.");
    }
    setLoading(false);
  }

  async function openThread(item: any) {
    setSelected(item);
    setMessages([]);
    setLoading(true);
    const ticketId = clean(item.ticket_id || item.ticketId);
    const result = await fetch(
      `/api/wellness/support?mode=messages&thread_id=${encodeURIComponent(ticketId)}&limit=50`,
      { cache: "no-store" }
    )
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      setSelected(result.thread || item);
      setMessages(result.messages || []);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      loadThreads();
    } else {
      setNotice(result.message || "Percakapan tidak dapat dimuat.");
    }
    setLoading(false);
  }

  useEffect(() => {
    loadThreads();
  }, [status]);

  const filteredThreads = useMemo(() => {
    const q = clean(query).toLowerCase();
    if (!q) return threads;
    return threads.filter((item: any) =>
      [item.actor_name, item.actor_code, item.company, item.kelompok, item.last_message, item.ticket_id]
        .map((value) => clean(value).toLowerCase())
        .join(" ")
        .includes(q)
    );
  }, [threads, query]);

  async function chooseFile(file: File | null) {
    if (!file) return;
    try {
      setNotice("Menyiapkan attachment hemat data...");
      const prepared = await prepareSupportAttachment(file);
      setAttachment(prepared);
      setNotice(`Attachment siap (${formatSupportBytes(prepared.size)}).`);
    } catch (error: any) {
      setAttachment(null);
      setNotice(error?.message || "Attachment gagal diproses.");
    }
  }

  async function sendReply() {
    const ticketId = clean(selected?.ticket_id || selected?.ticketId);
    if (!ticketId) return setNotice("Pilih percakapan terlebih dahulu.");
    if (!clean(text) && !attachment) return setNotice("Tulis balasan atau pilih attachment.");

    setSending(true);
    try {
      let uploaded: any = null;
      if (attachment) uploaded = await uploadSupportAttachment(attachment, ticketId);

      const result = await fetch("/api/wellness/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_message",
          thread_id: ticketId,
          message: clean(text),
          attachment: uploaded?.attachment || null,
        }),
      }).then((response) => response.json());

      if (!result.ok) throw new Error(result.message || "Balasan gagal dikirim.");
      setText("");
      setAttachment(null);
      if (fileRef.current) fileRef.current.value = "";
      setNotice("Balasan terkirim.");
      await openThread(selected);
    } catch (error: any) {
      setNotice(error?.message || "Balasan gagal dikirim.");
    }
    setSending(false);
  }

  async function updateStatus(nextStatus: string) {
    const ticketId = clean(selected?.ticket_id || selected?.ticketId);
    if (!ticketId) return;
    const result = await fetch("/api/wellness/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_status", thread_id: ticketId, status: nextStatus }),
    }).then((response) => response.json());

    if (result.ok) {
      setSelected(result.thread || { ...selected, status: nextStatus });
      setNotice(`Status diubah menjadi ${nextStatus}.`);
      loadThreads();
    } else {
      setNotice(result.message || "Status gagal diubah.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <WellnessQuickNav />

        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-violet-700 via-indigo-700 to-blue-700 p-6 text-white shadow-xl md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Wellness Technical Support</div>
              <h1 className="mt-2 text-3xl font-black">Chat with Admin Inbox</h1>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-white/85">
                Kendala teknis Peserta dan Coach. Pesan tersimpan di Google Sheet; attachment tersimpan di Google Drive.
              </p>
            </div>
            <button onClick={loadThreads} className="rounded-full bg-white/15 px-5 py-3 text-xs font-black backdrop-blur">
              Refresh Inbox
            </button>
          </div>
        </section>

        <section className="grid grid-cols-3 gap-3">
          <div className="rounded-3xl bg-amber-50 p-4"><div className="text-xs font-black text-amber-700">OPEN</div><div className="mt-2 text-3xl font-black text-amber-900">{summary.open || 0}</div></div>
          <div className="rounded-3xl bg-sky-50 p-4"><div className="text-xs font-black text-sky-700">DITANGANI</div><div className="mt-2 text-3xl font-black text-sky-900">{summary.handled || 0}</div></div>
          <div className="rounded-3xl bg-emerald-50 p-4"><div className="text-xs font-black text-emerald-700">SELESAI</div><div className="mt-2 text-3xl font-black text-emerald-900">{summary.closed || 0}</div></div>
        </section>

        {notice ? <div className="rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-800">{notice}</div> : null}

        <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <aside className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black outline-none">
                  <option value="all">Semua Status</option>
                  <option value="Open">Open</option>
                  <option value="Ditangani">Ditangani</option>
                  <option value="Selesai">Selesai</option>
                </select>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, kode, perusahaan" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none" />
              </div>
            </div>
            <div className="max-h-[68vh] overflow-y-auto p-3">
              {loading && threads.length === 0 ? (
                <div className="p-6 text-center text-sm font-bold text-slate-400">Memuat inbox...</div>
              ) : filteredThreads.length === 0 ? (
                <div className="p-6 text-center text-sm font-bold text-slate-400">Belum ada tiket support.</div>
              ) : (
                <div className="space-y-2">
                  {filteredThreads.map((item: any) => {
                    const active = clean(selected?.ticket_id) === clean(item.ticket_id);
                    const unread = Number(item.unread_admin || 0);
                    return (
                      <button key={item.ticket_id} type="button" onClick={() => openThread(item)} className={`w-full rounded-2xl border p-4 text-left ${active ? "border-indigo-200 bg-indigo-50" : "border-slate-100 bg-white"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black">{item.actor_name || "Pengguna Wellness"}</div>
                            <div className="mt-1 text-[11px] font-bold text-slate-500">{item.actor_type} · {item.actor_code || "-"}</div>
                          </div>
                          {unread > 0 ? <span className="rounded-full bg-rose-500 px-2.5 py-1 text-[10px] font-black text-white">{unread}</span> : null}
                        </div>
                        <div className="mt-2 line-clamp-2 text-xs font-bold leading-5 text-slate-500">{item.last_message || "Belum ada pesan"}</div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${statusTone(item.status)}`}>{item.status || "Open"}</span>
                          <span className="text-[10px] font-bold text-slate-400">{formatTime(item.updated_at)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            {!selected ? (
              <div className="flex min-h-[560px] items-center justify-center p-8 text-center">
                <div><div className="text-5xl">🛠️</div><div className="mt-4 text-xl font-black">Pilih tiket support</div><p className="mt-2 text-sm font-bold text-slate-500">Pilih percakapan di sebelah kiri untuk melihat detail.</p></div>
              </div>
            ) : (
              <div className="grid min-h-[560px] grid-rows-[auto_1fr_auto]">
                <div className="border-b border-slate-100 p-4 md:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-lg font-black">{selected.actor_name}</div>
                      <div className="mt-1 text-xs font-bold leading-5 text-slate-500">{selected.actor_type} · {selected.actor_code || "-"} · {selected.company || "-"} · {selected.kelompok || "-"}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {["Open", "Ditangani", "Selesai"].map((item) => (
                        <button key={item} type="button" onClick={() => updateStatus(item)} className={`rounded-full px-3 py-2 text-[11px] font-black ${clean(selected.status) === item ? statusTone(item) : "bg-slate-100 text-slate-600"}`}>{item}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="max-h-[56vh] overflow-y-auto bg-slate-50 p-4 md:p-5">
                  <div className="space-y-3">
                    {messages.map((item: any) => {
                      const adminMessage = clean(item.sender_type) === "admin";
                      return (
                        <div key={item.message_id} className={`flex ${adminMessage ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[88%] rounded-3xl px-4 py-3 ${adminMessage ? "rounded-br-md bg-indigo-600 text-white" : "rounded-bl-md border border-slate-100 bg-white"}`}>
                            <div className={`text-[11px] font-black ${adminMessage ? "text-white/70" : "text-slate-400"}`}>{adminMessage ? "Admin" : item.sender_name}</div>
                            {clean(item.message) ? <div className="mt-1 whitespace-pre-wrap break-words text-sm font-bold leading-6">{item.message}</div> : null}
                            <Attachment message={item} />
                            <div className={`mt-2 text-right text-[10px] font-bold ${adminMessage ? "text-white/65" : "text-slate-400"}`}>{formatTime(item.created_at)}{adminMessage ? ` · ${item.read_by_user_at ? "Sudah dibaca" : "Terkirim"}` : ""}</div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={endRef} />
                  </div>
                </div>

                <div className="border-t border-slate-100 p-4 md:p-5">
                  {attachment ? (
                    <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3"><div className="min-w-0"><div className="truncate text-xs font-black">{attachment.name}</div><div className="mt-1 text-[11px] font-bold text-slate-500">{formatSupportBytes(attachment.size)}</div></div><button onClick={() => setAttachment(null)} className="rounded-full bg-white px-3 py-2 text-xs font-black text-rose-600">Hapus</button></div>
                  ) : null}
                  <textarea value={text} onChange={(event) => setText(event.target.value.slice(0, 2000))} rows={3} placeholder="Balas kendala teknis..." className="w-full resize-none rounded-3xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(event) => chooseFile(event.target.files?.[0] || null)} /><button onClick={() => fileRef.current?.click()} className="rounded-2xl bg-slate-100 px-4 py-3 text-xs font-black">📎 Upload</button></div>
                    <button disabled={sending} onClick={sendReply} className="rounded-2xl bg-indigo-600 px-5 py-3 text-xs font-black text-white disabled:opacity-60">{sending ? "Mengirim..." : "Kirim Balasan"}</button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
