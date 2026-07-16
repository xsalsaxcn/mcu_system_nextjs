"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WellnessAvatar } from "@/components/wellness/WellnessProfile";

// WELLNESS_COMPANY_COACH_CHAT_UI_V78

type ActorRole = "company" | "coach";

function clean(value: any) {
  return String(value ?? "").trim();
}

function formatTime(value: any) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function CompanyCoachChatPanel({
  actorRole,
}: {
  actorRole: ActorRole;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const actorQuery = actorRole === "coach" ? "&actor=coach" : "";

  async function loadThreads(options?: { quiet?: boolean }) {
    if (!options?.quiet) setLoading(true);
    const result = await fetch(
      `/api/wellness/company/coach-chat?mode=threads${actorQuery}`,
      { cache: "no-store" },
    )
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      setItems(result.items || []);
      setNotice("");
    } else {
      setNotice(result.message || "Percakapan belum dapat dimuat.");
    }
    setLoading(false);
  }

  async function openThread(item: any) {
    setSelected(item);
    setLoading(true);
    const counterpartId = actorRole === "coach" ? item.id : item.id;
    const key = actorRole === "coach" ? "company_id" : "coach_id";
    const result = await fetch(
      `/api/wellness/company/coach-chat?mode=messages&${key}=${encodeURIComponent(
        counterpartId,
      )}${actorQuery}`,
      { cache: "no-store" },
    )
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      setMessages(result.messages || []);
      setItems((current) =>
        current.map((entry) =>
          String(entry.id) === String(item.id)
            ? { ...entry, unread_count: 0, thread: result.thread || entry.thread }
            : entry,
        ),
      );
      window.setTimeout(
        () => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
        80,
      );
      setNotice("");
    } else {
      setNotice(result.message || "Percakapan belum dapat dimuat.");
    }
    setLoading(false);
  }

  async function sendMessage() {
    const message = clean(text);
    if (!selected || !message || sending) return;

    setSending(true);
    const optimistic = {
      message_id: `optimistic-${Date.now()}`,
      created_at: new Date().toISOString(),
      sender_type: actorRole,
      sender_name: actorRole === "coach" ? "Coach" : "Perusahaan",
      message,
      optimistic: true,
    };
    setMessages((current) => [...current, optimistic]);
    setText("");

    const body: any = {
      actor: actorRole,
      message,
    };
    if (actorRole === "coach") body.company_id = selected.id;
    else body.coach_id = selected.id;

    const result = await fetch(
      `/api/wellness/company/coach-chat${actorRole === "coach" ? "?actor=coach" : ""}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    )
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      setMessages((current) => [
        ...current.filter((item) => item.message_id !== optimistic.message_id),
        result.message || optimistic,
      ]);
      await loadThreads({ quiet: true });
      setNotice("");
    } else {
      setMessages((current) =>
        current.filter((item) => item.message_id !== optimistic.message_id),
      );
      setText(message);
      setNotice(result.message || "Pesan gagal dikirim.");
    }

    setSending(false);
    window.setTimeout(
      () => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
      80,
    );
  }

  useEffect(() => {
    void loadThreads();
  }, [actorRole]);

  const filteredItems = useMemo(() => {
    const query = clean(search).toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      [
        item.name,
        ...(item.kelompok_names || []),
        item.thread?.last_message,
      ]
        .map((value) => clean(value).toLowerCase())
        .join(" ")
        .includes(query),
    );
  }, [items, search]);

  if (!selected) {
    return (
      <section className="overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white shadow-lg shadow-slate-200/50">
        <div className="border-b border-slate-100 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-600">
                Communication
              </div>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {actorRole === "coach" ? "Chat With Company" : "Chat With Coach"}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => loadThreads()}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg font-black text-slate-700"
              aria-label="Refresh percakapan"
            >
              ↻
            </button>
          </div>

          <div className="relative mt-3">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
              🔍
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari percakapan"
              className="h-11 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
            />
          </div>
        </div>

        {notice ? (
          <div className="mx-4 mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
            {notice}
          </div>
        ) : null}

        <div className="max-h-[66vh] min-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
          {loading ? (
            <div className="flex min-h-[28rem] items-center justify-center text-sm font-bold text-slate-400">
              Memuat percakapan...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex min-h-[28rem] flex-col items-center justify-center px-6 text-center">
              <div className="text-base font-black text-slate-900">
                Belum ada kontak tersedia
              </div>
              <div className="mt-2 text-sm font-bold text-slate-500">
                Pastikan Coach sudah di-assign ke kelompok perusahaan.
              </div>
            </div>
          ) : (
            filteredItems.map((item) => {
              const unread = Number(item.unread_count || 0);
              const subtitle =
                actorRole === "coach"
                  ? item.thread?.last_message || "Belum ada pesan"
                  : item.thread?.last_message ||
                    (item.kelompok_names || []).join(", ") ||
                    "Coach Wellness";
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openThread(item)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-slate-100"
                >
                  <WellnessAvatar
                    name={item.name}
                    src={
                      item.profile_photo_preview_url || item.profile_photo_url
                    }
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`break-words text-sm leading-5 text-slate-950 ${unread ? "font-black" : "font-bold"}`}>
                        {item.name}
                      </div>
                      <div className={`shrink-0 text-[10px] font-bold ${unread ? "text-teal-700" : "text-slate-400"}`}>
                        {formatTime(item.thread?.updated_at)}
                      </div>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate text-xs font-semibold text-slate-500">
                        {subtitle}
                      </div>
                      {unread > 0 ? (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-600 px-1.5 text-[10px] font-black text-white">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white shadow-lg shadow-slate-200/50">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-3 py-2.5">
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setMessages([]);
            void loadThreads({ quiet: true });
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-black text-slate-700"
          aria-label="Kembali ke inbox"
        >
          ←
        </button>
        <WellnessAvatar name={selected.name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="break-words text-sm font-black leading-5 text-slate-950">
            {selected.name}
          </div>
          <div className="truncate text-[10px] font-bold text-slate-500">
            {actorRole === "coach"
              ? "Perusahaan Wellness"
              : (selected.kelompok_names || []).join(", ") || "Coach Wellness"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => openThread(selected)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-black text-slate-700"
          aria-label="Refresh chat"
        >
          ↻
        </button>
      </div>

      {notice ? (
        <div className="m-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
          {notice}
        </div>
      ) : null}

      <div className="max-h-[58vh] min-h-[28rem] space-y-2 overflow-y-auto bg-[#efeae2] px-3 py-4">
        {loading ? (
          <div className="py-16 text-center text-sm font-bold text-slate-400">
            Memuat percakapan...
          </div>
        ) : messages.length === 0 ? (
          <div className="mx-auto mt-12 max-w-xs rounded-xl bg-white/85 px-5 py-4 text-center shadow-sm">
            <div className="text-sm font-black text-slate-900">
              Belum ada percakapan
            </div>
            <div className="mt-1 text-xs font-bold text-slate-500">
              Kirim pesan pertama untuk memulai komunikasi.
            </div>
          </div>
        ) : (
          messages.map((message: any) => {
            const mine = clean(message.sender_type) === actorRole;
            const read =
              actorRole === "company"
                ? clean(message.read_by_coach_at)
                : clean(message.read_by_company_at);
            return (
              <div
                key={message.message_id || message.created_at}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[84%] rounded-lg px-3 py-2 shadow-sm ${
                    mine
                      ? "rounded-br-sm bg-[#d9fdd3]"
                      : "rounded-bl-sm bg-white"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words text-[13px] font-semibold leading-5 text-slate-950">
                    {message.message}
                  </div>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[9px] font-bold text-slate-400">
                    <span>{formatTime(message.created_at)}</span>
                    {mine ? (
                      <span className={read ? "text-sky-500" : ""}>
                        {read ? "✓✓" : "✓"}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} className="h-px" />
      </div>

      <div className="flex items-end gap-2 border-t border-slate-100 bg-white p-2.5">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Tulis pesan..."
          rows={1}
          className="max-h-28 min-h-[44px] flex-1 resize-none rounded-[1.35rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-5 outline-none focus:border-teal-400"
        />
        <button
          type="button"
          onClick={sendMessage}
          disabled={sending || !clean(text)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-600 text-base font-black text-white shadow-lg shadow-teal-100 disabled:opacity-40"
          aria-label="Kirim pesan"
        >
          {sending ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            "➤"
          )}
        </button>
      </div>
    </section>
  );
}
