import { useMemo, useState } from "react";
import {
  useListImprovements, useListHearings, useListIssues, type Hearing, type Issue, type SystemCandidate,
} from "@workspace/api-client-react";
import { Button, Badge, Label } from "@/components/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { HEARING_STATUS, ISSUE_STATUS, SYSTEM_CANDIDATE_STATUS, getPriorityBadgeClass, getStatusColor } from "@/lib/constants";
import { ArrowLeft, Printer, UsersRoundCollaboration, Target, MonitorCog } from "lucide-react";
import { Link } from "wouter";
import { ProgressBar } from "@/components/progress-bar";
import { systemCandidateIcon } from "@/lib/kind-icons";
import { estimateImprovementProgress, systemProgress } from "@/lib/improvement-progress";
import { useTopLevelSystemCandidates } from "@/lib/top-level-system-candidates";

/** The "done" status per kind — 実施済み (hearing) / 対応済み (task) / リリース済み (system candidate). */
const COMPLETED_STATUS = { hearing: "conducted", task: "resolved", system: "released" } as const;
const COMPLETED_LABEL = { hearing: "実施済み", task: "対応済み", system: "リリース済み" } as const;
/** The "not started yet" status per kind — 未着手 (hearing) / 未対応 (task) / 候補 (system candidate). */
const NOT_STARTED_STATUS = { hearing: "not_started", task: "not_started", system: "candidate" } as const;

type GroupedItem = {
  key: string;
  kind: "hearing" | "task" | "system";
  title: string;
  status: string;
  priority: string | null;
  assignee: string | null;
  /** ヒアリングは予定日時点、タスク／システム化候補は開始予定日〜完了予定日の期間で表示する。 */
  dateLabel: string;
  boardSortOrder: number;
  /** ヒアリング・タスクは複数の改善案件に同時に属せるため、他のプロジェクト配下にも重複して出現する。 */
  isDuplicate: boolean;
  progress?: { value: number; estimated: boolean } | null;
};

const KIND_ICON = { hearing: UsersRoundCollaboration, task: Target, system: MonitorCog } as const;
const KIND_LABEL = { hearing: "ヒアリング", task: "タスク", system: "システム化" } as const;
const KIND_STATUS_MAP: Record<GroupedItem["kind"], Record<string, string>> = { hearing: HEARING_STATUS, task: ISSUE_STATUS, system: SYSTEM_CANDIDATE_STATUS };
// 改善ボードのカラム内並び順（boardSortOrder→種類→タイトル）と揃える。
const KIND_ORDER: Record<GroupedItem["kind"], number> = { hearing: 0, task: 1, system: 2 };

function formatDate(raw: string | null): string {
  if (!raw) return "-";
  return raw.includes("T") ? new Date(raw).toLocaleDateString("sv-SE").replace(/-/g, "/") : raw.replace(/-/g, "/");
}

function formatPlannedRange(startDate: string | null | undefined, endDate: string | null | undefined): string {
  if (!startDate && !endDate) return "-";
  return `${formatDate(startDate ?? null)} 〜 ${formatDate(endDate ?? null)}`;
}

/** 対応中・調整済など「済／未着手」以外の進行中ステータスは、薄いグレーがかった枠色のままだと
 * 目立たないので、地の色を保ったまま枠だけ濃い色に差し替える（例: border-blue-200 → border-blue-400）。 */
function darkenBorderColor(colorClasses: string): string {
  return colorClasses.replace(/border-([a-z]+)-200\b/, "border-$1-400");
}

/** 印刷時だけ優先度「高」は太字＋枠を太く濃く、「中」は枠の色だけ濃くして目立たせる。 */
function getPriorityPrintClass(priority: string | null): string {
  if (priority === "高") return "print:font-bold print:!border-2 print:!border-red-600";
  if (priority === "中") return "print:!border-amber-600";
  return "";
}

function groupedItemsFor(improvementId: number, hearings: Hearing[], issues: Issue[], systemCandidates: SystemCandidate[]): GroupedItem[] {
  // key はこの改善案件内での出現1件ごとに一意にする（改善案件IDを含める）。ヒアリング・タスクは
  // 複数の改善案件に同時に属せるため、同じ項目が別の改善案件セクションにも重複して出てくることがあり、
  // そのチェックは互いに独立して操作できるようにする必要がある。
  const hearingItems: GroupedItem[] = hearings
    .filter((h) => (h.improvements ?? []).some((r) => r.id === improvementId))
    .map((h) => ({ key: `h-${h.id}-${improvementId}`, kind: "hearing", title: h.title, status: h.status, priority: h.priority ?? null, assignee: h.intervieweeName ?? null, dateLabel: formatDate(h.scheduledAt ?? null), boardSortOrder: h.boardSortOrder ?? 0, isDuplicate: (h.improvements ?? []).length > 1 }));
  const taskItems: GroupedItem[] = issues
    .filter((i) => (i.improvements ?? []).some((r) => r.id === improvementId))
    .map((i) => ({ key: `t-${i.id}-${improvementId}`, kind: "task", title: i.title, status: i.status, priority: i.priority ?? null, assignee: i.ownerName ?? null, dateLabel: formatPlannedRange(i.plannedStartDate, i.plannedEndDate), boardSortOrder: i.boardSortOrder ?? 0, isDuplicate: (i.improvements ?? []).length > 1 }));
  const systemItems: GroupedItem[] = systemCandidates
    .filter((sc) => sc.improvementId === improvementId)
    .map((sc) => ({ key: `s-${sc.id}-${improvementId}`, kind: "system", title: sc.title, status: sc.status, priority: sc.priority ?? null, assignee: sc.ownerName ?? sc.developerName ?? null, dateLabel: formatPlannedRange(sc.plannedStartDate, sc.plannedEndDate), boardSortOrder: sc.boardSortOrder ?? 0, isDuplicate: false, progress: systemProgress(sc) }));
  return [...hearingItems, ...taskItems, ...systemItems].sort((a, b) =>
    a.boardSortOrder - b.boardSortOrder
    || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    || a.title.localeCompare(b.title, "ja")
  );
}

/**
 * 改善プロジェクト一覧の印刷プレビュー。
 * 通常一覧の表形式ではなく、印刷時に読みやすいカード型のレイアウトで、
 * 改善案件の直下にヒアリング・タスク・システム化候補を常時展開して並べる。
 */
export default function ImprovementsPrint() {
  const { data: improvements = [], isLoading: loadingImprovements } = useListImprovements();
  const { data: hearings = [], isLoading: loadingHearings } = useListHearings();
  const { data: issues = [], isLoading: loadingIssues } = useListIssues();
  const { data: systemCandidates = [], isLoading: loadingSystemCandidates } = useTopLevelSystemCandidates();
  const isLoading = loadingImprovements || loadingHearings || loadingIssues || loadingSystemCandidates;
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());

  // ステータス「完了」の改善案件はプレビュー・印刷どちらにも出さない（表示するステータスバッジ自体も撤去済み）。
  const sorted = useMemo(() => [...improvements]
    .filter((imp) => imp.status !== "completed")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.title.localeCompare(b.title, "ja")), [improvements]);

  // 上部の「実施済／対応済み／リリース済み」マスタートグルが操作する対象キー一覧。1件が複数の
  // 改善案件に属す場合はその出現ごとの key（groupedItemsFor と同じ形式）をすべて含める。
  const completedKeysByKind = useMemo(() => ({
    hearing: hearings.filter((h) => h.status === COMPLETED_STATUS.hearing)
      .flatMap((h) => (h.improvements ?? []).map((r) => `h-${h.id}-${r.id}`)),
    task: issues.filter((i) => i.status === COMPLETED_STATUS.task)
      .flatMap((i) => (i.improvements ?? []).map((r) => `t-${i.id}-${r.id}`)),
    system: systemCandidates.filter((sc) => sc.status === COMPLETED_STATUS.system)
      .flatMap((sc) => (sc.improvementId ? [`s-${sc.id}-${sc.improvementId}`] : [])),
  }), [hearings, issues, systemCandidates]);

  function toggleIncluded(key: string) {
    setExcludedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleCompletedKind(kind: keyof typeof completedKeysByKind) {
    const keys = completedKeysByKind[kind];
    const allExcluded = keys.length > 0 && keys.every((k) => excludedKeys.has(k));
    setExcludedKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => { if (allExcluded) next.delete(k); else next.add(k); });
      return next;
    });
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Normal flow (not position:fixed), so this only appears once at the very top of page 1 —
          not repeated on every subsequent printed page. */}
      <div className="hidden print:block text-sm font-bold text-slate-700 mb-2">一覧</div>
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/improvements" className="text-slate-400 hover:text-primary">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">改善プロジェクト（印刷プレビュー）</h1>
            <p className="text-sm text-muted-foreground mt-1">この内容で印刷されます。</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            {(["hearing", "task", "system"] as const).map((kind) => {
              const keys = completedKeysByKind[kind];
              const checked = keys.length > 0 && keys.every((k) => excludedKeys.has(k));
              return (
                <div key={kind} className="flex items-center gap-1.5">
                  <Checkbox id={`completed-${kind}`} checked={checked} onCheckedChange={() => toggleCompletedKind(kind)} disabled={keys.length === 0} />
                  <Label htmlFor={`completed-${kind}`} className="text-sm text-slate-600 cursor-pointer">
                    {COMPLETED_LABEL[kind]}
                  </Label>
                </div>
              );
            })}
          </div>
          <Button className="gap-2" onClick={() => window.print()}>
            <Printer className="w-4 h-4" />印刷
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground">読み込み中...</div>
      ) : (
        <div className="space-y-4">
          {sorted.map((imp, idx) => {
            const grouped = groupedItemsFor(imp.id, hearings, issues, systemCandidates);

            return (
              <section key={imp.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden print:break-inside-avoid">
                <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="shrink-0 text-sm font-bold text-slate-400">{idx + 1}.</span>
                    <Badge variant="outline" className="shrink-0 bg-slate-50 text-slate-500 border-slate-200 font-normal" title="改善案件ID（固定）">
                      No.{imp.id}
                    </Badge>
                    {imp.departmentName ? (
                      <Badge variant="outline" className="bg-slate-900 text-white border-slate-900 font-medium">
                        {imp.departmentName}
                      </Badge>
                    ) : null}
                    {imp.divisionName ? (
                      <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 font-medium">
                        {imp.divisionName}
                      </Badge>
                    ) : null}
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">{imp.title}</span>
                      {imp.priority ? (
                        <Badge variant="outline" className={`shrink-0 rounded-full w-6 h-6 p-0 flex items-center justify-center text-[10px] leading-none font-medium ${getPriorityBadgeClass(imp.priority)} ${getPriorityPrintClass(imp.priority)}`}>
                          {imp.priority}
                        </Badge>
                      ) : null}
                    </div>
                    <span className="ml-auto shrink-0 text-xs text-slate-500 whitespace-nowrap">
                      {formatPlannedRange(imp.plannedStartDate, imp.plannedEndDate)}
                    </span>
                    {imp.status === "in_progress" && (() => {
                      const estimate = imp.progress == null ? estimateImprovementProgress(imp.id, hearings, issues, systemCandidates) : null;
                      return (
                        <ProgressBar value={imp.progress ?? estimate?.percent ?? 0} estimated={estimate != null} showLabel className="shrink-0 w-32" />
                      );
                    })()}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
                    <span className="min-w-0 flex-1 whitespace-pre-wrap text-slate-600">{imp.purpose || "-"}</span>
                  </div>
                </div>

                <div className="px-4 py-3">
                  {grouped.length === 0 ? (
                    <p className="py-2 text-xs text-slate-400">紐づく項目はありません</p>
                  ) : (
                    <div className="space-y-0">
                      {grouped.map((g) => {
                        const Icon = g.kind === "system" ? systemCandidateIcon(g.status) : KIND_ICON[g.kind];
                        const included = !excludedKeys.has(g.key);
                        const isDone = g.status === COMPLETED_STATUS[g.kind];
                        const isNotStarted = g.status === NOT_STARTED_STATUS[g.kind];
                        const statusLabel = KIND_STATUS_MAP[g.kind][g.status] || g.status;
                        // バッジは3文字の枠を基準にしているので、それより長いラベルは細字にして収まりやすくする。
                        const isLongStatusLabel = statusLabel.length > 3;
                        const isOtherStatus = !isDone && !isNotStarted;
                        const statusColorClass = isOtherStatus ? darkenBorderColor(getStatusColor(g.status, KIND_STATUS_MAP[g.kind])) : getStatusColor(g.status, KIND_STATUS_MAP[g.kind]);
                        return (
                          <div
                            key={g.key}
                            className={`flex flex-wrap items-center gap-2 px-1 py-0.5 text-[10px] hover:bg-slate-50 ${included ? "" : "print:hidden"}`}
                          >
                            <Checkbox
                              className={`shrink-0 print:hidden ${g.isDuplicate ? "data-[state=unchecked]:bg-amber-300 data-[state=unchecked]:border-amber-400" : ""}`}
                              checked={!included}
                              onCheckedChange={() => toggleIncluded(g.key)}
                              title={g.isDuplicate ? "他のプロジェクトにも重複して表示されています" : "印刷から除外"}
                            />
                            <span
                              className={`inline-flex items-center justify-center rounded-full shrink-0 h-4 w-4 border ${
                                g.kind === "system"
                                  ? "bg-slate-900 text-white border-slate-900"
                                  : "bg-white text-slate-500 border-slate-200"
                              }`}
                              title={KIND_LABEL[g.kind]}
                            >
                              <Icon className="w-2.5 h-2.5 shrink-0" />
                            </span>
                            <span className="min-w-0 flex-1 flex items-center gap-1">
                              <span className={`min-w-0 text-slate-700 ${isDone ? "text-[10px] line-through" : isOtherStatus ? "text-[11px] font-medium" : "text-[10px]"}`}>{g.title}</span>
                              {g.priority ? (
                                <Badge variant="outline" className={`shrink-0 rounded-full w-4 h-4 p-0 flex items-center justify-center text-[8px] leading-none font-medium ${getPriorityBadgeClass(g.priority)} ${getPriorityPrintClass(g.priority)}`}>
                                  {g.priority}
                                </Badge>
                              ) : null}
                            </span>
                            <span className="shrink-0 text-[10px] text-slate-500">{g.assignee || "-"}</span>
                            <span className="shrink-0 text-[10px] text-slate-500">{g.dateLabel}</span>
                            {g.progress && (
                              <span
                                className={`shrink-0 w-[3.5em] text-right text-[10px] tabular-nums ${g.progress.estimated ? "text-slate-400" : "text-slate-600 font-medium"}`}
                                title={g.progress.estimated ? "ステータスから計算した目安" : undefined}
                              >
                                {g.progress.estimated ? "≒" : ""}{g.progress.value}%
                              </span>
                            )}
                            <Badge
                              className={`w-14 shrink-0 justify-center text-center text-[10px] px-1 py-0 ${statusColorClass} ${isLongStatusLabel ? "font-light" : ""} ${isDone ? "print:!bg-slate-50 print:!text-slate-50 print:!border-transparent" : ""} ${isNotStarted ? "print:!font-normal" : ""}`}
                              variant="outline"
                            >
                              {statusLabel}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
