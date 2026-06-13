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
  const [svg, setSvg] = useState("");
  const safeSize = Math.max(32, Number(size || 64));
  const qrText = String(value || "-").trim() || "-";

  useEffect(() => {
    let cancelled = false;

    // QR_LABEL_IPHONE_CRISP_V217
    // Untuk iPhone: gunakan SVG supaya hasil print thermal tetap tajam,
    // margin/quiet zone cukup, dan error correction M agar QR tidak terlalu padat.
    QRCode.toString(qrText, {
      type: "svg",
      margin: 4,
      scale: 8,
      width: Math.max(256, safeSize * 8),
      errorCorrectionLevel: "M",
      color: {
        dark: "#000000",
        light: "#ffffff"
      }
    } as any)
      .then((rawSvg) => {
        if (cancelled) return;
        const improvedSvg = String(rawSvg)
          .replace(/<svg([^>]*)>/, "<svg$1 style=\"width:100%;height:100%;display:block;shape-rendering:crispEdges;\" preserveAspectRatio=\"xMidYMid meet\">")
          .replace(/<path /g, "<path shape-rendering=\"crispEdges\" ")
          .replace(/<rect /g, "<rect shape-rendering=\"crispEdges\" ");
        setSvg(improvedSvg);
      })
      .catch(() => {
        if (!cancelled) setSvg("");
      });

    return () => {
      cancelled = true;
    };
  }, [qrText, safeSize]);

  if (!svg) {
    return (
      <div
        style={{ width: safeSize, height: safeSize, background: "#ffffff" }}
        className="flex items-center justify-center border border-slate-200 text-[8px] text-slate-400"
      >
        QR
      </div>
    );
  }

  return (
    <div
      aria-label={"QR " + qrText}
      title={qrText}
      style={{
        width: safeSize,
        height: safeSize,
        background: "#ffffff",
        display: "block",
        flexShrink: 0,
        overflow: "visible",
        lineHeight: 0,
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact"
      } as any}
      className="shrink-0"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
