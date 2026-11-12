import { useState } from "react";
import { type Process } from "@workspace/api-client-react";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge, Button } from "@/components/ui";
import { DepartmentBadgeGroup, DivisionBadges } from "@/components/department-division-badges";
import { PROCESS_STATUS, getStatusColor } from "@/lib/constants";
import { Link } from "wouter";
import { Pencil, Trash2 } from "lucide-react";

const GENERAL_TAB = "__general__";

export type AxisRef = { id: number; name: string };

/**
 * One accordion section for a "部署ごと" or "部門ごと" view of 業務一覧. Mirrors
 * `ProcessTreeAxisSection`/`HearingsAxisSection` — only which axis (department/division) is
 * the outer grouping vs. the inner tab differs — but renders a flat 業務名・概要 / 部署・担当部門・
 * ステータス list instead of a tree, since 業務一覧 isn't for reordering/reparenting.
 */
export function ProcessListAxisSection({
  primary,
  items,
  secondaryOptions,
  getSecondaryRefs,
  onEdit,
  onDelete,
  variant,
}: {
  /** The department or division this whole section represents. */
  primary: AxisRef;
  /** This primary's processes for the current filter/search. */
  items: Process[];
  /** Full master of the *other* axis, so every one shows up as a tab even if unused here. */
  secondaryOptions: AxisRef[];
  getSecondaryRefs: (p: Process) => AxisRef[] | null | undefined;
  onEdit: (p: Process) => void;
  onDelete: (id: number) => void;
  /** "warning" tints the header amber, for the synthetic "未設定" section. */
  variant?: "warning";
}) {
  const [tab, setTab] = useState<string>(GENERAL_TAB);
  const sortedSecondary = [...secondaryOptions].sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const activeSecondary = tab === GENERAL_TAB ? null : sortedSecondary.find(d => String(d.id) === tab) ?? null;
  const scopedItems = activeSecondary ? items.filter(p => (getSecondaryRefs(p) ?? []).some(x => x.id === activeSecondary.id)) : items;
  const sorted = [...scopedItems].sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return (
    <AccordionItem value={String(primary.id)}>
      <AccordionTrigger className={`text-sm font-bold px-1 ${variant === "warning" ? "text-amber-700" : "text-slate-700"}`}>
        {primary.name}
        <span className={`font-normal ml-1 ${variant === "warning" ? "text-amber-500" : "text-slate-400"}`}>（{items.length}件）</span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3 px-1">
          <div className="overflow-x-auto">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-max">
                <TabsTrigger value={GENERAL_TAB}>一般</TabsTrigger>
                {sortedSecondary.map(d => <TabsTrigger key={d.id} value={String(d.id)}>{d.name}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          </div>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">該当する業務がありません</p>
          ) : (
            <div className="border rounded-md divide-y overflow-hidden">
              {sorted.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 transition-colors group">
                  <Link href={`/processes/${p.id}`} className="w-44 shrink-0 truncate text-sm font-medium text-slate-800 hover:text-primary transition-colors">
                    {p.name}
                  </Link>
                  <span className="flex-1 min-w-0 text-xs text-slate-500 truncate">{p.overview || "-"}</span>
                  <div className="flex items-center gap-1 w-40 shrink-0 overflow-hidden">
                    <DepartmentBadgeGroup primary={p.departments} related={p.relatedDepartments} />
                  </div>
                  <div className="flex items-center gap-1 w-28 shrink-0 overflow-hidden">
                    <DivisionBadges divisions={p.divisions} />
                  </div>
                  <Badge className={`shrink-0 ${getStatusColor(p.status, PROCESS_STATUS)}`} variant="outline">
                    {PROCESS_STATUS[p.status as keyof typeof PROCESS_STATUS] || p.status}
                  </Badge>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-primary" onClick={() => onEdit(p)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => onDelete(p.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
