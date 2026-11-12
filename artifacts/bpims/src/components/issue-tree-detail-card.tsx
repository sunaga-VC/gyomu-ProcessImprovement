import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  useMoveIssue, useUpdateIssue, useDeleteIssue,
  getListIssuesQueryKey, type Issue,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Input } from "@/components/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IssueFormDialog } from "@/components/issue-form-dialog";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { ISSUE_STATUS, getPriorityBadgeClass, getStatusColor, isPastDue } from "@/lib/constants";
import { ISSUE_CATEGORY_ICONS } from "@/lib/issue-categories";
import { buildLocalHierarchy, type LocalTreeNode } from "@/lib/group-by-department";
import { Link } from "wouter";
import {
  Target, Search as SearchIcon, ChevronRight, ChevronDown, GripVertical,
  Pencil, Plus, Trash2,
} from "lucide-react";

export type IssueTreeDetailPrimary = { id: number; name: string };

function formatPlannedRange(startDate: string | null | undefined, endDate: string | null | undefined): string {
  if (!startDate && !endDate) return "-";
  const start = startDate ? startDate.replace(/-/g, "/") : "-";
  const end = endDate ? endDate.replace(/-/g, "/") : "-";
  return `${start} 〜 ${end}`;
}

/** Only nodes with children can be expanded, so 一括開閉 should only track those. */
function flattenExpandableIds(nodes: LocalTreeNode<Issue>[]): number[] {
  return nodes.flatMap((n) => (n.children.length > 0 ? [n.id, ...flattenExpandableIds(n.children)] : []));
}

/** Parent chain (nearest first) so a deep-linked child task's ancestors can be force-expanded to reveal it. */
function getAncestorIds(id: number, allIssues: Issue[]): number[] {
  const byId = new Map(allIssues.map((i) => [i.id, i]));
  const result: number[] = [];
  let current = byId.get(id);
  while (current?.parentId) {
    result.push(current.parentId);
    current = byId.get(current.parentId);
  }
  return result;
}

function getDescendantCount(node: LocalTreeNode<Issue>): number {
  return node.children.reduce((sum, c) => sum + 1 + getDescendantCount(c), 0);
}

/**
 * One axis-section card (改善プロジェクト / 部署 / 部門 — whichever the caller scopes `items` to) for
 * タスク一覧, matching 改善プロジェクト一覧の `ImprovementDetailCard` card-list style exactly: icon+count
 * header, 一括開閉 + 検索 + フィルター, then each task rendered as its own rounded card (child tasks
 * nested as smaller cards inside their parent's expanded body, with drag-and-drop reordering/reparenting).
 */
export function IssueTreeDetailCard({
  primary,
  items,
  allIssues,
  formDefaults,
  variant,
  autoSelectId,
  filterSlot,
}: {
  primary: IssueTreeDetailPrimary;
  /** This primary's tasks, already resolved by the caller. */
  items: Issue[];
  /** Full task list, for 配下変更 candidate parents / cycle exclusion. */
  allIssues: Issue[];
  /** Pre-filled axis fields when creating a new child from this section ("子タスク追加"). */
  formDefaults?: { defaultDepartmentIds?: number[]; defaultDivisionIds?: number[]; defaultImprovementIds?: number[] };
  /** "warning" tints the header amber, for the synthetic "未設定" section. */
  variant?: "warning";
  /** Deep link from 改善ボード — expands (but doesn't open the edit dialog for) this task once it's found in `items`. */
  autoSelectId?: number | null;
  /** Optional filter control rendered to the right of this card's search box. */
  filterSlot?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const moveIssue = useMoveIssue();
  const updateIssue = useUpdateIssue();
  const deleteIssue = useDeleteIssue();

  const [search, setSearch] = useState("");
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const sectionOpen = manualOpen ?? items.length > 0;
  const searchLower = search.trim().toLowerCase();
  const searchedItems = searchLower ? items.filter((i) => i.title.toLowerCase().includes(searchLower)) : items;
  const tree = useMemo(() => buildLocalHierarchy(searchedItems), [searchedItems]);
  const allIds = useMemo(() => flattenExpandableIds(tree), [tree]);

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const allExpanded = allIds.length > 0 && allIds.every((id) => expandedIds.has(id));
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [statusPopoverOpenId, setStatusPopoverOpenId] = useState<number | null>(null);
  const [openInfoId, setOpenInfoId] = useState<number | null>(null);

  useEffect(() => {
    if (!autoSelectId) return;
    if (items.some((i) => i.id === autoSelectId)) {
      setHighlightedId(autoSelectId);
      const ancestorIds = getAncestorIds(autoSelectId, allIssues);
      if (ancestorIds.length > 0) {
        setExpandedIds((prev) => {
          const next = new Set(prev);
          ancestorIds.forEach((id) => next.add(id));
          return next;
        });
      }
    }
  }, [autoSelectId, items, allIssues]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListIssuesQueryKey() });
  }

  function toggleExpanded(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleExpandAll() {
    setExpandedIds(allExpanded ? new Set() : new Set(allIds));
  }

  function handleStatusChange(issueId: number, status: string) {
    updateIssue.mutate({ id: issueId, data: { status } }, {
      onSuccess: () => { invalidate(); setStatusPopoverOpenId(null); },
    });
  }

  function handleDelete() {
    if (!deletingId) return;
    deleteIssue.mutate({ id: deletingId }, { onSuccess: () => { invalidate(); setDeletingId(null); } });
  }

  function reindexSiblings(parentId: number | null, orderedIds: number[]) {
    orderedIds.forEach((id, idx) => {
      const i = items.find((x) => x.id === id) ?? allIssues.find((x) => x.id === id);
      if (!i) return;
      if (i.sortOrder !== idx || (i.parentId ?? null) !== parentId) {
        moveIssue.mutate({ id, data: { newParentId: parentId, sortOrder: idx } }, { onSuccess: invalidate });
      }
    });
  }

  function handleDropOnNode(e: React.DragEvent, target: Issue) {
    if (draggedId === null || draggedId === target.id) { setDraggedId(null); return; }
    const dragged = allIssues.find((i) => i.id === draggedId);
    setDraggedId(null);
    if (!dragged) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dropAfter = e.clientY > rect.top + rect.height / 2;
    const newParentId = target.parentId ?? null;
    const siblings = items
      .filter((i) => (i.parentId ?? null) === newParentId && i.id !== dragged.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const targetIdx = siblings.findIndex((s) => s.id === target.id);
    const insertIdx = targetIdx === -1 ? siblings.length : dropAfter ? targetIdx + 1 : targetIdx;
    const orderedIds = [...siblings.slice(0, insertIdx).map((s) => s.id), dragged.id, ...siblings.slice(insertIdx).map((s) => s.id)];
    reindexSiblings(newParentId, orderedIds);
  }

  // ルート行へのドロップは2通り：ルート同士なら並び替え（兄弟のまま前後に挿入）、
  // 子タスクをルートにドロップした場合は、そのルートの配下へ移動（末尾に追加）。
  function handleDropOnRoot(e: React.DragEvent, root: Issue) {
    if (draggedId === null || draggedId === root.id) { setDraggedId(null); return; }
    const dragged = allIssues.find((i) => i.id === draggedId);
    setDraggedId(null);
    if (!dragged) return;
    const draggedIsRoot = (dragged.parentId ?? null) === null;
    if (draggedIsRoot) {
      const rect = e.currentTarget.getBoundingClientRect();
      const dropAfter = e.clientY > rect.top + rect.height / 2;
      const rootSiblings = items.filter((i) => (i.parentId ?? null) === null && i.id !== dragged.id).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const targetIdx = rootSiblings.findIndex((s) => s.id === root.id);
      const insertIdx = targetIdx === -1 ? rootSiblings.length : dropAfter ? targetIdx + 1 : targetIdx;
      const orderedIds = [...rootSiblings.slice(0, insertIdx).map((s) => s.id), dragged.id, ...rootSiblings.slice(insertIdx).map((s) => s.id)];
      reindexSiblings(null, orderedIds);
      return;
    }
    const siblings = items.filter((i) => (i.parentId ?? null) === root.id && i.id !== dragged.id).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    reindexSiblings(root.id, [...siblings.map((s) => s.id), dragged.id]);
  }

  function renderTaskCard(node: LocalTreeNode<Issue>, level: number) {
    const isExpanded = expandedIds.has(node.id);
    const TaskIcon = (node.category ? ISSUE_CATEGORY_ICONS[node.category] : undefined) ?? Target;
    const isRoot = level === 0;
    const hasChildren = node.children.length > 0;
    return (
      <section
        key={node.id}
        draggable
        onDragStart={(e) => { e.stopPropagation(); setDraggedId(node.id); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); isRoot ? handleDropOnRoot(e, node) : handleDropOnNode(e, node); }}
        className={`rounded-xl border bg-white shadow-sm overflow-hidden ${draggedId === node.id ? "opacity-50" : ""} ${highlightedId === node.id || (isExpanded && hasChildren) ? "border-primary bg-primary/5" : "border-slate-200"}`}
      >
        <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0 cursor-grab active:cursor-grabbing" />
            <Popover open={openInfoId === node.id} onOpenChange={(o) => !o && setOpenInfoId(null)}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:text-primary hover:border-slate-300"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenInfoId((prev) => (prev === node.id ? null : node.id));
                  }}
                  title="タスクの内容を表示"
                >
                  <TaskIcon className="w-3.5 h-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="max-w-xs whitespace-pre-wrap bg-slate-900 text-white border border-slate-700 rounded-md px-3 py-2 shadow-lg z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-xs font-bold mb-1">内容</p>
                <p className="text-xs">{node.content || "未設定"}</p>
              </PopoverContent>
            </Popover>
            <button
              type="button"
              disabled={!hasChildren}
              className={`shrink-0 ${hasChildren ? "text-slate-300 hover:text-primary" : "text-slate-200 cursor-default"}`}
              onClick={(e) => { e.stopPropagation(); if (hasChildren) toggleExpanded(node.id); }}
              title={hasChildren ? "子タスクを表示" : "子タスクはありません"}
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded && hasChildren ? "" : "-rotate-90"}`} />
            </button>
            {(node.departments?.length ?? 0) > 0 && (
              node.departments!.map((d) => (
                <Badge key={`d${d.id}`} variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-900 text-white border-slate-900 font-medium shrink-0">
                  {d.name}
                </Badge>
              ))
            )}
            {(node.divisions?.length ?? 0) > 0 && (
              node.divisions!.map((d) => (
                <Badge key={`v${d.id}`} variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-800 border-blue-200 font-medium shrink-0">
                  {d.name}
                </Badge>
              ))
            )}
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <span className={`truncate text-xs font-semibold ${node.status === "resolved" ? "line-through text-slate-500" : "text-slate-900"}`}>{node.title}</span>
              {node.priority ? (
                <Badge variant="outline" className={`shrink-0 rounded-full w-6 h-6 p-0 flex items-center justify-center text-[10px] leading-none font-medium ${getPriorityBadgeClass(node.priority)}`}>
                  {node.priority}
                </Badge>
              ) : null}
              {isPastDue(node.plannedEndDate, node.status === "resolved") && (
                <Badge className="text-[10px] px-1.5 py-0 bg-red-50 text-red-700 border-red-200 shrink-0" variant="outline">期限超過</Badge>
              )}
              {hasChildren && (
                <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 bg-slate-50 text-slate-500 border-slate-200 font-normal">
                  {getDescendantCount(node) + 1}件
                </Badge>
              )}
            </div>
            <span className="shrink-0 text-xs text-slate-400 whitespace-nowrap">{node.ownerName || "-"}</span>
            <span className="ml-auto shrink-0 text-xs text-slate-500 whitespace-nowrap">
              {formatPlannedRange(node.plannedStartDate, node.plannedEndDate)}
            </span>
            <Popover
              open={statusPopoverOpenId === node.id}
              onOpenChange={(open) => setStatusPopoverOpenId(open ? node.id : null)}
            >
              <PopoverTrigger asChild>
                <button type="button" className="shrink-0" onClick={(e) => e.stopPropagation()} title="ステータスを変更">
                  <Badge className={`cursor-pointer ${getStatusColor(node.status, ISSUE_STATUS)}`} variant="outline">
                    {ISSUE_STATUS[node.status as keyof typeof ISSUE_STATUS] || node.status}
                  </Badge>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-1" align="start" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-0.5">
                  {Object.entries(ISSUE_STATUS).map(([k, v]) => (
                    <button
                      key={k}
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100"
                      onClick={() => handleStatusChange(node.id, k)}
                    >
                      <Badge className={getStatusColor(k, ISSUE_STATUS)} variant="outline">{v}</Badge>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0 text-slate-400 hover:text-primary"
              onClick={(e) => { e.stopPropagation(); setEditingIssue(null); setAddParentId(node.id); setFormOpen(true); }}
              title="子タスクを追加"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <div className="flex flex-col gap-0.5 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="h-4 w-4 text-slate-400 hover:text-primary"
                onClick={(e) => { e.stopPropagation(); setEditingIssue(node); setFormOpen(true); }}
                title="タスクを編集"
              >
                <Pencil className="w-2.5 h-2.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-4 w-4 text-slate-400 hover:text-red-600"
                onClick={(e) => { e.stopPropagation(); setDeletingId(node.id); }}
                title="タスクを削除"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </Button>
            </div>
          </div>
        </div>

        {hasChildren && (
          <div className={`${isExpanded ? "block" : "hidden"} px-4 pb-3 mt-1`} onClick={(e) => e.stopPropagation()}>
            <div className="space-y-1 pl-3 ml-1 border-l-2 border-slate-200">
              {node.children.map((c) => renderTaskCard(c, level + 1))}
            </div>
          </div>
        )}
      </section>
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
            <Target className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className={`text-sm font-bold ${variant === "warning" ? "text-amber-700" : "text-slate-900"}`}>{primary.name}</h3>
            <Badge variant="outline" className={variant === "warning" ? "bg-amber-50 text-amber-700 border-amber-200 font-medium" : "bg-blue-50 text-blue-700 border-blue-200 font-medium"}>{items.length}件</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs shrink-0"
            disabled={allIds.length === 0}
            onClick={toggleExpandAll}
          >
            {allExpanded ? "すべて閉じる" : "すべて開く"}
          </Button>
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="タスクを検索" className="pl-8 h-8 text-sm w-48" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {filterSlot}
        </div>
      </div>

      {sectionOpen && (
        <div className="mt-3 space-y-2">
          {tree.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{search ? "該当するタスクがありません" : "紐づくタスクがありません"}</p>
          ) : (
            tree.map((root) => renderTaskCard(root, 0))
          )}
        </div>
      )}

      <IssueFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editingIssue={editingIssue}
        defaultParentId={editingIssue ? undefined : addParentId ?? undefined}
        defaultDepartmentIds={editingIssue ? undefined : formDefaults?.defaultDepartmentIds}
        defaultDivisionIds={editingIssue ? undefined : formDefaults?.defaultDivisionIds}
        defaultImprovementIds={editingIssue ? undefined : formDefaults?.defaultImprovementIds}
      />

      <ConfirmDeleteDialog
        open={deletingId !== null}
        onOpenChange={(o) => !o && setDeletingId(null)}
        onConfirm={handleDelete}
        isPending={deleteIssue.isPending}
        title="このタスクを削除しますか？"
      />
    </div>
  );
}
