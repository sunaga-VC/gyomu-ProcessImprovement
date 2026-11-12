import { useEffect, useMemo, useState } from "react";
import { useListHearings, useCreateHearing, useUpdateHearing, useListDepartments, useListDivisions, useListImprovements, getListHearingsQueryKey, type Hearing } from "@workspace/api-client-react";
import { Badge, Button, Input, Label } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { HearingDetailCard } from "@/components/hearing-detail-card";
import { MultiSelectList } from "@/components/multi-select-list";
import { HEARING_STATUS } from "@/lib/constants";
import { Calendar, Filter, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "wouter";

const EMPTY = { title: "", departmentId: "", divisionIds: [] as number[], improvementIds: [] as number[], intervieweeName: "", scheduledAt: "", purpose: "", priority: "", status: "not_started" };
const PRIORITIES = ["高", "中", "低"];
type AxisMode = "management" | "department" | "division";

function toDateInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function Hearings() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [filters, setFilters] = useState({ departmentId: "", status: "", priority: "" });
  const [axisMode, setAxisMode] = useState<AxisMode>("management");
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: hearings, isLoading } = useListHearings();
  const { data: departments = [] } = useListDepartments();
  const { data: divisions = [] } = useListDivisions();
  const { data: improvements = [] } = useListImprovements();
  const createHearing = useCreateHearing();
  const updateHearing = useUpdateHearing();

  const f = (k: "title" | "intervieweeName" | "scheduledAt" | "purpose") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(h: Hearing) {
    setEditingId(h.id);
    setForm({
      title: h.title,
      departmentId: h.departmentId ? String(h.departmentId) : "",
      divisionIds: (h.divisions ?? []).map(d => d.id),
      improvementIds: (h.improvements ?? []).map(r => r.id),
      intervieweeName: h.intervieweeName ?? "",
      scheduledAt: toDateInputValue(h.scheduledAt),
      purpose: h.purpose ?? "",
      priority: h.priority ?? "",
      status: h.status,
    });
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getListHearingsQueryKey() });
      setOpen(false);
      setForm(EMPTY);
      setEditingId(null);
    };
    if (editingId) {
      // null (not undefined): undefined fields are dropped from the JSON body entirely, so
      // clearing a field back to blank and saving would otherwise leave the old value in place.
      updateHearing.mutate({
        id: editingId,
        data: {
          title: form.title,
          departmentId: form.departmentId ? Number(form.departmentId) : null,
          divisionIds: form.divisionIds,
          improvementIds: form.improvementIds,
          intervieweeName: form.intervieweeName || null,
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
          purpose: form.purpose || null,
          priority: form.priority || null,
          status: form.status,
        },
      }, { onSuccess });
    } else {
      createHearing.mutate({
        data: {
          title: form.title,
          departmentId: form.departmentId ? Number(form.departmentId) : undefined,
          divisionIds: form.divisionIds,
          improvementIds: form.improvementIds,
          intervieweeName: form.intervieweeName || undefined,
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
          purpose: form.purpose || undefined,
          priority: form.priority || undefined,
          status: form.status,
        },
      }, { onSuccess });
    }
  }

  // Deep link from 改善ボード (?openId=<id>) — 一覧 view always contains every hearing, so switch
  // there and let HearingDetailCard select (not edit) the matching hearing.
  const [autoSelectId, setAutoSelectId] = useState<number | null>(null);
  const openId = searchParams.get("openId");
  useEffect(() => {
    if (!openId) return;
    setAxisMode("management");
    setAutoSelectId(Number(openId));
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete("openId"); return next; }, { replace: true });
  }, [openId]);

  const isPending = createHearing.isPending || updateHearing.isPending;
  const filtered = useMemo(() => (hearings ?? []).filter(h => {
    if (filters.departmentId && String(h.departmentId ?? "") !== filters.departmentId) return false;
    if (filters.status && h.status !== filters.status) return false;
    if (filters.priority && (h.priority ?? "") !== filters.priority) return false;
    return true;
  }), [hearings, filters]);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const filterControl = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative h-8 w-8 bg-white shrink-0" title="フィルター">
          <Filter className="w-4 h-4" />
          {activeFilterCount > 0 && (
            <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">{activeFilterCount}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">部署</Label>
          <Select value={filters.departmentId} onValueChange={v => setFilters(p => ({ ...p, departmentId: v }))}>
            <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
            <SelectContent>{departments.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">ステータス</Label>
          <Select value={filters.status} onValueChange={v => setFilters(p => ({ ...p, status: v }))}>
            <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
            <SelectContent>{Object.entries(HEARING_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">優先度</Label>
          <Select value={filters.priority} onValueChange={v => setFilters(p => ({ ...p, priority: v }))}>
            <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
            <SelectContent>{PRIORITIES.map(pr => <SelectItem key={pr} value={pr}>{pr}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button variant="ghost" size="sm" className="w-full" disabled={activeFilterCount === 0} onClick={() => setFilters({ departmentId: "", status: "", priority: "" })}>
          フィルターをクリア
        </Button>
      </PopoverContent>
    </Popover>
  );

  // Section lists are driven by the department/division masters (組織管理) so every
  // configured one shows up from the start — same structure as 業務ツリーの「部署ごと」「部門ごと」.
  const departmentSections = useMemo(() => {
    return departments
      .map(d => ({ primary: { id: d.id, name: d.name }, sortOrder: d.sortOrder ?? 0, items: filtered.filter(h => h.departmentId === d.id) }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.primary.name.localeCompare(b.primary.name, "ja"));
  }, [departments, filtered]);

  const divisionSections = useMemo(() => {
    return divisions
      .map(d => ({ primary: { id: d.id, name: d.name }, sortOrder: d.sortOrder ?? 0, items: filtered.filter(h => (h.divisions ?? []).some(x => x.id === d.id)) }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.primary.name.localeCompare(b.primary.name, "ja"));
  }, [divisions, filtered]);

  const unassignedDepartment = filtered.filter(h => !h.departmentId);
  const unassignedDivision = filtered.filter(h => !h.divisions || h.divisions.length === 0);

  function handleDepartmentChange(v: string) {
    setForm(p => ({ ...p, departmentId: v }));
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ヒアリング一覧</h1>
          <p className="text-sm text-muted-foreground mt-1">業務ヒアリングの予定と結果を管理します。</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />新規ヒアリング
        </Button>
      </div>

      <div className="p-4 border-b flex flex-wrap gap-3 bg-slate-50/50">
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" className="gap-2 bg-white"><Calendar className="w-4 h-4" />カレンダー表示</Button>
          <Tabs value={axisMode} onValueChange={v => setAxisMode(v as AxisMode)}>
            <TabsList>
              <TabsTrigger value="management">一覧</TabsTrigger>
              <TabsTrigger value="department">部署ごと</TabsTrigger>
              <TabsTrigger value="division">部門ごと</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground">読み込み中...</div>
      ) : axisMode === "management" ? (
        <div className="p-4">
          <HearingDetailCard primary={{ id: -1, name: "ヒアリング一覧" }} items={filtered} onEdit={openEdit} autoSelectId={autoSelectId} filterSlot={filterControl} />
        </div>
      ) : axisMode === "department" ? (
        <div className="p-4 space-y-4">
          {departmentSections.length === 0 && unassignedDepartment.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {activeFilterCount > 0 ? "該当するヒアリングがありません" : "部署が登録されていません（組織管理 > 部署管理から登録できます）"}
            </p>
          ) : (
            <div className="space-y-4">
              {unassignedDepartment.length > 0 && (
                <HearingDetailCard
                  primary={{ id: -1, name: "部署未設定" }}
                  items={unassignedDepartment}
                  onEdit={openEdit}
                  variant="warning"
                  filterSlot={filterControl}
                />
              )}
              {departmentSections.map((s, idx) => (
                <HearingDetailCard
                  key={s.primary.id}
                  primary={s.primary}
                  items={s.items}
                  onEdit={openEdit}
                  filterSlot={idx === 0 && unassignedDepartment.length === 0 ? filterControl : undefined}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {divisionSections.length === 0 && unassignedDivision.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {activeFilterCount > 0 ? "該当するヒアリングがありません" : "部門が登録されていません（組織管理 > 部門管理から登録できます）"}
            </p>
          ) : (
            <div className="space-y-4">
              {unassignedDivision.length > 0 && (
                <HearingDetailCard
                  primary={{ id: -1, name: "部門未設定" }}
                  items={unassignedDivision}
                  onEdit={openEdit}
                  variant="warning"
                  filterSlot={filterControl}
                />
              )}
              {divisionSections.map((s, idx) => (
                <HearingDetailCard
                  key={s.primary.id}
                  primary={s.primary}
                  items={s.items}
                  onEdit={openEdit}
                  filterSlot={idx === 0 && unassignedDivision.length === 0 ? filterControl : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editingId ? "ヒアリングを編集" : "新規ヒアリング"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <div className="space-y-1.5">
                <Label>件名 <span className="text-red-500">*</span></Label>
                <Input value={form.title} onChange={f("title")} placeholder="例：人事部 採用業務 初回ヒアリング" required />
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
                <Label>対象部署</Label>
                <Select value={form.departmentId} onValueChange={handleDepartmentChange}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>{departments.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
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
            <div className="space-y-1.5">
              <Label>関連改善案件（複数選択可）</Label>
              <MultiSelectList
                options={improvements.map(i => ({ id: i.id, name: i.title }))}
                selectedIds={form.improvementIds}
                onChange={ids => setForm(p => ({ ...p, improvementIds: ids }))}
                emptyLabel="改善案件が登録されていません"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>対象者（被ヒアリング者）</Label>
                <Input value={form.intervieweeName} onChange={f("intervieweeName")} placeholder="対象者名を入力..." />
              </div>
              <div className="space-y-1.5">
                <Label>予定日</Label>
                <Input type="date" value={form.scheduledAt} onChange={f("scheduledAt")} />
              </div>
              <div className="space-y-1.5">
                <Label>ステータス</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(HEARING_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>目的・確認事項</Label>
              <Textarea value={form.purpose} onChange={f("purpose")} placeholder="ヒアリングの目的や確認したい事項を入力..." rows={2} />
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
    </div>
  );
}
