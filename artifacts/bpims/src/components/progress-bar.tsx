import { cn } from "@/lib/utils";

export function ProgressBar({ value, showLabel = false, estimated = false, className }: { value: number; showLabel?: boolean; estimated?: boolean; className?: string }) {
  const pct = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div className={cn("flex items-center gap-1.5", className)} title={estimated ? "紐づく項目から計算した目安" : undefined}>
      <div className="h-2 flex-1 min-w-[48px] rounded-full bg-slate-200 overflow-hidden print:border print:border-slate-300">
        <div className={cn("h-full rounded-full", estimated ? "bg-blue-300" : "bg-blue-500")} style={{ width: `${pct}%`, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} />
      </div>
      {showLabel && <span className={cn("text-xs tabular-nums w-[3.5em] text-right", estimated ? "text-slate-400" : "text-slate-600")}>{estimated ? "≒" : ""}{pct}%</span>}
    </div>
  );
}
