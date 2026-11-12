import { useEffect, useMemo, useRef, useState } from "react";
import {
  useListImprovements, useListDepartments, useListDivisions,
  useListHearings, useUpdateHearing, getListHearingsQueryKey,
  useListIssues, useUpdateIssue, getListIssuesQueryKey,
  useUpdateSystemCandidate, getListSystemCandidatesQueryKey,
  type Hearing, type Issue, type SystemCandidate, type Improvement,
} from "@workspace/api-client-react";
import { Card, Badge } from "@/components/ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HEARING_STATUS, ISSUE_STATUS, SYSTEM_CANDIDATE_STATUS, getStatusColor } from "@/lib/constants";
import { useQueryClient } from "@tanstack/react-query";
import { useTopLevelSystemCandidates } from "@/lib/top-level-system-candidates";
import { Link } from "wouter";
import { X, UsersRoundCollaboration, Target, Server, FileText, ExternalLink } from "lucide-react";
import { systemCandidateIcon } from "@/lib/kind-icons";

type BoardCard = {
  key: string;
  kind: "hearing" | "task" | "system";
  id: number;
  title: string;
  status: string;
  departmentId: number | null;
  departmentName: string | null;
  divisionName: string | null;
  divisionIds: number[];
  improvementIds: number[];
  boardSortOrder: number;
  /** hearing: 目的・確認事項 */
  purpose?: string | null;
  /** hearing: 実施済みの場合のヒアリング内容 */
  answers?: string | null;
  documents?: { id: number; name: string }[];
  systems?: { id: number; name: string }[];
  /** task: タスク内容 */
  content?: string | null;
  /** system: 解決したい課題 */
  problemToSolve?: string | null;
};

const CARD_TOOLTIP_LABEL: Record<BoardCard["kind"], string> = { hearing: "目的・確認事項", task: "内容", system: "解決したい課題" };
function cardTooltipText(card: BoardCard): string | null {
  if (card.kind === "hearing") return card.purpose ?? null;
  if (card.kind === "task") return card.content ?? null;
  return card.problemToSolve ?? null;
}

type BoardColumn = {
  id: number;
  title: string;
  priority: string | null;
  departmentName: string | null;
  divisionName: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  items: BoardCard[];
};

function formatPlannedRange(startDate: string | null, endDate: string | null): string {
  if (!startDate && !endDate) return "-";
  const start = startDate ? startDate.replace(/-/g, "/") : "-";
  const end = endDate ? endDate.replace(/-/g, "/") : "-";
  return `${start} 〜 ${end}`;
}

const CARD_KIND_LABEL: Record<BoardCard["kind"], string> = { hearing: "ヒアリング", task: "タスク", system: "システム化" };
const CARD_KIND_HREF: Record<BoardCard["kind"], string> = { hearing: "/hearings", task: "/issues", system: "/system-candidates" };
const CARD_STATUS_MAP: Record<BoardCard["kind"], Record<string, string>> = { hearing: HEARING_STATUS, task: ISSUE_STATUS, system: SYSTEM_CANDIDATE_STATUS };

const UNASSIGNED_COLUMN_ID = -1;
const CARD_KIND_ORDER: Record<BoardCard["kind"], number> = { hearing: 0, task: 1, system: 2 };

function getPriorityBadgeClass(priority?: string | null) {
  if (priority === "高") return "rounded-full w-6 h-6 p-0 flex items-center justify-center text-[10px] leading-none bg-red-50 text-red-700 border-red-200";
  if (priority === "中") return "rounded-full w-6 h-6 p-0 flex items-center justify-center text-[10px] leading-none bg-amber-50 text-amber-700 border-amber-200";
  if (priority) return "rounded-full w-6 h-6 p-0 flex items-center justify-center text-[10px] leading-none bg-slate-50 text-slate-600 border-slate-200";
  return "rounded-full w-6 h-6 p-0 flex items-center justify-center text-[10px] leading-none bg-slate-50 text-slate-400 border-slate-200";
}

function sortCards(items: BoardCard[]): BoardCard[] {
  return [...items].sort((a, b) =>
    a.boardSortOrder - b.boardSortOrder
    || CARD_KIND_ORDER[a.kind] - CARD_KIND_ORDER[b.kind]
    || a.title.localeCompare(b.title, "ja")
  );
}

function isCardInColumn(card: BoardCard, columnId: number): boolean {
  return columnId === UNASSIGNED_COLUMN_ID ? card.improvementIds.length === 0 : card.improvementIds.includes(columnId);
}

/** Walks up from `el` to find the nearest ancestor that actually scrolls vertically, falling back to the window. */
function getScrollParent(el: HTMLElement | null): HTMLElement | (Window & typeof globalThis) {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return window;
}

const DRAG_AUTOSCROLL_EDGE_PX = 80;
const DRAG_AUTOSCROLL_MAX_SPEED = 20;

export type BoardAxisMode = "management" | "department" | "division";

/**
 * 改善プロジェクトを「ブロック」としたカンバンボード本体。/improvements/board ページから axisMode
 * （一覧・部署ごと・部門ごと）を受け取り、部署・部門ごとの軸では改善案件一覧の部署ごと/部門ごと表示と
 * 同じ考え方で、担当部署・担当部門ごとに独立したミニボード（列＝その部署/部門の改善案件＋未当て込み）
 * を並べる。ヒアリング・タスクは複数の改善案件に同時に属せる多対多の関係なので、ドラッグ操作は「その
 * ブロックへの追加」であり元の割当ては消えない。システム化候補は改善案件1件にしか属さない設計
 * （system_candidates.improvementId）なのでドロップは「置き換え」になり、また部署・部門の情報を
 * 持たないため、部署ごと/部門ごとの軸では紐づく改善案件のブロック内にのみ現れる。
 */
export function ImprovementsBoardView({ axisMode }: { axisMode: BoardAxisMode }) {
  const queryClient = useQueryClient();
  const [draggedCard, setDraggedCard] = useState<BoardCard | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // カードをドラッグ中、画面端（スクロール先の上下）に近づいたら自動でスクロールする。
  // ボードの実際のスクロール領域は <main> 側の overflow-y-auto なので window ではなく
  // それを都度探して動かす。
  useEffect(() => {
    if (!draggedCard) return;
    const scrollParent = getScrollParent(rootRef.current);
    let dir = 0;
    let speed = 0;
    let rafId = 0;

    function onDragOver(e: DragEvent) {
      const rect = scrollParent === window
        ? { top: 0, bottom: window.innerHeight }
        : (scrollParent as HTMLElement).getBoundingClientRect();
      const y = e.clientY;
      if (y < rect.top + DRAG_AUTOSCROLL_EDGE_PX) {
        dir = -1;
        speed = Math.max(4, DRAG_AUTOSCROLL_MAX_SPEED * (rect.top + DRAG_AUTOSCROLL_EDGE_PX - y) / DRAG_AUTOSCROLL_EDGE_PX);
      } else if (y > rect.bottom - DRAG_AUTOSCROLL_EDGE_PX) {
        dir = 1;
        speed = Math.max(4, DRAG_AUTOSCROLL_MAX_SPEED * (y - (rect.bottom - DRAG_AUTOSCROLL_EDGE_PX)) / DRAG_AUTOSCROLL_EDGE_PX);
      } else {
        dir = 0;
      }
    }

    function tick() {
      if (dir !== 0) scrollParent.scrollBy(0, dir * speed);
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    window.addEventListener("dragover", onDragOver, { capture: true });

    return () => {
      window.removeEventListener("dragover", onDragOver, { capture: true });
      cancelAnimationFrame(rafId);
    };
  }, [draggedCard]);

  const { data: improvements = [], isLoading: loadingImprovements } = useListImprovements();
  const { data: hearings = [], isLoading: loadingHearings } = useListHearings();
  const { data: issues = [], isLoading: loadingIssues } = useListIssues();
  const { data: systemCandidates = [], isLoading: loadingSystemCandidates } = useTopLevelSystemCandidates();
  const { data: departments = [] } = useListDepartments();
  const { data: divisions = [] } = useListDivisions();
  const updateHearing = useUpdateHearing();
  const updateIssue = useUpdateIssue();
  const updateSystemCandidate = useUpdateSystemCandidate();

  const isLoading = loadingImprovements || loadingHearings || loadingIssues || loadingSystemCandidates;

  const cards = useMemo<BoardCard[]>(() => [
    ...hearings.map((h: Hearing): BoardCard => ({
      key: `h-${h.id}`, kind: "hearing", id: h.id, title: h.title, status: h.status,
      departmentId: h.departmentId ?? null, departmentName: h.departmentName ?? null, divisionName: h.divisionName ?? null,
      divisionIds: (h.divisions ?? []).map((d) => d.id), improvementIds: (h.improvements ?? []).map((i) => i.id),
      boardSortOrder: h.boardSortOrder ?? 0,
      purpose: h.purpose ?? null, answers: h.answers ?? null,
      documents: h.documents ?? [],
      systems: h.systems ?? [],
    })),
    ...issues.map((i: Issue): BoardCard => ({
      key: `t-${i.id}`, kind: "task", id: i.id, title: i.title, status: i.status,
      departmentId: i.departmentId ?? null, departmentName: i.departmentName ?? null, divisionName: i.divisionName ?? null,
      divisionIds: (i.divisions ?? []).map((d) => d.id), improvementIds: (i.improvements ?? []).map((x) => x.id),
      boardSortOrder: i.boardSortOrder ?? 0,
      content: i.content ?? null,
    })),
    ...systemCandidates.map((sc: SystemCandidate): BoardCard => ({
      key: `s-${sc.id}`, kind: "system", id: sc.id, title: sc.title, status: sc.status,
      departmentId: null, departmentName: null, divisionName: null, divisionIds: [],
      improvementIds: sc.improvementId ? [sc.improvementId] : [],
      boardSortOrder: sc.boardSortOrder ?? 0,
      problemToSolve: sc.problemToSolve ?? null,
    })),
  ], [hearings, issues, systemCandidates]);

  function buildColumns(imps: Improvement[], unassignedItems: BoardCard[]): BoardColumn[] {
    const columns: BoardColumn[] = [];
    if (unassignedItems.length > 0) {
      columns.push({ id: UNASSIGNED_COLUMN_ID, title: "未当て込み", priority: null, departmentName: null, divisionName: null, plannedStartDate: null, plannedEndDate: null, items: sortCards(unassignedItems) });
    }
    columns.push(...imps.map((imp) => ({
      id: imp.id, title: imp.title, priority: imp.priority ?? null, departmentName: imp.departmentName ?? null, divisionName: imp.divisionName ?? null,
      plannedStartDate: imp.plannedStartDate ?? null, plannedEndDate: imp.plannedEndDate ?? null,
      items: sortCards(cards.filter((c) => c.improvementIds.includes(imp.id))),
    })));
    return columns;
  }

  type BoardSection = { key: string; title: string; variant?: "warning"; columns: BoardColumn[] };

  const managementSections = useMemo<BoardSection[]>(() => [
    { key: "all", title: "改善プロジェクト一覧", columns: buildColumns(improvements, cards.filter((c) => c.improvementIds.length === 0)) },
  ], [improvements, cards]);

  const departmentSections = useMemo<BoardSection[]>(() => {
    const sorted = [...departments].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, "ja"));
    const sections: BoardSection[] = sorted.map((d) => {
      const deptImps = improvements.filter((i) => i.departmentId === d.id);
      const deptImpIds = new Set(deptImps.map((i) => i.id));
      const unassigned = cards.filter((c) => c.departmentId === d.id && !c.improvementIds.some((id) => deptImpIds.has(id)));
      return { key: `d-${d.id}`, title: d.name, columns: buildColumns(deptImps, unassigned) };
    });
    const noDeptImps = improvements.filter((i) => !i.departmentId);
    const noDeptImpIds = new Set(noDeptImps.map((i) => i.id));
    const noDeptUnassigned = cards.filter((c) => !c.departmentId && !c.improvementIds.some((id) => noDeptImpIds.has(id)));
    if (noDeptImps.length > 0 || noDeptUnassigned.length > 0) {
      sections.push({ key: "d-none", title: "部署未設定", variant: "warning", columns: buildColumns(noDeptImps, noDeptUnassigned) });
    }
    return sections;
  }, [departments, improvements, cards]);

  const divisionSections = useMemo<BoardSection[]>(() => {
    const sorted = [...divisions].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, "ja"));
    const sections: BoardSection[] = sorted.map((d) => {
      const divImps = improvements.filter((i) => (i.divisions ?? []).some((x) => x.id === d.id));
      const divImpIds = new Set(divImps.map((i) => i.id));
      const unassigned = cards.filter((c) => c.divisionIds.includes(d.id) && !c.improvementIds.some((id) => divImpIds.has(id)));
      return { key: `v-${d.id}`, title: d.name, columns: buildColumns(divImps, unassigned) };
    });
    const noDivImps = improvements.filter((i) => !i.divisions || i.divisions.length === 0);
    const noDivImpIds = new Set(noDivImps.map((i) => i.id));
    const noDivUnassigned = cards.filter((c) => c.divisionIds.length === 0 && !c.improvementIds.some((id) => noDivImpIds.has(id)));
    if (noDivImps.length > 0 || noDivUnassigned.length > 0) {
      sections.push({ key: "v-none", title: "部門未設定", variant: "warning", columns: buildColumns(noDivImps, noDivUnassigned) });
    }
    return sections;
  }, [divisions, improvements, cards]);

  const sections = axisMode === "management" ? managementSections : axisMode === "department" ? departmentSections : divisionSections;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListHearingsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListIssuesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListSystemCandidatesQueryKey() });
  }

  function setCardImprovementIds(card: BoardCard, improvementIds: number[]) {
    if (card.kind === "hearing") {
      updateHearing.mutate({ id: card.id, data: { improvementIds } }, { onSuccess: invalidate });
    } else if (card.kind === "task") {
      updateIssue.mutate({ id: card.id, data: { improvementIds } }, { onSuccess: invalidate });
    } else {
      updateSystemCandidate.mutate({ id: card.id, data: { improvementId: improvementIds[0] ?? null } }, { onSuccess: invalidate });
    }
  }

  function handleDragStart(card: BoardCard) {
    setDraggedCard(card);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function handleDrop(columnId: number) {
    if (!draggedCard) return;
    if (columnId === UNASSIGNED_COLUMN_ID) {
      setCardImprovementIds(draggedCard, []);
    } else if (draggedCard.kind === "system") {
      // システム化候補は改善案件1件にしか属さないので、ドロップは追加ではなく置き換え。
      setCardImprovementIds(draggedCard, [columnId]);
    } else if (!draggedCard.improvementIds.includes(columnId)) {
      setCardImprovementIds(draggedCard, [...draggedCard.improvementIds, columnId]);
    }
    setDraggedCard(null);
  }
  function handleRemoveFromColumn(card: BoardCard, columnId: number) {
    setCardImprovementIds(card, card.improvementIds.filter((id) => id !== columnId));
  }

  function setCardBoardSortOrder(card: BoardCard, boardSortOrder: number) {
    if (card.boardSortOrder === boardSortOrder) return;
    if (card.kind === "hearing") {
      updateHearing.mutate({ id: card.id, data: { boardSortOrder } }, { onSuccess: invalidate });
    } else if (card.kind === "task") {
      updateIssue.mutate({ id: card.id, data: { boardSortOrder } }, { onSuccess: invalidate });
    } else {
      updateSystemCandidate.mutate({ id: card.id, data: { boardSortOrder } }, { onSuccess: invalidate });
    }
  }

  // 列内の見た目の並び順（0始まりの連番）をそのままboardSortOrderとして各カードに保存する。
  // ヒアリング・タスクは複数の改善案件ブロックに同時に属し得るため、この値は列ごとではなく
  // カード共通の1つの値になる（別の列で並び替えると、この列での並びは崩れうる）。
  function reindexColumn(col: BoardColumn, orderedKeys: string[]) {
    orderedKeys.forEach((key, idx) => {
      const card = col.items.find((c) => c.key === key);
      if (card) setCardBoardSortOrder(card, idx);
    });
  }

  function handleCardDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleCardDrop(e: React.DragEvent, targetCard: BoardCard, col: BoardColumn) {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedCard || draggedCard.key === targetCard.key) { setDraggedCard(null); return; }
    if (!isCardInColumn(draggedCard, col.id)) {
      // このブロックにまだ属していないカードがドロップされた＝ブロックへの割当変更。
      handleDrop(col.id);
      return;
    }
    // ドロップ先カードの上半分なら手前に、下半分なら後ろに挿入する（隣接カードとの入れ替えにも対応するため）。
    const rect = e.currentTarget.getBoundingClientRect();
    const dropAfter = e.clientY > rect.top + rect.height / 2;
    const others = col.items.filter((c) => c.key !== draggedCard.key);
    const targetIdx = others.findIndex((c) => c.key === targetCard.key);
    const insertIdx = targetIdx === -1 ? others.length : dropAfter ? targetIdx + 1 : targetIdx;
    const orderedKeys = [...others.slice(0, insertIdx).map((c) => c.key), draggedCard.key, ...others.slice(insertIdx).map((c) => c.key)];
    reindexColumn(col, orderedKeys);
    setDraggedCard(null);
  }

  if (isLoading) return <div className="p-12 text-center text-muted-foreground">読み込み中...</div>;

  return (
    <div className="space-y-6" ref={rootRef}>
      {sections.map((section) => (
        <div key={section.key}>
          {axisMode !== "management" && (
            <div className="flex items-center gap-2 mb-2">
              <h3 className={`text-sm font-bold ${section.variant === "warning" ? "text-amber-700" : "text-slate-900"}`}>{section.title}</h3>
              <Badge variant="outline" className={section.variant === "warning" ? "bg-amber-50 text-amber-700 border-amber-200 font-medium" : "bg-blue-50 text-blue-700 border-blue-200 font-medium"}>
                {section.columns.reduce((n, c) => n + c.items.length, 0)}件
              </Badge>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
            {section.columns.map((col) => (
              <div
                key={col.id}
                className="flex flex-col bg-slate-100/80 border border-slate-200 rounded-xl"
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(col.id)}
              >
                <div className="p-3 border-b border-slate-200 bg-slate-100 rounded-t-xl">
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {col.id === UNASSIGNED_COLUMN_ID ? (
                        <h3 className="font-bold text-xs text-amber-700 truncate">{col.title}</h3>
                      ) : (
                        <>
                          <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0 bg-slate-50 text-slate-500 border-slate-200 font-normal" title="改善案件ID（固定）">
                            No.{col.id}
                          </Badge>
                          <Link href={`/improvements?openId=${col.id}`} className="font-bold text-xs text-slate-800 hover:text-primary truncate">
                            {col.title}
                          </Link>
                        </>
                      )}
                      {col.priority && (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${getPriorityBadgeClass(col.priority)}`}>
                          {col.priority}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs font-semibold bg-white text-slate-600 px-2 py-0.5 rounded-full shadow-sm shrink-0">{col.items.length}</span>
                  </div>
                  {(col.departmentName || col.divisionName) && (
                    <div className="flex items-center gap-1 flex-wrap mt-1.5">
                      {col.departmentName && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 bg-black text-white border-black font-bold shrink-0">
                          {col.departmentName}
                        </Badge>
                      )}
                      {col.divisionName && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 bg-blue-50 text-blue-800 border-blue-200 font-bold shrink-0">
                          {col.divisionName}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex-1 p-3 space-y-2 min-h-[80px]">
                  {col.items.map((card) => (
                    <Tooltip key={card.key}>
                    <TooltipTrigger asChild>
                    <Card
                      draggable
                      onDragStart={() => handleDragStart(card)}
                      onDragEnd={() => setDraggedCard(null)}
                      onDragOver={handleCardDragOver}
                      onDrop={(e) => handleCardDrop(e, card, col)}
                      className={`p-3 cursor-grab hover:shadow-md transition-all active:cursor-grabbing border-l-4 group ${card.kind === "system" ? "bg-emerald-50" : "bg-white"} ${card.improvementIds.length > 1 ? "border-l-[#1f4f8f]" : "border-l-[#9aa8be]"}`}
                    >
                      <div className="flex justify-between items-start gap-2 ml-0.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          {card.kind === "hearing" ? <UsersRoundCollaboration className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : card.kind === "task" ? <Target className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : (() => { const Icon = systemCandidateIcon(card.status); return <Icon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />; })()}
                          {card.departmentName && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 bg-black text-white border-black font-bold shrink-0">
                              {card.departmentName}
                            </Badge>
                          )}
                          {card.divisionName && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 bg-blue-50 text-blue-800 border-blue-200 font-bold shrink-0">
                              {card.divisionName}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link
                              href={`${CARD_KIND_HREF[card.kind]}?openId=${card.id}`}
                              className="text-slate-300 hover:text-primary"
                              title={`${CARD_KIND_LABEL[card.kind]}一覧で開く`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                            {col.id !== UNASSIGNED_COLUMN_ID && (
                              <button
                                type="button"
                                className="text-slate-300 hover:text-red-600"
                                onClick={() => handleRemoveFromColumn(card, col.id)}
                                title="このブロックから外す"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <Badge
                            className={`text-[10px] px-1.5 py-0 shrink-0 ${getStatusColor(card.status, CARD_STATUS_MAP[card.kind])}`}
                            variant="outline"
                          >
                            {CARD_STATUS_MAP[card.kind][card.status] || card.status}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-1 flex items-start justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-bold text-xs leading-snug text-slate-800 whitespace-normal break-words min-w-0">
                              {card.title}
                            </span>
                            {card.kind === "hearing" && (
                              <div className="flex items-center gap-1 shrink-0">
                                {(card.documents?.length ?? 0) > 0 && (
                                  <Link
                                    href={`/documents?openId=${card.documents![0].id}`}
                                    className="text-slate-300 hover:text-primary"
                                    title="関連書類一覧で開く"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                  </Link>
                                )}
                                {(card.systems?.length ?? 0) > 0 && (
                                  <Link
                                    href={`/systems?openId=${card.systems![0].id}`}
                                    className="text-slate-300 hover:text-primary"
                                    title="利用システム一覧で開く"
                                  >
                                    <Server className="w-3.5 h-3.5" />
                                  </Link>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs whitespace-pre-wrap bg-slate-900 text-white border border-slate-700 rounded-md px-3 py-2 shadow-lg z-50">
                      <p className="text-xs font-bold mb-1">{CARD_TOOLTIP_LABEL[card.kind]}</p>
                      <p className="text-xs">{cardTooltipText(card) || "未設定"}</p>
                      {card.kind === "hearing" && card.status === "conducted" && (
                        <>
                          <p className="text-xs font-bold mt-2 mb-1">ヒアリング内容</p>
                          <p className="text-xs">{card.answers || "未記入"}</p>
                        </>
                      )}
                    </TooltipContent>
                    </Tooltip>
                  ))}
                  {col.items.length === 0 && (
                    <div className="h-full flex items-center justify-center border-2 border-dashed border-slate-200 rounded-lg p-4 bg-slate-50/50">
                      <span className="text-xs text-slate-400 font-medium text-center">ここにドロップ</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
