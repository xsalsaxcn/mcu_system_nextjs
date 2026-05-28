import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "MCU System - Medical Check-Up Management",
  description: "Sistem manajemen Medical Check-Up CAPASKA / Corporate"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="bg-background">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
