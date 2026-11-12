import { useMemo, useState } from "react";
import {
  useMoveProcess, useUpdateProcess, useDeleteProcess, useListDocuments, useListSystems,
  useLinkProcessDocument, useLinkProcessSystem,
  getListProcessesQueryKey, type Process,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Badge, Button, Input } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProcessFormDialog } from "@/components/process-form-dialog";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { DepartmentBadgeGroup } from "@/components/department-division-badges";
import { PROCESS_STATUS, getStatusColor } from "@/lib/constants";
import { buildLocalHierarchy, type LocalTreeNode } from "@/lib/group-by-department";
import {
  BarChart3, RefreshCw, Phone, FileText, TrendingUp, Heart, Search as SearchIcon,
  ChevronDown, ChevronUp, ChevronRight, GripVertical, Pencil, Plus, Server, FileSearch, Trash2,
} from "lucide-react";

const ICON_PALETTE = [BarChart3, RefreshCw, Phone, FileText, TrendingUp, Heart, SearchIcon];

function iconFor(seed: number) {
  const len = ICON_PALETTE.length;
  return ICON_PALETTE[((seed % len) + len) % len];
}

export type ProcessTreeDetailPrimary = { id: number; name: string; description?: string | null };

/**
 * One axis-section card (管理業務 / 部署 / 部門 — whichever the caller scopes `items` to),
 * redesigned to match the reference mockup: icon+count+description header, search + 一括開閉,
 * a left-hand collapsible tree (root business processes as groups, descendants beneath with
 * drag-and-drop reordering), and a right-hand 業務詳細 panel for whichever node is selected.
 * Axis-agnostic like `ProcessListAxisSection`/`ProcessTreeAxisSection` — the caller resolves
 * `items` (e.g. via `expandWithDescendants` for 管理業務, direct membership for 部署/部門) and
 * `formDefaults` (what to pre-fill when adding a child from this section).
 */
export function ProcessTreeDetailCard({
  primary,
  items,
  allProcesses,
  formDefaults,
  variant,
}: {
  primary: ProcessTreeDetailPrimary;
  /** This primary's processes, already resolved by the caller. */
  items: Process[];
  /** Full process list, for 配下変更 candidate parents / cycle exclusion. */
  allProcesses: Process[];
  /** Pre-filled axis fields when creating a new child from this section ("子業務追加"). */
  formDefaults?: { defaultDepartmentIds?: number[]; defaultDivisionIds?: number[]; defaultManagementTaskIds?: number[] };
  /** "warning" tints the header amber, for the synthetic "未設定" section. */
  variant?: "warning";
}) {
  const queryClient = useQueryClient();
  const moveProcess = useMoveProcess();
  const updateProcess = useUpdateProcess();
  const deleteProcess = useDeleteProcess();
  const linkDocument = useLinkProcessDocument();
  const linkSystem = useLinkProcessSystem();
  const { data: allDocuments = [] } = useListDocuments();
  const { data: allSystems = [] } = useListSystems();

  const [search, setSearch] = useState("");
  const [sectionManualOpen, setSectionManualOpen] = useState<boolean | null>(null);
  const sectionOpen = sectionManualOpen ?? items.length > 0;
  const searchLower = search.trim().toLowerCase();
  const searchedItems = searchLower ? items.filter((p) => p.name.toLowerCase().includes(searchLower)) : items;
  const tree = useMemo(() => buildLocalHierarchy(searchedItems), [searchedItems]);

  const [expandedRoots, setExpandedRoots] = useState<Set<number>>(() => new Set(tree.slice(0, 1).map((n) => n.id)));
  const allOpen = tree.length > 0 && tree.every((n) => expandedRoots.has(n.id));

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = items.find((p) => p.id === selectedId) ?? null;

  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [editingProcess, setEditingProcess] = useState<Process | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [sysDialogOpen, setSysDialogOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [selectedSysId, setSelectedSysId] = useState("");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListProcessesQueryKey() });
  }

  function handleStatusChange(processId: number, status: string) {
    updateProcess.mutate({ id: processId, data: { status } }, { onSuccess: invalidate });
  }

  function handleDelete() {
    if (!deletingId) return;
    deleteProcess.mutate({ id: deletingId }, {
      onSuccess: () => {
        invalidate();
        if (selectedId === deletingId) setSelectedId(null);
        setDeletingId(null);
      },
    });
  }

  function handleAddDocument() {
    if (!selected || !selectedDocId) return;
    linkDocument.mutate({ id: selected.id, data: { documentId: Number(selectedDocId) } }, {
      onSuccess: () => { invalidate(); setDocDialogOpen(false); setSelectedDocId(""); },
    });
  }

  function handleAddSystem() {
    if (!selected || !selectedSysId) return;
    linkSystem.mutate({ id: selected.id, data: { systemId: Number(selectedSysId) } }, {
      onSuccess: () => { invalidate(); setSysDialogOpen(false); setSelectedSysId(""); },
    });
  }

  function toggleRoot(id: number) {
    setExpandedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpandedRoots(new Set(tree.map((n) => n.id)));
  }
  function collapseAll() {
    setExpandedRoots(new Set());
  }

  function reindexSiblings(parentId: number | null, orderedIds: number[]) {
    orderedIds.forEach((id, idx) => {
      const p = items.find((x) => x.id === id) ?? allProcesses.find((x) => x.id === id);
      if (!p) return;
      if (p.sortOrder !== idx || (p.parentId ?? null) !== parentId) {
        moveProcess.mutate({ id, data: { newParentId: parentId, sortOrder: idx } }, { onSuccess: invalidate });
      }
    });
  }

  function handleDropOnNode(target: Process) {
    if (draggedId === null || draggedId === target.id) { setDraggedId(null); return; }
    const dragged = allProcesses.find((p) => p.id === draggedId);
    setDraggedId(null);
    if (!dragged) return;
    const newParentId = target.parentId ?? null;
    const siblings = items
      .filter((p) => (p.parentId ?? null) === newParentId && p.id !== dragged.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const targetIdx = siblings.findIndex((s) => s.id === target.id);
    const insertIdx = targetIdx === -1 ? siblings.length : targetIdx;
    const orderedIds = [...siblings.slice(0, insertIdx).map((s) => s.id), dragged.id, ...siblings.slice(insertIdx).map((s) => s.id)];
    reindexSiblings(newParentId, orderedIds);
  }

  function handleDropOnRoot(root: Process) {
    if (draggedId === null || draggedId === root.id) { setDraggedId(null); return; }
    const dragged = allProcesses.find((p) => p.id === draggedId);
    setDraggedId(null);
    if (!dragged) return;
    const siblings = items.filter((p) => (p.parentId ?? null) === root.id && p.id !== dragged.id).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    reindexSiblings(root.id, [...siblings.map((s) => s.id), dragged.id]);
  }

  function renderChild(node: LocalTreeNode<Process>, level: number) {
    return (
      <div key={node.id}>
        <div
          draggable
          onDragStart={() => setDraggedId(node.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDropOnNode(node)}
          onClick={() => setSelectedId(node.id)}
          className={`flex items-center gap-2 py-1.5 pr-2 rounded-md cursor-pointer border-l-2 ml-3 ${selectedId === node.id ? "bg-primary/5 border-l-primary" : "border-l-slate-200 hover:bg-slate-50"}`}
          style={{ paddingLeft: `${level * 1.25 + 0.75}rem` }}
        >
          <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0 cursor-grab" />
          <span className={`text-sm truncate ${selectedId === node.id ? "text-primary font-semibold" : "text-slate-700"}`}>{node.name}</span>
          {node.departments?.[0] && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600 border-slate-200 font-normal shrink-0">
              {node.departments[0].name}
            </Badge>
          )}
          <Badge className={`ml-auto text-[10px] px-1.5 py-0 shrink-0 ${getStatusColor(node.status, PROCESS_STATUS)}`} variant="outline">
            {PROCESS_STATUS[node.status as keyof typeof PROCESS_STATUS] || node.status}
          </Badge>
        </div>
        {node.children.length > 0 && <div>{node.children.map((c) => renderChild(c, level + 1))}</div>}
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div
        className="p-5 border-b bg-white flex flex-wrap items-start justify-between gap-4 cursor-pointer"
        onClick={() => setSectionManualOpen(!sectionOpen)}
      >
        <div className="flex items-start gap-2">
          <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform shrink-0 mt-2 ${sectionOpen ? "rotate-90" : ""}`} />
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${variant === "warning" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
            {(() => { const Icon = iconFor(primary.id); return <Icon className="w-4 h-4" />; })()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`text-sm font-bold ${variant === "warning" ? "text-amber-700" : "text-slate-900"}`}>{primary.name}</h3>
              <Badge variant="outline" className={variant === "warning" ? "bg-amber-50 text-amber-700 border-amber-200 font-medium" : "bg-blue-50 text-blue-700 border-blue-200 font-medium"}>{items.length}件</Badge>
            </div>
            {primary.description && <p className="text-sm text-muted-foreground mt-0.5">{primary.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={allOpen ? collapseAll : expandAll}>
            {allOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {allOpen ? "すべて閉じる" : "すべて開く"}
          </Button>
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="業務を検索" className="pl-8 h-8 text-sm w-48" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {sectionOpen && (
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px]">
        <div className="p-4 border-b lg:border-b-0 lg:border-r max-h-[520px] overflow-y-auto">
          {tree.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{search ? "該当する業務がありません" : "紐づく業務がありません"}</p>
          ) : (
            <div className="space-y-1">
              {tree.map((root) => {
                const isOpen = expandedRoots.has(root.id);
                return (
                  <div key={root.id}>
                    <div
                      onClick={() => { toggleRoot(root.id); setSelectedId(root.id); }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDropOnRoot(root)}
                      className={`flex items-center gap-2 py-2 px-2 rounded-md cursor-pointer border ${selectedId === root.id ? "border-primary bg-primary/5" : "border-slate-200 hover:bg-slate-50"}`}
                    >
                      <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isOpen ? "rotate-90" : ""}`} />
                      {(() => { const Icon = iconFor(root.id); return <Icon className="w-4 h-4 text-blue-500 shrink-0" />; })()}
                      <span className="font-bold text-sm text-slate-800 truncate">{root.name}</span>
                      <span className="text-xs text-slate-400 font-normal shrink-0">
                        {(root.children.length > 0 ? getDescendantCount(root) + 1 : 1)}件
                      </span>
                    </div>
                    {isOpen && root.children.length > 0 && (
                      <div className="mt-0.5 space-y-0.5">{root.children.map((c) => renderChild(c, 1))}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50/50">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <FileSearch className="w-4 h-4 text-primary" />
              <h4 className="font-bold text-sm text-slate-800">業務詳細</h4>
            </div>
            {selected && (
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-primary" onClick={() => { setEditingProcess(selected); setFormOpen(true); }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => setDeletingId(selected.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
          {!selected ? (
            <p className="text-sm text-muted-foreground py-8 text-center">左のリストから業務を選択してください</p>
          ) : (
            <div className="space-y-3">
              <DetailRow label="業務名"><span className="font-semibold text-slate-900">{selected.name}</span></DetailRow>
              <DetailRow label="内容"><span className="text-slate-700">{selected.overview || "-"}</span></DetailRow>
              <DetailRow label="部署">
                <DepartmentBadgeGroup primary={selected.departments} related={selected.relatedDepartments} />
              </DetailRow>
              <DetailRow label="頻度・所要時間">
                <div className="flex items-center gap-3 text-sm text-slate-700">
                  <span>{selected.frequency || "-"}</span>
                  <span className="text-slate-300">|</span>
                  <span>{selected.duration || "-"}</span>
                </div>
              </DetailRow>
              <DetailRow label="ステータス">
                <div className="flex items-center gap-3 flex-wrap">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button">
                        <Badge className={`cursor-pointer hover:opacity-80 transition-opacity ${getStatusColor(selected.status, PROCESS_STATUS)}`} variant="outline">
                          {PROCESS_STATUS[selected.status as keyof typeof PROCESS_STATUS] || selected.status}
                        </Badge>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-40 p-1" align="start">
                      <div className="space-y-0.5">
                        {Object.entries(PROCESS_STATUS).map(([k, v]) => (
                          <button
                            key={k}
                            type="button"
                            className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100"
                            onClick={() => handleStatusChange(selected.id, k)}
                          >
                            <Badge className={getStatusColor(k, PROCESS_STATUS)} variant="outline">{v}</Badge>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <span className="text-xs text-slate-500">タスク <b className="text-slate-700">{selected.issueCount ?? 0}</b>件</span>
                  <span className="text-xs text-slate-500">ヒアリング <b className="text-slate-700">{selected.hearingCount ?? 0}</b>件</span>
                </div>
              </DetailRow>

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  variant="outline"
                  className="gap-1.5 w-full"
                  onClick={() => { setEditingProcess(null); setAddParentId(selected.id); setFormOpen(true); }}
                >
                  <Plus className="w-3.5 h-3.5" />子業務追加
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" className="gap-1.5 flex-1" onClick={() => setDocDialogOpen(true)}>
                    <FileText className="w-3.5 h-3.5" />関連書類を追加
                  </Button>
                  <Button variant="outline" className="gap-1.5 flex-1" onClick={() => setSysDialogOpen(true)}>
                    <Server className="w-3.5 h-3.5" />利用システムを追加
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      <ProcessFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editingProcess={editingProcess}
        defaultParentId={editingProcess ? undefined : addParentId ?? undefined}
        defaultDepartmentIds={editingProcess ? undefined : formDefaults?.defaultDepartmentIds}
        defaultDivisionIds={editingProcess ? undefined : formDefaults?.defaultDivisionIds}
        defaultManagementTaskIds={editingProcess ? undefined : formDefaults?.defaultManagementTaskIds}
      />

      <Dialog open={docDialogOpen} onOpenChange={setDocDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>関連書類を追加</DialogTitle></DialogHeader>
          <Select value={selectedDocId} onValueChange={setSelectedDocId}>
            <SelectTrigger><SelectValue placeholder="書類を選択..." /></SelectTrigger>
            <SelectContent>
              {allDocuments.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDocDialogOpen(false)}>キャンセル</Button>
            <Button type="button" disabled={!selectedDocId || linkDocument.isPending} onClick={handleAddDocument}>
              {linkDocument.isPending ? "追加中..." : "追加する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sysDialogOpen} onOpenChange={setSysDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>利用システムを追加</DialogTitle></DialogHeader>
          <Select value={selectedSysId} onValueChange={setSelectedSysId}>
            <SelectTrigger><SelectValue placeholder="システムを選択..." /></SelectTrigger>
            <SelectContent>
              {allSystems.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSysDialogOpen(false)}>キャンセル</Button>
            <Button type="button" disabled={!selectedSysId || linkSystem.isPending} onClick={handleAddSystem}>
              {linkSystem.isPending ? "追加中..." : "追加する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deletingId !== null}
        onOpenChange={(o) => !o && setDeletingId(null)}
        onConfirm={handleDelete}
        isPending={deleteProcess.isPending}
        title="この業務を削除しますか？"
      />
    </Card>
  );
}

function getDescendantCount(node: LocalTreeNode<Process>): number {
  return node.children.reduce((sum, c) => sum + 1 + getDescendantCount(c), 0);
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 pb-2.5">
      <div className="text-xs font-bold text-slate-400 mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}
