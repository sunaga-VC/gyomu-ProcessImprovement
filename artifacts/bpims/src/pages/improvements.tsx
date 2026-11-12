import { useMemo, useState, useEffect } from "react";
import { useListImprovements, useListDepartments, useListDivisions, useListHearings, useListIssues, type Improvement } from "@workspace/api-client-react";
import { useTopLevelSystemCandidates } from "@/lib/top-level-system-candidates";
import { Badge, Button, Label } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImprovementDetailCard } from "@/components/improvement-detail-card";
import { ImprovementFormDialog } from "@/components/improvement-form-dialog";
import { IMPROVEMENT_STATUS } from "@/lib/constants";
import { Plus, Filter, Printer } from "lucide-react";
import { useSearchParams, Link } from "wouter";

const PRIORITIES = ["高", "中", "低"];
type AxisMode = "management" | "department" | "division";

export default function Improvements() {
  const [open, setOpen] = useState(false);
  const [editingImprovement, setEditingImprovement] = useState<Improvement | null>(null);
  const [filters, setFilters] = useState({ departmentId: "", status: "", priority: "" });
  const [axisMode, setAxisMode] = useState<AxisMode>("management");
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: items, isLoading } = useListImprovements();
  const { data: departments = [] } = useListDepartments();
  const { data: divisions = [] } = useListDivisions();
  const { data: hearings = [] } = useListHearings();
  const { data: issues = [] } = useListIssues();
  const { data: systemCandidates = [] } = useTopLevelSystemCandidates();

  function openCreate() {
    setEditingImprovement(null);
    setOpen(true);
  }

  function openEdit(i: Improvement) {
    setEditingImprovement(i);
    setOpen(true);
  }

  // Deep link from the Gantt chart / 改善ボード (?openId=<id>) — there's no dedicated detail
  // route for improvements, so opening the specific item's edit dialog is the equivalent destination.
  const openId = searchParams.get("openId");
  useEffect(() => {
    if (!openId || !items) return;
    const target = items.find(i => String(i.id) === openId);
    if (target) openEdit(target);
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete("openId"); return next; }, { replace: true });
  }, [openId, items]);

  const filtered = useMemo(() => (items ?? []).filter(i => {
    if (filters.departmentId && String(i.departmentId ?? "") !== filters.departmentId) return false;
    if (filters.status && i.status !== filters.status) return false;
    if (filters.priority && (i.priority ?? "") !== filters.priority) return false;
    return true;
  }), [items, filters]);
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
          <Label className="text-xs">担当部署</Label>
          <Select value={filters.departmentId} onValueChange={v => setFilters(p => ({ ...p, departmentId: v }))}>
            <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
            <SelectContent>{departments.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">ステータス</Label>
          <Select value={filters.status} onValueChange={v => setFilters(p => ({ ...p, status: v }))}>
            <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
            <SelectContent>{Object.entries(IMPROVEMENT_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
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

  // Section lists are driven by the department/division/management-task masters so every
  // configured one shows up from the start — same structure as 業務一覧・ヒアリング一覧.
  const departmentSections = useMemo(() => {
    return departments
      .map(d => ({ primary: { id: d.id, name: d.name }, sortOrder: d.sortOrder ?? 0, items: filtered.filter(i => i.departmentId === d.id) }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.primary.name.localeCompare(b.primary.name, "ja"));
  }, [departments, filtered]);

  const divisionSections = useMemo(() => {
    return divisions
      .map(d => ({ primary: { id: d.id, name: d.name }, sortOrder: d.sortOrder ?? 0, items: filtered.filter(i => (i.divisions ?? []).some(x => x.id === d.id)) }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.primary.name.localeCompare(b.primary.name, "ja"));
  }, [divisions, filtered]);

  const unassignedDepartment = filtered.filter(i => !i.departmentId);
  const unassignedDivision = filtered.filter(i => !i.divisions || i.divisions.length === 0);

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">改善プロジェクト</h1>
          <p className="text-sm text-muted-foreground mt-1">実行中の業務改善施策とその進捗を管理します。</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" className="gap-2" asChild>
            <Link href="/improvements/print"><Printer className="w-4 h-4" />印刷</Link>
          </Button>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="w-4 h-4" />新規案件作成
          </Button>
        </div>
      </div>

      <div className="p-4 border-b flex flex-wrap gap-3 bg-slate-50/50 print:hidden">
        <Tabs value={axisMode} onValueChange={v => setAxisMode(v as AxisMode)} className="ml-auto">
          <TabsList>
            <TabsTrigger value="management">一覧</TabsTrigger>
            <TabsTrigger value="department">部署ごと</TabsTrigger>
            <TabsTrigger value="division">部門ごと</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground">読み込み中...</div>
      ) : axisMode === "management" ? (
        <div className="p-4">
          <ImprovementDetailCard primary={{ id: -1, name: "改善プロジェクト一覧" }} items={filtered} onEdit={openEdit} hearings={hearings} issues={issues} systemCandidates={systemCandidates} filterSlot={filterControl} />
        </div>
      ) : axisMode === "department" ? (
        <div className="p-4 space-y-4">
          {departmentSections.length === 0 && unassignedDepartment.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {activeFilterCount > 0 ? "該当する改善案件がありません" : "部署が登録されていません（組織管理 > 部署管理から登録できます）"}
            </p>
          ) : (
            <div className="space-y-4">
              {unassignedDepartment.length > 0 && (
                <ImprovementDetailCard
                  primary={{ id: -1, name: "部署未設定" }}
                  items={unassignedDepartment}
                  onEdit={openEdit} hearings={hearings} issues={issues} systemCandidates={systemCandidates}
                  variant="warning"
                  filterSlot={filterControl}
                />
              )}
              {departmentSections.map((s, idx) => (
                <ImprovementDetailCard
                  key={s.primary.id}
                  primary={s.primary}
                  items={s.items}
                  onEdit={openEdit} hearings={hearings} issues={issues} systemCandidates={systemCandidates}
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
              {activeFilterCount > 0 ? "該当する改善案件がありません" : "部門が登録されていません（組織管理 > 部門管理から登録できます）"}
            </p>
          ) : (
            <div className="space-y-4">
              {unassignedDivision.length > 0 && (
                <ImprovementDetailCard
                  primary={{ id: -1, name: "部門未設定" }}
                  items={unassignedDivision}
                  onEdit={openEdit} hearings={hearings} issues={issues} systemCandidates={systemCandidates}
                  variant="warning"
                  filterSlot={filterControl}
                />
              )}
              {divisionSections.map((s, idx) => (
                <ImprovementDetailCard
                  key={s.primary.id}
                  primary={s.primary}
                  items={s.items}
                  onEdit={openEdit} hearings={hearings} issues={issues} systemCandidates={systemCandidates}
                  filterSlot={idx === 0 && unassignedDivision.length === 0 ? filterControl : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <ImprovementFormDialog open={open} onOpenChange={setOpen} editingImprovement={editingImprovement} />
    </div>
  );
}
