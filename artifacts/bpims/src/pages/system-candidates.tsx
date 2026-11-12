import { useEffect, useState } from "react";
import { useListSystemCandidates, useCreateSystemCandidate, useUpdateSystemCandidate, useDeleteSystemCandidate, useListImprovements, getListSystemCandidatesQueryKey, type SystemCandidate } from "@workspace/api-client-react";
import { Badge, Button, Input, Label } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { SYSTEM_CANDIDATE_STATUS, getStatusColor, isPastDue } from "@/lib/constants";
import { ProgressBar } from "@/components/progress-bar";
import { systemCandidateIcon } from "@/lib/kind-icons";
import { estimateSystemProgressByStatus, systemProgress } from "@/lib/improvement-progress";
import { MonitorCog, MessageCircleCheck, Plus, Search as SearchIcon, Filter, Pencil, Trash2, GripVertical, Link2, X, ChevronRight, ChevronDown, Printer } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams, Link } from "wouter";

const NO_PARENT = "none";
const EMPTY = { title: "", parentId: NO_PARENT, improvementId: "", targetUsers: "", ownerName: "", problemToSolve: "", requiredFeatures: "", priority: "", estimatedUsers: "", plannedStartDate: "", plannedEndDate: "", status: "candidate", progress: "", links: [] as { name: string; url: string }[] };
const PRIORITIES = ["高", "中", "低"];

/**
 * Default display order when nothing has been manually dragged: 未リリースを完了予定日が近い順
 * （未設定は登録が古い順）で先に、その後にリリース済みを完了予定日が新しい順で並べる。
 */
function compareSystemCandidatesDefault(a: SystemCandidate, b: SystemCandidate): number {
  const aDone = a.status === "released";
  const bDone = b.status === "released";
  if (aDone !== bDone) return aDone ? 1 : -1;
  if (!aDone) {
    if (a.plannedEndDate && b.plannedEndDate) return a.plannedEndDate.localeCompare(b.plannedEndDate);
    if (a.plannedEndDate) return -1;
    if (b.plannedEndDate) return 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }
  if (a.plannedEndDate && b.plannedEndDate) return b.plannedEndDate.localeCompare(a.plannedEndDate);
  if (a.plannedEndDate) return -1;
  if (b.plannedEndDate) return 1;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/** listSortOrder (manual drag) wins first; ties (e.g. everything still at the default 0) fall back to compareSystemCandidatesDefault. */
function compareSystemCandidates(a: SystemCandidate, b: SystemCandidate): number {
  return (a.listSortOrder ?? 0) - (b.listSortOrder ?? 0) || compareSystemCandidatesDefault(a, b);
}

type SystemCandidateNode = SystemCandidate & { children: SystemCandidateNode[] };

/** A node whose parent isn't in `items` (filtered out, or deleted) becomes a root instead of disappearing. */
function buildSystemCandidateTree(items: SystemCandidate[]): SystemCandidateNode[] {
  const idSet = new Set(items.map((i) => i.id));
  const childrenByParent = new Map<number, SystemCandidate[]>();
  const roots: SystemCandidate[] = [];
  for (const item of items) {
    if (item.parentId && idSet.has(item.parentId)) {
      childrenByParent.set(item.parentId, [...(childrenByParent.get(item.parentId) ?? []), item]);
    } else {
      roots.push(item);
    }
  }
  const attach = (node: SystemCandidate): SystemCandidateNode => ({
    ...node,
    children: (childrenByParent.get(node.id) ?? []).sort(compareSystemCandidates).map(attach),
  });
  return roots.sort(compareSystemCandidates).map(attach);
}

function getDescendantIds(id: number, all: SystemCandidate[]): Set<number> {
  const result = new Set<number>([id]);
  let added = true;
  while (added) {
    added = false;
    for (const sc of all) {
      if (sc.parentId && result.has(sc.parentId) && !result.has(sc.id)) { result.add(sc.id); added = true; }
    }
  }
  return result;
}

function countDescendants(node: SystemCandidateNode): number {
  return node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0);
}

function flattenExpandableIds(nodes: SystemCandidateNode[]): number[] {
  return nodes.flatMap((n) => (n.children.length > 0 ? [n.id, ...flattenExpandableIds(n.children)] : []));
}

/** 候補（未着手）とﾘﾘｰｽ済（完了）以外のステータスでのみ進捗率を扱う。 */
function hasProgress(status: string) {
  return status !== "candidate" && status !== "released";
}

function formatPeriod(startDate: string | null | undefined, endDate: string | null | undefined): string {
  if (!startDate && !endDate) return "-";
  const start = startDate ? startDate.replace(/-/g, "/") : "-";
  const end = endDate ? endDate.replace(/-/g, "/") : "-";
  return `${start}〜${end}`;
}

/** ヒアリング一覧などと同じ規則: アイコンに中身がある場合は紫で強調する。 */
function relatedIconClass(hasContent: boolean) {
  return `flex items-center gap-1 rounded-md border px-2 py-1 ${
    hasContent
      ? "border-purple-200 bg-purple-50 text-purple-600 hover:bg-purple-100"
      : "border-slate-200 bg-white text-slate-500 hover:text-primary hover:border-slate-300"
  }`;
}

export default function SystemCandidates() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [keyword, setKeyword] = useState("");
  const [filters, setFilters] = useState({ priority: "", status: "" });
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: items = [], isLoading } = useListSystemCandidates();
  const { data: improvements = [] } = useListImprovements();
  const createSystemCandidate = useCreateSystemCandidate();
  const updateSystemCandidate = useUpdateSystemCandidate();
  const deleteSystemCandidate = useDeleteSystemCandidate();

  const f = (k: Exclude<keyof typeof EMPTY, "links">) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  function addLink() {
    setForm(p => ({ ...p, links: [...p.links, { name: "", url: "" }] }));
  }
  function updateLink(idx: number, field: "name" | "url", value: string) {
    setForm(p => ({ ...p, links: p.links.map((l, i) => (i === idx ? { ...l, [field]: value } : l)) }));
  }
  function removeLink(idx: number) {
    setForm(p => ({ ...p, links: p.links.filter((_, i) => i !== idx) }));
  }

  function openCreate(parent?: SystemCandidate) {
    setEditingId(null);
    setForm(parent
      ? { ...EMPTY, parentId: String(parent.id), improvementId: parent.improvementId ? String(parent.improvementId) : "" }
      : EMPTY);
    setOpen(true);
  }

  function openEdit(i: SystemCandidate) {
    setEditingId(i.id);
    setForm({
      title: i.title,
      parentId: i.parentId ? String(i.parentId) : NO_PARENT,
      improvementId: i.improvementId ? String(i.improvementId) : "",
      targetUsers: i.targetUsers ?? "",
      ownerName: i.ownerName ?? "",
      problemToSolve: i.problemToSolve ?? "",
      requiredFeatures: i.requiredFeatures ?? "",
      priority: i.priority ?? "",
      estimatedUsers: i.estimatedUsers != null ? String(i.estimatedUsers) : "",
      plannedStartDate: i.plannedStartDate ?? "",
      plannedEndDate: i.plannedEndDate ?? "",
      status: i.status,
      progress: i.progress != null ? String(i.progress) : "",
      links: (i.links ?? []).map(l => ({ name: l.name, url: l.url })),
    });
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getListSystemCandidatesQueryKey() });
      setOpen(false);
      setForm(EMPTY);
      setEditingId(null);
    };
    const links = form.links.filter(l => l.name.trim() && l.url.trim());
    const progress = hasProgress(form.status) && form.progress !== ""
      ? Math.min(100, Math.max(0, Math.round(Number(form.progress))))
      : null;
    if (editingId) {
      // null (not undefined): undefined fields are dropped from the JSON body entirely, so
      // clearing a field back to blank and saving would otherwise leave the old value in place.
      updateSystemCandidate.mutate({
        id: editingId,
        data: {
          title: form.title,
          parentId: form.parentId !== NO_PARENT ? Number(form.parentId) : null,
          improvementId: form.improvementId ? Number(form.improvementId) : null,
          targetUsers: form.targetUsers || null,
          ownerName: form.ownerName || null,
          problemToSolve: form.problemToSolve || null,
          requiredFeatures: form.requiredFeatures || null,
          priority: form.priority || null,
          estimatedUsers: form.estimatedUsers ? Number(form.estimatedUsers) : null,
          plannedStartDate: form.plannedStartDate || null,
          plannedEndDate: form.plannedEndDate || null,
          status: form.status,
          progress,
          links,
        },
      }, { onSuccess });
    } else {
      createSystemCandidate.mutate({
        data: {
          title: form.title,
          parentId: form.parentId !== NO_PARENT ? Number(form.parentId) : undefined,
          improvementId: form.improvementId ? Number(form.improvementId) : undefined,
          targetUsers: form.targetUsers || undefined,
          ownerName: form.ownerName || undefined,
          problemToSolve: form.problemToSolve || undefined,
          requiredFeatures: form.requiredFeatures || undefined,
          priority: form.priority || undefined,
          estimatedUsers: form.estimatedUsers ? Number(form.estimatedUsers) : undefined,
          plannedStartDate: form.plannedStartDate || undefined,
          plannedEndDate: form.plannedEndDate || undefined,
          status: form.status,
          progress,
          links,
        },
      }, { onSuccess });
    }
  }

  function handleDelete() {
    if (!deletingId) return;
    deleteSystemCandidate.mutate({ id: deletingId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSystemCandidatesQueryKey() });
        setDeletingId(null);
      }
    });
  }

  function handleStatusChange(id: number, status: string) {
    updateSystemCandidate.mutate({ id, data: { status } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSystemCandidatesQueryKey() }),
    });
  }

  function getStatusLabelClass(status: string) {
    return "";
  }

  // Deep link from 改善ボード (?openId=<id>) — ヒアリング一覧・タスク一覧と同じく、該当カードを
  // ハイライトするだけで編集ダイアログは開かない。
  const openId = searchParams.get("openId");
  useEffect(() => {
    if (!openId || !items) return;
    const target = items.find(i => String(i.id) === openId);
    if (target) setHighlightedId(target.id);
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete("openId"); return next; }, { replace: true });
  }, [openId, items]);

  const isPending = createSystemCandidate.isPending || updateSystemCandidate.isPending;
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const filtered = items
    .filter(i => !keyword || i.title.toLowerCase().includes(keyword.toLowerCase()))
    .filter(i => !filters.priority || i.priority === filters.priority)
    .filter(i => !filters.status || i.status === filters.status)
    .sort(compareSystemCandidates);
  const sectionOpen = manualOpen ?? items.length > 0;

  const tree = buildSystemCandidateTree(filtered);
  const expandableIds = flattenExpandableIds(tree);
  const allExpanded = expandableIds.length > 0 && expandableIds.every((id) => expandedIds.has(id));

  function toggleExpanded(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function reindexSiblings(parentId: number | null, orderedIds: number[]) {
    orderedIds.forEach((id, idx) => {
      const sc = items.find((x) => x.id === id);
      if (!sc) return;
      if (sc.listSortOrder !== idx || (sc.parentId ?? null) !== parentId) {
        updateSystemCandidate.mutate({ id, data: { listSortOrder: idx, parentId } }, {
          onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSystemCandidatesQueryKey() }),
        });
      }
    });
  }

  function siblingIds(parentId: number | null, excludeId: number): number[] {
    return filtered
      .filter((i) => (i.parentId ?? null) === parentId && i.id !== excludeId)
      .sort(compareSystemCandidates)
      .map((i) => i.id);
  }

  function insertRelativeTo(e: React.DragEvent, ids: number[], targetId: number, movingId: number): number[] {
    const rect = e.currentTarget.getBoundingClientRect();
    const dropAfter = e.clientY > rect.top + rect.height / 2;
    const targetIdx = ids.indexOf(targetId);
    const insertIdx = targetIdx === -1 ? ids.length : dropAfter ? targetIdx + 1 : targetIdx;
    return [...ids.slice(0, insertIdx), movingId, ...ids.slice(insertIdx)];
  }

  // タスク一覧と同じ規則：ルート同士は並び替え、子をルートへドロップするとそのルートの配下（末尾）へ移動、
  // 子同士は同じ親の中で並び替え（親が違えばドロップ先の親へ移動）。
  function handleDrop(e: React.DragEvent, target: SystemCandidate, isRoot: boolean) {
    e.preventDefault();
    e.stopPropagation();
    const dragged = items.find((i) => i.id === draggedId);
    setDraggedId(null);
    if (!dragged || dragged.id === target.id) return;
    const draggedIsRoot = (dragged.parentId ?? null) === null || !filtered.some((i) => i.id === dragged.parentId);
    if (isRoot && draggedIsRoot) {
      reindexSiblings(null, insertRelativeTo(e, siblingIds(null, dragged.id), target.id, dragged.id));
      return;
    }
    const newParentId = isRoot ? target.id : (target.parentId ?? null);
    if (newParentId !== null && getDescendantIds(dragged.id, items).has(newParentId)) return;
    if (isRoot) {
      reindexSiblings(target.id, [...siblingIds(target.id, dragged.id), dragged.id]);
    } else {
      reindexSiblings(newParentId, insertRelativeTo(e, siblingIds(newParentId, dragged.id), target.id, dragged.id));
    }
  }

  const parentOptions = (() => {
    const excluded = editingId ? getDescendantIds(editingId, items) : new Set<number>();
    return items.filter((i) => !excluded.has(i.id)).sort((a, b) => a.title.localeCompare(b.title, "ja"));
  })();

  function renderCard(i: SystemCandidateNode, level: number): React.ReactNode {
    const links = i.links ?? [];
    const isRoot = level === 0;
    const hasChildren = i.children.length > 0;
    const isExpanded = expandedIds.has(i.id);
    const RowIcon = isRoot ? systemCandidateIcon(i.status) : MessageCircleCheck;
    return (
      <section
        key={i.id}
        draggable
        onDragStart={(e) => { e.stopPropagation(); setDraggedId(i.id); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleDrop(e, i, isRoot)}
        className={`rounded-xl border bg-white shadow-sm overflow-hidden ${draggedId === i.id ? "opacity-50" : ""} ${highlightedId === i.id || (isExpanded && hasChildren) ? "border-primary bg-primary/5" : "border-slate-200"}`}
      >
        <div className={`bg-slate-50/70 px-4 ${isRoot ? "py-3" : "py-2"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0 cursor-grab active:cursor-grabbing" />
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className={relatedIconClass(false)} onClick={(e) => e.stopPropagation()} title="解決したい課題・必要な機能を表示">
                  <RowIcon className="w-3.5 h-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="max-w-xs whitespace-pre-wrap bg-slate-900 text-white border border-slate-700 rounded-md px-3 py-2 shadow-lg z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-xs font-bold mb-1">解決したい課題</p>
                <p className="text-xs">{i.problemToSolve || "未設定"}</p>
                <p className="text-xs font-bold mt-2 mb-1">必要な機能・要件</p>
                <p className="text-xs">{i.requiredFeatures || "未設定"}</p>
              </PopoverContent>
            </Popover>
            <button
              type="button"
              disabled={!hasChildren}
              className={`shrink-0 ${hasChildren ? "text-slate-300 hover:text-primary" : "text-slate-200 cursor-default"}`}
              onClick={(e) => { e.stopPropagation(); if (hasChildren) toggleExpanded(i.id); }}
              title={hasChildren ? "子を表示" : "子はありません"}
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded && hasChildren ? "" : "-rotate-90"}`} />
            </button>
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <span className={`truncate ${isRoot ? "text-sm" : "text-xs"} font-semibold ${i.status === "released" ? "line-through text-slate-500" : "text-slate-900"}`}>{i.title}</span>
              {i.priority ? (
                <Badge variant="outline" className={`shrink-0 rounded-full w-6 h-6 p-0 flex items-center justify-center text-[10px] leading-none font-medium ${i.priority === '高' ? 'bg-red-50 text-red-700 border-red-200' : i.priority === '中' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                  {i.priority}
                </Badge>
              ) : null}
              {isPastDue(i.plannedEndDate, i.status === "released") && (
                <Badge className="text-[10px] px-1.5 py-0 bg-red-50 text-red-700 border-red-200 shrink-0" variant="outline">期限超過</Badge>
              )}
              {hasChildren && (
                <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 bg-slate-50 text-slate-500 border-slate-200 font-normal">
                  {countDescendants(i) + 1}件
                </Badge>
              )}
              {isRoot && i.improvementTitle ? (
                <Badge variant="outline" className="shrink-0 font-normal bg-blue-50 text-blue-700 border-blue-200">
                  {i.improvementTitle}
                </Badge>
              ) : null}
            </div>
            <div onClick={(e) => e.stopPropagation()} className="shrink-0">
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className={relatedIconClass(links.length > 0)}>
                    <Link2 className="w-3.5 h-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-2">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 px-1">参考リンク</div>
                    {links.length === 0 && <p className="text-xs text-slate-400 px-1 py-1">未設定</p>}
                    {links.map(link => (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 hover:text-primary"
                        title={link.url}
                      >
                        <Link2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">{link.name}</span>
                      </a>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <span className="shrink-0 text-xs text-slate-400 whitespace-nowrap" title="担当者">{i.ownerName || "-"}</span>
            {isRoot && (
              <>
                <span className="shrink-0 text-xs text-slate-400 whitespace-nowrap">{i.targetUsers || "-"}</span>
                <span className="shrink-0 text-xs text-slate-400 whitespace-nowrap">{i.estimatedUsers ? `${i.estimatedUsers}人` : "-"}</span>
              </>
            )}
            <span className="ml-auto shrink-0 text-xs text-slate-500 whitespace-nowrap">{formatPeriod(i.plannedStartDate, i.plannedEndDate)}</span>
            {hasProgress(i.status) && (() => {
              const p = systemProgress(i);
              return <ProgressBar value={p.value} estimated={p.estimated} showLabel className="shrink-0 w-32" />;
            })()}
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="shrink-0" onClick={(e) => e.stopPropagation()} title="ステータスを変更">
                  <Badge className={`cursor-pointer ${getStatusColor(i.status, SYSTEM_CANDIDATE_STATUS)} shrink-0 w-[3.75em] justify-center !px-0`} variant="outline">
                    <span className={getStatusLabelClass(i.status)}>
                      {SYSTEM_CANDIDATE_STATUS[i.status as keyof typeof SYSTEM_CANDIDATE_STATUS] || i.status}
                    </span>
                  </Badge>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1" align="start" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-0.5">
                  {Object.entries(SYSTEM_CANDIDATE_STATUS).map(([k, v]) => (
                    <button
                      key={k}
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100"
                      onClick={() => handleStatusChange(i.id, k)}
                    >
                      <Badge className={`${getStatusColor(k, SYSTEM_CANDIDATE_STATUS)} shrink-0 w-[3.75em] justify-center !px-0`} variant="outline">
                        <span className={getStatusLabelClass(k)}>{v}</span>
                      </Badge>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0 text-slate-400 hover:text-primary"
              onClick={(e) => { e.stopPropagation(); openCreate(i); }}
              title="子を追加"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <div className="flex flex-col gap-0.5 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="h-4 w-4 text-slate-400 hover:text-primary"
                onClick={(e) => { e.stopPropagation(); openEdit(i); }}
                title="システム化候補を編集"
              >
                <Pencil className="w-2.5 h-2.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-4 w-4 text-slate-400 hover:text-red-600"
                onClick={(e) => { e.stopPropagation(); setDeletingId(i.id); }}
                title="システム化候補を削除"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </Button>
            </div>
          </div>
        </div>

        {hasChildren && (
          <div className={`${isExpanded ? "block" : "hidden"} px-4 pb-3 mt-1`} onClick={(e) => e.stopPropagation()}>
            <div className="space-y-1 pl-3 ml-1 border-l-2 border-slate-200">
              {i.children.map((c) => renderCard(c, level + 1))}
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">システム化一覧</h1>
          <p className="text-sm text-muted-foreground mt-1">ITによる解決が必要な改善案と開発状況を管理します。</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" asChild>
            <Link href="/system-candidates/print"><Printer className="w-4 h-4" />印刷</Link>
          </Button>
          <Button className="gap-2" onClick={() => openCreate()}>
            <Plus className="w-4 h-4" />新規候補登録
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground">読み込み中...</div>
      ) : (
        <div>
          <div
            className="flex flex-wrap items-start justify-between gap-4 cursor-pointer py-2"
            onClick={() => setManualOpen(!sectionOpen)}
          >
            <div className="flex items-start gap-2">
              <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform shrink-0 mt-2 ${sectionOpen ? "rotate-90" : ""}`} />
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-blue-50 text-blue-600">
                <MonitorCog className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">システム化候補一覧</h3>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-medium">{filtered.length}件</Badge>
              </div>
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs shrink-0"
                disabled={expandableIds.length === 0}
                onClick={() => setExpandedIds(allExpanded ? new Set() : new Set(expandableIds))}
              >
                {allExpanded ? "すべて閉じる" : "すべて開く"}
              </Button>
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="名称で検索" className="pl-8 h-8 text-sm w-48" value={keyword} onChange={e => setKeyword(e.target.value)} />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="relative h-8 w-8 bg-white shrink-0" title="フィルター">
                    <Filter className="w-4 h-4" />
                    {activeFilterCount > 0 && (
                      <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">{activeFilterCount}</Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">優先度</Label>
                    <Select value={filters.priority} onValueChange={v => setFilters(p => ({ ...p, priority: v }))}>
                      <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
                      <SelectContent>{PRIORITIES.map(pr => <SelectItem key={pr} value={pr}>{pr}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">ステータス</Label>
                    <Select value={filters.status} onValueChange={v => setFilters(p => ({ ...p, status: v }))}>
                      <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
                      <SelectContent>{Object.entries(SYSTEM_CANDIDATE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Button variant="ghost" size="sm" className="w-full" disabled={activeFilterCount === 0} onClick={() => setFilters({ priority: "", status: "" })}>
                    フィルターをクリア
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {sectionOpen && (
            <div className="mt-3 space-y-2">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">{keyword || activeFilterCount > 0 ? "該当するシステム化候補がありません" : "システム化候補がありません"}</p>
              ) : (
                tree.map((root) => renderCard(root, 0))
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{
            form.parentId !== NO_PARENT
              ? (editingId ? "システムタスクを編集" : "システムタスクを追加")
              : (editingId ? "システム化候補を編集" : "新規システム化候補登録")
          }</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <div className="space-y-1.5">
                <Label>{form.parentId !== NO_PARENT ? "システムタスク" : "システム名称"} <span className="text-red-500">*</span></Label>
                <Input value={form.title} onChange={f("title")} placeholder={form.parentId !== NO_PARENT ? "例：応募者一覧画面の作成" : "例：採用管理システム"} required />
              </div>
              <div className="space-y-1.5">
                <Label>優先度</Label>
                <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map(pr => <SelectItem key={pr} value={pr}>{pr}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>親のシステム化</Label>
                <Select value={form.parentId} onValueChange={v => setForm(p => ({ ...p, parentId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PARENT}>なし（一番上に表示）</SelectItem>
                    {parentOptions.map(sc => <SelectItem key={sc.id} value={String(sc.id)}>{sc.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>担当者</Label>
                <Input value={form.ownerName} onChange={f("ownerName")} placeholder="担当者名を入力..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>関連改善案件</Label>
                <Select value={form.improvementId} onValueChange={v => setForm(p => ({ ...p, improvementId: v }))}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>{improvements.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>ステータス</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(SYSTEM_CANDIDATE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {hasProgress(form.status) && (
              <div className="space-y-1.5">
                <Label>進捗率（%）</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={form.progress}
                    onChange={e => setForm(p => ({ ...p, progress: e.target.value }))}
                    placeholder="0〜100"
                    className="w-24"
                  />
                  <ProgressBar value={form.progress === "" ? 0 : Number(form.progress)} className="flex-1" />
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span>目安：<span className="font-semibold text-slate-700">{estimateSystemProgressByStatus(form.status)}%</span>（ステータス「{SYSTEM_CANDIDATE_STATUS[form.status as keyof typeof SYSTEM_CANDIDATE_STATUS] ?? form.status}」から計算）</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setForm(p => ({ ...p, progress: String(estimateSystemProgressByStatus(p.status)) }))}
                  >
                    目安を入れる
                  </Button>
                </div>
              </div>
            )}
            {form.parentId === NO_PARENT && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>対象ユーザー</Label>
                  <Input value={form.targetUsers} onChange={f("targetUsers")} placeholder="例：人事部採用チーム（5名）" />
                </div>
                <div className="space-y-1.5">
                  <Label>想定利用者数</Label>
                  <Input type="number" value={form.estimatedUsers} onChange={f("estimatedUsers")} placeholder="例：20" min={0} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>開始予定日</Label>
                <Input type="date" value={form.plannedStartDate} onChange={f("plannedStartDate")} />
              </div>
              <div className="space-y-1.5">
                <Label>完了予定日</Label>
                <Input type="date" value={form.plannedEndDate} onChange={f("plannedEndDate")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1"><Link2 className="w-3.5 h-3.5" />参考リンク</Label>
              <div className="space-y-2">
                {form.links.map((link, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      value={link.name}
                      onChange={e => updateLink(idx, "name", e.target.value)}
                      placeholder="リンク名称"
                      className="flex-1"
                    />
                    <Input
                      value={link.url}
                      onChange={e => updateLink(idx, "url", e.target.value)}
                      placeholder="https://..."
                      className="flex-[2]"
                    />
                    <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-slate-400 hover:text-red-600 shrink-0" onClick={() => removeLink(idx)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addLink}>
                  <Plus className="w-3.5 h-3.5" />リンクを追加
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>解決したい課題</Label>
              <Textarea value={form.problemToSolve} onChange={f("problemToSolve")} placeholder="現状の課題や問題点を入力..." rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>必要な機能・要件</Label>
              <Textarea value={form.requiredFeatures} onChange={f("requiredFeatures")} placeholder="必要な機能を箇条書きで入力..." rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (editingId ? "更新中..." : "登録中...") : (editingId ? "更新する" : "登録する")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deletingId !== null}
        onOpenChange={(o) => !o && setDeletingId(null)}
        onConfirm={handleDelete}
        isPending={deleteSystemCandidate.isPending}
        title="このシステム化候補を削除しますか？"
      />
    </div>
  );
}
