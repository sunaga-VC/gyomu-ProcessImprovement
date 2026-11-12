import { useState } from "react";
import { useListDepartments, useCreateDepartment, useUpdateDepartment, useDeleteDepartment, useListUsers, useListDivisions, getListDepartmentsQueryKey, type Department } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Card, Button, Input, Label, Badge } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { MultiSelectList } from "@/components/multi-select-list";
import { Building2, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const EMPTY = { name: "", code: "", divisionIds: [] as number[], managerId: "", description: "", sortOrder: "0" };

export default function Departments() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [keyword, setKeyword] = useState("");
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useListDepartments();
  const { data: users = [] } = useListUsers();
  const { data: divisions = [] } = useListDivisions();
  const createDepartment = useCreateDepartment();
  const updateDepartment = useUpdateDepartment();
  const deleteDepartment = useDeleteDepartment();

  const f = (k: "name" | "code" | "managerId" | "description" | "sortOrder") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(d: Department) {
    setEditingId(d.id);
    setForm({
      name: d.name,
      code: d.code ?? "",
      divisionIds: (d.divisions ?? []).map(v => v.id),
      managerId: d.managerId ? String(d.managerId) : "",
      description: d.description ?? "",
      sortOrder: String(d.sortOrder ?? 0),
    });
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const data = {
      name: form.name,
      code: form.code || undefined,
      divisionIds: form.divisionIds,
      managerId: form.managerId ? Number(form.managerId) : undefined,
      description: form.description || undefined,
      sortOrder: form.sortOrder ? Number(form.sortOrder) : 0,
    };
    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
      setOpen(false);
      setForm(EMPTY);
      setEditingId(null);
    };
    if (editingId) {
      updateDepartment.mutate({ id: editingId, data }, { onSuccess });
    } else {
      createDepartment.mutate({ data }, { onSuccess });
    }
  }

  function handleDelete() {
    if (!deletingId) return;
    deleteDepartment.mutate({ id: deletingId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
        setDeletingId(null);
      }
    });
  }

  const isPending = createDepartment.isPending || updateDepartment.isPending;
  const filtered = items?.filter(i => !keyword || i.name.toLowerCase().includes(keyword.toLowerCase()));

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">部署管理</h1>
          <p className="text-sm text-muted-foreground mt-1">組織構造と部署マスターを管理します。</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />新規部署登録
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b flex gap-3 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="部署名で検索..." className="pl-9 bg-white" value={keyword} onChange={e => setKeyword(e.target.value)} />
          </div>
        </div>
        {isLoading ? <div className="p-12 text-center text-muted-foreground">読み込み中...</div> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>部署コード</TableHead>
                <TableHead>部署名</TableHead>
                <TableHead>所属部門</TableHead>
                <TableHead>責任者</TableHead>
                <TableHead>登録業務数</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.map(i => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-slate-500">{i.code || '-'}</TableCell>
                  <TableCell className="font-semibold text-slate-800">{i.name}</TableCell>
                  <TableCell className="text-slate-500 text-sm">{i.divisionName || '-'}</TableCell>
                  <TableCell className="text-slate-600">{i.managerName || '-'}</TableCell>
                  <TableCell className="text-slate-600 font-medium">{i.processCount || 0}</TableCell>
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
          <DialogHeader><DialogTitle>{editingId ? "部署を編集" : "新規部署登録"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>部署名 <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={f("name")} placeholder="例：人事総務部" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>部署コード</Label>
                <Input value={form.code} onChange={f("code")} placeholder="例：HR" />
              </div>
              <div className="space-y-1.5">
                <Label>表示順</Label>
                <Input type="number" value={form.sortOrder} onChange={f("sortOrder")} min={0} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>所属部門（複数選択可）</Label>
              <MultiSelectList
                options={divisions}
                selectedIds={form.divisionIds}
                onChange={ids => setForm(p => ({ ...p, divisionIds: ids }))}
                emptyLabel="部門が登録されていません"
              />
            </div>
            <div className="space-y-1.5">
              <Label>責任者</Label>
              <Select value={form.managerId} onValueChange={v => setForm(p => ({ ...p, managerId: v }))}>
                <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                <SelectContent>{users.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>説明・補足</Label>
              <Textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} placeholder="部署の役割・担当業務の説明..." rows={2} />
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
        isPending={deleteDepartment.isPending}
        title="この部署を削除しますか？"
      />
    </div>
  );
}
