import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import {
  actorWebhookPayload,
  getSupportActor,
  postSupportWebhook,
} from "@/lib/wellness/supportServer";

// WELLNESS_SUPPORT_ATTACHMENT_GOOGLE_DRIVE_V61_API
// Images are compressed in the browser before this route is called.
// Files go to Google Drive, never Supabase Storage.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value ?? "").trim();
}

function safeFileName(name: string) {
  const cleaned = clean(name)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return cleaned ? `${stamp} - ${cleaned}` : `${stamp} - support-attachment`;
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getSupportActor(request);
    if (!actor) return fail("Session Wellness belum aktif.", 401);

    const formData = await request.formData().catch(() => null);
    if (!formData) return fail("Form upload tidak valid.", 400);

    const file = formData.get("file");
    if (!(file instanceof File)) return fail("File belum dipilih.", 400);

    const contentType = clean(file.type).toLowerCase();
    const isImage = ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(contentType);
    const isPdf = contentType === "application/pdf";
    if (!isImage && !isPdf) return fail("Gunakan JPG, PNG, WebP, atau PDF.", 400);

    const maxBytes = isPdf ? 1024 * 1024 : 350 * 1024;
    if (file.size > maxBytes) {
      return fail(
        isPdf
          ? "PDF maksimal 1 MB. Kecilkan file terlebih dahulu."
          : "Foto hasil kompresi maksimal 350 KB. Pilih ulang foto.",
        400
      );
    }

    let ticketId = clean(formData.get("thread_id") || formData.get("ticket_id"));
    if (!ticketId && !actor.isAdmin) {
      const ensured = await postSupportWebhook("supportEnsureThread", {
        ...actorWebhookPayload(actor),
      });
      ticketId = clean(ensured?.thread?.ticket_id || ensured?.thread?.ticketId);
    }
    if (!ticketId) return fail("Percakapan support belum tersedia.", 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await postSupportWebhook("uploadSupportAttachment", {
      ...actorWebhookPayload(actor),
      ticketId,
      filename: safeFileName(file.name),
      originalFilename: file.name,
      contentType,
      dataBase64: buffer.toString("base64"),
      fileSize: file.size,
      folderName: "wellness program",
    });

    return ok({
      thread_id: ticketId,
      attachment: {
        name: uploaded.name || file.name,
        type: contentType,
        size: file.size,
        url: uploaded.driveUrl || uploaded.publicUrl || uploaded.url || "",
        previewUrl:
          uploaded.previewUrl || uploaded.thumbnailUrl || uploaded.publicUrl || uploaded.driveUrl || "",
      },
      message: "Attachment berhasil diunggah ke Google Drive.",
    });
  } catch (error: any) {
    return fail(error?.message || "Upload attachment support gagal.", 500);
  }
}
