import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import {
  actorWebhookPayload,
  getSupportActor,
  getSupportAdminActor,
  postSupportWebhook,
} from "@/lib/wellness/supportServer";

// WELLNESS_SUPPORT_CHAT_GOOGLE_SHEET_V61_API
// WELLNESS_SUPPORT_UNREAD_SUMMARY_V74
// WELLNESS_SUPPORT_AUTO_THREAD_V79F
// Text and metadata are stored in Google Sheet, not Supabase.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value ?? "").trim();
}

function clampLimit(value: any, fallback = 30, max = 50) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(n)));
}


// WELLNESS_SUPPORT_RESPONSE_NORMALIZATION_V79Q
function firstValue(source: any, keys: string[], fallback: any = "") {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null) {
      return source[key];
    }
  }
  return fallback;
}

function normalizeThread(item: any) {
  const ticketId = clean(
    firstValue(item, ["ticket_id", "ticketId", "thread_id", "threadId", "id"]),
  );
  return {
    ...item,
    ticket_id: ticketId,
    ticketId,
    actor_type: clean(firstValue(item, ["actor_type", "actorType", "role"])),
    actor_name: clean(
      firstValue(item, ["actor_name", "actorName", "name", "user_name", "userName"]),
    ),
    actor_code: clean(firstValue(item, ["actor_code", "actorCode", "code"])),
    company: clean(
      firstValue(item, ["company", "company_name", "companyName", "actor_company", "actorCompany"]),
    ),
    kelompok: clean(
      firstValue(item, ["kelompok", "group", "group_name", "groupName", "actor_group", "actorGroup"]),
    ),
    status: clean(firstValue(item, ["status"], "Open")) || "Open",
    last_message: clean(
      firstValue(item, ["last_message", "lastMessage", "message", "latest_message", "latestMessage"]),
    ),
    updated_at: clean(
      firstValue(item, ["updated_at", "updatedAt", "last_message_at", "lastMessageAt", "created_at", "createdAt"]),
    ),
    unread_admin: Math.max(
      0,
      Number(firstValue(item, ["unread_admin", "unreadAdmin", "admin_unread", "adminUnread"], 0)) || 0,
    ),
    unread_user: Math.max(
      0,
      Number(firstValue(item, ["unread_user", "unreadUser", "user_unread", "userUnread"], 0)) || 0,
    ),
  };
}

function normalizeMessage(item: any) {
  return {
    ...item,
    message_id: clean(firstValue(item, ["message_id", "messageId", "id"])),
    ticket_id: clean(firstValue(item, ["ticket_id", "ticketId", "thread_id", "threadId"])),
    sender_type: clean(firstValue(item, ["sender_type", "senderType"])),
    sender_name: clean(firstValue(item, ["sender_name", "senderName", "name"])),
    message: clean(firstValue(item, ["message", "text", "body"])),
    created_at: clean(firstValue(item, ["created_at", "createdAt", "timestamp"])),
    attachment_name: clean(firstValue(item, ["attachment_name", "attachmentName"])),
    attachment_type: clean(firstValue(item, ["attachment_type", "attachmentType"])),
    attachment_size: Number(firstValue(item, ["attachment_size", "attachmentSize"], 0)) || 0,
    attachment_url: clean(firstValue(item, ["attachment_url", "attachmentUrl"])),
    attachment_preview_url: clean(
      firstValue(item, ["attachment_preview_url", "attachmentPreviewUrl", "attachment_url", "attachmentUrl"]),
    ),
    read_by_user_at: clean(firstValue(item, ["read_by_user_at", "readByUserAt"])),
    read_by_admin_at: clean(firstValue(item, ["read_by_admin_at", "readByAdminAt"])),
  };
}

function normalizeSummary(summary: any, threads: any[]) {
  const unreadFromThreads = threads.reduce(
    (sum: number, item: any) => sum + Number(item.unread_admin || 0),
    0,
  );
  return {
    ...(summary || {}),
    unread: Math.max(
      0,
      Number(
        firstValue(summary, ["unread", "unread_admin", "unreadAdmin", "new_messages", "newMessages"], unreadFromThreads),
      ) || unreadFromThreads,
    ),
    open: Number(firstValue(summary, ["open", "Open"], 0)) || 0,
    handled: Number(firstValue(summary, ["handled", "ditangani", "Ditangani"], 0)) || 0,
    done: Number(firstValue(summary, ["done", "selesai", "Selesai"], 0)) || 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const mode = clean(request.nextUrl.searchParams.get("mode") || "messages");

    if (mode === "threads") {
      const admin = getSupportAdminActor(request);
      if (!admin) return fail("Akses Admin Wellness diperlukan.", 401);

      const result = await postSupportWebhook("supportListThreads", {
        ...actorWebhookPayload(admin),
        status: clean(request.nextUrl.searchParams.get("status") || "all"),
        query: clean(request.nextUrl.searchParams.get("query")),
        limit: clampLimit(request.nextUrl.searchParams.get("limit"), 40, 80),
      });

      const rawThreads = Array.isArray(result.threads)
        ? result.threads
        : Array.isArray(result.items)
          ? result.items
          : Array.isArray(result.rows)
            ? result.rows
            : Array.isArray(result.data)
              ? result.data
              : [];
      const threads = rawThreads.map(normalizeThread).filter((item: any) => item.ticket_id);
      return ok({ threads, summary: normalizeSummary(result.summary || result, threads) });
    }

    const actor = await getSupportActor(request);
    if (!actor) return fail("Session Wellness belum aktif.", 401);

    if (mode === "summary" && !actor.isAdmin) {
      const result = await postSupportWebhook("supportGetThread", {
        ...actorWebhookPayload(actor),
        limit: 1,
        markRead: false,
      });
      const thread = result.thread || null;
      const unreadCount = Number(
        thread?.unread_user ?? thread?.unreadUser ?? 0
      );
      return ok({
        thread,
        unread_count: Number.isFinite(unreadCount) ? unreadCount : 0,
        has_unread: Number.isFinite(unreadCount) && unreadCount > 0,
      });
    }

    const threadId = clean(request.nextUrl.searchParams.get("thread_id"));
    const limit = clampLimit(request.nextUrl.searchParams.get("limit"), 30, 50);

    if (actor.isAdmin) {
      if (!threadId) return fail("thread_id wajib dipilih.", 400);
      const result = await postSupportWebhook("supportGetMessages", {
        ...actorWebhookPayload(actor),
        ticketId: threadId,
        limit,
        markRead: true,
      });
      return ok({ thread: result.thread ? normalizeThread(result.thread) : null, messages: (result.messages || result.items || result.rows || []).map(normalizeMessage) });
    }

    await postSupportWebhook("supportEnsureThread", {
      ...actorWebhookPayload(actor),
    });

    const result = await postSupportWebhook("supportGetThread", {
      ...actorWebhookPayload(actor),
      limit,
      markRead: true,
    });

    return ok({ thread: result.thread ? normalizeThread(result.thread) : null, messages: (result.messages || result.items || result.rows || []).map(normalizeMessage) });
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat Chat with Admin.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getSupportActor(request);
    if (!actor) return fail("Session Wellness belum aktif.", 401);

    const body = await request.json().catch(() => ({}));
    const action = clean(body.action);

    if (action === "send_message") {
      const message = clean(body.message).slice(0, 2000);
      const attachment = body.attachment && typeof body.attachment === "object" ? body.attachment : null;
      const ticketId = clean(body.thread_id || body.ticket_id);

      if (!message && !attachment?.url) {
        return fail("Tulis pesan atau pilih attachment.", 400);
      }
      if (actor.isAdmin && !ticketId) return fail("Pilih percakapan terlebih dahulu.", 400);

      const result = await postSupportWebhook("supportSendMessage", {
        ...actorWebhookPayload(actor),
        ticketId,
        senderType: actor.type,
        senderId: actor.id,
        senderName: actor.name,
        message,
        attachmentName: clean(attachment?.name),
        attachmentType: clean(attachment?.type),
        attachmentSize: Number(attachment?.size || 0),
        attachmentUrl: clean(attachment?.url),
        attachmentPreviewUrl: clean(attachment?.previewUrl || attachment?.url),
      });

      return ok({ thread: result.thread ? normalizeThread(result.thread) : null, message: result.message ? normalizeMessage(result.message) : null });
    }

    if (action === "mark_read") {
      const ticketId = clean(body.thread_id || body.ticket_id);
      if (actor.isAdmin && !ticketId) return fail("thread_id wajib dipilih.", 400);
      await postSupportWebhook("supportMarkRead", {
        ...actorWebhookPayload(actor),
        ticketId,
        readerType: actor.type,
      });
      return ok({ marked: true });
    }

    if (action === "update_status") {
      const admin = getSupportAdminActor(request);
      if (!admin) return fail("Akses Admin Wellness diperlukan.", 401);
      const ticketId = clean(body.thread_id || body.ticket_id);
      const status = clean(body.status);
      if (!ticketId) return fail("thread_id wajib dipilih.", 400);
      if (!["Open", "Ditangani", "Selesai"].includes(status)) {
        return fail("Status support tidak valid.", 400);
      }

      const result = await postSupportWebhook("supportUpdateStatus", {
        ...actorWebhookPayload(admin),
        ticketId,
        status,
      });
      return ok({ thread: result.thread ? normalizeThread(result.thread) : null });
    }

    return fail("Action support tidak dikenal.", 400);
  } catch (error: any) {
    return fail(error?.message || "Gagal memproses Chat with Admin.", 500);
  }
}
