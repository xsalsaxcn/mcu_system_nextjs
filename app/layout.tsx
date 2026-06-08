import "./globals.css";
import type { Metadata } from "next";

import VaccinationProcessTindakanEnhancer from "../components/VaccinationProcessTindakanEnhancer";
import VaccinationSessionLightFeatures from "../components/VaccinationSessionLightFeatures";
import VaccinationQueueDecodeCleanup from "../components/VaccinationQueueDecodeCleanup";
import VaccinationDoctorSingleStaffField from "../components/VaccinationDoctorSingleStaffField";
import VaccinationValidationFinalGuard from "../components/VaccinationValidationFinalGuard";
import LoginQuickAccessAllCapaska from "../components/LoginQuickAccessAllCapaska";
import CapaskaHideDuplicateThtRhinitis from "../components/CapaskaHideDuplicateThtRhinitis";
export const metadata: Metadata = {
  title: "Harmony Health App",
  description: "Harmony Health App - MCU, corporate health, and vaccination workflow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <CapaskaHideDuplicateThtRhinitis />
        <LoginQuickAccessAllCapaska />
        <VaccinationValidationFinalGuard />
        <VaccinationDoctorSingleStaffField />
        <VaccinationQueueDecodeCleanup />
        <VaccinationSessionLightFeatures />
        <VaccinationProcessTindakanEnhancer />{children}</body>
    </html>
  );
}



















