"use client";

// WELLNESS_SUPPORT_ATTACHMENT_COMPRESSION_V61
// WELLNESS_COMPANY_SUPPORT_ATTACHMENT_CONTEXT_V78
// WELLNESS_SUPPORT_ATTACHMENT_ALL_ROLE_CONTEXT_V79F
// Client-side compression keeps images small before upload to Google Drive.

export function formatSupportBytes(value: number) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function replaceExtension(name: string, extension: string) {
  const base = name.replace(/\.[^.]+$/, "").trim() || "support-image";
  return `${base}.${extension}`;
}

function loadHtmlImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Foto tidak dapat dibaca."));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Kompresi foto gagal."))),
      type,
      quality
    );
  });
}

export async function prepareSupportAttachment(file: File): Promise<File> {
  const type = String(file.type || "").toLowerCase();
  if (type === "application/pdf") {
    if (file.size > 1024 * 1024) throw new Error("PDF maksimal 1 MB.");
    return file;
  }

  if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(type)) {
    throw new Error("Gunakan JPG, PNG, WebP, atau PDF.");
  }

  const image = await loadHtmlImage(file);
  const maxDimension = 1280;
  const ratio = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Browser tidak mendukung kompresi foto.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const targetBytes = 180 * 1024;
  const qualities = [0.74, 0.66, 0.58, 0.5, 0.44];
  let selected = await canvasBlob(canvas, "image/webp", qualities[0]);

  for (const quality of qualities.slice(1)) {
    if (selected.size <= targetBytes) break;
    selected = await canvasBlob(canvas, "image/webp", quality);
  }

  if (selected.size > 350 * 1024) {
    throw new Error("Foto masih terlalu besar setelah dikompres. Gunakan foto lain.");
  }

  return new File([selected], replaceExtension(file.name, "webp"), {
    type: "image/webp",
    lastModified: Date.now(),
  });
}

export async function uploadSupportAttachment(
  file: File,
  threadId = "",
  actorType: "participant" | "coach" | "company" = "participant",
) {
  const form = new FormData();
  form.append("file", file);
  if (threadId) form.append("thread_id", threadId);

  const response = await fetch("/api/wellness/support/upload", {
    method: "POST",
    headers: { "x-wellness-actor-context": actorType },
    body: form,
  });
  const result = await response.json().catch(() => ({ ok: false, message: "Upload gagal." }));
  if (!response.ok || !result.ok) throw new Error(result.message || "Upload attachment gagal.");
  return result;
}
