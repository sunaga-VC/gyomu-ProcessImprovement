import { useState, type ComponentType } from "react";
import { type GanttItem } from "@/lib/gantt-item";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HearingsWeeklyGantt } from "@/components/hearings-weekly-gantt";

const GENERAL_TAB = "__general__";

export type AxisRef = { id: number; name: string };

/**
 * One accordion section for a "部署ごと" or "部門ごと" view of the Gantt chart. Mirrors
 * `ProcessTreeAxisSection` — only which axis (department/division) is the outer grouping
 * vs. the inner tab differs, so this is parameterized over both the same way.
 */
export function HearingsAxisSection({
  primary,
  items,
  secondaryOptions,
  getSecondaryRefs,
  weeks,
  hideSecondaryTabs,
  icon: Icon,
}: {
  /** The department or division this whole section represents. */
  primary: AxisRef;
  /** This primary's items (hearings + tasks) for the current month. */
  items: GanttItem[];
  /** Full master of the *other* axis, so every one shows up as a tab even if unused here. */
  secondaryOptions: AxisRef[];
  getSecondaryRefs: (item: GanttItem) => AxisRef[];
  weeks: Date[][];
  /** Hides the 一般/{axis} sub-tab bar — for axes (like 管理業務) that don't need a secondary breakdown. */
  hideSecondaryTabs?: boolean;
  /** Optional icon shown before the section name. */
  icon?: ComponentType<{ className?: string }>;
}) {
  const [tab, setTab] = useState<string>(GENERAL_TAB);
  const sortedSecondary = [...secondaryOptions].sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const activeSecondary = !hideSecondaryTabs && tab !== GENERAL_TAB ? sortedSecondary.find(d => String(d.id) === tab) ?? null : null;
  const scopedItems = activeSecondary ? items.filter(i => getSecondaryRefs(i).some(x => x.id === activeSecondary.id)) : items;

  return (
    <AccordionItem value={String(primary.id)}>
      <AccordionTrigger className="text-sm font-bold text-slate-700 px-1">
        <span className="flex items-center">
          {Icon && (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 mr-2">
              <Icon className="w-3.5 h-3.5" />
            </span>
          )}
          {primary.name}
          <span className="font-normal text-slate-400 ml-1">（{items.length}件）</span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3 px-1">
          {!hideSecondaryTabs && (
            <div className="overflow-x-auto">
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="w-max">
                  <TabsTrigger value={GENERAL_TAB}>一般</TabsTrigger>
                  {sortedSecondary.map(d => <TabsTrigger key={d.id} value={String(d.id)}>{d.name}</TabsTrigger>)}
                </TabsList>
              </Tabs>
            </div>
          )}
          <HearingsWeeklyGantt items={scopedItems} weeks={weeks} />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
