"use client";

export default function StageProgress({ stages }: { stages: any[] }) {
  if (!stages?.length) {
    return <div className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-700">Belum ada stage. Pastikan package sudah punya parameter.</div>;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {stages.map((stage) => (
        <div key={stage.post_id} className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="text-sm font-bold text-slate-900">{stage.post_name}</div>
          <div className="mt-2 flex items-center justify-between">
            <span className={`badge ${stage.is_done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
              {stage.status_text}
            </span>
            <span className="text-xs font-bold text-slate-500">{stage.progress_text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
