"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QRCodeImage({
  value,
  size = 64
}: {
  value: string;
  size?: number;
}) {
  const [src, setSrc] = useState("");
  const text = String(value || "-").trim() || "-";
  const safeSize = Math.max(32, Number(size || 64));

  useEffect(() => {
    let cancelled = false;
    const qrText = String(value || "-").trim() || "-";
    const renderWidth = Math.max(768, Math.round(safeSize * 14));

    // UNIVERSAL_QR_SENSITIVE_V225
    // Short content + high-resolution PNG + real white quiet zone is the most stable option
    // for Android scanners, iPhone scanner, and thermal label printers.
    try {
      (QRCode as any).toDataURL(
        qrText,
        {
          type: "image/png",
          width: renderWidth,
          margin: 4,
          errorCorrectionLevel: "M",
          color: {
            dark: "#000000",
            light: "#FFFFFF"
          },
          rendererOpts: {
            quality: 1
          }
        },
        (err: any, url: string) => {
          if (cancelled) return;
          if (err || !url) {
            setSrc("");
            return;
          }
          setSrc(url);
        }
      );
    } catch {
      if (!cancelled) setSrc("");
    }

    return () => {
      cancelled = true;
    };
  }, [value, safeSize]);

  if (!src) {
    return (
      <div
        style={{ width: safeSize, height: safeSize }}
        className="flex items-center justify-center border border-slate-200 bg-white text-[8px] text-slate-400"
      >
        QR
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={"QR " + text}
      draggable={false}
      style={{
        width: safeSize,
        height: safeSize,
        display: "block",
        background: "#ffffff",
        imageRendering: "pixelated"
      } as any}
      className="shrink-0"
    />
  );
}
