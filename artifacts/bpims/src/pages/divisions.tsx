import { useState } from "react";
import { useListDivisions, useCreateDivision, useUpdateDivision, useDeleteDivision, getListDivisionsQueryKey, type Division } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Card, Button, Input, Label, Badge } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { Building2, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const EMPTY = { name: "", description: "", sortOrder: "0" };

export default function Divisions() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [keyword, setKeyword] = useState("");
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useListDivisions();
  const createDivision = useCreateDivision();
  const updateDivision = useUpdateDivision();
  const deleteDivision = useDeleteDivision();

  const f = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(d: Division) {
    setEditingId(d.id);
    setForm({
      name: d.name,
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
      description: form.description || undefined,
      sortOrder: form.sortOrder ? Number(form.sortOrder) : 0,
    };
    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getListDivisionsQueryKey() });
      setOpen(false);
      setForm(EMPTY);
      setEditingId(null);
    };
    if (editingId) {
      updateDivision.mutate({ id: editingId, data }, { onSuccess });
    } else {
      createDivision.mutate({ data }, { onSuccess });
    }
  }

  function handleDelete() {
    if (!deletingId) return;
    deleteDivision.mutate({ id: deletingId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDivisionsQueryKey() });
        setDeletingId(null);
      }
    });
  }

  const isPending = createDivision.isPending || updateDivision.isPending;
  const filtered = items?.filter(i => !keyword || i.name.toLowerCase().includes(keyword.toLowerCase()));

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">部門管理</h1>
          <p className="text-sm text-muted-foreground mt-1">部署の上位にあたる部門を管理します。</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />新規部門登録
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b flex gap-3 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="部門名で検索..." className="pl-9 bg-white" value={keyword} onChange={e => setKeyword(e.target.value)} />
          </div>
        </div>
        {isLoading ? <div className="p-12 text-center text-muted-foreground">読み込み中...</div> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>部門名</TableHead>
                <TableHead>説明</TableHead>
                <TableHead>所属部署数</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.map(i => (
                <TableRow key={i.id}>
                  <TableCell className="font-semibold text-slate-800 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />{i.name}
                  </TableCell>
                  <TableCell className="text-slate-600 text-sm">{i.description || '-'}</TableCell>
                  <TableCell className="text-slate-600 font-medium">{i.departmentCount || 0}</TableCell>
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
          <DialogHeader><DialogTitle>{editingId ? "部門を編集" : "新規部門登録"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-1">
                <Label>部門名 <span className="text-red-500">*</span></Label>
                <Input value={form.name} onChange={f("name")} placeholder="例：営業" required />
              </div>
              <div className="space-y-1.5">
                <Label>表示順</Label>
                <Input type="number" value={form.sortOrder} onChange={f("sortOrder")} min={0} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>説明・補足</Label>
              <Textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} placeholder="部門の役割の説明..." rows={2} />
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
        isPending={deleteDivision.isPending}
        title="この部門を削除しますか？"
      />
    </div>
  );
}
