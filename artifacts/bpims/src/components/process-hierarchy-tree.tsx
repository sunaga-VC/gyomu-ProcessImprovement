import { useState } from "react";
import { useMoveProcess, useDeleteProcess, getListProcessesQueryKey, type Process } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { ProcessFormDialog } from "@/components/process-form-dialog";
import { DepartmentBadgeGroup, DivisionBadges } from "@/components/department-division-badges";
import { PROCESS_STATUS, getStatusColor } from "@/lib/constants";
import { buildLocalHierarchy, getDescendantIds, type LocalTreeNode } from "@/lib/group-by-department";
import { Link } from "wouter";
import { ChevronDown, ChevronUp, FolderInput, Pencil, Trash2 } from "lucide-react";

/**
 * Renders a scoped set of processes as a parent/child tree (▲▼ reorder, 配下変更, edit,
 * delete) — the same node rendering `ProcessTreeAxisSection`'s 一般タブ uses per management-task
 * group, factored out so other scoped views (e.g. 業務ツリーの「管理業務」タブ) can show the
 * same hierarchy instead of a flat list. A node whose true parent isn't in `items` becomes a
 * local root (see `buildLocalHierarchy`), so a management task's own subset stays consistent.
 */
export function ProcessHierarchyTree({
  items,
  allProcesses,
  emptyLabel = "業務がありません",
  showDetails = false,
}: {
  /** The scoped set of processes to render as a tree. */
  items: Process[];
  /** Full process list, for 配下変更 candidate parents / cycle exclusion. */
  allProcesses: Process[];
  emptyLabel?: string;
  /** Shows 概要・部署・担当部門 under each node's name, matching 業務一覧のリスト表示. */
  showDetails?: boolean;
}) {
  const [editingProcess, setEditingProcess] = useState<Process | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const moveProcess = useMoveProcess();
  const deleteProcess = useDeleteProcess();

  const tree = buildLocalHierarchy(items);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListProcessesQueryKey() });
  }

  function moveWithinSiblings(node: Process, siblings: Process[], direction: -1 | 1) {
    const idx = siblings.findIndex((s) => s.id === node.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const other = siblings[swapIdx];
    moveProcess.mutate({ id: node.id, data: { newParentId: node.parentId ?? null, sortOrder: other.sortOrder } }, { onSuccess: invalidate });
    moveProcess.mutate({ id: other.id, data: { newParentId: other.parentId ?? null, sortOrder: node.sortOrder } }, { onSuccess: invalidate });
  }

  function reparent(node: Process, newParentId: number | null) {
    if (newParentId === (node.parentId ?? null)) return;
    moveProcess.mutate({ id: node.id, data: { newParentId, sortOrder: node.sortOrder } }, { onSuccess: invalidate });
  }

  function handleDelete() {
    if (!deletingId) return;
    deleteProcess.mutate({ id: deletingId }, { onSuccess: () => { invalidate(); setDeletingId(null); } });
  }

  function renderNode(node: LocalTreeNode<Process>, siblings: LocalTreeNode<Process>[], level: number) {
    const idx = siblings.findIndex((s) => s.id === node.id);
    const excludeIds = getDescendantIds(node.id, allProcesses);
    const candidateParents = allProcesses.filter((p) => !excludeIds.has(p.id));
    return (
      <div key={node.id}>
        <div className="py-1.5 px-2 hover:bg-slate-50 rounded-md group" style={{ paddingLeft: `${level * 1.25 + 0.5}rem` }}>
          <div className="flex items-center gap-2">
            <div className="flex flex-col -my-1">
              <button
                type="button"
                className="text-slate-300 hover:text-primary disabled:opacity-30 disabled:hover:text-slate-300"
                disabled={idx === 0}
                onClick={() => moveWithinSiblings(node, siblings, -1)}
                title="上に移動"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                className="text-slate-300 hover:text-primary disabled:opacity-30 disabled:hover:text-slate-300"
                disabled={idx === siblings.length - 1}
                onClick={() => moveWithinSiblings(node, siblings, 1)}
                title="下に移動"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <Link href={`/processes/${node.id}`} className="font-semibold text-[13px] text-slate-800 hover:text-primary shrink-0 max-w-[240px] truncate">{node.name}</Link>
            {showDetails ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0 flex-1 text-xs">
                {node.overview && <span className="text-slate-500 truncate max-w-[280px]">{node.overview}</span>}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-slate-400">部署</span>
                  <DepartmentBadgeGroup primary={node.departments} related={node.relatedDepartments} />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-slate-400">担当部門</span>
                  <DivisionBadges divisions={node.divisions} />
                </div>
                <Badge className={`shrink-0 ${getStatusColor(node.status, PROCESS_STATUS)}`} variant="outline">
                  {PROCESS_STATUS[node.status as keyof typeof PROCESS_STATUS] || node.status}
                </Badge>
              </div>
            ) : (
              <Badge className={`scale-90 origin-left ${getStatusColor(node.status, PROCESS_STATUS)}`} variant="outline">
                {PROCESS_STATUS[node.status as keyof typeof PROCESS_STATUS] || node.status}
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-primary" title="配下を変更">
                    <FolderInput className="w-3.5 h-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 space-y-2" align="end">
                  <p className="text-xs text-slate-500">移動先の親業務を選択</p>
                  <Select value={node.parentId ? String(node.parentId) : "__root__"} onValueChange={(v) => reparent(node, v === "__root__" ? null : Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__root__">なし（最上位にする）</SelectItem>
                      {candidateParents.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </PopoverContent>
              </Popover>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-primary" onClick={() => { setEditingProcess(node); setFormOpen(true); }}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => setDeletingId(node.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
        {node.children.length > 0 && (
          <div>{node.children.map((child) => renderNode(child, node.children, level + 1))}</div>
        )}
      </div>
    );
  }

  return (
    <div>
      {tree.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">{emptyLabel}</p>
      ) : (
        <div>{tree.map((node) => renderNode(node, tree, 0))}</div>
      )}
      <ProcessFormDialog open={formOpen} onOpenChange={setFormOpen} editingProcess={editingProcess} />
      <ConfirmDeleteDialog
        open={deletingId !== null}
        onOpenChange={(o) => !o && setDeletingId(null)}
        onConfirm={handleDelete}
        isPending={deleteProcess.isPending}
        title="この業務を削除しますか？"
        description="子業務や紐づくタスク・ヒアリングなどはそのまま残ります。この操作は取り消せません。"
      />
    </div>
  );
}
