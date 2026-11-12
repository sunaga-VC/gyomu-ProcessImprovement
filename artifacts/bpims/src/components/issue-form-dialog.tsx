import { useEffect, useState } from "react";
import { useCreateIssue, useUpdateIssue, useListDepartments, useListDivisions, useListIssues, useListImprovements, getListIssuesQueryKey, type Issue } from "@workspace/api-client-react";
import { Button, Input, Label } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelectList } from "@/components/multi-select-list";
import { ISSUE_STATUS } from "@/lib/constants";
import { ISSUE_CATEGORIES, ISSUE_CATEGORY_ICONS } from "@/lib/issue-categories";
import { useQueryClient } from "@tanstack/react-query";

const EMPTY = { title: "", parentId: "", departmentIds: [] as number[], divisionIds: [] as number[], hearingIds: [] as number[], improvementIds: [] as number[], ownerName: "", content: "", category: "", priority: "", urgency: "", plannedStartDate: "", plannedEndDate: "", status: "not_started" };
const PRIORITIES = [{ value: "高", label: "高" }, { value: "中", label: "中" }, { value: "低", label: "低" }];

export function IssueFormDialog({
  open,
  onOpenChange,
  editingIssue,
  defaultDepartmentIds,
  defaultDivisionIds,
  defaultHearingIds,
  defaultImprovementIds,
  defaultParentId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null (or omitted) opens the dialog in "create" mode. */
  editingIssue?: Issue | null;
  /** Pre-selected departments when creating from a department-scoped context. */
  defaultDepartmentIds?: number[];
  /** Pre-selected divisions when creating from a division-scoped context. */
  defaultDivisionIds?: number[];
  /** Pre-selected hearings when creating from a hearing-scoped context (e.g. ヒアリング詳細の「タスクを追加」). Not shown as a form field — carried through silently so the new task still gets tagged. */
  defaultHearingIds?: number[];
  /** Pre-selected improvement projects when creating from an improvement-scoped context. */
  defaultImprovementIds?: number[];
  /** Pre-selected parent task when creating a child from a specific node ("子タスク追加"). */
  defaultParentId?: number;
  onSuccess?: (issue: Issue) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const queryClient = useQueryClient();

  const { data: issues } = useListIssues();
  const { data: departments = [] } = useListDepartments();
  const { data: divisions = [] } = useListDivisions();
  const { data: improvements = [] } = useListImprovements();
  const createIssue = useCreateIssue();
  const updateIssue = useUpdateIssue();

  useEffect(() => {
    if (!open) return;
    if (editingIssue) {
      setForm({
        title: editingIssue.title,
        parentId: editingIssue.parentId ? String(editingIssue.parentId) : "",
        departmentIds: (editingIssue.departments ?? []).map(d => d.id),
        divisionIds: (editingIssue.divisions ?? []).map(d => d.id),
        hearingIds: (editingIssue.hearings ?? []).map(h => h.id),
        improvementIds: (editingIssue.improvements ?? []).map(r => r.id),
        ownerName: editingIssue.ownerName ?? "",
        content: editingIssue.content ?? "",
        category: editingIssue.category ?? "",
        priority: editingIssue.priority ?? "",
        urgency: editingIssue.urgency ?? "",
        plannedStartDate: editingIssue.plannedStartDate ?? "",
        plannedEndDate: editingIssue.plannedEndDate ?? "",
        status: editingIssue.status,
      });
    } else {
      setForm({
        ...EMPTY,
        parentId: defaultParentId ? String(defaultParentId) : "",
        departmentIds: defaultDepartmentIds ?? [],
        divisionIds: defaultDivisionIds ?? [],
        hearingIds: defaultHearingIds ?? [],
        improvementIds: defaultImprovementIds ?? [],
      });
    }
  // Only re-populate when the dialog actually opens (or switches which issue it's editing) — the
  // default* props are frequently fresh array/object literals from the caller's JSX, so depending
  // on them directly would reset the form (wiping anything the user just typed) on every unrelated
  // re-render of the caller while this dialog stays open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingIssue?.id]);

  const f = (k: "title" | "ownerName" | "content" | "plannedStartDate" | "plannedEndDate") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const handleSuccess = (issue: Issue) => {
      queryClient.invalidateQueries({ queryKey: getListIssuesQueryKey() });
      onOpenChange(false);
      onSuccess?.(issue);
    };
    if (editingIssue) {
      // null (not undefined): undefined fields are dropped from the JSON body entirely, so
      // clearing a field back to blank and saving would otherwise leave the old value in place.
      updateIssue.mutate({
        id: editingIssue.id,
        data: {
          title: form.title,
          parentId: form.parentId ? Number(form.parentId) : null,
          departmentIds: form.departmentIds,
          divisionIds: form.divisionIds,
          hearingIds: form.hearingIds,
          improvementIds: form.improvementIds,
          ownerName: form.ownerName || null,
          content: form.content || null,
          category: form.category || null,
          priority: form.priority || null,
          urgency: form.urgency || null,
          plannedStartDate: form.plannedStartDate || null,
          plannedEndDate: form.plannedEndDate || null,
          status: form.status,
        },
      }, { onSuccess: handleSuccess });
    } else {
      createIssue.mutate({
        data: {
          title: form.title,
          parentId: form.parentId ? Number(form.parentId) : undefined,
          departmentIds: form.departmentIds,
          divisionIds: form.divisionIds,
          hearingIds: form.hearingIds,
          improvementIds: form.improvementIds,
          ownerName: form.ownerName || undefined,
          content: form.content || undefined,
          category: form.category || undefined,
          priority: form.priority || undefined,
          urgency: form.urgency || undefined,
          plannedStartDate: form.plannedStartDate || undefined,
          plannedEndDate: form.plannedEndDate || undefined,
          status: form.status,
        },
      }, { onSuccess: handleSuccess });
    }
  }

  const isPending = createIssue.isPending || updateIssue.isPending;

  function handleDepartmentIdsChange(ids: number[]) {
    setForm(p => ({ ...p, departmentIds: ids }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{editingIssue ? "タスクを編集" : "新規タスク登録"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <div className="space-y-1.5">
              <Label>タスク名 <span className="text-red-500">*</span></Label>
              <Input value={form.title} onChange={f("title")} placeholder="例：応募書類の管理がExcel台帳のみ" required />
            </div>
            <div className="space-y-1.5">
              <Label>優先度</Label>
              <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v }))}>
                <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                <SelectContent>{PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>対象部署（複数選択可）</Label>
              <MultiSelectList
                options={departments}
                selectedIds={form.departmentIds}
                onChange={handleDepartmentIdsChange}
                emptyLabel="部署が登録されていません"
              />
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
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>カテゴリ</Label>
              <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                <SelectContent>
                  {ISSUE_CATEGORIES.map(c => {
                    const Icon = ISSUE_CATEGORY_ICONS[c];
                    return (
                      <SelectItem key={c} value={c}>
                        <span className="flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5" />{c}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>親タスク</Label>
              <Select value={form.parentId} onValueChange={v => setForm(p => ({ ...p, parentId: v }))}>
                <SelectTrigger><SelectValue placeholder="なし（最上位）" /></SelectTrigger>
                <SelectContent>{issues?.filter(i => i.id !== editingIssue?.id).map(i => <SelectItem key={i.id} value={String(i.id)}>{i.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>担当者</Label>
              <Input value={form.ownerName} onChange={f("ownerName")} placeholder="担当者名を入力..." />
            </div>
            <div className="space-y-1.5">
              <Label>関連改善案件（複数選択可）</Label>
              <MultiSelectList
                options={improvements.map(i => ({ id: i.id, name: i.title }))}
                selectedIds={form.improvementIds}
                onChange={ids => setForm(p => ({ ...p, improvementIds: ids }))}
                emptyLabel="改善案件が登録されていません"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>開始予定日</Label>
              <Input type="date" value={form.plannedStartDate} onChange={f("plannedStartDate")} />
            </div>
            <div className="space-y-1.5">
              <Label>完了予定日</Label>
              <Input type="date" value={form.plannedEndDate} onChange={f("plannedEndDate")} />
            </div>
            <div className="space-y-1.5">
              <Label>ステータス</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ISSUE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>タスク内容</Label>
            <Textarea value={form.content} onChange={f("content")} placeholder="タスクの詳細を入力..." rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (editingIssue ? "更新中..." : "登録中...") : (editingIssue ? "更新する" : "登録する")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
