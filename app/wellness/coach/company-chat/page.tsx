"use client";

import CompanyCoachChatPanel from "@/components/wellness/CompanyCoachChatPanel";

// WELLNESS_COACH_COMPANY_CHAT_PAGE_V78

export default function WellnessCoachCompanyChatPage() {
  return (
    <main className="min-h-screen bg-[#f4fbfa] px-4 py-4 text-slate-950">
      <section className="mx-auto max-w-3xl">
        <header className="mb-4 flex items-center gap-3 rounded-[1.35rem] border border-slate-100 bg-white px-3 py-3 shadow-sm">
          <button
            type="button"
            onClick={() => {
              window.location.href = "/wellness/coach";
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg font-black text-slate-700"
            aria-label="Kembali ke Portal Coach"
          >
            ←
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-teal-600">
              Wellness Coach
            </div>
            <h1 className="mt-0.5 break-words text-lg font-black leading-tight">
              Chat With Company
            </h1>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-lg font-black text-white"
            aria-label="Refresh"
          >
            ↻
          </button>
        </header>

        <CompanyCoachChatPanel actorRole="coach" />
      </section>
    </main>
  );
}
