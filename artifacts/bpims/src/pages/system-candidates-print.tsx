import { useMemo, useState } from "react";
import { useListSystemCandidates, type SystemCandidate } from "@workspace/api-client-react";
import { Button, Badge, Label } from "@/components/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { SYSTEM_CANDIDATE_STATUS, getPriorityBadgeClass, getStatusColor } from "@/lib/constants";
import { ArrowLeft, Printer, MessageCircleCheck } from "lucide-react";
import { Link } from "wouter";
import { ProgressBar } from "@/components/progress-bar";
import { systemCandidateIcon } from "@/lib/kind-icons";
import { systemProgress } from "@/lib/improvement-progress";

function formatPlannedRange(startDate: string | null | undefined, endDate: string | null | undefined): string {
  if (!startDate && !endDate) return "-";
  const start = startDate ? startDate.replace(/-/g, "/") : "-";
  const end = endDate ? endDate.replace(/-/g, "/") : "-";
  return `${start} 〜 ${end}`;
}

/** 印刷時だけ優先度「高」は太字＋枠を太く濃く、「中」は枠の色だけ濃くして目立たせる。 */
function getPriorityPrintClass(priority: string | null | undefined): string {
  if (priority === "高") return "print:font-bold print:!border-2 print:!border-red-600";
  if (priority === "中") return "print:!border-amber-600";
  return "";
}

function hasProgress(status: string) {
  return status !== "candidate" && status !== "released";
}

function bySortOrder(a: SystemCandidate, b: SystemCandidate) {
  return (a.listSortOrder ?? 0) - (b.listSortOrder ?? 0) || a.title.localeCompare(b.title, "ja");
}

/** Depth-first so each child is printed directly under its own parent. */
function flattenDescendants(parentId: number, all: SystemCandidate[], depth = 1): { sc: SystemCandidate; depth: number }[] {
  return all
    .filter((sc) => sc.parentId === parentId)
    .sort(bySortOrder)
    .flatMap((sc) => [{ sc, depth }, ...flattenDescendants(sc.id, all, depth + 1)]);
}

function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  return (
    <Badge className={`w-14 shrink-0 justify-center text-center px-1 py-0 ${getStatusColor(status, SYSTEM_CANDIDATE_STATUS)} ${className}`} variant="outline">
      {SYSTEM_CANDIDATE_STATUS[status as keyof typeof SYSTEM_CANDIDATE_STATUS] || status}
    </Badge>
  );
}

/**
 * システム化一覧の印刷プレビュー。改善プロジェクトの印刷と同じカード型で、
 * 親のシステム化の直下にシステムタスク（子・孫）を常時展開して並べる。
 */
export default function SystemCandidatesPrint() {
  const { data: systemCandidates = [], isLoading } = useListSystemCandidates();
  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set());

  // リリース済みの親は、改善プロジェクト印刷の「完了」と同じくプレビュー・印刷どちらにも出さない。
  const parents = useMemo(
    () => systemCandidates.filter((sc) => !sc.parentId && sc.status !== "released").sort(bySortOrder),
    [systemCandidates],
  );
  const releasedChildIds = useMemo(
    () => systemCandidates.filter((sc) => sc.parentId && sc.status === "released").map((sc) => sc.id),
    [systemCandidates],
  );
  const releasedAllExcluded = releasedChildIds.length > 0 && releasedChildIds.every((id) => excludedIds.has(id));

  function toggleIncluded(id: number) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleReleased() {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      releasedChildIds.forEach((id) => { if (releasedAllExcluded) next.delete(id); else next.add(id); });
      return next;
    });
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="hidden print:block text-sm font-bold text-slate-700 mb-2">システム化一覧</div>
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/system-candidates" className="text-slate-400 hover:text-primary">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">システム化一覧（印刷プレビュー）</h1>
            <p className="text-sm text-muted-foreground mt-1">この内容で印刷されます。</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Checkbox id="exclude-released" checked={releasedAllExcluded} onCheckedChange={toggleReleased} disabled={releasedChildIds.length === 0} />
            <Label htmlFor="exclude-released" className="text-sm text-slate-600 cursor-pointer">リリース済み</Label>
          </div>
          <Button className="gap-2" onClick={() => window.print()}>
            <Printer className="w-4 h-4" />印刷
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground">読み込み中...</div>
      ) : parents.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">印刷するシステム化がありません</div>
      ) : (
        <div className="space-y-4">
          {parents.map((p, idx) => renderParent(p, idx))}
        </div>
      )}
    </div>
  );

  function renderParent(p: SystemCandidate, idx: number) {
            const ParentIcon = systemCandidateIcon(p.status);
            const children = flattenDescendants(p.id, systemCandidates);
            return (
              <section key={p.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden print:break-inside-avoid">
                <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="shrink-0 text-sm font-bold text-slate-400">{idx + 1}.</span>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500">
                      <ParentIcon className="w-3.5 h-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">{p.title}</span>
                      {p.priority ? (
                        <Badge variant="outline" className={`shrink-0 rounded-full w-6 h-6 p-0 flex items-center justify-center text-[10px] leading-none font-medium ${getPriorityBadgeClass(p.priority)} ${getPriorityPrintClass(p.priority)}`}>
                          {p.priority}
                        </Badge>
                      ) : null}
                      {p.improvementTitle ? (
                        <Badge variant="outline" className="shrink-0 font-normal bg-blue-50 text-blue-700 border-blue-200">{p.improvementTitle}</Badge>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs text-slate-500 whitespace-nowrap">{p.ownerName || "-"}</span>
                    <span className="shrink-0 text-xs text-slate-500 whitespace-nowrap">{formatPlannedRange(p.plannedStartDate, p.plannedEndDate)}</span>
                    {hasProgress(p.status) && (() => {
                      const prog = systemProgress(p);
                      return <ProgressBar value={prog.value} estimated={prog.estimated} showLabel className="shrink-0 w-32" />;
                    })()}
                    <StatusBadge status={p.status} className="text-[11px]" />
                  </div>
                  {(p.problemToSolve || p.requiredFeatures) && (
                    <div className="mt-2 space-y-0.5 text-[10px] text-slate-600 whitespace-pre-wrap">
                      {p.problemToSolve && <div><span className="font-bold text-slate-500">課題：</span>{p.problemToSolve}</div>}
                      {p.requiredFeatures && <div><span className="font-bold text-slate-500">機能：</span>{p.requiredFeatures}</div>}
                    </div>
                  )}
                </div>

                <div className="px-4 py-3">
                  {children.length === 0 ? (
                    <p className="py-2 text-xs text-slate-400">システムタスクはありません</p>
                  ) : (
                    <div className="space-y-0">
                      {children.map(({ sc, depth }) => {
                        const included = !excludedIds.has(sc.id);
                        const isDone = sc.status === "released";
                        const prog = hasProgress(sc.status) ? systemProgress(sc) : null;
                        return (
                          <div
                            key={sc.id}
                            className={`flex flex-wrap items-center gap-2 px-1 py-0.5 text-[10px] hover:bg-slate-50 ${included ? "" : "print:hidden"}`}
                            style={{ paddingLeft: `${(depth - 1) * 16 + 4}px` }}
                          >
                            <Checkbox className="shrink-0 print:hidden" checked={!included} onCheckedChange={() => toggleIncluded(sc.id)} title="印刷から除外" />
                            <span className="inline-flex items-center justify-center rounded-full shrink-0 h-4 w-4 border bg-white text-slate-500 border-slate-200" title="システムタスク">
                              <MessageCircleCheck className="w-2.5 h-2.5 shrink-0" />
                            </span>
                            <span className="min-w-0 flex-1 flex items-center gap-1">
                              <span className={`min-w-0 text-slate-700 ${isDone ? "line-through" : "text-[11px] font-medium"}`}>{sc.title}</span>
                              {sc.priority ? (
                                <Badge variant="outline" className={`shrink-0 rounded-full w-4 h-4 p-0 flex items-center justify-center text-[8px] leading-none font-medium ${getPriorityBadgeClass(sc.priority)} ${getPriorityPrintClass(sc.priority)}`}>
                                  {sc.priority}
                                </Badge>
                              ) : null}
                            </span>
                            <span className="shrink-0 text-slate-500">{sc.ownerName || "-"}</span>
                            <span className="shrink-0 text-slate-500">{formatPlannedRange(sc.plannedStartDate, sc.plannedEndDate)}</span>
                            {prog && (
                              <span className={`shrink-0 w-[3.5em] text-right tabular-nums ${prog.estimated ? "text-slate-400" : "text-slate-600 font-medium"}`}>
                                {prog.estimated ? "≒" : ""}{prog.value}%
                              </span>
                            )}
                            <StatusBadge status={sc.status} className={`text-[10px] ${isDone ? "print:!bg-slate-50 print:!text-slate-50 print:!border-transparent" : ""}`} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            );
  }
}
