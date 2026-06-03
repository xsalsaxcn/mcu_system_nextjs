import "./globals.css";
import type { Metadata } from "next";

import GlobalMojibakeDisplayFix from "../components/GlobalMojibakeDisplayFix";
import VaccinationProcessTindakanEnhancer from "../components/VaccinationProcessTindakanEnhancer";
import VaccinationStaffOptionsEnhancer from "../components/VaccinationStaffOptionsEnhancer";
export const metadata: Metadata = {
  title: "Harmony Health App",
  description: "Harmony Health App - MCU, corporate health, and vaccination workflow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <VaccinationStaffOptionsEnhancer />
        <VaccinationProcessTindakanEnhancer />
        <GlobalMojibakeDisplayFix />{children}</body>
    </html>
  );
}




