"use client";

// VACCINATION_STAGE_MIRROR_V153_9_1
import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { groups } from "@/components/VaccinationWorkspaceMenu";

type Props = {
  stageNotes?: Record<string, string>;
};

export default function VaccinationStageMirror({ stageNotes = {} }: Props) {
  const [activeStage, setActiveStage] = useState("");

  const activeGroup = useMemo(
    () => groups.find((group) => group.title === activeStage) || null,
    [activeStage],
  );

  if (activeGroup) {
    const GroupIcon = activeGroup.icon;

    return (
      <div className="p-6 lg:p-8">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveStage("")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
              aria-label="Kembali ke daftar stage"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="text-xs font-black uppercase tracking-[0.14em] text-emerald-600">Stage</div>
              <div className="mt-0.5 flex items-center gap-2 text-xl font-black text-slate-900">
                <GroupIcon className="h-5 w-5 text-emerald-600" />
                {activeGroup.title}
              </div>
              {stageNotes[activeGroup.title] ? (
                <div className="mt-1 text-sm font-medium text-slate-500">{stageNotes[activeGroup.title]}</div>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveStage("")}
            className="self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 sm:self-auto"
          >
            Semua Stage
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {activeGroup.items.map((item) => {
            const ItemIcon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                className="group flex min-h-[104px] items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/40 hover:shadow-md"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 transition group-hover:bg-emerald-100 group-hover:text-emerald-700">
                  <ItemIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-slate-900 group-hover:text-emerald-800">{item.label}</span>
                  <span className="mt-1 block truncate text-xs font-semibold text-slate-400">{item.href}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-600" />
              </a>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4 lg:p-8">
      {groups.map((group) => {
        const GroupIcon = group.icon;
        return (
          <button
            key={group.title}
            type="button"
            onClick={() => setActiveStage(group.title)}
            className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/30 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-emerald-100"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Stage</div>
                <div className="mt-1 flex items-center gap-2 text-lg font-black text-slate-900 group-hover:text-emerald-800">
                  <GroupIcon className="h-4 w-4 text-slate-400 group-hover:text-emerald-600" />
                  {group.title}
                </div>
              </div>
              <div className="grid h-10 min-w-10 place-items-center rounded-xl bg-slate-100 px-3 text-base font-black text-slate-700 transition group-hover:bg-emerald-100 group-hover:text-emerald-700">
                {group.items.length}
              </div>
            </div>
            <div className="mt-4 text-sm font-medium leading-6 text-slate-500">
              {stageNotes[group.title] || `${group.items.length} menu tersedia.`}
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-xs font-black text-emerald-700 opacity-80">
              Lihat submenu
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
