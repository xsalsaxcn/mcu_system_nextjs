"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import WellnessQuickNav from "@/components/wellness/WellnessQuickNav";
import {
  formatSupportBytes,
  prepareSupportAttachment,
  uploadSupportAttachment,
} from "@/components/wellness/supportFiles";

// WELLNESS_SUPPORT_ADMIN_WHATSAPP_INBOX_V79P
// Mobile shows the conversation list first; opening a name shows the thread.

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

function initials(value: any) {
  const parts = clean(value).split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((item) => item[0]).join("") || "U").toUpperCase();
}

function roleLabel(value: any) {
  const role = clean(value).toLowerCase();
  if (role === "participant") return "Peserta";
  if (role === "coach") return "Coach";
  if (role === "company") return "Perusahaan";
  return role || "Pengguna";
}

function statusTone(status: string) {
  if (status === "Selesai") return "bg-emerald-100 text-emerald-800";
  if (status === "Ditangani") return "bg-sky-100 text-sky-800";
  return "bg-amber-100 text-amber-800";
}

function cacheRead(key: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function cacheWrite(key: string, value: any) {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function Attachment({ message }: { message: any }) {
  const url = clean(message.attachment_url || message.attachmentUrl);
  const preview = clean(message.attachment_preview_url || message.attachmentPreviewUrl || url);
  const type = clean(message.attachment_type || message.attachmentType).toLowerCase();
  const name = clean(message.attachment_name || message.attachmentName) || "Attachment";
  const size = Number(message.attachment_size || message.attachmentSize || 0);
  if (!url) return null;

  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-2xl border border-slate-100 bg-white">
      {type.startsWith("image/") ? (
        <img src={preview} alt={name} loading="lazy" className="max-h-56 w-full object-cover" />
      ) : (
        <div className="flex items-center gap-3 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-xl">📄</div>
          <div className="min-w-0"><div className="truncate text-sm font-black">{name}</div><div className="mt-1 text-xs font-bold text-slate-500">{formatSupportBytes(size)}</div></div>
        </div>
      )}
    </a>
  );
}

export default function WellnessSupportAdminPage() {
  const cachedInbox = useMemo(() => cacheRead("wellness-support-admin-inbox-v79p"), []);
  const [threads, setThreads] = useState<any[]>(cachedInbox?.threads || []);
  const [summary, setSummary] = useState<any>(cachedInbox?.summary || {});
  const [selected, setSelected] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(!cachedInbox?.threads?.length);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  async function loadThreads(options?: { quiet?: boolean }) {
    if (!options?.quiet && threads.length === 0) setLoadingThreads(true);
    const params = new URLSearchParams({ mode: "threads", status, limit: "80" });
    const result = await fetch(`/api/wellness/support?${params.toString()}`, { cache: "no-store" })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      const nextThreads = result.threads || [];
      const nextSummary = result.summary || {};
      setThreads(nextThreads);
      setSummary(nextSummary);
      cacheWrite("wellness-support-admin-inbox-v79p", { threads: nextThreads, summary: nextSummary });
      setNotice("");
      if (selected) {
        const fresh = nextThreads.find((item: any) => clean(item.ticket_id) === clean(selected.ticket_id));
        if (fresh) setSelected((current: any) => ({ ...current, ...fresh }));
      }
    } else if (!options?.quiet) {
      setNotice(result.message || "Inbox support tidak dapat dimuat.");
    }
    setLoadingThreads(false);
  }

  async function openThread(item: any, options?: { quiet?: boolean }) {
    const ticketId = clean(item.ticket_id || item.ticketId);
    if (!ticketId) return;
    setSelected(item);

    const cache = cacheRead(`wellness-support-thread-v79p:${ticketId}`);
    if (cache?.messages?.length && messages.length === 0) setMessages(cache.messages);
    if (!options?.quiet && !cache?.messages?.length) setLoadingMessages(true);

    const result = await fetch(`/api/wellness/support?mode=messages&thread_id=${encodeURIComponent(ticketId)}&limit=60`, { cache: "no-store" })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      const nextThread = result.thread || item;
      const nextMessages = result.messages || [];
      setSelected(nextThread);
      setMessages(nextMessages);
      cacheWrite(`wellness-support-thread-v79p:${ticketId}`, { thread: nextThread, messages: nextMessages });
      setThreads((current) => current.map((thread) => clean(thread.ticket_id) === ticketId ? { ...thread, ...nextThread, unread_admin: 0 } : thread));
      window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: options?.quiet ? "auto" : "smooth" }), 30);
      void loadThreads({ quiet: true });
    } else if (!options?.quiet) {
      setNotice(result.message || "Percakapan tidak dapat dimuat.");
    }
    setLoadingMessages(false);
  }

  useEffect(() => { void loadThreads(); }, [status]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || sending) return;
      void loadThreads({ quiet: true });
      if (selected) void openThread(selected, { quiet: true });
    }, 8000);
    return () => window.clearInterval(timer);
  }, [status, selected?.ticket_id, sending]);

  const filteredThreads = useMemo(() => {
    const q = clean(query).toLowerCase();
    if (!q) return threads;
    return threads.filter((item: any) =>
      [item.actor_name, item.actor_code, item.company, item.kelompok, item.last_message, item.ticket_id]
        .map((value) => clean(value).toLowerCase()).join(" ").includes(q),
    );
  }, [threads, query]);

  async function chooseFile(file: File | null) {
    if (!file) return;
    try {
      setNotice("Menyiapkan attachment...");
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
    const messageText = clean(text);
    if (!ticketId) return setNotice("Pilih percakapan terlebih dahulu.");
    if (!messageText && !attachment) return setNotice("Tulis balasan atau pilih attachment.");

    const optimisticId = `local-${Date.now()}`;
    const optimistic = { message_id: optimisticId, ticket_id: ticketId, created_at: new Date().toISOString(), sender_type: "admin", sender_name: "Admin", message: messageText, optimistic: true };
    setText("");
    setSending(true);
    setMessages((current) => [...current, optimistic]);
    window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 20);

    try {
      let uploaded: any = null;
      if (attachment) uploaded = await uploadSupportAttachment(attachment, ticketId);
      const result = await fetch("/api/wellness/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_message", thread_id: ticketId, message: messageText, attachment: uploaded?.attachment || null }),
      }).then((response) => response.json());
      if (!result.ok) throw new Error(result.message || "Balasan gagal dikirim.");

      setMessages((current) => current.map((item) => clean(item.message_id) === optimisticId ? (result.message || { ...optimistic, optimistic: false }) : item));
      setAttachment(null);
      if (fileRef.current) fileRef.current.value = "";
      setNotice("");
      window.setTimeout(() => void openThread(result.thread || selected, { quiet: true }), 700);
    } catch (error: any) {
      setMessages((current) => current.map((item) => clean(item.message_id) === optimisticId ? { ...item, optimistic: false, failed: true } : item));
      setNotice(error?.message || "Balasan gagal dikirim.");
    } finally {
      setSending(false);
    }
  }

  async function updateStatus(nextStatus: string) {
    const ticketId = clean(selected?.ticket_id || selected?.ticketId);
    if (!ticketId) return;
    setSelected((current: any) => ({ ...current, status: nextStatus }));
    const result = await fetch("/api/wellness/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_status", thread_id: ticketId, status: nextStatus }),
    }).then((response) => response.json());
    if (result.ok) {
      setSelected(result.thread || { ...selected, status: nextStatus });
      void loadThreads({ quiet: true });
    } else {
      setNotice(result.message || "Status gagal diubah.");
    }
  }

  const unreadTotal = Number(summary.unread || 0);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-5 md:px-8 md:py-6">
        <div className={selected ? "hidden lg:block" : "block"}><WellnessQuickNav /></div>

        <section className={`${selected ? "hidden lg:flex" : "flex"} mt-3 items-center justify-between gap-3 rounded-[1.4rem] bg-gradient-to-r from-indigo-700 to-blue-700 px-4 py-4 text-white shadow-lg lg:mt-5`}>
          <div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/65">Harmony Health Admin</div><h1 className="mt-1 text-xl font-black">Support Inbox</h1><p className="mt-1 text-xs font-bold text-white/75">Peserta, Coach, dan Perusahaan</p></div>
          <div className="flex items-center gap-2"><span className="rounded-full bg-rose-500 px-3 py-2 text-xs font-black">{unreadTotal} baru</span><button onClick={() => void loadThreads()} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg">↻</button></div>
        </section>

        {notice ? <div className="mt-3 rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-800">{notice}</div> : null}

        <section className="mt-3 grid min-h-[calc(100vh-10rem)] gap-4 lg:mt-5 lg:grid-cols-[380px_1fr]">
          <aside className={`${selected ? "hidden lg:block" : "block"} overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm`}>
            <div className="border-b border-slate-100 p-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[['all','Semua'],['Open','Open'],['Ditangani','Ditangani'],['Selesai','Selesai']].map(([value,label]) => <button key={value} onClick={() => setStatus(value)} className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-black ${status === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}
              </div>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama atau perusahaan" className="mt-2 h-11 w-full rounded-full border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-400" />
            </div>

            <div className="max-h-[calc(100vh-15rem)] divide-y divide-slate-100 overflow-y-auto">
              {loadingThreads && threads.length === 0 ? <div className="p-8 text-center text-sm font-bold text-slate-400">Memuat percakapan...</div> : filteredThreads.length === 0 ? <div className="p-8 text-center text-sm font-bold text-slate-400">Belum ada percakapan.</div> : filteredThreads.map((item: any) => {
                const unread = Number(item.unread_admin || 0);
                const active = clean(selected?.ticket_id) === clean(item.ticket_id);
                return (
                  <button key={item.ticket_id} type="button" onClick={() => void openThread(item)} className={`flex w-full items-center gap-3 px-3 py-3 text-left transition ${active ? 'bg-indigo-50' : 'bg-white active:bg-slate-50'}`}>
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-sm font-black text-white">{initials(item.actor_name)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2"><div className={`break-words text-sm leading-5 text-slate-950 ${unread > 0 ? 'font-black' : 'font-bold'}`}>{item.actor_name || 'Pengguna Wellness'}</div><div className={`shrink-0 text-[9px] font-bold ${unread > 0 ? 'text-teal-700' : 'text-slate-400'}`}>{formatTime(item.updated_at)}</div></div>
                      <div className="mt-0.5 truncate text-[10px] font-bold text-slate-400">{roleLabel(item.actor_type)} · {item.company || '-'}{item.kelompok ? ` · ${item.kelompok}` : ''}</div>
                      <div className="mt-1 flex items-center justify-between gap-2"><div className={`min-w-0 truncate text-xs ${unread > 0 ? 'font-bold text-slate-800' : 'font-semibold text-slate-500'}`}>{item.last_message || 'Belum ada pesan'}</div>{unread > 0 ? <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 px-1.5 text-[10px] font-black text-white">{unread}</span> : null}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className={`${selected ? "block" : "hidden lg:block"} overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm`}>
            {!selected ? (
              <div className="flex min-h-[560px] items-center justify-center p-8 text-center"><div><div className="text-5xl">💬</div><div className="mt-4 text-xl font-black">Pilih percakapan</div><p className="mt-2 text-sm font-bold text-slate-500">Klik nama untuk melihat pesan.</p></div></div>
            ) : (
              <div className="grid min-h-[calc(100vh-8rem)] grid-rows-[auto_1fr_auto] lg:min-h-[620px]">
                <div className="border-b border-slate-100 bg-white p-3 sm:p-4">
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => { setSelected(null); setMessages([]); }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-black lg:hidden">←</button>
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-sm font-black text-white">{initials(selected.actor_name)}</div>
                    <div className="min-w-0 flex-1"><div className="break-words text-sm font-black leading-5 sm:text-base">{selected.actor_name}</div><div className="mt-0.5 break-words text-[10px] font-bold text-slate-500">{roleLabel(selected.actor_type)} · {selected.company || '-'}{selected.kelompok ? ` · ${selected.kelompok}` : ''}</div></div>
                    <button onClick={() => void openThread(selected)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100">↻</button>
                  </div>
                  <div className="mt-3 flex gap-2 overflow-x-auto">{['Open','Ditangani','Selesai'].map((item) => <button key={item} onClick={() => void updateStatus(item)} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black ${clean(selected.status) === item ? statusTone(item) : 'bg-slate-100 text-slate-600'}`}>{item}</button>)}</div>
                </div>

                <div className="max-h-[calc(100vh-19rem)] overflow-y-auto bg-[#f3f5f9] p-3 sm:p-4 lg:max-h-[58vh]">
                  {loadingMessages && messages.length === 0 ? <div className="py-16 text-center text-sm font-bold text-slate-400">Memuat pesan...</div> : <div className="space-y-2.5">{messages.map((item: any) => {
                    const adminMessage = clean(item.sender_type) === 'admin';
                    return <div key={item.message_id} className={`flex ${adminMessage ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 shadow-sm ${adminMessage ? 'rounded-br-md bg-indigo-600 text-white' : 'rounded-bl-md border border-slate-100 bg-white text-slate-900'} ${item.optimistic ? 'opacity-80' : ''}`}><div className={`text-[10px] font-black ${adminMessage ? 'text-white/65' : 'text-slate-400'}`}>{adminMessage ? 'Admin' : item.sender_name}</div>{clean(item.message) ? <div className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-5">{item.message}</div> : null}<Attachment message={item} /><div className={`mt-1.5 text-right text-[9px] font-bold ${adminMessage ? 'text-white/60' : 'text-slate-400'}`}>{formatTime(item.created_at)}{adminMessage ? ` · ${item.failed ? 'Gagal' : item.optimistic ? 'Mengirim...' : item.read_by_user_at ? 'Dibaca' : 'Terkirim'}` : ''}</div></div></div>;
                  })}<div ref={endRef} /></div>}
                </div>

                <div className="border-t border-slate-100 bg-white p-3 sm:p-4">
                  {attachment ? <div className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-2.5"><div className="min-w-0"><div className="truncate text-xs font-black">{attachment.name}</div><div className="text-[10px] font-bold text-slate-500">{formatSupportBytes(attachment.size)}</div></div><button onClick={() => setAttachment(null)} className="text-xs font-black text-rose-600">Hapus</button></div> : null}
                  <textarea value={text} onChange={(event) => setText(event.target.value.slice(0, 2000))} rows={2} placeholder="Tulis balasan..." className="max-h-28 min-h-[54px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-400" />
                  <div className="mt-2 flex items-center justify-between gap-2"><div><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(event) => void chooseFile(event.target.files?.[0] || null)} /><button onClick={() => fileRef.current?.click()} className="h-10 rounded-xl bg-slate-100 px-3 text-xs font-black">📎 Foto/PDF</button></div><button disabled={sending || (!clean(text) && !attachment)} onClick={() => void sendReply()} className="h-10 rounded-xl bg-indigo-600 px-5 text-xs font-black text-white disabled:opacity-40">{sending ? 'Mengirim...' : 'Kirim'}</button></div>
                </div>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
