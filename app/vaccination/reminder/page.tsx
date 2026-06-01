"use client";

export default function VaccinationReminderPage() {
  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Reminder Vaksinasi</h1>
            <p className="mt-2 text-sm text-slate-600">Placeholder tahap reminder. Flow operasional utama tetap berjalan tanpa integrasi email otomatis.</p>
          </div>
          <a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a>
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border bg-emerald-50 p-5"><div className="text-sm font-black uppercase text-emerald-700">Sent</div><div className="mt-2 text-3xl font-black">0</div></div>
          <div className="rounded-2xl border bg-red-50 p-5"><div className="text-sm font-black uppercase text-red-700">Failed With Reason</div><div className="mt-2 text-3xl font-black">0</div></div>
          <div className="rounded-2xl border bg-blue-50 p-5"><div className="text-sm font-black uppercase text-blue-700">Incoming Reminder</div><div className="mt-2 text-3xl font-black">0</div></div>
          <div className="rounded-2xl border bg-purple-50 p-5"><div className="text-sm font-black uppercase text-purple-700">Manual Reminder</div><div className="mt-2 text-3xl font-black">Ready</div></div>
        </section>

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <h2 className="font-bold">Rencana fitur</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
            <li>Reminder Status: Sent, Failed, Pending, Skipped.</li>
            <li>Failed Reason: email kosong, format email salah, SMTP error, template kosong.</li>
            <li>Incoming Reminder: daftar peserta yang akan dikirim reminder.</li>
            <li>Button Manual Reminder dan Edit Email Template.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
