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

    QRCode.toDataURL(value || "-", {
      margin: 0,
      width: size * 4,
      errorCorrectionLevel: "M"
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
        style={{ width: size, height: size }}
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
