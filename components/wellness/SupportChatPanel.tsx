"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatSupportBytes,
  prepareSupportAttachment,
  uploadSupportAttachment,
} from "@/components/wellness/supportFiles";

// WELLNESS_SUPPORT_CHAT_FULLSCREEN_V62
// WELLNESS_COMPANY_SUPPORT_CHAT_CONTEXT_V78
// WELLNESS_SUPPORT_ALL_ROLE_CONTEXT_V79F
// Full-screen technical support workspace for mobile WebView.
// Storage and network behavior remain unchanged: Google Sheet/Drive, manual refresh, latest 30 messages.

type SupportChatPanelProps = {
  actorType: "participant" | "coach" | "company";
  onClose?: () => void;
};

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

function friendlyNotice(value: any) {
  const text = clean(value);
  if (!text) return "";
  if (/no row data supplied/i.test(text)) {
    return "Belum ada percakapan. Kirim pesan pertama atau tekan Refresh.";
  }
  if (/network error/i.test(text)) {
    return "Koneksi tidak stabil. Periksa internet lalu tekan Refresh.";
  }
  return text;
}

function statusTone(status: string) {
  if (status === "Selesai") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "Ditangani") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function AttachmentView({ message }: { message: any }) {
  const url = clean(message.attachment_url || message.attachmentUrl);
  const preview = clean(
    message.attachment_preview_url || message.attachmentPreviewUrl || url
  );
  const type = clean(message.attachment_type || message.attachmentType).toLowerCase();
  const name = clean(message.attachment_name || message.attachmentName) || "Attachment";
  const size = Number(message.attachment_size || message.attachmentSize || 0);
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 block overflow-hidden rounded-2xl border border-black/5 bg-white/90"
    >
      {type.startsWith("image/") ? (
        <img
          src={preview}
          alt={name}
          loading="lazy"
          className="max-h-52 w-full object-cover"
        />
      ) : (
        <div className="flex items-center gap-3 p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-lg">
            📄
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-900">{name}</div>
            <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
              {formatSupportBytes(size)}
            </div>
          </div>
        </div>
      )}
    </a>
  );
}

export default function SupportChatPanel({
  actorType,
  onClose,
}: SupportChatPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [thread, setThread] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  async function loadMessages(options?: { quiet?: boolean }) {
    if (!options?.quiet) setLoading(true);
    const result = await fetch("/api/wellness/support?mode=messages&limit=30", {
      cache: "no-store",
      headers: { "x-wellness-actor-context": actorType },
    })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      setThread(result.thread || null);
      setMessages(result.messages || []);
      setNotice("");
      window.setTimeout(
        () => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
        80
      );
    } else {
      setNotice(friendlyNotice(result.message || "Chat with Admin belum dapat dimuat."));
    }
    setLoading(false);
  }

  useEffect(() => {
    setMounted(true);
    loadMessages();
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mounted, onClose]);

  async function chooseFile(file: File | null) {
    if (!file) return;
    try {
      setNotice("Menyiapkan attachment hemat data...");
      const prepared = await prepareSupportAttachment(file);
      setAttachment(prepared);
      setNotice(
        prepared.type.startsWith("image/")
          ? `Foto dikompres menjadi ${formatSupportBytes(prepared.size)}.`
          : `Dokumen siap dikirim (${formatSupportBytes(prepared.size)}).`
      );
    } catch (error: any) {
      setAttachment(null);
      setNotice(friendlyNotice(error?.message || "Attachment tidak dapat diproses."));
    }
  }

  async function sendMessage() {
    if (!clean(text) && !attachment) {
      setNotice("Tulis pesan atau pilih attachment.");
      return;
    }

    setSending(true);
    setNotice("Mengirim pesan...");
    try {
      let uploaded: any = null;
      if (attachment) {
        uploaded = await uploadSupportAttachment(
          attachment,
          clean(thread?.ticket_id || thread?.ticketId),
          actorType,
        );
      }

      const result = await fetch("/api/wellness/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wellness-actor-context": actorType,
        },
        body: JSON.stringify({
          action: "send_message",
          thread_id:
            uploaded?.thread_id || thread?.ticket_id || thread?.ticketId || "",
          message: clean(text),
          attachment: uploaded?.attachment || null,
        }),
      }).then((response) => response.json());

      if (!result.ok) throw new Error(result.message || "Pesan gagal dikirim.");
      setText("");
      setAttachment(null);
      if (fileRef.current) fileRef.current.value = "";
      setNotice("Pesan terkirim ke Admin.");
      await loadMessages({ quiet: true });
    } catch (error: any) {
      setNotice(friendlyNotice(error?.message || "Pesan gagal dikirim."));
    }
    setSending(false);
  }

  function closePanel() {
    if (onClose) {
      onClose();
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    }
  }

  const status = clean(thread?.status) || "Open";
  const contextLabel =
    actorType === "coach"
      ? "Bantuan teknis Portal Coach"
      : actorType === "company"
        ? "Bantuan teknis Portal Perusahaan"
        : "Bantuan teknis Portal Peserta";

  if (!mounted) return null;

  return createPortal(
    <section
      className="font-sans text-slate-900"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10050,
        display: "flex",
        minHeight: 0,
        flexDirection: "column",
        background: "#f8fafc",
      }}
      data-wellness-support-fullscreen="v62"
    >
      <header className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:px-4">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5">
          <button
            type="button"
            onClick={closePanel}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl font-bold text-slate-700 transition active:scale-95"
            aria-label="Kembali ke Portal"
          >
            ←
          </button>

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-lg">
            🛠️
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-base font-extrabold tracking-[-0.02em] text-slate-950 sm:text-lg">
                Chat with Admin
              </h1>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone(
                  status
                )}`}
              >
                {status}
              </span>
            </div>
            <p className="truncate text-[11px] font-medium text-slate-500 sm:text-xs">
              {contextLabel} · 30 pesan terakhir
            </p>
          </div>

          <button
            type="button"
            onClick={() => loadMessages()}
            disabled={loading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-sm transition active:scale-95 disabled:opacity-50"
            aria-label="Refresh percakapan"
          >
            ↻
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
          <div className="mx-auto max-w-3xl">
            {loading ? (
              <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
                <p className="mt-3 text-sm font-semibold text-slate-500">Memuat percakapan...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex min-h-[42vh] flex-col items-center justify-center px-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-3xl">
                  💬
                </div>
                <h2 className="mt-4 text-lg font-extrabold tracking-tight text-slate-950">
                  Mulai percakapan dengan Admin
                </h2>
                <p className="mt-2 max-w-sm text-sm font-medium leading-6 text-slate-500">
                  Jelaskan kendala, perangkat yang digunakan, dan langkah sebelum masalah terjadi.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((item: any) => {
                  const mine = clean(item.sender_type || item.senderType) === actorType;
                  const readAt = clean(item.read_by_admin_at || item.readByAdminAt);
                  return (
                    <div
                      key={item.message_id || item.messageId}
                      className={`flex ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[78%] ${
                          mine
                            ? "rounded-br-md bg-indigo-600 text-white"
                            : "rounded-bl-md border border-slate-200 bg-white text-slate-900"
                        }`}
                      >
                        <div
                          className={`text-[10px] font-bold uppercase tracking-wide ${
                            mine ? "text-white/65" : "text-slate-400"
                          }`}
                        >
                          {mine
                            ? "Anda"
                            : clean(item.sender_name || item.senderName) || "Admin"}
                        </div>
                        {clean(item.message) ? (
                          <div className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-5">
                            {item.message}
                          </div>
                        ) : null}
                        <AttachmentView message={item} />
                        <div
                          className={`mt-1.5 flex flex-wrap items-center justify-end gap-2 text-[9px] font-medium ${
                            mine ? "text-white/60" : "text-slate-400"
                          }`}
                        >
                          <span>{formatTime(item.created_at || item.createdAt)}</span>
                          {mine ? <span>{readAt ? "Dibaca Admin" : "Terkirim"}</span> : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
            )}
          </div>
        </div>

        <footer
          className="shrink-0 border-t border-slate-200 bg-white px-3 pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] sm:px-4"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto max-w-3xl">
            {notice ? (
              <div className="mb-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-[11px] font-semibold leading-4 text-indigo-800">
                {friendlyNotice(notice)}
              </div>
            ) : null}

            {attachment ? (
              <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-slate-900">{attachment.name}</div>
                  <div className="mt-0.5 text-[10px] font-medium text-slate-500">
                    {formatSupportBytes(attachment.size)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAttachment(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-rose-600"
                >
                  Hapus
                </button>
              </div>
            ) : null}

            <textarea
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 2000))}
              rows={2}
              placeholder="Tulis kendala teknis..."
              className="max-h-28 min-h-[58px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-medium leading-5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
            />

            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(event) => chooseFile(event.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-10 items-center gap-2 rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-700 transition active:scale-95"
                >
                  <span>📎</span>
                  <span>Foto/PDF</span>
                </button>
                <span className="hidden truncate text-[10px] font-medium text-slate-400 sm:block">
                  Foto dikompres otomatis
                </span>
              </div>

              <button
                type="button"
                disabled={sending || (!clean(text) && !attachment)}
                onClick={sendMessage}
                className="h-10 shrink-0 rounded-xl bg-indigo-600 px-5 text-xs font-extrabold text-white shadow-md shadow-indigo-100 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending ? "Mengirim..." : "Kirim"}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </section>,
    document.body
  );
}
