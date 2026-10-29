"use client";

import { useEffect } from "react";

// V508_INLINE_PACKAGE_NONPACKAGE_PRICING_REDIRECT
export default function VaccinationPricingRedirectPage() {
  useEffect(() => {
    window.location.replace("/vaccination/master#vaccination-pricing-inline");
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-xl rounded-2xl border bg-white p-6 text-sm font-semibold text-slate-700 shadow-sm">
        Paket / Non Paket sekarang dikelola langsung di Master Vaksin & Lot Number. Mengalihkan...
      </div>
    </main>
  );
}
