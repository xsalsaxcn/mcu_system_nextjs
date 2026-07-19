"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatSupportBytes,
  prepareSupportAttachment,
  uploadSupportAttachment,
} from "@/components/wellness/supportFiles";

// WELLNESS_SUPPORT_ADMIN_DIRECT_INBOX_V79Q
// WELLNESS_SUPPORT_GOOGLE_SHEET_HEADERS_V79Q5
// WELLNESS_SUPPORT_ADMIN_CONTEXT_EXACT_V79R2
// Compact WhatsApp-style inbox. No Wellness menu card or oversized hero.

function clean(value: any) {
  return String(value ?? "").trim();
}

function pick(item: any, keys: string[], fallback: any = "") {
  for (const key of keys) {
    if (item?.[key] !== undefined && item?.[key] !== null) return item[key];
  }
  return fallback;
}

function normalizeThread(item: any) {
  const ticketId = clean(pick(item, ["ticket_id", "ticketId", "thread_id", "threadId", "id", "Ticket ID"]));
  return {
    ...item,
    ticket_id: ticketId,
    actor_type: clean(pick(item, ["actor_type", "actorType", "role", "Actor Type"])),
    actor_name: clean(pick(item, ["actor_name", "actorName", "name", "Actor Name"])) || "Pengguna Wellness",
    actor_code: clean(pick(item, ["actor_code", "actorCode", "code", "Actor Code"])),
    company: clean(pick(item, ["company", "company_name", "companyName", "actorCompany", "Company"])) || "-",
    kelompok: clean(pick(item, ["kelompok", "group", "group_name", "groupName", "actorGroup", "Kelompok"])),
    last_message: clean(pick(item, ["last_message", "lastMessage", "message", "Last Message"])),
    updated_at: clean(pick(item, ["updated_at", "updatedAt", "last_message_at", "lastMessageAt", "created_at", "Updated At", "Created At"])),
    unread_admin: Math.max(0, Number(pick(item, ["unread_admin", "unreadAdmin", "adminUnread", "Unread Admin"], 0)) || 0),
    status: clean(pick(item, ["status", "Status"], "Open")) || "Open",
  };
}

function normalizeMessage(item: any) {
  return {
    ...item,
    message_id: clean(pick(item, ["message_id", "messageId", "id", "Message ID"])),
    sender_type: clean(pick(item, ["sender_type", "senderType", "Sender Type"])),
    sender_name: clean(pick(item, ["sender_name", "senderName", "name", "Sender Name"])),
    message: clean(pick(item, ["message", "text", "body", "Message"])),
    created_at: clean(pick(item, ["created_at", "createdAt", "timestamp", "Created At"])),
    attachment_url: clean(pick(item, ["attachment_url", "attachmentUrl", "Attachment URL"])),
    attachment_preview_url: clean(pick(item, ["attachment_preview_url", "attachmentPreviewUrl", "attachment_url", "attachmentUrl", "Attachment Preview URL", "Attachment URL"])),
    attachment_name: clean(pick(item, ["attachment_name", "attachmentName", "Attachment Name"])),
    attachment_type: clean(pick(item, ["attachment_type", "attachmentType", "Attachment Type"])),
    attachment_size: Number(pick(item, ["attachment_size", "attachmentSize", "Attachment Size"], 0)) || 0,
    read_by_user_at: clean(pick(item, ["read_by_user_at", "readByUserAt", "Read By User At"])),
  };
}

function formatTime(value: any) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat("id-ID", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short" }
  ).format(date);
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

function messageIdentity(item: any) {
  return (
    clean(item?.message_id || item?.messageId) ||
    [
      clean(item?.created_at || item?.createdAt),
      clean(item?.sender_type || item?.senderType),
      clean(item?.message),
      clean(item?.attachment_url || item?.attachmentUrl),
    ].join("|")
  );
}

function mergeMessages(current: any[], incoming: any[]) {
  const map = new Map<string, any>();
  for (const item of [...(current || []), ...(incoming || [])]) {
    const key = messageIdentity(item);
    if (!key) continue;
    const previous = map.get(key);
    map.set(key, previous ? { ...previous, ...item } : item);
  }
  return Array.from(map.values()).sort((left, right) =>
    clean(left?.created_at || left?.createdAt).localeCompare(
      clean(right?.created_at || right?.createdAt),
    ),
  );
}

function Attachment({ message }: { message: any }) {
  const url = clean(message.attachment_url);
  if (!url) return null;
  const preview = clean(message.attachment_preview_url || url);
  const type = clean(message.attachment_type).toLowerCase();
  const name = clean(message.attachment_name) || "Attachment";
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-xl border border-slate-100 bg-white">
      {type.startsWith("image/") ? (
        <img src={preview} alt={name} loading="lazy" className="max-h-56 w-full object-cover" />
      ) : (
        <div className="flex items-center gap-3 p-3">
          <div className="text-2xl">📄</div>
          <div className="min-w-0"><div className="truncate text-sm font-black">{name}</div><div className="text-[10px] font-bold text-slate-500">{formatSupportBytes(message.attachment_size || 0)}</div></div>
        </div>
      )}
    </a>
  );
}

export default function WellnessSupportAdminPage() {
  const cached = useMemo(() => cacheRead("wellness-support-admin-inbox-v79q"), []);
  const [threads, setThreads] = useState<any[]>((cached?.threads || []).map(normalizeThread));
  const [summary, setSummary] = useState<any>(cached?.summary || {});
  const [selected, setSelected] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(!cached?.threads?.length);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  async function loadThreads(options?: { quiet?: boolean }) {
    if (!options?.quiet && threads.length === 0) setLoadingThreads(true);
    const params = new URLSearchParams({ mode: "threads", status, limit: "80", actor_context: "admin" });
    const result = await fetch(`/api/wellness/support?${params}`, {
      cache: "no-store",
      credentials: "include",
      headers: { "x-wellness-actor-context": "admin" },
    })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      const nextThreads = (result.threads || result.items || result.rows || [])
        .map(normalizeThread)
        .filter((item: any) => item.ticket_id);
      const nextSummary = result.summary || {};
      setThreads(nextThreads);
      setSummary(nextSummary);
      cacheWrite("wellness-support-admin-inbox-v79q", { threads: nextThreads, summary: nextSummary });
      setNotice("");
      if (selected) {
        const fresh = nextThreads.find((item: any) => item.ticket_id === selected.ticket_id);
        if (fresh) setSelected((current: any) => ({ ...current, ...fresh }));
      }
    } else if (!options?.quiet) {
      setNotice(result.message || "Inbox support tidak dapat dimuat.");
    }
    setLoadingThreads(false);
  }

  async function openThread(rawItem: any, options?: { quiet?: boolean }) {
    const item = normalizeThread(rawItem);
    if (!item.ticket_id) return;
    setSelected(item);
    const cache = cacheRead(`wellness-support-thread-v79q:${item.ticket_id}`);
    if (cache?.messages?.length) setMessages(cache.messages.map(normalizeMessage));
    if (!options?.quiet && !cache?.messages?.length) setLoadingMessages(true);

    const result = await fetch(`/api/wellness/support?mode=messages&thread_id=${encodeURIComponent(item.ticket_id)}&limit=60&actor_context=admin`, {
      cache: "no-store",
      credentials: "include",
      headers: { "x-wellness-actor-context": "admin" },
    })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      const nextThread = normalizeThread(result.thread || item);
      const incomingMessages = (result.messages || []).map(normalizeMessage);
      setSelected(nextThread);
      setMessages((current) => {
        const nextMessages = mergeMessages(current, incomingMessages);
        cacheWrite(`wellness-support-thread-v79q:${item.ticket_id}`, {
          thread: nextThread,
          messages: nextMessages,
        });
        return nextMessages;
      });
      setThreads((current) =>
        current.map((thread) =>
          thread.ticket_id === item.ticket_id
            ? { ...thread, ...nextThread, unread_admin: 0 }
            : thread,
        ),
      );
      window.setTimeout(() =>
        endRef.current?.scrollIntoView({
          behavior: options?.quiet ? "auto" : "smooth",
        }), 30);
    } else if (!options?.quiet) {
      setNotice(result.message || "Percakapan tidak dapat dimuat.");
    }
    setLoadingMessages(false);
  }

  useEffect(() => { void loadThreads(); }, [status]);

  // WELLNESS_SUPPORT_ADMIN_STAGGERED_POLLING_V82
  // Avoid sending the thread-list and message requests together every six
  // seconds. Staggered polling reduces Google Apps Script queueing and keeps
  // cached messages visible while refresh runs in the background.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !sending) {
        void loadThreads({ quiet: true });
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, [status, sending]);

  useEffect(() => {
    if (!selected?.ticket_id) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !sending) {
        void openThread(selected, { quiet: true });
      }
    }, 8000);
    return () => window.clearInterval(timer);
  }, [selected?.ticket_id, sending]);

  const filteredThreads = useMemo(() => {
    const q = clean(query).toLowerCase();
    if (!q) return threads;
    return threads.filter((item) =>
      [item.actor_name, item.actor_code, item.company, item.kelompok, item.last_message]
        .map((value) => clean(value).toLowerCase()).join(" ").includes(q),
    );
  }, [threads, query]);

  async function chooseFile(file: File | null) {
    if (!file) return;
    try {
      const prepared = await prepareSupportAttachment(file);
      setAttachment(prepared);
      setNotice(`Attachment siap (${formatSupportBytes(prepared.size)}).`);
    } catch (error: any) {
      setNotice(error?.message || "Attachment gagal diproses.");
    }
  }

  async function sendReply() {
    const ticketId = clean(selected?.ticket_id);
    const messageText = clean(text);
    if (!ticketId || (!messageText && !attachment)) return;
    const optimisticId = `local-${Date.now()}`;
    const optimistic = normalizeMessage({ message_id: optimisticId, created_at: new Date().toISOString(), sender_type: "admin", sender_name: "Admin", message: messageText, optimistic: true });
    setText("");
    setSending(true);
    setMessages((current) => [...current, optimistic]);
    try {
      let uploaded: any = null;
      if (attachment) uploaded = await uploadSupportAttachment(attachment, ticketId);
      const result = await fetch("/api/wellness/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wellness-actor-context": "admin",
        },
        credentials: "include",
        body: JSON.stringify({ action: "send_message", thread_id: ticketId, message: messageText, attachment: uploaded?.attachment || null }),
      }).then((response) => response.json());
      if (!result.ok) throw new Error(result.message || "Balasan gagal dikirim.");
      setMessages((current) => current.map((item) => item.message_id === optimisticId ? normalizeMessage(result.message || { ...optimistic, optimistic: false }) : item));
      setAttachment(null);
      if (fileRef.current) fileRef.current.value = "";
      setNotice("");
    } catch (error: any) {
      setMessages((current) => current.map((item) => item.message_id === optimisticId ? { ...item, optimistic: false, failed: true } : item));
      setNotice(error?.message || "Balasan gagal dikirim.");
    } finally {
      setSending(false);
    }
  }

  async function updateStatus(nextStatus: string) {
    if (!selected?.ticket_id) return;
    const result = await fetch("/api/wellness/support", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wellness-actor-context": "admin",
      },
      credentials: "include",
      body: JSON.stringify({ action: "update_status", thread_id: selected.ticket_id, status: nextStatus }),
    }).then((response) => response.json());
    if (result.ok) {
      setSelected(normalizeThread(result.thread || { ...selected, status: nextStatus }));
      void loadThreads({ quiet: true });
    }
  }

  const unreadTotal = Math.max(0, Number(summary.unread ?? summary.unread_admin ?? summary.unreadAdmin ?? threads.reduce((sum, item) => sum + Number(item.unread_admin || 0), 0)) || 0);

  return (
    <main className="min-h-screen bg-[#f7f9fb] text-slate-950">
      <div className="mx-auto w-full max-w-6xl px-0 py-0 sm:px-4 sm:py-4">
        <header className={`${selected ? "hidden lg:flex" : "flex"} sticky top-0 z-30 items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:rounded-t-2xl sm:border`}>
          <div><div className="text-[9px] font-black uppercase tracking-[0.15em] text-indigo-600">Admin Support</div><h1 className="mt-0.5 text-lg font-black">Percakapan</h1></div>
          <div className="flex items-center gap-2">{unreadTotal > 0 ? <span className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-black text-white">{unreadTotal > 99 ? "99+" : unreadTotal}</span> : null}<button onClick={() => void loadThreads()} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg" aria-label="Refresh inbox">↻</button><button onClick={() => setMenuOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-lg font-black text-white" aria-label="Buka menu admin">☰</button></div>
        </header>

        {notice ? <div className="mx-3 mt-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-800 sm:mx-0">{notice}</div> : null}

        <section className="grid min-h-[calc(100vh-4.5rem)] bg-white lg:grid-cols-[360px_1fr] lg:overflow-hidden lg:rounded-b-2xl lg:border lg:border-t-0 lg:border-slate-200">
          <aside className={`${selected ? "hidden lg:block" : "block"} border-r border-slate-100 bg-white`}>
            <div className="border-b border-slate-100 p-3">
              <div className="flex gap-2 overflow-x-auto pb-1">{[["all","Semua"],["Open","Open"],["Ditangani","Ditangani"],["Selesai","Selesai"]].map(([value,label]) => <button key={value} onClick={() => setStatus(value)} className={`shrink-0 rounded-full px-3 py-2 text-[10px] font-black ${status === value ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>{label}</button>)}</div>
              <div className="relative mt-2"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">🔍</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama atau perusahaan" className="h-11 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm font-semibold outline-none focus:border-indigo-400" /></div>
            </div>

            <div className="max-h-[calc(100vh-10rem)] divide-y divide-slate-100 overflow-y-auto">
              {loadingThreads && threads.length === 0 ? <div className="p-10 text-center text-sm font-bold text-slate-400">Memuat percakapan...</div> : filteredThreads.length === 0 ? <div className="p-10 text-center"><div className="text-4xl">💬</div><div className="mt-3 text-sm font-black">Belum ada percakapan</div><div className="mt-1 text-xs font-bold text-slate-500">Data pesan terdeteksi tetapi format daftar belum terbaca. Setelah V79Q5, nama pengirim akan muncul di sini.</div></div> : filteredThreads.map((item) => {
                const unread = Number(item.unread_admin || 0);
                return <button key={item.ticket_id} type="button" onClick={() => void openThread(item)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-sm font-black text-white">{initials(item.actor_name)}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className={`min-w-0 break-words text-sm leading-5 ${unread ? "font-black" : "font-bold"}`}>{item.actor_name}</div><div className={`shrink-0 text-[10px] font-bold ${unread ? "text-teal-700" : "text-slate-400"}`}>{formatTime(item.updated_at)}</div></div><div className="mt-0.5 truncate text-[10px] font-bold text-slate-400">{roleLabel(item.actor_type)} · {item.company}{item.kelompok ? ` · ${item.kelompok}` : ""}</div><div className="mt-1 flex items-center justify-between gap-2"><div className={`min-w-0 truncate text-xs ${unread ? "font-bold text-slate-800" : "font-semibold text-slate-500"}`}>{item.last_message || "Belum ada pesan"}</div>{unread ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-600 px-1.5 text-[10px] font-black text-white">{unread}</span> : null}</div></div></button>;
              })}
            </div>
          </aside>

          <section className={`${selected ? "block" : "hidden lg:block"} bg-white`}>
            {!selected ? <div className="flex min-h-[600px] items-center justify-center text-center"><div><div className="text-5xl">💬</div><div className="mt-4 text-lg font-black">Pilih percakapan</div><div className="mt-1 text-sm font-bold text-slate-500">Klik nama untuk membuka pesan.</div></div></div> : <div className="grid min-h-[calc(100vh-3.5rem)] grid-rows-[auto_1fr_auto]">
              <div className="sticky top-0 z-20 border-b border-slate-100 bg-white px-3 py-2.5"><div className="flex items-center gap-3"><button onClick={() => { setSelected(null); setMessages([]); }} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg font-black lg:hidden">←</button><div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-xs font-black text-white">{initials(selected.actor_name)}</div><div className="min-w-0 flex-1"><div className="break-words text-sm font-black">{selected.actor_name}</div><div className="truncate text-[10px] font-bold text-slate-500">{roleLabel(selected.actor_type)} · {selected.company}{selected.kelompok ? ` · ${selected.kelompok}` : ""}</div></div><button onClick={() => void openThread(selected)} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">↻</button></div><div className="mt-2 flex gap-2 overflow-x-auto">{["Open","Ditangani","Selesai"].map((item) => <button key={item} onClick={() => void updateStatus(item)} className={`rounded-full px-3 py-1.5 text-[9px] font-black ${selected.status === item ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>{item}</button>)}</div></div>
              <div className="max-h-[calc(100vh-12rem)] overflow-y-auto bg-[#efeae2] px-3 py-4">{loadingMessages && messages.length === 0 ? <div className="py-16 text-center text-sm font-bold text-slate-400">Memuat pesan...</div> : <div className="space-y-2">{messages.map((item) => { const admin = item.sender_type === "admin"; return <div key={item.message_id || `${item.created_at}-${item.message}`} className={`flex ${admin ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-lg px-3 py-2 shadow-sm ${admin ? "rounded-br-sm bg-[#d9fdd3]" : "rounded-bl-sm bg-white"}`}><div className="whitespace-pre-wrap break-words text-[13px] font-semibold leading-5">{item.message}</div><Attachment message={item} /><div className="mt-1 text-right text-[9px] font-bold text-slate-400">{formatTime(item.created_at)}{admin ? ` · ${item.failed ? "Gagal" : item.optimistic ? "Mengirim..." : item.read_by_user_at ? "Dibaca" : "Terkirim"}` : ""}</div></div></div>; })}<div ref={endRef} /></div>}</div>
              <div className="border-t border-slate-100 bg-white p-2.5">{attachment ? <div className="mb-2 flex items-center justify-between rounded-xl bg-slate-50 p-2"><div className="min-w-0 truncate text-xs font-black">{attachment.name}</div><button onClick={() => setAttachment(null)} className="text-xs font-black text-rose-600">Hapus</button></div> : null}<div className="flex items-end gap-2"><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(event) => void chooseFile(event.target.files?.[0] || null)} /><button onClick={() => fileRef.current?.click()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100">📎</button><textarea value={text} onChange={(event) => setText(event.target.value.slice(0, 2000))} rows={1} placeholder="Tulis pesan..." className="max-h-28 min-h-[44px] flex-1 resize-none rounded-[1.35rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-indigo-400" /><button disabled={sending || (!clean(text) && !attachment)} onClick={() => void sendReply()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white disabled:opacity-40">➤</button></div></div>
            </div>}
          </section>
        </section>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-[120]">
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-slate-950/55"
          />
          <aside className="absolute bottom-2 right-2 top-2 flex w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-[1.8rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 bg-gradient-to-br from-slate-950 via-blue-900 to-teal-600 p-5 text-white">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/65">
                  Harmony Health
                </div>
                <div className="mt-1 text-xl font-black">Menu Admin</div>
                <div className="mt-1 text-xs font-bold text-white/75">
                  Admin Support
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-full bg-white/15 px-3 py-2 text-xs font-black"
              >
                Tutup
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-3">
              {[
                ["🏠", "Portal Admin", "/wellness/admin"],
                ["💬", "Admin Support", "/wellness/support-admin"],
                ["🍽️", "Master Nutrisi", "/wellness/master"],
                ["⚙️", "Setting Wellness", "/wellness/settings"],
                ["📥", "Import Peserta", "/wellness/import"],
                ["🔗", "Signup Peserta", "/wellness/signup"],
              ].map(([icon, label, href]) => (
                <a
                  key={href}
                  href={href}
                  className="mb-2 flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left shadow-sm"
                >
                  <span className="text-xl">{icon}</span>
                  <span className="text-sm font-black text-slate-800">{label}</span>
                </a>
              ))}
              <div className="my-3 border-t border-slate-200" />
              <a
                href="/wellness/dashboard"
                className="mb-2 block rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-800"
              >
                Wellness Management
              </a>
              <a
                href="/dashboard"
                className="block rounded-2xl bg-slate-200 px-4 py-3 text-sm font-black text-slate-800"
              >
                Dashboard Operasional
              </a>
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
