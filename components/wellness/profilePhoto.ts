"use client";

// WELLNESS_PROFILE_PHOTO_COMPRESSION_V76

function loadImage(file: File) {
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

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Kompresi foto gagal.")),
      "image/webp",
      quality,
    );
  });
}

export async function prepareWellnessProfilePhoto(file: File) {
  const type = String(file.type || "").toLowerCase();
  if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(type)) {
    throw new Error("Gunakan foto JPG, PNG, atau WebP.");
  }

  const image = await loadImage(file);
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(
    0,
    Math.floor((image.naturalWidth - sourceSize) / 2),
  );
  const sourceY = Math.max(
    0,
    Math.floor((image.naturalHeight - sourceSize) / 2),
  );
  const outputSize = 480;
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Browser tidak mendukung kompresi foto.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputSize, outputSize);
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    outputSize,
    outputSize,
  );

  let quality = 0.82;
  let blob = await canvasBlob(canvas, quality);
  while (blob.size > 80 * 1024 && quality > 0.42) {
    quality -= 0.08;
    blob = await canvasBlob(canvas, quality);
  }
  if (blob.size > 120 * 1024) {
    throw new Error(
      "Foto masih terlalu besar setelah dikompres. Pilih foto lain.",
    );
  }

  const base = file.name.replace(/\.[^.]+$/, "").trim() || "profile";
  return new File([blob], `${base}-profile.webp`, {
    type: "image/webp",
    lastModified: Date.now(),
  });
}
