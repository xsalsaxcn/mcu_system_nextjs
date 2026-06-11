"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

type QRCodeImageProps = {
  value: string;
  size?: number;
};

function normalizeQrValueV221(value: string) {
  return String(value || "-").trim() || "-";
}

function improveSvgV221(rawSvg: string) {
  // QR_SVG_BLACK_FIX_V224
  // Jangan replace semua fill menjadi hitam. SVG QR punya area putih/quiet zone yang wajib tetap putih,
  // terutama untuk iPhone. Patch lama membuat background putih ikut hitam sehingga QR jadi kotak hitam.
  return String(rawSvg || "")
    .replace(/<svg([^>]*)>/, '<svg$1 style="width:100%;height:100%;display:block;background:#ffffff;shape-rendering:crispEdges;" preserveAspectRatio="xMidYMid meet">');
}

export default function QRCodeImage({ value, size = 64 }: QRCodeImageProps) {
  const qrText = useMemo(() => normalizeQrValueV221(value), [value]);
  const safeSize = Math.max(32, Number(size || 64));
  const [svg, setSvg] = useState("");
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSvg("");
    setSrc("");

    const options = {
      type: "svg",
      margin: 4,
      errorCorrectionLevel: "M",
      color: {
        dark: "#000000",
        light: "#ffffff"
      }
    };

    try {
      (QRCode as any).toString(qrText, options, (err: any, rawSvg: string) => {
        if (cancelled) return;

        if (!err && rawSvg) {
          setSvg(improveSvgV221(rawSvg));
          return;
        }

        try {
          (QRCode as any).toDataURL(qrText, {
            margin: 4,
            width: safeSize * 4,
            errorCorrectionLevel: "M",
            color: {
              dark: "#000000",
              light: "#ffffff"
            }
          }, (fallbackErr: any, url: string) => {
            if (cancelled) return;
            setSrc(!fallbackErr && url ? url : "");
          });
        } catch {
          if (!cancelled) setSrc("");
        }
      });
    } catch {
      try {
        (QRCode as any).toDataURL(qrText, {
          margin: 4,
          width: safeSize * 4,
          errorCorrectionLevel: "M",
          color: {
            dark: "#000000",
            light: "#ffffff"
          }
        }, (fallbackErr: any, url: string) => {
          if (cancelled) return;
          setSrc(!fallbackErr && url ? url : "");
        });
      } catch {
        if (!cancelled) setSrc("");
      }
    }

    return () => {
      cancelled = true;
    };
  }, [qrText, safeSize]);

  if (svg) {
    return (
      <span
        aria-label={"QR " + qrText}
        className="block shrink-0 bg-white"
        style={{ width: safeSize, height: safeSize, padding: 0, lineHeight: 0 }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  if (src) {
    return (
      <img
        src={src}
        alt={"QR " + qrText}
        style={{ width: safeSize, height: safeSize, imageRendering: "pixelated", background: "#ffffff" }}
        className="shrink-0"
      />
    );
  }

  return (
    <div
      style={{ width: safeSize, height: safeSize }}
      className="flex items-center justify-center border border-slate-200 bg-white text-[8px] text-slate-400"
    >
      QR
    </div>
  );
}
