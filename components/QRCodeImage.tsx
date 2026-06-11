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

  useEffect(() => {
    let cancelled = false;

    // QR_IPHONE_SCAN_V215
    QRCode.toDataURL(value || "-", {
      margin: 4,
      width: size * 4,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#ffffff" }
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!src) {
    return (
      <div
        style={{ width: size, height: size, display: "block", objectFit: "contain", background: "#ffffff" }}
        className="flex items-center justify-center border border-slate-200 text-[8px] text-slate-400"
      >
        QR
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`QR ${value}`}
      style={{ width: size, height: size }}
      className="shrink-0"
    />
  );
}
