"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatSupportBytes,
  prepareSupportAttachment,
  uploadSupportAttachment,
} from "@/components/wellness/supportFiles";

// WELLNESS_SUPPORT_CHAT_PANEL_V61
// Manual refresh + last 30 messages only. No Supabase Realtime and no Supabase Storage.

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

function AttachmentView({ message }: { message: any }) {
  const url = clean(message.attachment_url || message.attachmentUrl);
  const preview = clean(message.attachment_preview_url || message.attachmentPreviewUrl || url);
  const type = clean(message.attachment_type || message.attachmentType).toLowerCase();
  const name = clean(message.attachment_name || message.attachmentName) || "Attachment";
  const size = Number(message.attachment_size || message.attachmentSize || 0);
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-3 block overflow-hidden rounded-2xl border border-black/5 bg-white/80"
    >
      {type.startsWith("image/") ? (
        <img
          src={preview}
          alt={name}
          loading="lazy"
          className="max-h-56 w-full object-cover"
        />
      ) : (
        <div className="flex items-center gap-3 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-xl">📄</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-slate-900">{name}</div>
            <div className="mt-1 text-xs font-bold text-slate-500">{formatSupportBytes(size)}</div>
          </div>
        </div>
      )}
    </a>
  );
}

export default function SupportChatPanel({ actorType }: { actorType: "participant" | "coach" }) {
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
    })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      setThread(result.thread || null);
      setMessages(result.messages || []);
      setNotice("");
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } else {
      setNotice(result.message || "Chat with Admin belum dapat dimuat.");
    }
    setLoading(false);
  }

  useEffect(() => {
    loadMessages();
  }, []);

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
      setNotice(error?.message || "Attachment tidak dapat diproses.");
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
          clean(thread?.ticket_id || thread?.ticketId)
        );
      }

      const result = await fetch("/api/wellness/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_message",
          thread_id: uploaded?.thread_id || thread?.ticket_id || thread?.ticketId || "",
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
      setNotice(error?.message || "Pesan gagal dikirim.");
    }
    setSending(false);
  }

  const title = "Chat with Admin";
  const subtitle =
    actorType === "coach"
      ? "Laporkan kendala teknis Portal Coach atau aplikasi Harmony Health."
      : "Laporkan kendala teknis Portal Peserta atau aplikasi Harmony Health.";

  return (
    <section className="overflow-hidden rounded-[2rem] border border-white bg-white shadow-xl shadow-slate-200/60">
      <div className="bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 p-5 text-white md:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Technical Support</div>
            <h2 className="mt-2 text-2xl font-black">{title}</h2>
            <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-white/85">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => loadMessages()}
            disabled={loading}
            className="rounded-full bg-white/15 px-4 py-2 text-xs font-black text-white backdrop-blur disabled:opacity-60"
          >
            {loading ? "Memuat..." : "Refresh"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-black">
          <span className={`rounded-full px-3 py-1.5 ${statusTone(clean(thread?.status) || "Open")}`}>
            {clean(thread?.status) || "Open"}
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1.5 text-white/90">
            Maks. 30 pesan terbaru
          </span>
        </div>
      </div>

      <div className="grid min-h-[520px] grid-rows-[1fr_auto]">
        <div className="max-h-[58vh] overflow-y-auto bg-slate-50 p-4 md:p-6">
          {loading ? (
            <div className="rounded-3xl bg-white p-8 text-center text-sm font-bold text-slate-500">Memuat percakapan...</div>
          ) : messages.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center">
              <div className="text-4xl">🛠️</div>
              <div className="mt-3 text-lg font-black text-slate-900">Belum ada laporan teknis</div>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                Jelaskan kendala, perangkat yang digunakan, dan langkah sebelum masalah terjadi.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((item: any) => {
                const mine = clean(item.sender_type || item.senderType) === actorType;
                const readAt = clean(item.read_by_admin_at || item.readByAdminAt);
                return (
                  <div key={item.message_id || item.messageId} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[88%] rounded-3xl px-4 py-3 shadow-sm ${
                        mine
                          ? "rounded-br-md bg-indigo-600 text-white"
                          : "rounded-bl-md border border-slate-100 bg-white text-slate-900"
                      }`}
                    >
                      <div className={`text-[11px] font-black ${mine ? "text-white/70" : "text-slate-400"}`}>
                        {mine ? "Anda" : clean(item.sender_name || item.senderName) || "Admin"}
                      </div>
                      {clean(item.message) ? (
                        <div className="mt-1 whitespace-pre-wrap break-words text-sm font-bold leading-6">{item.message}</div>
                      ) : null}
                      <AttachmentView message={item} />
                      <div className={`mt-2 flex flex-wrap items-center justify-end gap-2 text-[10px] font-bold ${mine ? "text-white/65" : "text-slate-400"}`}>
                        <span>{formatTime(item.created_at || item.createdAt)}</span>
                        {mine ? <span>{readAt ? "Sudah dibaca Admin" : "Terkirim"}</span> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-white p-4 md:p-5">
          {notice ? (
            <div className="mb-3 rounded-2xl bg-indigo-50 px-4 py-3 text-xs font-black leading-5 text-indigo-800">{notice}</div>
          ) : null}

          {attachment ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-black text-slate-900">{attachment.name}</div>
                <div className="mt-1 text-[11px] font-bold text-slate-500">{formatSupportBytes(attachment.size)}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAttachment(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="rounded-full bg-white px-3 py-2 text-xs font-black text-rose-600"
              >
                Hapus
              </button>
            </div>
          ) : null}

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, 2000))}
            rows={3}
            placeholder="Jelaskan kendala teknis yang dialami..."
            className="w-full resize-none rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
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
                className="rounded-2xl bg-slate-100 px-4 py-3 text-xs font-black text-slate-700"
              >
                📎 Upload Foto/PDF
              </button>
            </div>
            <button
              type="button"
              disabled={sending}
              onClick={sendMessage}
              className="rounded-2xl bg-indigo-600 px-5 py-3 text-xs font-black text-white shadow-lg shadow-indigo-100 disabled:opacity-60"
            >
              {sending ? "Mengirim..." : "Kirim"}
            </button>
          </div>

          <p className="mt-3 text-[11px] font-bold leading-5 text-slate-400">
            Foto otomatis diperkecil menjadi sekitar 80–180 KB. PDF maksimal 1 MB. Attachment disimpan di Google Drive, bukan Supabase Storage.
          </p>
        </div>
      </div>
    </section>
  );
}
