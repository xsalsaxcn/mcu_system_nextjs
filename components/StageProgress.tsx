"use client";

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function StageProgress({ stages }: { stages: any[] }) {
  if (!stages?.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-700">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>Belum ada stage. Pastikan package sudah punya parameter.</span>
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {stages.map((stage) => (
        <div
          key={stage.post_id}
          className={cn(
            "rounded-lg border p-3 transition-colors",
            stage.is_done
              ? "border-emerald-200 bg-emerald-50/50"
              : "border-border bg-card"
          )}
        >
          <div className="flex items-center gap-2">
            {stage.is_done ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="text-sm font-medium text-foreground">{stage.post_name}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <Badge variant={stage.is_done ? "success" : "secondary"} className="text-xs">
              {stage.status_text}
            </Badge>
            <span className="text-xs font-medium text-muted-foreground">{stage.progress_text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
