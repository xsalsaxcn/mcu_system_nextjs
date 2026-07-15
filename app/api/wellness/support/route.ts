import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import {
  actorWebhookPayload,
  getSupportActor,
  getSupportAdminActor,
  postSupportWebhook,
} from "@/lib/wellness/supportServer";

// WELLNESS_SUPPORT_CHAT_GOOGLE_SHEET_V61_API
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

      return ok({ threads: result.threads || [], summary: result.summary || {} });
    }

    const actor = await getSupportActor(request);
    if (!actor) return fail("Session Wellness belum aktif.", 401);

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
      return ok({ thread: result.thread || null, messages: result.messages || [] });
    }

    const result = await postSupportWebhook("supportGetThread", {
      ...actorWebhookPayload(actor),
      limit,
      markRead: true,
    });

    return ok({ thread: result.thread || null, messages: result.messages || [] });
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

      return ok({ thread: result.thread || null, message: result.message || null });
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
      return ok({ thread: result.thread || null });
    }

    return fail("Action support tidak dikenal.", 400);
  } catch (error: any) {
    return fail(error?.message || "Gagal memproses Chat with Admin.", 500);
  }
}
