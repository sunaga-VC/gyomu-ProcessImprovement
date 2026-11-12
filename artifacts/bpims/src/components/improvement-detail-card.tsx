import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListImprovementsQueryKey, type Improvement, type Hearing, type Issue, type SystemCandidate, useUpdateImprovement } from "@workspace/api-client-react";
import { Badge, Button, Input } from "@/components/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IMPROVEMENT_STATUS, HEARING_STATUS, ISSUE_STATUS, SYSTEM_CANDIDATE_STATUS, getPriorityBadgeClass, getStatusColor } from "@/lib/constants";
import { Search as SearchIcon, Pencil, Activity, ChevronRight, ChevronDown, UsersRoundCollaboration, Target, MonitorCog, GripVertical } from "lucide-react";
import { Link } from "wouter";
import { ProgressBar } from "@/components/progress-bar";
import { systemCandidateIcon } from "@/lib/kind-icons";
import { estimateImprovementProgress, systemProgress } from "@/lib/improvement-progress";
import { format } from "date-fns";

export type ImprovementDetailPrimary = { id: number; name: string };

/** 他ページへ移動して戻ってきてもトグルの開閉状態を保持したいので、コンポーネントの
 * 再マウントをまたいでモジュールスコープで保持する（画面のフルリロードではリセットされる）。 */
const persistedExpandedIds = new Set<number>();

type GroupedItem = {
  key: string;
  kind: "hearing" | "task" | "system";
  id: number;
  title: string;
  status: string;
  href: string;
  priority: string | null;
  assignee: string | null;
  /** ヒアリングは予定日時点、タスク／システム化候補は開始予定日〜完了予定日の期間で表示する。 */
  dateLabel: string;
  boardSortOrder: number;
  /** システム化候補のみ。 */
  progress?: { value: number; estimated: boolean };
};

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return "-";
  // Hearings carry an ISO timestamp (scheduledAt); tasks/system candidates a plain YYYY-MM-DD.
  return dueDate.includes("T") ? format(new Date(dueDate), "yyyy/MM/dd") : dueDate.replace(/-/g, "/");
}

/** 印刷時だけ優先度「高」は太字＋枠を太く濃く、「中」は枠の色だけ濃くして目立たせる。 */
function getPriorityPrintClass(priority: string | null): string {
  if (priority === "高") return "print:font-bold print:!border-2 print:!border-red-600";
  if (priority === "中") return "print:!border-amber-600";
  return "";
}

function formatPlannedRange(startDate: string | null | undefined, endDate: string | null | undefined): string {
  if (!startDate && !endDate) return "-";
  const start = startDate ? startDate.replace(/-/g, "/") : "-";
  const end = endDate ? endDate.replace(/-/g, "/") : "-";
  return `${start} 〜 ${end}`;
}

const GROUPED_KIND_ICON = { hearing: UsersRoundCollaboration, task: Target, system: MonitorCog } as const;
const GROUPED_KIND_LABEL = { hearing: "ヒアリング", task: "タスク", system: "システム化" } as const;
const GROUPED_COMPLETED_STATUS = { hearing: "conducted", task: "resolved", system: "released" } as const;
const GROUPED_STATUS_MAP: Record<GroupedItem["kind"], Record<string, string>> = { hearing: HEARING_STATUS, task: ISSUE_STATUS, system: SYSTEM_CANDIDATE_STATUS };
// 改善ボードのカラム内並び順（boardSortOrder→種類→タイトル）と揃える。
const GROUPED_KIND_ORDER: Record<GroupedItem["kind"], number> = { hearing: 0, task: 1, system: 2 };

/**
 * One axis-section card (管理業務 / 部署 / 部門, or a single flat section) for 改善プロジェクト,
 * matching ヒアリング一覧の `HearingDetailCard` list+詳細 two-column style exactly: a clickable
 * list on the left, a detail panel on the right for whichever improvement is selected.
 */
export function ImprovementDetailCard({
  primary,
  items,
  onEdit,
  variant,
  hearings = [],
  issues = [],
  systemCandidates = [],
  filterSlot,
}: {
  primary: ImprovementDetailPrimary;
  /** This primary's improvements, already resolved by the caller. */
  items: Improvement[];
  onEdit: (i: Improvement) => void;
  /** "warning" tints the header amber, for the synthetic "未設定" section. */
  variant?: "warning";
  /** Full hearing/task/system-candidate lists, so each row can show what 改善ボード groups under it. */
  hearings?: Hearing[];
  issues?: Issue[];
  systemCandidates?: SystemCandidate[];
  /** Optional filter control rendered to the right of this card's search box. */
  filterSlot?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const sectionOpen = manualOpen ?? items.length > 0;
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set(persistedExpandedIds));
  const [statusPopoverOpenId, setStatusPopoverOpenId] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const updateImprovement = useUpdateImprovement();

  const searchLower = search.trim().toLowerCase();
  const filteredItems = searchLower ? items.filter((i) => i.title.toLowerCase().includes(searchLower)) : items;
  const sorted = [...filteredItems].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.title.localeCompare(b.title, "ja"));
  const allExpanded = sorted.length > 0 && sorted.every((i) => expandedIds.has(i.id));

  function invalidateImprovements() {
    queryClient.invalidateQueries({ queryKey: getListImprovementsQueryKey() });
  }

  function handleCardDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleCardDrop(e: React.DragEvent, targetId: number) {
    e.preventDefault();
    if (draggedId === null || draggedId === targetId) { setDraggedId(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const dropAfter = e.clientY > rect.top + rect.height / 2;
    const others = sorted.filter((x) => x.id !== draggedId);
    const targetIdx = others.findIndex((x) => x.id === targetId);
    const insertIdx = targetIdx === -1 ? others.length : dropAfter ? targetIdx + 1 : targetIdx;
    const orderedIds = [...others.slice(0, insertIdx).map((x) => x.id), draggedId, ...others.slice(insertIdx).map((x) => x.id)];
    orderedIds.forEach((id, idx) => {
      const item = sorted.find((x) => x.id === id);
      if (item && (item.sortOrder ?? 0) !== idx) {
        updateImprovement.mutate({ id, data: { sortOrder: idx } }, { onSuccess: invalidateImprovements });
      }
    });
    setDraggedId(null);
  }

  function applyExpandedIds(next: Set<number>) {
    persistedExpandedIds.clear();
    next.forEach((id) => persistedExpandedIds.add(id));
    setExpandedIds(next);
  }

  function toggleExpanded(id: number) {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    applyExpandedIds(next);
  }

  function toggleExpandAll() {
    applyExpandedIds(allExpanded ? new Set() : new Set(sorted.map((i) => i.id)));
  }

  function handleStatusChange(improvementId: number, status: string) {
    updateImprovement.mutate(
      { id: improvementId, data: { status } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListImprovementsQueryKey() });
          setStatusPopoverOpenId(null);
        },
      },
    );
  }

  // Mirrors 改善ボード's column membership: hearings/tasks can belong to multiple improvements,
  // system candidates to at most one.
  function groupedItemsFor(improvementId: number): GroupedItem[] {
    const hearingItems: GroupedItem[] = hearings
      .filter((h) => (h.improvements ?? []).some((r) => r.id === improvementId))
      .map((h) => ({
        key: `h-${h.id}`, kind: "hearing", id: h.id, title: h.title, status: h.status, href: `/hearings?openId=${h.id}`,
        priority: h.priority ?? null, assignee: h.intervieweeName ?? null, dateLabel: formatDueDate(h.scheduledAt ?? null), boardSortOrder: h.boardSortOrder ?? 0,
      }));
    const taskItems: GroupedItem[] = issues
      .filter((i) => (i.improvements ?? []).some((r) => r.id === improvementId))
      .map((i) => ({
        key: `t-${i.id}`, kind: "task", id: i.id, title: i.title, status: i.status, href: `/issues?openId=${i.id}`,
        priority: i.priority ?? null, assignee: i.ownerName ?? null, dateLabel: formatPlannedRange(i.plannedStartDate, i.plannedEndDate), boardSortOrder: i.boardSortOrder ?? 0,
      }));
    const systemItems: GroupedItem[] = systemCandidates
      .filter((sc) => sc.improvementId === improvementId)
      .map((sc) => ({
        key: `s-${sc.id}`, kind: "system", id: sc.id, title: sc.title, status: sc.status, href: `/system-candidates?openId=${sc.id}`,
        priority: sc.priority ?? null, assignee: sc.ownerName ?? sc.developerName ?? null, dateLabel: formatPlannedRange(sc.plannedStartDate, sc.plannedEndDate), boardSortOrder: sc.boardSortOrder ?? 0,
        progress: systemProgress(sc),
      }));
    return [...hearingItems, ...taskItems, ...systemItems].sort((a, b) =>
      a.boardSortOrder - b.boardSortOrder
      || GROUPED_KIND_ORDER[a.kind] - GROUPED_KIND_ORDER[b.kind]
      || a.title.localeCompare(b.title, "ja")
    );
  }

  return (
    <div>
      <div
        className="flex flex-wrap items-start justify-between gap-4 cursor-pointer py-2"
        onClick={() => setManualOpen(!sectionOpen)}
      >
        <div className="flex items-start gap-2">
          <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform shrink-0 mt-2 ${sectionOpen ? "rotate-90" : ""}`} />
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${variant === "warning" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
            <Activity className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className={`text-sm font-bold ${variant === "warning" ? "text-amber-700" : "text-slate-900"}`}>{primary.name}</h3>
            <Badge variant="outline" className={variant === "warning" ? "bg-amber-50 text-amber-700 border-amber-200 font-medium" : "bg-blue-50 text-blue-700 border-blue-200 font-medium"}>{items.length}件</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 print:hidden" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs shrink-0"
            disabled={sorted.length === 0}
            onClick={toggleExpandAll}
          >
            {allExpanded ? "すべて閉じる" : "すべて開く"}
          </Button>
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="改善案件を検索" className="pl-8 h-8 text-sm w-48" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {filterSlot}
        </div>
      </div>

      {sectionOpen && (
        <div className="mt-3 space-y-4">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{search ? "該当する改善案件がありません" : "改善案件がありません"}</p>
          ) : (
            sorted.map((i) => {
              const grouped = groupedItemsFor(i.id);
              const isExpanded = expandedIds.has(i.id);
              return (
                <section
                  key={i.id}
                  draggable
                  onDragStart={(e) => { e.stopPropagation(); setDraggedId(i.id); }}
                  onDragOver={handleCardDragOver}
                  onDrop={(e) => { e.stopPropagation(); handleCardDrop(e, i.id); }}
                  className={`rounded-xl border bg-white shadow-sm overflow-hidden print:break-inside-avoid ${draggedId === i.id ? "opacity-50" : ""} ${isExpanded ? "border-primary bg-primary/5" : "border-slate-200"}`}
                >
                  <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0 cursor-grab active:cursor-grabbing print:hidden" />
                      <button
                        type="button"
                        className="shrink-0 text-slate-300 hover:text-primary print:hidden"
                        onClick={(e) => { e.stopPropagation(); toggleExpanded(i.id); }}
                        title="改善ボードでグルーピングされた項目を表示"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                      </button>
                      <Badge variant="outline" className="shrink-0 bg-slate-50 text-slate-500 border-slate-200 font-normal" title="改善案件ID（固定）">
                        No.{i.id}
                      </Badge>
                      {i.departmentName ? (
                        <Badge variant="outline" className="bg-slate-900 text-white border-slate-900 font-medium">
                          {i.departmentName}
                        </Badge>
                      ) : null}
                      {i.divisionName ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 font-medium">
                          {i.divisionName}
                        </Badge>
                      ) : null}
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">{i.title}</span>
                        {i.priority ? (
                          <Badge variant="outline" className={`shrink-0 rounded-full w-6 h-6 p-0 flex items-center justify-center text-[10px] leading-none font-medium ${getPriorityBadgeClass(i.priority)} ${getPriorityPrintClass(i.priority)}`}>
                            {i.priority}
                          </Badge>
                        ) : null}
                        {i.isOverdue && (
                          <Badge className="text-[10px] px-1.5 py-0 bg-red-50 text-red-700 border-red-200 shrink-0" variant="outline">期限超過</Badge>
                        )}
                      </div>
                      <span className="ml-auto shrink-0 text-xs text-slate-500 whitespace-nowrap">
                        {formatPlannedRange(i.plannedStartDate ?? null, i.plannedEndDate ?? null)}
                      </span>
                      {i.status === "in_progress" && (() => {
                        const estimate = i.progress == null ? estimateImprovementProgress(i.id, hearings, issues, systemCandidates) : null;
                        return (
                          <ProgressBar value={i.progress ?? estimate?.percent ?? 0} estimated={estimate != null} showLabel className="shrink-0 w-32" />
                        );
                      })()}
                      <Popover
                        open={statusPopoverOpenId === i.id}
                        onOpenChange={(open) => setStatusPopoverOpenId(open ? i.id : null)}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="shrink-0"
                            onClick={(e) => e.stopPropagation()}
                            title="ステータスを変更"
                          >
                            <Badge className={`cursor-pointer ${getStatusColor(i.status, IMPROVEMENT_STATUS)}`} variant="outline">
                              {IMPROVEMENT_STATUS[i.status as keyof typeof IMPROVEMENT_STATUS] || i.status}
                            </Badge>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-44 p-1" align="start" onClick={(e) => e.stopPropagation()}>
                          <div className="space-y-0.5">
                            {Object.entries(IMPROVEMENT_STATUS).map(([k, v]) => (
                              <button
                                key={k}
                                type="button"
                                className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100"
                                onClick={() => handleStatusChange(i.id, k)}
                              >
                                <Badge className={getStatusColor(k, IMPROVEMENT_STATUS)} variant="outline">{v}</Badge>
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-slate-400 hover:text-primary print:hidden"
                        onClick={(e) => { e.stopPropagation(); onEdit(i); }}
                        title="改善案件を編集"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="min-w-0 flex-1 whitespace-pre-wrap text-slate-600">{i.purpose || "-"}</span>
                    </div>
                  </div>

                  <div
                    className={`${isExpanded ? "block" : "hidden"} print:block px-4 pb-3 mt-1`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {grouped.length === 0 ? (
                      <p className="text-xs text-slate-400 py-1">改善ボードに紐づく項目はありません</p>
                    ) : (
                      <div className="space-y-1">
                        {grouped.map((g) => {
                          const Icon = g.kind === "system" ? systemCandidateIcon(g.status) : GROUPED_KIND_ICON[g.kind];
                          return (
                            <Link
                              key={g.key}
                              href={g.href}
                              className="group flex flex-wrap items-center gap-2 px-1 py-1 text-xs hover:bg-slate-50"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span
                                className={`inline-flex items-center justify-center rounded-full shrink-0 h-5 w-5 border ${
                                  g.kind === "system"
                                    ? "bg-slate-900 text-white border-slate-900"
                                    : "bg-white text-slate-500 border-slate-200"
                                }`}
                                title={GROUPED_KIND_LABEL[g.kind]}
                              >
                                <Icon className="w-3 h-3 shrink-0" />
                              </span>
                              <span className="flex-1 min-w-0 flex items-center gap-1.5">
                                <span className={`min-w-0 truncate ${g.status === GROUPED_COMPLETED_STATUS[g.kind] ? "line-through text-slate-500" : "text-slate-700"}`}>{g.title}</span>
                                {g.priority ? (
                                  <Badge variant="outline" className={`shrink-0 rounded-full w-5 h-5 p-0 flex items-center justify-center text-[9px] leading-none font-medium ${getPriorityBadgeClass(g.priority)} ${getPriorityPrintClass(g.priority)}`}>
                                    {g.priority}
                                  </Badge>
                                ) : null}
                              </span>
                              <span className="text-slate-400 shrink-0">{g.assignee || "-"}</span>
                              <span className="text-slate-400 shrink-0">{g.dateLabel}</span>
                              {g.progress && (
                                <span
                                  className={`shrink-0 w-[3.5em] text-right tabular-nums ${g.progress.estimated ? "text-slate-400" : "text-slate-600 font-medium"}`}
                                  title={g.progress.estimated ? "ステータスから計算した目安" : undefined}
                                >
                                  {g.progress.estimated ? "≒" : ""}{g.progress.value}%
                                </span>
                              )}
                              <Badge className={`text-[9px] px-1 py-0 shrink-0 ${getStatusColor(g.status, GROUPED_STATUS_MAP[g.kind])}`} variant="outline">
                                {GROUPED_STATUS_MAP[g.kind][g.status] || g.status}
                              </Badge>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
