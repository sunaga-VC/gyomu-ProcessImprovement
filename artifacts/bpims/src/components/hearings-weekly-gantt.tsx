import { type GanttItem, ganttItemIcon, GANTT_KIND_LABEL } from "@/lib/gantt-item";
import { format, differenceInCalendarDays, isWeekend, isSameDay } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

const DAY_WIDTH = 32;
const LABEL_WIDTH = 240;

/**
 * A true horizontal-timeline Gantt: the period runs left-to-right across day columns, and
 * each item (hearing / task / system candidate) is one row with a bar spanning its
 * start〜end range. `weeks` is only used to derive the flat list of visible days.
 */
export function HearingsWeeklyGantt({ items, weeks }: { items: GanttItem[]; weeks: Date[][] }) {
  const [, navigate] = useLocation();
  const days = weeks.flat();
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime());
  const today = new Date();

  if (days.length === 0) return null;

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">この月の予定はありません</p>;
  }

  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];
  const timelineWidth = days.length * DAY_WIDTH;

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ width: LABEL_WIDTH + timelineWidth }}>
          {/* Day header */}
          <div className="flex border-b bg-slate-50">
            <div
              className="sticky left-0 z-10 shrink-0 px-3 py-2 text-xs font-bold text-slate-500 border-r bg-slate-50"
              style={{ width: LABEL_WIDTH }}
            >
              件名
            </div>
            <div className="flex">
              {days.map((d) => (
                <div
                  key={d.toISOString()}
                  className={cn(
                    "shrink-0 text-center py-1 border-r border-slate-200 text-[10px] leading-tight",
                    d.getDay() === 1 && "border-l-2 border-l-slate-400",
                    isWeekend(d) ? "bg-slate-100/70 text-slate-400" : "text-slate-500",
                    isSameDay(d, today) && "bg-blue-50 text-primary font-bold"
                  )}
                  style={{ width: DAY_WIDTH }}
                >
                  <div>{format(d, "d")}</div>
                  <div>{format(d, "EEEEE", { locale: ja })}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className="divide-y">
            {sorted.map((item) => {
              const Icon = ganttItemIcon(item);
              const startIdx = Math.max(0, differenceInCalendarDays(item.start, rangeStart));
              const endIdx = Math.min(days.length - 1, differenceInCalendarDays(item.end < rangeEnd ? item.end : rangeEnd, rangeStart));
              const barLeft = startIdx * DAY_WIDTH;
              const barWidth = Math.max(DAY_WIDTH, (endIdx - startIdx + 1) * DAY_WIDTH);
              return (
                <div key={item.id} className="flex hover:bg-slate-50/60">
                  <button
                    type="button"
                    onClick={() => navigate(item.href)}
                    className="sticky left-0 z-10 shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 text-left border-r bg-white hover:text-primary hover:bg-slate-50/60 transition-colors"
                    style={{ width: LABEL_WIDTH }}
                    title={`${GANTT_KIND_LABEL[item.kind]}: ${item.title}（${item.statusLabel}）`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{item.title}</span>
                  </button>
                  <div className="relative" style={{ width: timelineWidth, height: 40 }}>
                    {days.map((d, idx) => (
                      <div
                        key={d.toISOString()}
                        className={cn(
                          "absolute top-0 bottom-0 border-r border-slate-200",
                          d.getDay() === 1 && "border-l-2 border-l-slate-300",
                          isWeekend(d) ? "bg-slate-50/60" : ""
                        )}
                        style={{ left: idx * DAY_WIDTH, width: DAY_WIDTH }}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => navigate(item.href)}
                      className={cn("absolute top-1.5 h-7 rounded hover:opacity-80 transition-opacity overflow-hidden px-1.5 text-left", item.barColorClass)}
                      style={{ left: barLeft, width: barWidth }}
                      title={`${item.title}（${item.statusLabel}）${item.barLabel ? ` 担当：${item.barLabel}` : ""}`}
                    >
                      {item.barLabel && (
                        <span className="block truncate text-[11px] font-medium leading-7 text-white drop-shadow-sm">{item.barLabel}</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
