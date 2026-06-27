import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";

// WELLNESS_GOOGLE_DRIVE_UPLOAD_BUTTON_V367_API
// WELLNESS_GOOGLE_DRIVE_FOLDER_STRUCTURE_V368_API
// Upload evidence files to Google Drive through the Apps Script webhook.
// Files are not stored in Supabase Storage; the API returns a public/preview URL to be saved in the Wellness form and Google Sheet.

export const runtime = "nodejs";

function cleanText(value: any) {
  return String(value ?? "").trim();
}

function safeFileName(name: string) {
  const cleaned = cleanText(name).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return cleaned ? `${stamp} - ${cleaned}` : `${stamp} - wellness-evidence`;
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const webhookUrl = cleanText(process.env.WELLNESS_GOOGLE_DRIVE_UPLOAD_WEBHOOK_URL || process.env.WELLNESS_GOOGLE_SHEET_WEBHOOK_URL);
  if (!webhookUrl) {
    return fail("Webhook Google Drive/Google Sheet belum diatur. Isi WELLNESS_GOOGLE_SHEET_WEBHOOK_URL di .env.local atau Vercel Environment Variables.", 400);
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) return fail("Form upload tidak valid.", 400);

  const file = formData.get("file");
  if (!(file instanceof File)) return fail("File belum dipilih.", 400);

  const maxBytes = 8 * 1024 * 1024;
  if (file.size > maxBytes) return fail("Ukuran file maksimal 8 MB.", 400);

  const contentType = cleanText(file.type) || "application/octet-stream";
  const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "application/pdf"];
  if (!allowed.includes(contentType.toLowerCase())) {
    return fail("Format file belum didukung. Gunakan JPG, PNG, WebP, GIF, atau PDF.", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fieldKey = cleanText(formData.get("fieldKey"));
  const participantId = cleanText(formData.get("participant_id"));
  const participantCode = cleanText(formData.get("participant_code"));
  const participantName = cleanText(formData.get("participant_name"));
  const companyName = cleanText(formData.get("company_name"));
  const kelompokName = cleanText(formData.get("kelompok_name"));
  const groupUnitName = cleanText(formData.get("group_unit_name"));
  const riskCluster = cleanText(formData.get("risk_cluster"));
  const activeTab = cleanText(formData.get("active_tab"));
  const logDate = cleanText(formData.get("log_date"));
  const evidenceCategory = cleanText(formData.get("evidence_category"));

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "uploadEvidence",
        secret: process.env.WELLNESS_GOOGLE_SHEET_WEBHOOK_SECRET || "",
        filename: safeFileName(file.name),
        originalFilename: file.name,
        contentType,
        dataBase64: buffer.toString("base64"),
        fieldKey,
        participantId,
        participantCode,
        participantName,
        companyName,
        kelompokName,
        groupUnitName,
        riskCluster,
        activeTab,
        logDate,
        evidenceCategory,
        uploadedBy: user.id,
        folderName: process.env.WELLNESS_GOOGLE_DRIVE_FOLDER_NAME || "Wellness Evidence Uploads",
        marker: "WELLNESS_GOOGLE_DRIVE_FOLDER_STRUCTURE_V368",
      }),
      cache: "no-store",
    });

    const text = await response.text().catch(() => "");
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch {}

    if (!response.ok || !json?.ok) {
      return fail(json?.message || `Upload Google Drive gagal (${response.status}). ${text.slice(0, 160)}`, response.status || 500);
    }

    return ok({
      fileId: json.fileId || null,
      url: json.previewUrl || json.thumbnailUrl || json.publicUrl || json.driveUrl || json.url || "",
      previewUrl: json.previewUrl || json.thumbnailUrl || json.publicUrl || json.url || "",
      driveUrl: json.driveUrl || json.url || "",
      publicUrl: json.publicUrl || json.previewUrl || json.url || "",
      contentType,
      size: file.size,
      message: "Upload berhasil ke Google Drive.",
      marker: "WELLNESS_GOOGLE_DRIVE_FOLDER_STRUCTURE_V368",
    });
  } catch (error: any) {
    return fail(`Upload Google Drive gagal: ${error?.message || String(error)}`, 500);
  }
}
