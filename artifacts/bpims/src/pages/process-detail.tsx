import { useState } from "react";
import {
  useGetProcess, useUpdateProcess, useDeleteProcess, getGetProcessQueryKey, getListProcessesQueryKey,
  useListDocuments, useListSystems, useListDepartments, useListProcesses,
  useLinkProcessDocument, useUnlinkProcessDocument,
  useLinkProcessSystem, useUnlinkProcessSystem,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input, Label } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { MultiSelectList } from "@/components/multi-select-list";
import { DepartmentBadgeGroup } from "@/components/department-division-badges";
import { PROCESS_STATUS, ISSUE_STATUS, HEARING_STATUS, getStatusColor } from "@/lib/constants";
import { useParams, useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Edit, FileText, Target, Activity, Server, Plus, X, Trash2 } from "lucide-react";

const EMPTY_EDIT_FORM = { name: "", parentId: "", departmentIds: [] as number[], relatedDepartmentIds: [] as number[], ownerName: "", category: "", status: "draft", overview: "", frequency: "", duration: "" };

export default function ProcessDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: process, isLoading } = useGetProcess(id, { query: { enabled: !!id, queryKey: getGetProcessQueryKey(id) } });

  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [sysDialogOpen, setSysDialogOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [selectedSysId, setSelectedSysId] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);

  const { data: allDocuments = [] } = useListDocuments();
  const { data: allSystems = [] } = useListSystems();
  const { data: departments = [] } = useListDepartments();
  const { data: allProcesses = [] } = useListProcesses();
  const linkDocument = useLinkProcessDocument();
  const unlinkDocument = useUnlinkProcessDocument();
  const linkSystem = useLinkProcessSystem();
  const unlinkSystem = useUnlinkProcessSystem();
  const updateProcess = useUpdateProcess();
  const deleteProcess = useDeleteProcess();

  if (isLoading) return <div className="p-12 text-center text-muted-foreground">読み込み中...</div>;
  if (!process) return <div className="p-12 text-center">見つかりません</div>;

  const proc = process;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetProcessQueryKey(id) });
  const linkedDocumentIds = new Set(process.documents.map(d => d.id));
  const linkedSystemIds = new Set(process.systems.map(s => s.id));
  const availableDocuments = allDocuments.filter(d => !linkedDocumentIds.has(d.id));
  const availableSystems = allSystems.filter(s => !linkedSystemIds.has(s.id));

  function handleAddDocument() {
    if (!selectedDocId) return;
    linkDocument.mutate({ id, data: { documentId: Number(selectedDocId) } }, {
      onSuccess: () => { invalidate(); setDocDialogOpen(false); setSelectedDocId(""); }
    });
  }

  function handleAddSystem() {
    if (!selectedSysId) return;
    linkSystem.mutate({ id, data: { systemId: Number(selectedSysId) } }, {
      onSuccess: () => { invalidate(); setSysDialogOpen(false); setSelectedSysId(""); }
    });
  }

  function openEdit() {
    setEditForm({
      name: proc.name,
      parentId: proc.parentId ? String(proc.parentId) : "",
      departmentIds: (proc.departments ?? []).map(d => d.id),
      relatedDepartmentIds: (proc.relatedDepartments ?? []).map(d => d.id),
      ownerName: proc.ownerName ?? "",
      category: proc.category ?? "",
      status: proc.status,
      overview: proc.overview ?? "",
      frequency: proc.frequency ?? "",
      duration: proc.duration ?? "",
    });
    setEditOpen(true);
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm.name.trim()) return;
    updateProcess.mutate({
      id,
      data: {
        name: editForm.name,
        parentId: editForm.parentId ? Number(editForm.parentId) : undefined,
        departmentIds: editForm.departmentIds,
        relatedDepartmentIds: editForm.relatedDepartmentIds,
        ownerName: editForm.ownerName || undefined,
        category: editForm.category || undefined,
        status: editForm.status,
        overview: editForm.overview || undefined,
        frequency: editForm.frequency || undefined,
        duration: editForm.duration || undefined,
      }
    }, {
      onSuccess: () => {
        invalidate();
        queryClient.invalidateQueries({ queryKey: getListProcessesQueryKey() });
        setEditOpen(false);
      }
    });
  }

  function handleDelete() {
    deleteProcess.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProcessesQueryKey() });
        navigate("/processes");
      }
    });
  }

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 text-sm font-medium text-slate-500 mb-2">
        <Link href="/processes" className="hover:text-primary flex items-center gap-1"><ArrowLeft className="w-4 h-4"/> 戻る</Link>
        <span>/</span>
        <Link href="/processes" className="hover:text-primary">{process.departmentName}</Link>
        <span>/</span>
        <span className="text-slate-900">{process.name}</span>
      </div>

      <div className="flex justify-between items-start bg-white p-6 rounded-lg border shadow-sm">
        <div>
          <h1 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">{process.name}</h1>
          <div className="flex flex-wrap gap-3 items-center">
            <Badge className={getStatusColor(process.status, PROCESS_STATUS)} variant="outline">
              {PROCESS_STATUS[process.status as keyof typeof PROCESS_STATUS] || process.status}
            </Badge>
            <div className="text-sm font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded-md">
              担当: <span className="text-slate-900 ml-1">{process.ownerName || '未設定'}</span>
            </div>
            {process.category && (
              <div className="text-sm font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded-md">
                カテゴリ: <span className="text-slate-900 ml-1">{process.category}</span>
              </div>
            )}
            {((process.departments ?? []).length > 0 || (process.relatedDepartments ?? []).length > 0) && (
              <div className="text-sm font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded-md flex items-center gap-2">
                部署:
                <DepartmentBadgeGroup primary={process.departments} related={process.relatedDepartments} />
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 shadow-sm text-red-600 hover:text-red-700" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="w-4 h-4" />
            削除
          </Button>
          <Button className="gap-2 shadow-sm" onClick={openEdit}>
            <Edit className="w-4 h-4" />
            編集
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <Card>
            <CardHeader className="bg-slate-50/50 border-b pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                概要
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                {process.overview || '概要が入力されていません。'}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="bg-slate-50/50 border-b pb-4">
              <CardTitle className="text-base">実行条件・頻度</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-5">
              <div>
                <div className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">頻度</div>
                <div className="text-sm font-medium text-slate-800">{process.frequency || '-'}</div>
              </div>
              <div className="h-px bg-slate-100"></div>
              <div>
                <div className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">所要時間</div>
                <div className="text-sm font-medium text-slate-800">{process.duration || '-'}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader className="bg-slate-50/50 border-b pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-600" />
              タスク（{process.issues.length}件）
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y">
            {process.issues.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">関連するタスクはありません。</p>
            ) : process.issues.map(i => (
              <div key={i.id} className="p-4 flex justify-between items-center gap-3">
                <span className="text-sm font-medium text-slate-800 truncate">{i.title}</span>
                <Badge className={getStatusColor(i.status, ISSUE_STATUS)} variant="outline">
                  {ISSUE_STATUS[i.status as keyof typeof ISSUE_STATUS] || i.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="bg-slate-50/50 border-b pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              ヒアリング（{process.hearings.length}件）
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y">
            {process.hearings.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">関連するヒアリングはありません。</p>
            ) : process.hearings.map(h => (
              <div key={h.id} className="p-4 flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{h.title}</div>
                  {h.scheduledAt && (
                    <div className="text-xs text-slate-500 mt-0.5">{format(new Date(h.scheduledAt), 'yyyy/MM/dd')}</div>
                  )}
                </div>
                <Badge className={getStatusColor(h.status, HEARING_STATUS)} variant="outline">
                  {HEARING_STATUS[h.status as keyof typeof HEARING_STATUS] || h.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="bg-slate-50/50 border-b pb-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-600" />
              関連書類（{process.documents.length}件）
            </CardTitle>
            <Button size="sm" variant="outline" className="gap-1.5 bg-white" onClick={() => setDocDialogOpen(true)}>
              <Plus className="w-3.5 h-3.5" />追加
            </Button>
          </CardHeader>
          <CardContent className="p-0 divide-y">
            {process.documents.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">関連する書類はありません。</p>
            ) : process.documents.map(d => (
              <div key={d.id} className="p-4 flex justify-between items-center gap-3">
                <span className="text-[10px] font-medium text-slate-800 truncate">{d.name}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-slate-400 hover:text-red-600 shrink-0"
                  disabled={unlinkDocument.isPending}
                  onClick={() => unlinkDocument.mutate({ id, documentId: d.id }, { onSuccess: invalidate })}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="bg-slate-50/50 border-b pb-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="w-4 h-4 text-slate-600" />
              利用システム（{process.systems.length}件）
            </CardTitle>
            <Button size="sm" variant="outline" className="gap-1.5 bg-white" onClick={() => setSysDialogOpen(true)}>
              <Plus className="w-3.5 h-3.5" />追加
            </Button>
          </CardHeader>
          <CardContent className="p-0 divide-y">
            {process.systems.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">関連するシステムはありません。</p>
            ) : process.systems.map(s => (
              <div key={s.id} className="p-4 flex justify-between items-center gap-3">
                <span className="text-[10px] font-medium text-slate-800 truncate">{s.name}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-slate-400 hover:text-red-600 shrink-0"
                  disabled={unlinkSystem.isPending}
                  onClick={() => unlinkSystem.mutate({ id, systemId: s.id }, { onSuccess: invalidate })}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={docDialogOpen} onOpenChange={setDocDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>関連書類を追加</DialogTitle></DialogHeader>
          <Select value={selectedDocId} onValueChange={setSelectedDocId}>
            <SelectTrigger><SelectValue placeholder="書類を選択..." /></SelectTrigger>
            <SelectContent>
              {availableDocuments.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
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
              {availableSystems.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>業務を編集</DialogTitle></DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>業務名 <span className="text-red-500">*</span></Label>
              <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>主担当部署（複数選択可）</Label>
                <MultiSelectList
                  options={departments}
                  selectedIds={editForm.departmentIds}
                  onChange={ids => setEditForm(p => ({ ...p, departmentIds: ids }))}
                  emptyLabel="部署が登録されていません"
                />
              </div>
              <div className="space-y-1.5">
                <Label>関連部署（複数選択可）</Label>
                <MultiSelectList
                  options={departments}
                  selectedIds={editForm.relatedDepartmentIds}
                  onChange={ids => setEditForm(p => ({ ...p, relatedDepartmentIds: ids }))}
                  emptyLabel="部署が登録されていません"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>担当者</Label>
              <Input value={editForm.ownerName} onChange={e => setEditForm(p => ({ ...p, ownerName: e.target.value }))} placeholder="担当者名を入力..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>親業務</Label>
                <Select value={editForm.parentId} onValueChange={v => setEditForm(p => ({ ...p, parentId: v }))}>
                  <SelectTrigger><SelectValue placeholder="なし（最上位）" /></SelectTrigger>
                  <SelectContent>{allProcesses.filter(p => p.id !== id).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>ステータス</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PROCESS_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>カテゴリ</Label>
                <Input value={editForm.category} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))} placeholder="例：定常業務、月次業務" />
              </div>
              <div className="space-y-1.5">
                <Label>実施頻度</Label>
                <Input value={editForm.frequency} onChange={e => setEditForm(p => ({ ...p, frequency: e.target.value }))} placeholder="例：月次、随時" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>所要時間</Label>
              <Input value={editForm.duration} onChange={e => setEditForm(p => ({ ...p, duration: e.target.value }))} placeholder="例：30分" />
            </div>
            <div className="space-y-1.5">
              <Label>業務概要</Label>
              <Textarea value={editForm.overview} onChange={e => setEditForm(p => ({ ...p, overview: e.target.value }))} rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>キャンセル</Button>
              <Button type="submit" disabled={updateProcess.isPending}>
                {updateProcess.isPending ? "更新中..." : "更新する"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        isPending={deleteProcess.isPending}
        title="この業務を削除しますか？"
        description="子業務や紐づくタスク・ヒアリングなどはそのまま残ります。この操作は取り消せません。"
      />
    </div>
  );
}
