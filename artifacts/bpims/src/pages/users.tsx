import { useState } from "react";
import { useListUsers, useCreateUser, useUpdateUser, useDeleteUser, useListDepartments, getListUsersQueryKey, type UserInputRole, type User } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Card, Badge, Button, Input, Label } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const EMPTY = { name: "", email: "", departmentId: "", role: "staff", isActive: true };

const ROLES: { value: string; label: string }[] = [
  { value: "admin", label: "管理者 (Admin)" },
  { value: "manager", label: "マネージャー (Manager)" },
  { value: "supervisor", label: "スーパーバイザー (Supervisor)" },
  { value: "staff", label: "スタッフ (Staff)" },
  { value: "viewer", label: "閲覧のみ (Viewer)" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "管理者",
  manager: "マネージャー",
  supervisor: "スーパーバイザー",
  staff: "スタッフ",
  viewer: "閲覧のみ",
};

export default function Users() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [keyword, setKeyword] = useState("");
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useListUsers();
  const { data: departments = [] } = useListDepartments();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const f = (k: "name" | "email") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(u: User) {
    setEditingId(u.id);
    setForm({
      name: u.name,
      email: u.email,
      departmentId: u.departmentId ? String(u.departmentId) : "",
      role: u.role,
      isActive: u.isActive ?? true,
    });
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    const data = {
      name: form.name,
      email: form.email,
      departmentId: form.departmentId ? Number(form.departmentId) : undefined,
      role: form.role as UserInputRole,
      isActive: form.isActive,
    };
    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setOpen(false);
      setForm(EMPTY);
      setEditingId(null);
    };
    if (editingId) {
      updateUser.mutate({ id: editingId, data }, { onSuccess });
    } else {
      createUser.mutate({ data }, { onSuccess });
    }
  }

  function handleDelete() {
    if (!deletingId) return;
    deleteUser.mutate({ id: deletingId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setDeletingId(null);
      }
    });
  }

  const isPending = createUser.isPending || updateUser.isPending;
  const filtered = items?.filter(i =>
    !keyword ||
    i.name.toLowerCase().includes(keyword.toLowerCase()) ||
    i.email.toLowerCase().includes(keyword.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ユーザー管理</h1>
          <p className="text-sm text-muted-foreground mt-1">システムを利用するユーザーの権限を管理します。</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />新規ユーザー登録
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b flex gap-3 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="名前、メールアドレスで検索..." className="pl-9 bg-white" value={keyword} onChange={e => setKeyword(e.target.value)} />
          </div>
        </div>
        {isLoading ? <div className="p-12 text-center text-muted-foreground">読み込み中...</div> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>氏名</TableHead>
                <TableHead>メールアドレス</TableHead>
                <TableHead>所属部署</TableHead>
                <TableHead>権限</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.map(i => (
                <TableRow key={i.id}>
                  <TableCell className="font-semibold text-slate-800">{i.name}</TableCell>
                  <TableCell className="text-slate-500 font-mono text-xs">{i.email}</TableCell>
                  <TableCell className="text-slate-700">{i.departmentName || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-slate-50">
                      {ROLE_LABELS[i.role] || i.role}
                    </Badge>
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "ユーザーを編集" : "新規ユーザー登録"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>氏名 <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={f("name")} placeholder="例：山田 太郎" required />
            </div>
            <div className="space-y-1.5">
              <Label>メールアドレス <span className="text-red-500">*</span></Label>
              <Input type="email" value={form.email} onChange={f("email")} placeholder="例：yamada@example.com" required />
            </div>
            <div className="space-y-1.5">
              <Label>所属部署</Label>
              <Select value={form.departmentId} onValueChange={v => setForm(p => ({ ...p, departmentId: v }))}>
                <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                <SelectContent>{departments.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>権限</Label>
              <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300"
              />
              <span className="text-sm font-medium text-slate-700">有効なユーザーとして登録する</span>
            </label>
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
        isPending={deleteUser.isPending}
        title="このユーザーを削除しますか？"
      />
    </div>
  );
}
