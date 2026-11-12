import { useEffect, useState } from "react";
import { useCreateProcess, useUpdateProcess, useListDepartments, useListDivisions, useListManagementTasks, useListProcesses, getListProcessesQueryKey, type Process } from "@workspace/api-client-react";
import { Button, Input, Label } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelectList } from "@/components/multi-select-list";
import { PROCESS_STATUS } from "@/lib/constants";
import { useQueryClient } from "@tanstack/react-query";

const EMPTY = { name: "", parentId: "", departmentIds: [] as number[], relatedDepartmentIds: [] as number[], divisionIds: [] as number[], managementTaskIds: [] as number[], ownerName: "", category: "", status: "draft", overview: "", frequency: "", duration: "" };

export function ProcessFormDialog({
  open,
  onOpenChange,
  editingProcess,
  defaultDepartmentIds,
  defaultDivisionIds,
  defaultManagementTaskIds,
  defaultParentId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null (or omitted) opens the dialog in "create" mode. */
  editingProcess?: Process | null;
  /** Pre-selected departments when creating from a department-scoped section. */
  defaultDepartmentIds?: number[];
  /** Pre-selected divisions when creating from a division-scoped tab. */
  defaultDivisionIds?: number[];
  /** Pre-selected management tasks when creating from a management-task-scoped context. */
  defaultManagementTaskIds?: number[];
  /** Pre-selected parent process when creating a child from a specific node ("子業務追加"). */
  defaultParentId?: number;
  onSuccess?: (process: Process) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const queryClient = useQueryClient();

  const { data: processes } = useListProcesses();
  const { data: departments = [] } = useListDepartments();
  const { data: divisions = [] } = useListDivisions();
  const { data: managementTasks = [] } = useListManagementTasks();
  const createProcess = useCreateProcess();
  const updateProcess = useUpdateProcess();

  useEffect(() => {
    if (!open) return;
    if (editingProcess) {
      setForm({
        name: editingProcess.name,
        parentId: editingProcess.parentId ? String(editingProcess.parentId) : "",
        departmentIds: (editingProcess.departments ?? []).map(d => d.id),
        relatedDepartmentIds: (editingProcess.relatedDepartments ?? []).map(d => d.id),
        divisionIds: (editingProcess.divisions ?? []).map(d => d.id),
        managementTaskIds: (editingProcess.managementTasks ?? []).map(t => t.id),
        ownerName: editingProcess.ownerName ?? "",
        category: editingProcess.category ?? "",
        status: editingProcess.status,
        overview: editingProcess.overview ?? "",
        frequency: editingProcess.frequency ?? "",
        duration: editingProcess.duration ?? "",
      });
    } else {
      setForm({ ...EMPTY, parentId: defaultParentId ? String(defaultParentId) : "", departmentIds: defaultDepartmentIds ?? [], divisionIds: defaultDivisionIds ?? [], managementTaskIds: defaultManagementTaskIds ?? [] });
    }
  }, [open, editingProcess, defaultDepartmentIds, defaultDivisionIds, defaultManagementTaskIds, defaultParentId]);

  const f = (k: "name" | "ownerName" | "category" | "overview" | "frequency" | "duration") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const data = {
      name: form.name,
      parentId: form.parentId ? Number(form.parentId) : undefined,
      departmentIds: form.departmentIds,
      relatedDepartmentIds: form.relatedDepartmentIds,
      divisionIds: form.divisionIds,
      managementTaskIds: form.managementTaskIds,
      ownerName: form.ownerName || undefined,
      category: form.category || undefined,
      status: form.status,
      overview: form.overview || undefined,
      frequency: form.frequency || undefined,
      duration: form.duration || undefined,
    };
    const handleSuccess = (process: Process) => {
      queryClient.invalidateQueries({ queryKey: getListProcessesQueryKey() });
      onOpenChange(false);
      onSuccess?.(process);
    };
    if (editingProcess) {
      updateProcess.mutate({ id: editingProcess.id, data }, { onSuccess: handleSuccess });
    } else {
      createProcess.mutate({ data }, { onSuccess: handleSuccess });
    }
  }

  const isPending = createProcess.isPending || updateProcess.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{editingProcess ? "業務を編集" : "新規業務登録"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>業務名 <span className="text-red-500">*</span></Label>
            <Input value={form.name} onChange={f("name")} placeholder="例：月次経理処理" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>主担当部署（複数選択可）</Label>
              <MultiSelectList
                options={departments}
                selectedIds={form.departmentIds}
                onChange={ids => setForm(p => ({ ...p, departmentIds: ids }))}
                emptyLabel="部署が登録されていません"
              />
            </div>
            <div className="space-y-1.5">
              <Label>関連部署（複数選択可）</Label>
              <MultiSelectList
                options={departments}
                selectedIds={form.relatedDepartmentIds}
                onChange={ids => setForm(p => ({ ...p, relatedDepartmentIds: ids }))}
                emptyLabel="部署が登録されていません"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>対象部門（複数選択可）</Label>
            <MultiSelectList
              options={divisions}
              selectedIds={form.divisionIds}
              onChange={ids => setForm(p => ({ ...p, divisionIds: ids }))}
              emptyLabel="部門が登録されていません"
            />
          </div>
          <div className="space-y-1.5">
            <Label>関連する管理業務（複数選択可）</Label>
            <MultiSelectList
              options={managementTasks}
              selectedIds={form.managementTaskIds}
              onChange={ids => setForm(p => ({ ...p, managementTaskIds: ids }))}
              emptyLabel="管理業務が登録されていません"
            />
          </div>
          <div className="space-y-1.5">
            <Label>担当者</Label>
            <Input value={form.ownerName} onChange={f("ownerName")} placeholder="担当者名を入力..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>親業務</Label>
              <Select value={form.parentId} onValueChange={v => setForm(p => ({ ...p, parentId: v }))}>
                <SelectTrigger><SelectValue placeholder="なし（最上位）" /></SelectTrigger>
                <SelectContent>{processes?.filter(p => p.id !== editingProcess?.id).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ステータス</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PROCESS_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>カテゴリ</Label>
              <Input value={form.category} onChange={f("category")} placeholder="例：定常業務、月次業務" />
            </div>
            <div className="space-y-1.5">
              <Label>実施頻度</Label>
              <Input value={form.frequency} onChange={f("frequency")} placeholder="例：月次、随時" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>業務概要</Label>
            <Textarea value={form.overview} onChange={f("overview")} placeholder="業務の概要を入力..." rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (editingProcess ? "更新中..." : "登録中...") : (editingProcess ? "更新する" : "登録する")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
