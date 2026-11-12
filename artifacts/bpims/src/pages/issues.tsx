import { useEffect, useMemo, useState } from "react";
import { useListIssues, useListDepartments, useListDivisions, useListImprovements, type Issue } from "@workspace/api-client-react";
import { Badge, Button, Input, Label } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IssueFormDialog } from "@/components/issue-form-dialog";
import { IssueTreeDetailCard } from "@/components/issue-tree-detail-card";
import { ISSUE_STATUS } from "@/lib/constants";
import { expandWithDescendants } from "@/lib/group-by-department";
import { Filter, Plus } from "lucide-react";
import { useSearchParams } from "wouter";

const EMPTY_FILTERS = { departmentId: "", divisionId: "", status: "", priority: "", ownerName: "" };
const PRIORITIES = [{ value: "高", label: "高" }, { value: "中", label: "中" }, { value: "低", label: "低" }];
type AxisMode = "all" | "improvement" | "department" | "division";

export default function Issues() {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [axisMode, setAxisMode] = useState<AxisMode>("all");
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: issues, isLoading } = useListIssues();
  const { data: departments = [] } = useListDepartments();
  const { data: divisions = [] } = useListDivisions();
  const { data: improvements = [] } = useListImprovements();

  function openCreate() {
    setOpen(true);
  }

  // Deep link from 改善ボード (?openId=<id>) — 一覧 view always contains every task, so switch
  // there and let IssueTreeDetailCard select (not edit) the matching task.
  const [autoSelectId, setAutoSelectId] = useState<number | null>(null);
  const openIdParam = searchParams.get("openId");
  useEffect(() => {
    if (!openIdParam) return;
    setAxisMode("all");
    setAutoSelectId(Number(openIdParam));
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete("openId"); return next; }, { replace: true });
  }, [openIdParam]);

  const filtered = useMemo(() => (issues ?? []).filter((i: Issue) => {
    if (filters.departmentId && !(i.departments ?? []).some(d => String(d.id) === filters.departmentId)) return false;
    if (filters.divisionId && !(i.divisions ?? []).some(d => String(d.id) === filters.divisionId)) return false;
    if (filters.status && i.status !== filters.status) return false;
    if (filters.priority && (i.priority ?? "") !== filters.priority) return false;
    if (filters.ownerName && !(i.ownerName ?? "").toLowerCase().includes(filters.ownerName.toLowerCase())) return false;
    return true;
  }), [issues, filters]);
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
          <Label className="text-xs">対象部署</Label>
          <Select value={filters.departmentId} onValueChange={v => setFilters(p => ({ ...p, departmentId: v }))}>
            <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
            <SelectContent>{departments.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">対象部門</Label>
          <Select value={filters.divisionId} onValueChange={v => setFilters(p => ({ ...p, divisionId: v }))}>
            <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
            <SelectContent>{divisions.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">優先度</Label>
          <Select value={filters.priority} onValueChange={v => setFilters(p => ({ ...p, priority: v }))}>
            <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
            <SelectContent>{PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">担当者</Label>
          <Input placeholder="担当者名で絞り込み..." className="bg-white" value={filters.ownerName} onChange={e => setFilters(p => ({ ...p, ownerName: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">ステータス</Label>
          <Select value={filters.status} onValueChange={v => setFilters(p => ({ ...p, status: v }))}>
            <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
            <SelectContent>{Object.entries(ISSUE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button variant="ghost" size="sm" className="w-full" disabled={activeFilterCount === 0} onClick={() => setFilters(EMPTY_FILTERS)}>
          フィルターをクリア
        </Button>
      </PopoverContent>
    </Popover>
  );

  // Section lists are driven by the department/division/hearing masters so every configured one
  // shows up from the start — same structure as 業務一覧・ヒアリング一覧.
  const departmentSections = useMemo(() => {
    return departments
      .map(d => ({ primary: { id: d.id, name: d.name }, sortOrder: d.sortOrder ?? 0, items: filtered.filter(i => (i.departments ?? []).some(x => x.id === d.id)) }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.primary.name.localeCompare(b.primary.name, "ja"));
  }, [departments, filtered]);

  const divisionSections = useMemo(() => {
    return divisions
      .map(d => ({ primary: { id: d.id, name: d.name }, sortOrder: d.sortOrder ?? 0, items: filtered.filter(i => (i.divisions ?? []).some(x => x.id === d.id)) }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.primary.name.localeCompare(b.primary.name, "ja"));
  }, [divisions, filtered]);

  // Like 業務一覧's 管理業務ごと axis: a child task without its own improvement tag still nests
  // under a tagged ancestor, so expand each improvement's directly-tagged tasks to their descendants.
  const improvementSections = useMemo(() => {
    const filteredIds = new Set(filtered.map(i => i.id));
    return improvements
      .map(imp => {
        const seedIds = new Set(filtered.filter(i => (i.improvements ?? []).some(x => x.id === imp.id)).map(i => i.id));
        const expandedIds = expandWithDescendants(seedIds, issues ?? []);
        const items = (issues ?? []).filter(i => expandedIds.has(i.id) && filteredIds.has(i.id));
        return { primary: { id: imp.id, name: imp.title }, items };
      })
      .sort((a, b) => a.primary.name.localeCompare(b.primary.name, "ja"));
  }, [improvements, issues, filtered]);

  const unassignedDepartment = filtered.filter(i => !i.departments || i.departments.length === 0);
  const unassignedDivision = filtered.filter(i => !i.divisions || i.divisions.length === 0);
  const unassignedImprovement = filtered.filter(i => !i.improvements || i.improvements.length === 0);

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">タスク一覧</h1>
          <p className="text-sm text-muted-foreground mt-1">ヒアリングや日々の業務から挙がったタスクを管理します。</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />新規タスク登録
        </Button>
      </div>

      <div className="p-4 border-b flex flex-wrap gap-3 bg-slate-50/50">
        <Tabs value={axisMode} onValueChange={v => setAxisMode(v as AxisMode)} className="ml-auto">
          <TabsList>
            <TabsTrigger value="all">一覧</TabsTrigger>
            <TabsTrigger value="improvement">改善プロジェクトごと</TabsTrigger>
            <TabsTrigger value="department">部署ごと</TabsTrigger>
            <TabsTrigger value="division">部門ごと</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground">読み込み中...</div>
      ) : axisMode === "all" ? (
        <div className="p-4">
          <IssueTreeDetailCard primary={{ id: -1, name: "タスク一覧" }} items={filtered} allIssues={issues ?? []} autoSelectId={autoSelectId} filterSlot={filterControl} />
        </div>
      ) : axisMode === "improvement" ? (
        <div className="p-4 space-y-4">
          {improvementSections.length === 0 && unassignedImprovement.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {activeFilterCount > 0 ? "該当するタスクがありません" : "改善案件が登録されていません（改善プロジェクト一覧から登録できます）"}
            </p>
          ) : (
            <div className="space-y-4">
              {unassignedImprovement.length > 0 && (
                <IssueTreeDetailCard
                  primary={{ id: -1, name: "改善案件未設定" }}
                  items={unassignedImprovement}
                  allIssues={issues ?? []}
                  variant="warning"
                  filterSlot={filterControl}
                />
              )}
              {improvementSections.map((s, idx) => (
                <IssueTreeDetailCard
                  key={s.primary.id}
                  primary={s.primary}
                  items={s.items}
                  allIssues={issues ?? []}
                  formDefaults={{ defaultImprovementIds: [s.primary.id] }}
                  filterSlot={idx === 0 && unassignedImprovement.length === 0 ? filterControl : undefined}
                />
              ))}
            </div>
          )}
        </div>
      ) : axisMode === "department" ? (
        <div className="p-4 space-y-4">
          {departmentSections.length === 0 && unassignedDepartment.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {activeFilterCount > 0 ? "該当するタスクがありません" : "部署が登録されていません（組織管理 > 部署管理から登録できます）"}
            </p>
          ) : (
            <div className="space-y-4">
              {unassignedDepartment.length > 0 && (
                <IssueTreeDetailCard
                  primary={{ id: -1, name: "部署未設定" }}
                  items={unassignedDepartment}
                  allIssues={issues ?? []}
                  variant="warning"
                  filterSlot={filterControl}
                />
              )}
              {departmentSections.map((s, idx) => (
                <IssueTreeDetailCard
                  key={s.primary.id}
                  primary={s.primary}
                  items={s.items}
                  allIssues={issues ?? []}
                  formDefaults={{ defaultDepartmentIds: [s.primary.id] }}
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
              {activeFilterCount > 0 ? "該当するタスクがありません" : "部門が登録されていません（組織管理 > 部門管理から登録できます）"}
            </p>
          ) : (
            <div className="space-y-4">
              {unassignedDivision.length > 0 && (
                <IssueTreeDetailCard
                  primary={{ id: -1, name: "部門未設定" }}
                  items={unassignedDivision}
                  allIssues={issues ?? []}
                  variant="warning"
                  filterSlot={filterControl}
                />
              )}
              {divisionSections.map((s, idx) => (
                <IssueTreeDetailCard
                  key={s.primary.id}
                  primary={s.primary}
                  items={s.items}
                  allIssues={issues ?? []}
                  formDefaults={{ defaultDivisionIds: [s.primary.id] }}
                  filterSlot={idx === 0 && unassignedDivision.length === 0 ? filterControl : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <IssueFormDialog open={open} onOpenChange={setOpen} editingIssue={null} />
    </div>
  );
}
