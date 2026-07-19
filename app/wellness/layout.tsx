import type { Metadata, Viewport } from "next";

import WellnessIosInstallPrompt from "@/components/wellness/WellnessIosInstallPrompt";
import "./wellness-ios.css";

export const metadata: Metadata = {
  applicationName: "Harmony Health Wellness",
  title: {
    default: "Harmony Health Wellness",
    template: "%s | Harmony Health Wellness",
  },
  description:
    "Portal Wellness Harmony Health untuk peserta, coach, perusahaan, dan admin.",
  manifest: "/wellness-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Harmony Wellness",
    startupImage: [],
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      {
        url: "/wellness-pwa/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/wellness-pwa/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/wellness-pwa/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#042e66",
};

export default function WellnessLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="wellness-ios-shell">
      {children}
      <WellnessIosInstallPrompt />
    </div>
  );
}
