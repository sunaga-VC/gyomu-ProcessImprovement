import { useMemo, useState } from "react";
import { useListProcesses, useCreateProcess, useListDepartments, useListDivisions, useListManagementTasks, getListProcessesQueryKey } from "@workspace/api-client-react";
import { Card, Badge, Button, Input, Label } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProcessTreeDetailCard } from "@/components/process-tree-detail-card";
import { ProcessFormDialog } from "@/components/process-form-dialog";
import { CsvImportDialog, type CsvField, type CsvImportResult } from "@/components/csv-import-dialog";
import { PROCESS_STATUS } from "@/lib/constants";
import { splitMultiValue, resolveNamesToIds } from "@/lib/csv";
import { expandWithDescendants } from "@/lib/group-by-department";
import { Plus, Search, Filter, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const EMPTY_FILTERS = { departmentId: "", divisionId: "", parentId: "", status: "", ownerName: "" };
type AxisMode = "management" | "department" | "division";

const PROCESS_CSV_FIELDS: CsvField[] = [
  { key: "name", label: "業務名", required: true },
  { key: "parentName", label: "親業務" },
  { key: "departmentNames", label: "主担当部署（カンマ区切り）" },
  { key: "relatedDepartmentNames", label: "関連部署（カンマ区切り）" },
  { key: "divisionNames", label: "担当部門（カンマ区切り）" },
  { key: "managementTaskNames", label: "関連する管理業務（カンマ区切り）" },
  { key: "ownerName", label: "担当者" },
  { key: "category", label: "カテゴリ" },
  { key: "status", label: "ステータス" },
  { key: "frequency", label: "実施頻度" },
  { key: "overview", label: "業務概要" },
];

export default function Processes() {
  const [open, setOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [axisMode, setAxisMode] = useState<AxisMode>("management");
  const queryClient = useQueryClient();

  const { data: processes, isLoading } = useListProcesses();
  const { data: departments = [] } = useListDepartments();
  const { data: divisions = [] } = useListDivisions();
  const { data: managementTasks = [] } = useListManagementTasks();
  const createProcess = useCreateProcess();

  const statusLabelToKey = useMemo(() => new Map(Object.entries(PROCESS_STATUS).map(([k, v]) => [v, k])), []);

  async function handleCsvImport(rows: Record<string, string>[]): Promise<CsvImportResult> {
    const issues: CsvImportResult["issues"] = [];
    let successCount = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const name = r.name.trim();
      if (!name) { issues.push({ row: rowNum, message: "業務名が空のため、この行はスキップしました。", level: "error" }); continue; }

      const parentName = r.parentName.trim();
      const parent = parentName ? (processes ?? []).find(p => p.name === parentName) : undefined;
      if (parentName && !parent) issues.push({ row: rowNum, message: `親業務「${parentName}」が見つかりません（未設定のまま登録します。既存の業務名のみ指定できます）。`, level: "warning" });

      const { ids: departmentIds, unmatched: unmatchedDepts } = resolveNamesToIds(splitMultiValue(r.departmentNames), departments);
      if (unmatchedDepts.length > 0) issues.push({ row: rowNum, message: `主担当部署が見つかりません: ${unmatchedDepts.join("、")}`, level: "warning" });

      const { ids: relatedDepartmentIds, unmatched: unmatchedRelatedDepts } = resolveNamesToIds(splitMultiValue(r.relatedDepartmentNames), departments);
      if (unmatchedRelatedDepts.length > 0) issues.push({ row: rowNum, message: `関連部署が見つかりません: ${unmatchedRelatedDepts.join("、")}`, level: "warning" });

      const { ids: divisionIds, unmatched: unmatchedDivs } = resolveNamesToIds(splitMultiValue(r.divisionNames), divisions);
      if (unmatchedDivs.length > 0) issues.push({ row: rowNum, message: `担当部門が見つかりません: ${unmatchedDivs.join("、")}`, level: "warning" });

      const { ids: managementTaskIds, unmatched: unmatchedTasks } = resolveNamesToIds(splitMultiValue(r.managementTaskNames), managementTasks);
      if (unmatchedTasks.length > 0) issues.push({ row: rowNum, message: `管理業務が見つかりません: ${unmatchedTasks.join("、")}`, level: "warning" });

      const rawStatus = r.status.trim();
      const status = rawStatus ? (statusLabelToKey.get(rawStatus) ?? (rawStatus in PROCESS_STATUS ? rawStatus : undefined)) : undefined;
      if (rawStatus && !status) issues.push({ row: rowNum, message: `ステータス「${rawStatus}」が不明のため、初期値（仮登録）で登録します。`, level: "warning" });

      try {
        await createProcess.mutateAsync({
          data: {
            name,
            parentId: parent?.id,
            departmentIds,
            relatedDepartmentIds,
            divisionIds,
            managementTaskIds,
            ownerName: r.ownerName || undefined,
            category: r.category || undefined,
            status: status ?? "draft",
            frequency: r.frequency || undefined,
            overview: r.overview || undefined,
          },
        });
        successCount++;
      } catch (e) {
        issues.push({ row: rowNum, message: e instanceof Error ? e.message : "登録に失敗しました。", level: "error" });
      }
    }
    queryClient.invalidateQueries({ queryKey: getListProcessesQueryKey() });
    return { successCount, issues };
  }

  function openCreate() {
    setOpen(true);
  }

  const filtered = processes?.filter(p => {
    const matchesKeyword = !keyword || p.name.toLowerCase().includes(keyword.toLowerCase()) ||
      (p.departments ?? []).some(d => d.name.toLowerCase().includes(keyword.toLowerCase()));
    if (!matchesKeyword) return false;
    if (filters.departmentId && !(p.departments ?? []).some(d => String(d.id) === filters.departmentId)) return false;
    if (filters.divisionId && !(p.divisions ?? []).some(d => String(d.id) === filters.divisionId)) return false;
    if (filters.parentId && String(p.parentId ?? "") !== filters.parentId) return false;
    if (filters.status && p.status !== filters.status) return false;
    if (filters.ownerName && !(p.ownerName ?? "").toLowerCase().includes(filters.ownerName.toLowerCase())) return false;
    return true;
  }) ?? [];
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // Section lists are driven by the department/division/management-task masters so every
  // configured one shows up from the start, not just ones with items in the current filter —
  // same structure as 業務ツリー.
  const departmentSections = useMemo(() => {
    return (departments ?? [])
      .map(d => ({ primary: { id: d.id, name: d.name, description: d.description }, sortOrder: d.sortOrder ?? 0, items: filtered.filter(p => (p.departments ?? []).some(x => x.id === d.id)) }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.primary.name.localeCompare(b.primary.name, "ja"));
  }, [departments, filtered]);

  const divisionSections = useMemo(() => {
    return (divisions ?? [])
      .map(d => ({ primary: { id: d.id, name: d.name, description: d.description }, sortOrder: d.sortOrder ?? 0, items: filtered.filter(p => (p.divisions ?? []).some(x => x.id === d.id)) }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.primary.name.localeCompare(b.primary.name, "ja"));
  }, [divisions, filtered]);

  const managementSections = useMemo(() => {
    const filteredIds = new Set(filtered.map(p => p.id));
    return managementTasks
      .map(mt => {
        const seedIds = new Set((mt.processes ?? []).map(p => p.id));
        const expandedIds = expandWithDescendants(seedIds, processes ?? []);
        const items = (processes ?? []).filter(p => expandedIds.has(p.id) && filteredIds.has(p.id));
        return { primary: { id: mt.id, name: mt.name, description: mt.description }, sortOrder: mt.sortOrder ?? 0, items };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.primary.name.localeCompare(b.primary.name, "ja"));
  }, [managementTasks, processes, filtered]);

  const unassignedDepartment = filtered.filter(p => !p.departments || p.departments.length === 0);
  const unassignedDivision = filtered.filter(p => !p.divisions || p.divisions.length === 0);
  const unassignedManagement = filtered.filter(p => !p.managementTasks || p.managementTasks.length === 0);

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">業務一覧</h1>
          <p className="text-sm text-muted-foreground mt-1">全社の業務プロセスを一覧表示・検索します。</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setCsvOpen(true)}>
            <Upload className="w-4 h-4" />CSVインポート
          </Button>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="w-4 h-4" />新規業務登録
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-4 border-b flex flex-wrap gap-3 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="業務名、担当部署で検索..." className="pl-9 bg-white" value={keyword} onChange={e => setKeyword(e.target.value)} />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 bg-white">
                <Filter className="w-4 h-4" />フィルター
                {activeFilterCount > 0 && (
                  <Badge className="h-5 min-w-5 justify-center rounded-full px-1">{activeFilterCount}</Badge>
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
                <Label className="text-xs">部門</Label>
                <Select value={filters.divisionId} onValueChange={v => setFilters(p => ({ ...p, divisionId: v }))}>
                  <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
                  <SelectContent>{divisions.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">親業務</Label>
                <Select value={filters.parentId} onValueChange={v => setFilters(p => ({ ...p, parentId: v }))}>
                  <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
                  <SelectContent>{processes?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
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
                  <SelectContent>{Object.entries(PROCESS_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button variant="ghost" size="sm" className="w-full" disabled={activeFilterCount === 0} onClick={() => setFilters(EMPTY_FILTERS)}>
                フィルターをクリア
              </Button>
            </PopoverContent>
          </Popover>
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
          <div className="p-4 space-y-4">
            {managementSections.length === 0 && unassignedManagement.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {keyword || activeFilterCount > 0 ? "該当する業務がありません" : "管理業務が登録されていません（管理業務画面から登録できます）"}
              </p>
            ) : (
              <div className="space-y-4">
                {unassignedManagement.length > 0 && (
                  <ProcessTreeDetailCard
                    primary={{ id: -1, name: "管理業務未設定" }}
                    items={unassignedManagement}
                    allProcesses={processes ?? []}
                    variant="warning"
                  />
                )}
                {managementSections.map(s => (
                  <ProcessTreeDetailCard
                    key={s.primary.id}
                    primary={s.primary}
                    items={s.items}
                    allProcesses={processes ?? []}
                    formDefaults={{ defaultManagementTaskIds: [s.primary.id] }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : axisMode === "department" ? (
          <div className="p-4 space-y-4">
            {departmentSections.length === 0 && unassignedDepartment.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {keyword || activeFilterCount > 0 ? "該当する業務がありません" : "部署が登録されていません（組織管理 > 部署管理から登録できます）"}
              </p>
            ) : (
              <div className="space-y-4">
                {unassignedDepartment.length > 0 && (
                  <ProcessTreeDetailCard
                    primary={{ id: -1, name: "部署未設定" }}
                    items={unassignedDepartment}
                    allProcesses={processes ?? []}
                    variant="warning"
                  />
                )}
                {departmentSections.map(s => (
                  <ProcessTreeDetailCard
                    key={s.primary.id}
                    primary={s.primary}
                    items={s.items}
                    allProcesses={processes ?? []}
                    formDefaults={{ defaultDepartmentIds: [s.primary.id] }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {divisionSections.length === 0 && unassignedDivision.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {keyword || activeFilterCount > 0 ? "該当する業務がありません" : "部門が登録されていません（組織管理 > 部門管理から登録できます）"}
              </p>
            ) : (
              <div className="space-y-4">
                {unassignedDivision.length > 0 && (
                  <ProcessTreeDetailCard
                    primary={{ id: -1, name: "部門未設定" }}
                    items={unassignedDivision}
                    allProcesses={processes ?? []}
                    variant="warning"
                  />
                )}
                {divisionSections.map(s => (
                  <ProcessTreeDetailCard
                    key={s.primary.id}
                    primary={s.primary}
                    items={s.items}
                    allProcesses={processes ?? []}
                    formDefaults={{ defaultDivisionIds: [s.primary.id] }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <ProcessFormDialog open={open} onOpenChange={setOpen} editingProcess={null} />

      <CsvImportDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        title="業務一覧をCSVインポート"
        description="業務名は必須です。部署・部門・管理業務は既存マスターの名称と完全一致するものだけ紐づけられます（カンマ区切りで複数指定可）。部署は主担当部署・関連部署をそれぞれ別の列で指定できます。"
        fields={PROCESS_CSV_FIELDS}
        onImport={handleCsvImport}
      />
    </div>
  );
}
