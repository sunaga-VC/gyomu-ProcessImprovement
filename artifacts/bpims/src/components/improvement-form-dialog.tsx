import { useEffect, useState } from "react";
import { useCreateImprovement, useUpdateImprovement, useListDepartments, useListDivisions, useListHearings, useListIssues, getListImprovementsQueryKey, type Improvement } from "@workspace/api-client-react";
import { useTopLevelSystemCandidates } from "@/lib/top-level-system-candidates";
import { Button, Input, Label } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelectList } from "@/components/multi-select-list";
import { ProgressBar } from "@/components/progress-bar";
import { estimateImprovementProgress, formatEstimateBreakdown } from "@/lib/improvement-progress";
import { IMPROVEMENT_STATUS } from "@/lib/constants";
import { useQueryClient } from "@tanstack/react-query";

const EMPTY = { title: "", departmentId: "", divisionIds: [] as number[], priority: "", status: "not_started", progress: "", plannedStartDate: "", plannedEndDate: "", purpose: "" };
const PRIORITIES = ["高", "中", "低"];

/**
 * Shared create/edit dialog for 改善案件 — used by both 改善プロジェクト一覧 (list) and
 * 改善ボード (kanban) so "新規改善案件"/"新規案件作成" is always the same form, not two
 * diverging ones.
 */
export function ImprovementFormDialog({
  open,
  onOpenChange,
  editingImprovement,
  defaultDepartmentIds,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null (or omitted) opens the dialog in "create" mode. */
  editingImprovement?: Improvement | null;
  /** Pre-selected department when creating from a department-scoped context. */
  defaultDepartmentIds?: number[];
  onSuccess?: (improvement: Improvement) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const queryClient = useQueryClient();

  const { data: departments = [] } = useListDepartments();
  const { data: divisions = [] } = useListDivisions();
  const { data: hearings = [] } = useListHearings();
  const { data: issues = [] } = useListIssues();
  const { data: systemCandidates = [] } = useTopLevelSystemCandidates();
  const estimate = editingImprovement
    ? estimateImprovementProgress(editingImprovement.id, hearings, issues, systemCandidates)
    : null;
  const createImprovement = useCreateImprovement();
  const updateImprovement = useUpdateImprovement();

  useEffect(() => {
    if (!open) return;
    if (editingImprovement) {
      setForm({
        title: editingImprovement.title,
        departmentId: editingImprovement.departmentId ? String(editingImprovement.departmentId) : "",
        divisionIds: (editingImprovement.divisions ?? []).map(d => d.id),
        priority: editingImprovement.priority ?? "",
        status: editingImprovement.status,
        progress: editingImprovement.progress != null ? String(editingImprovement.progress) : "",
        plannedStartDate: editingImprovement.plannedStartDate ?? "",
        plannedEndDate: editingImprovement.plannedEndDate ?? "",
        purpose: editingImprovement.purpose ?? "",
      });
    } else {
      setForm({
        ...EMPTY,
        departmentId: defaultDepartmentIds?.[0] ? String(defaultDepartmentIds[0]) : "",
      });
    }
  }, [open, editingImprovement, defaultDepartmentIds]);

  const f = (k: "title" | "plannedStartDate" | "plannedEndDate" | "purpose") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const progress = form.status === "in_progress" && form.progress !== ""
      ? Math.min(100, Math.max(0, Math.round(Number(form.progress))))
      : null;
    const handleSuccess = (improvement: Improvement) => {
      queryClient.invalidateQueries({ queryKey: getListImprovementsQueryKey() });
      onOpenChange(false);
      onSuccess?.(improvement);
    };
    if (editingImprovement) {
      // null (not undefined): undefined fields are dropped from the JSON body entirely, so
      // clearing a field back to blank and saving would otherwise leave the old value in place.
      updateImprovement.mutate({
        id: editingImprovement.id,
        data: {
          title: form.title,
          departmentId: form.departmentId ? Number(form.departmentId) : null,
          divisionIds: form.divisionIds,
          priority: form.priority || null,
          status: form.status,
          progress,
          plannedStartDate: form.plannedStartDate || null,
          plannedEndDate: form.plannedEndDate || null,
          purpose: form.purpose || null,
        },
      }, { onSuccess: handleSuccess });
    } else {
      createImprovement.mutate({
        data: {
          title: form.title,
          departmentId: form.departmentId ? Number(form.departmentId) : undefined,
          divisionIds: form.divisionIds,
          priority: form.priority || undefined,
          status: form.status,
          progress,
          plannedStartDate: form.plannedStartDate || undefined,
          plannedEndDate: form.plannedEndDate || undefined,
          purpose: form.purpose || undefined,
        },
      }, { onSuccess: handleSuccess });
    }
  }

  const isPending = createImprovement.isPending || updateImprovement.isPending;

  function handleDepartmentChange(v: string) {
    setForm(p => ({ ...p, departmentId: v }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{editingImprovement ? "改善案件を編集" : "新規改善案件作成"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <div className="space-y-1.5">
              <Label>案件名 <span className="text-red-500">*</span></Label>
              <Input value={form.title} onChange={f("title")} placeholder="例：採用管理システムの導入" required />
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
              <Label className="text-sm font-bold text-slate-700">対象部署</Label>
              <Select value={form.departmentId} onValueChange={handleDepartmentChange}>
                <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                <SelectContent>{departments.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-bold text-slate-700">対象部門（複数選択可）</Label>
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
              <Label>対応開始予定日</Label>
              <Input type="date" value={form.plannedStartDate} onChange={f("plannedStartDate")} />
            </div>
            <div className="space-y-1.5">
              <Label>対応完了予定日</Label>
              <Input type="date" value={form.plannedEndDate} onChange={f("plannedEndDate")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>目的・背景</Label>
            <Textarea value={form.purpose} onChange={f("purpose")} placeholder="改善案件の目的を入力..." rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>ステータス</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(IMPROVEMENT_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {form.status === "in_progress" && (
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
                {estimate ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>目安：<span className="font-semibold text-slate-700">{estimate.percent}%</span>（{formatEstimateBreakdown(estimate)}から計算）</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setForm(p => ({ ...p, progress: String(estimate.percent) }))}
                    >
                      目安を入れる
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">紐づく項目がないため目安は計算できません</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (editingImprovement ? "更新中..." : "作成中...") : (editingImprovement ? "更新する" : "作成する")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
