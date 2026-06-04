import "./globals.css";
import type { Metadata } from "next";

import VaccinationProcessTindakanEnhancer from "../components/VaccinationProcessTindakanEnhancer";
import VaccinationSessionLightFeatures from "../components/VaccinationSessionLightFeatures";
import VaccinationQueueDecodeCleanup from "../components/VaccinationQueueDecodeCleanup";
import VaccinationDoctorSingleStaffField from "../components/VaccinationDoctorSingleStaffField";
import VaccinationPrintLabelRouting from "../components/VaccinationPrintLabelRouting";
export const metadata: Metadata = {
  title: "Harmony Health App",
  description: "Harmony Health App - MCU, corporate health, and vaccination workflow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <VaccinationPrintLabelRouting />
        <VaccinationDoctorSingleStaffField />
        <VaccinationQueueDecodeCleanup />
        <VaccinationSessionLightFeatures />
        <VaccinationProcessTindakanEnhancer />{children}</body>
    </html>
  );
}














