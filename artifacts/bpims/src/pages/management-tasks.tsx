import { useState } from "react";
import { useListManagementTasks, useCreateManagementTask, useUpdateManagementTask, useDeleteManagementTask, useListProcesses, useListDepartments, useListDivisions, getListManagementTasksQueryKey, type ManagementTask } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Card, Button, Input, Label, Badge } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { MultiSelectList } from "@/components/multi-select-list";
import { DepartmentBadgeGroup, DivisionBadges } from "@/components/department-division-badges";
import { CsvImportDialog, type CsvField, type CsvImportResult } from "@/components/csv-import-dialog";
import { splitMultiValue, resolveNamesToIds } from "@/lib/csv";
import { Plus, Search, Pencil, Trash2, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const EMPTY = { name: "", description: "", processIds: [] as number[], departmentIds: [] as number[], relatedDepartmentIds: [] as number[], divisionIds: [] as number[], sortOrder: "0" };

const MANAGEMENT_TASK_CSV_FIELDS: CsvField[] = [
  { key: "name", label: "管理業務名", required: true },
  { key: "description", label: "説明・補足" },
  { key: "departmentNames", label: "主担当部署（カンマ区切り）" },
  { key: "relatedDepartmentNames", label: "関連部署（カンマ区切り）" },
  { key: "divisionNames", label: "担当部門（カンマ区切り）" },
  { key: "processNames", label: "紐づく業務（カンマ区切り）" },
  { key: "sortOrder", label: "表示順" },
];

export default function ManagementTasks() {
  const [open, setOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [keyword, setKeyword] = useState("");
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useListManagementTasks();
  const { data: processes = [] } = useListProcesses();
  const { data: departments = [] } = useListDepartments();
  const { data: divisions = [] } = useListDivisions();
  const createTask = useCreateManagementTask();
  const updateTask = useUpdateManagementTask();
  const deleteTask = useDeleteManagementTask();

  async function handleCsvImport(rows: Record<string, string>[]): Promise<CsvImportResult> {
    const issues: CsvImportResult["issues"] = [];
    let successCount = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const name = r.name.trim();
      if (!name) { issues.push({ row: rowNum, message: "管理業務名が空のため、この行はスキップしました。", level: "error" }); continue; }

      const { ids: departmentIds, unmatched: unmatchedDepts } = resolveNamesToIds(splitMultiValue(r.departmentNames), departments);
      if (unmatchedDepts.length > 0) issues.push({ row: rowNum, message: `主担当部署が見つかりません: ${unmatchedDepts.join("、")}`, level: "warning" });

      const { ids: relatedDepartmentIds, unmatched: unmatchedRelatedDepts } = resolveNamesToIds(splitMultiValue(r.relatedDepartmentNames), departments);
      if (unmatchedRelatedDepts.length > 0) issues.push({ row: rowNum, message: `関連部署が見つかりません: ${unmatchedRelatedDepts.join("、")}`, level: "warning" });

      const { ids: divisionIds, unmatched: unmatchedDivs } = resolveNamesToIds(splitMultiValue(r.divisionNames), divisions);
      if (unmatchedDivs.length > 0) issues.push({ row: rowNum, message: `担当部門が見つかりません: ${unmatchedDivs.join("、")}`, level: "warning" });

      const { ids: processIds, unmatched: unmatchedProcs } = resolveNamesToIds(splitMultiValue(r.processNames), processes ?? []);
      if (unmatchedProcs.length > 0) issues.push({ row: rowNum, message: `紐づく業務が見つかりません: ${unmatchedProcs.join("、")}`, level: "warning" });

      const sortOrderRaw = r.sortOrder.trim();
      const sortOrder = sortOrderRaw && !Number.isNaN(Number(sortOrderRaw)) ? Number(sortOrderRaw) : 0;

      try {
        await createTask.mutateAsync({ data: { name, description: r.description || undefined, processIds, departmentIds, relatedDepartmentIds, divisionIds, sortOrder } });
        successCount++;
      } catch (e) {
        issues.push({ row: rowNum, message: e instanceof Error ? e.message : "登録に失敗しました。", level: "error" });
      }
    }
    queryClient.invalidateQueries({ queryKey: getListManagementTasksQueryKey() });
    return { successCount, issues };
  }

  const f = (k: "name" | "description" | "sortOrder") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(t: ManagementTask) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      description: t.description ?? "",
      processIds: (t.processes ?? []).map(p => p.id),
      departmentIds: (t.departments ?? []).map(d => d.id),
      relatedDepartmentIds: (t.relatedDepartments ?? []).map(d => d.id),
      divisionIds: (t.divisions ?? []).map(d => d.id),
      sortOrder: String(t.sortOrder ?? 0),
    });
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const data = {
      name: form.name,
      description: form.description || undefined,
      processIds: form.processIds,
      departmentIds: form.departmentIds,
      relatedDepartmentIds: form.relatedDepartmentIds,
      divisionIds: form.divisionIds,
      sortOrder: form.sortOrder ? Number(form.sortOrder) : 0,
    };
    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getListManagementTasksQueryKey() });
      setOpen(false);
      setForm(EMPTY);
      setEditingId(null);
    };
    if (editingId) {
      updateTask.mutate({ id: editingId, data }, { onSuccess });
    } else {
      createTask.mutate({ data }, { onSuccess });
    }
  }

  function handleDelete() {
    if (!deletingId) return;
    deleteTask.mutate({ id: deletingId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListManagementTasksQueryKey() });
        setDeletingId(null);
      }
    });
  }

  const isPending = createTask.isPending || updateTask.isPending;
  const filtered = items?.filter(i => !keyword || i.name.toLowerCase().includes(keyword.toLowerCase()));

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">管理業務</h1>
          <p className="text-sm text-muted-foreground mt-1">個別の業務をまとめる管理業務のマスターを管理します。</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setCsvOpen(true)}>
            <Upload className="w-4 h-4" />CSVインポート
          </Button>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="w-4 h-4" />新規管理業務登録
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-4 border-b flex gap-3 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="管理業務名で検索..." className="pl-9 bg-white" value={keyword} onChange={e => setKeyword(e.target.value)} />
          </div>
        </div>
        {isLoading ? <div className="p-12 text-center text-muted-foreground">読み込み中...</div> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>管理業務名</TableHead>
                <TableHead>部署</TableHead>
                <TableHead>担当部門</TableHead>
                <TableHead>紐づく業務</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.map(i => (
                <TableRow key={i.id}>
                  <TableCell className="font-semibold text-slate-800">
                    {i.name}
                    {i.description && <div className="text-xs font-normal text-slate-500 mt-0.5">{i.description}</div>}
                  </TableCell>
                  <TableCell><DepartmentBadgeGroup primary={i.departments} related={i.relatedDepartments} /></TableCell>
                  <TableCell><DivisionBadges divisions={i.divisions} /></TableCell>
                  <TableCell>
                    {(i.processes ?? []).length === 0 ? (
                      <span className="text-slate-400 text-xs">未設定</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(i.processes ?? []).map(p => (
                          <Badge key={p.id} variant="outline" className="font-normal bg-slate-50 text-slate-700 border-slate-200">{p.name}</Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={i.isActive ? "default" : "secondary"}>
                      {i.isActive ? '有効' : '無効'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-primary" onClick={() => openEdit(i)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => setDeletingId(i.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "管理業務を編集" : "新規管理業務登録"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>管理業務名 <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={f("name")} placeholder="例：採用管理" required />
            </div>
            <div className="space-y-1.5">
              <Label>表示順</Label>
              <Input type="number" value={form.sortOrder} onChange={f("sortOrder")} min={0} />
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
              <Label>担当部門（複数選択可）</Label>
              <MultiSelectList
                options={divisions}
                selectedIds={form.divisionIds}
                onChange={ids => setForm(p => ({ ...p, divisionIds: ids }))}
                emptyLabel="部門が登録されていません"
              />
            </div>
            <div className="space-y-1.5">
              <Label>紐づく業務（複数選択可）</Label>
              <MultiSelectList
                options={processes}
                selectedIds={form.processIds}
                onChange={ids => setForm(p => ({ ...p, processIds: ids }))}
                emptyLabel="業務が登録されていません"
              />
            </div>
            <div className="space-y-1.5">
              <Label>説明・補足</Label>
              <Textarea value={form.description} onChange={f("description")} placeholder="管理業務の説明..." rows={2} />
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

      <CsvImportDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        title="管理業務をCSVインポート"
        description="管理業務名は必須です。部署・部門・紐づく業務は既存マスターの名称と完全一致するものだけ紐づけられます（カンマ区切りで複数指定可）。部署は主担当部署・関連部署をそれぞれ別の列で指定できます。"
        fields={MANAGEMENT_TASK_CSV_FIELDS}
        onImport={handleCsvImport}
      />

      <ConfirmDeleteDialog
        open={deletingId !== null}
        onOpenChange={(o) => !o && setDeletingId(null)}
        onConfirm={handleDelete}
        isPending={deleteTask.isPending}
        title="この管理業務を削除しますか？"
        description="紐づく業務自体は削除されません。この操作は取り消せません。"
      />
    </div>
  );
}
