import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MCU System",
  description: "MCU System CAPASKA / Corporate"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
