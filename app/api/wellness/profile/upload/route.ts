import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import {
  actorWebhookPayload,
  getSupportActor,
  postSupportWebhook,
} from "@/lib/wellness/supportServer";

// WELLNESS_PROFILE_PHOTO_GOOGLE_DRIVE_API_V76
// WELLNESS_PROFILE_UPLOAD_ATOMIC_SAVE_V76B

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
  return `${new Date().toISOString().replace(/[:.]/g, "-")} - ${cleaned || "profile.webp"}`;
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getSupportActor(request);
    if (!actor || actor.isAdmin)
      return fail("Session Wellness belum aktif.", 401);

    const formData = await request.formData().catch(() => null);
    if (!formData) return fail("Form upload tidak valid.", 400);
    const file = formData.get("file");
    if (!(file instanceof File)) return fail("Foto profil belum dipilih.", 400);

    const contentType = clean(file.type).toLowerCase();
    if (
      !["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(
        contentType,
      )
    ) {
      return fail("Gunakan foto JPG, PNG, atau WebP.", 400);
    }
    if (file.size > 120 * 1024) {
      return fail("Foto profil maksimal 120 KB setelah kompresi.", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await postSupportWebhook("uploadWellnessProfilePhoto", {
      ...actorWebhookPayload(actor),
      filename: safeFileName(file.name),
      originalFilename: file.name,
      contentType,
      fileSize: file.size,
      dataBase64: buffer.toString("base64"),
      folderName: "wellness program",
    });

    let profile = uploaded?.profile || null;

    if (!profile) {
      const saved = await postSupportWebhook("wellnessProfileSave", {
        ...actorWebhookPayload(actor),
        photoUrl:
          uploaded.driveUrl || uploaded.publicUrl || uploaded.url || "",
        photoPreviewUrl:
          uploaded.previewUrl ||
          uploaded.thumbnailUrl ||
          uploaded.publicUrl ||
          uploaded.driveUrl ||
          "",
      });
      profile = saved?.profile || null;
    }

    return ok({
      profile,
      message: "Foto profil berhasil disimpan di Google Drive.",
    });
  } catch (error: any) {
    const rawMessage = clean(error?.message || "Upload foto profil gagal.");
    return fail(
      /no row data supplied/i.test(rawMessage)
        ? "Metadata foto belum dapat disimpan. Deploy ulang Apps Script V76B lalu coba kembali."
        : rawMessage,
      500,
    );
  }
}
