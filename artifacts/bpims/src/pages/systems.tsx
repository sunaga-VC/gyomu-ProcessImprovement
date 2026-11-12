import { useEffect, useState } from "react";
import { useListSystems, useCreateSystem, useUpdateSystem, useDeleteSystem, useListDepartments, useListDivisions, getListSystemsQueryKey, type SystemRecord } from "@workspace/api-client-react";
import { Badge, Button, Input, Label } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { MultiSelectList } from "@/components/multi-select-list";
import { DepartmentBadgeGroup, DivisionBadges } from "@/components/department-division-badges";
import { Server, Plus, Search as SearchIcon, Filter, Pencil, Trash2, ExternalLink, ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "wouter";

const EMPTY = { name: "", systemType: "", url: "", departmentIds: [] as number[], relatedDepartmentIds: [] as number[], divisionIds: [] as number[], issues: "", notes: "", isBeingDiscontinued: false };
const SYSTEM_TYPES = ["SaaS", "社内システム", "パッケージソフト", "クラウドサービス", "チャット", "Google Workspace", "Microsoft 365", "その他"];

/** ヒアリング一覧などと同じ規則: アイコンに中身がある場合は紫で強調する。 */
function relatedIconClass(hasContent: boolean) {
  return `flex items-center gap-1 rounded-md border px-2 py-1 ${
    hasContent
      ? "border-purple-200 bg-purple-50 text-purple-600 hover:bg-purple-100"
      : "border-slate-200 bg-white text-slate-500 hover:text-primary hover:border-slate-300"
  }`;
}

const SYSTEM_STATUSES = ["利用中", "廃止予定", "利用停止"];
function getSystemStatusLabel(sys: { isActive?: boolean; isBeingDiscontinued?: boolean | null }): string {
  return sys.isBeingDiscontinued ? "廃止予定" : sys.isActive ? "利用中" : "利用停止";
}

export default function Systems() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [keyword, setKeyword] = useState("");
  const [filters, setFilters] = useState({ systemType: "", status: "" });
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: items = [], isLoading } = useListSystems();
  const { data: departments = [] } = useListDepartments();
  const { data: divisions = [] } = useListDivisions();
  const createSystem = useCreateSystem();
  const updateSystem = useUpdateSystem();
  const deleteSystem = useDeleteSystem();

  const openId = searchParams.get("openId");
  useEffect(() => {
    if (!openId || !items) return;
    const target = items.find((i) => String(i.id) === openId);
    if (target) {
      setHighlightId(target.id);
      requestAnimationFrame(() => {
        document.getElementById(`system-row-${target.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete("openId"); return next; }, { replace: true });
  }, [openId, items]);

  const f = (k: "name" | "url" | "issues" | "notes") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(sys: SystemRecord) {
    setEditingId(sys.id);
    setForm({
      name: sys.name,
      systemType: sys.systemType ?? "",
      url: sys.url ?? "",
      departmentIds: (sys.departments ?? []).map(d => d.id),
      relatedDepartmentIds: (sys.relatedDepartments ?? []).map(d => d.id),
      divisionIds: (sys.divisions ?? []).map(d => d.id),
      issues: sys.issues ?? "",
      notes: sys.notes ?? "",
      isBeingDiscontinued: sys.isBeingDiscontinued ?? false,
    });
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const data = {
      name: form.name,
      systemType: form.systemType || undefined,
      url: form.url || undefined,
      departmentIds: form.departmentIds,
      relatedDepartmentIds: form.relatedDepartmentIds,
      divisionIds: form.divisionIds,
      issues: form.issues || undefined,
      notes: form.notes || undefined,
      isBeingDiscontinued: form.isBeingDiscontinued,
    };
    const finish = () => {
      queryClient.invalidateQueries({ queryKey: getListSystemsQueryKey() });
      setOpen(false);
      setForm(EMPTY);
      setEditingId(null);
    };
    if (editingId) {
      updateSystem.mutate({ id: editingId, data }, { onSuccess: finish });
    } else {
      createSystem.mutate({ data }, { onSuccess: finish });
    }
  }

  function handleDelete() {
    if (!deletingId) return;
    deleteSystem.mutate({ id: deletingId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSystemsQueryKey() });
        setDeletingId(null);
      }
    });
  }

  function handleDepartmentIdsChange(ids: number[]) {
    setForm(p => ({ ...p, departmentIds: ids }));
  }

  const isPending = createSystem.isPending || updateSystem.isPending;
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const filtered = items
    .filter(i => !keyword || i.name.toLowerCase().includes(keyword.toLowerCase()))
    .filter(i => !filters.systemType || i.systemType === filters.systemType)
    .filter(i => !filters.status || getSystemStatusLabel(i) === filters.status);
  const sectionOpen = manualOpen ?? items.length > 0;

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">利用システム</h1>
          <p className="text-sm text-muted-foreground mt-1">社内で利用されている各種システムの台帳です。</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />利用システム登録
        </Button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground">読み込み中...</div>
      ) : (
        <div>
          <div
            className="flex flex-wrap items-start justify-between gap-4 cursor-pointer py-2"
            onClick={() => setManualOpen(!sectionOpen)}
          >
            <div className="flex items-start gap-2">
              <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform shrink-0 mt-2 ${sectionOpen ? "rotate-90" : ""}`} />
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-blue-50 text-blue-600">
                <Server className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">利用システム一覧</h3>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-medium">{filtered.length}件</Badge>
              </div>
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="システム名で検索" className="pl-8 h-8 text-sm w-48" value={keyword} onChange={e => setKeyword(e.target.value)} />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="relative h-8 w-8 bg-white shrink-0" title="フィルター">
                    <Filter className="w-4 h-4" />
                    {activeFilterCount > 0 && (
                      <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">{activeFilterCount}</Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">種別</Label>
                    <Select value={filters.systemType} onValueChange={v => setFilters(p => ({ ...p, systemType: v }))}>
                      <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
                      <SelectContent>{SYSTEM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">ステータス</Label>
                    <Select value={filters.status} onValueChange={v => setFilters(p => ({ ...p, status: v }))}>
                      <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
                      <SelectContent>{SYSTEM_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Button variant="ghost" size="sm" className="w-full" disabled={activeFilterCount === 0} onClick={() => setFilters({ systemType: "", status: "" })}>
                    フィルターをクリア
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {sectionOpen && (
            <div className="mt-3 space-y-2">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">{keyword || activeFilterCount > 0 ? "該当するシステムがありません" : "システムがありません"}</p>
              ) : (
                filtered.map(i => {
                  const hasContent = !!(i.issues?.trim() || i.notes?.trim());
                  return (
                    <section
                      key={i.id}
                      id={`system-row-${i.id}`}
                      className={`rounded-xl border bg-white shadow-sm overflow-hidden ${highlightId === i.id ? "border-primary bg-primary/5" : "border-slate-200"}`}
                    >
                      <div className="bg-slate-50/70 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button type="button" className={relatedIconClass(hasContent)} title="課題・備考を表示">
                                <Server className="w-3.5 h-3.5" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              className="max-w-xs whitespace-pre-wrap bg-slate-900 text-white border border-slate-700 rounded-md px-3 py-2 shadow-lg z-50"
                            >
                              <p className="text-xs font-bold mb-1">課題</p>
                              <p className="text-xs">{i.issues || "未設定"}</p>
                              <p className="text-xs font-bold mt-2 mb-1">備考</p>
                              <p className="text-xs">{i.notes || "未設定"}</p>
                            </PopoverContent>
                          </Popover>
                          <div className="min-w-0 flex-1 flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-slate-900">{i.name}</span>
                            {i.systemType ? (
                              <Badge variant="outline" className="shrink-0 bg-slate-50 text-slate-700 border-slate-200 font-normal">
                                {i.systemType}
                              </Badge>
                            ) : null}
                            {i.url ? (
                              <a
                                href={i.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 text-slate-400 hover:text-primary"
                                title="URLを開く"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : null}
                          </div>
                          <div className="shrink-0"><DepartmentBadgeGroup primary={i.departments} related={i.relatedDepartments} /></div>
                          <div className="shrink-0"><DivisionBadges divisions={i.divisions} /></div>
                          <Badge
                            className="ml-auto shrink-0"
                            variant={i.isActive ? "default" : "secondary"}
                          >
                            {getSystemStatusLabel(i)}
                          </Badge>
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <Button size="icon" variant="ghost" className="h-4 w-4 text-slate-400 hover:text-primary" onClick={() => openEdit(i)} title="システムを編集">
                              <Pencil className="w-2.5 h-2.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-4 w-4 text-slate-400 hover:text-red-600" onClick={() => setDeletingId(i.id)} title="システムを削除">
                              <Trash2 className="w-2.5 h-2.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "システムを編集" : "利用システム登録"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>システム名 <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={f("name")} placeholder="例：SmartHR" required />
            </div>
            <div className="space-y-1.5">
              <Label>種別</Label>
              <Select value={form.systemType} onValueChange={v => setForm(p => ({ ...p, systemType: v }))}>
                <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                <SelectContent>{SYSTEM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input value={form.url} onChange={f("url")} placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>担当部署（複数選択可）</Label>
                <MultiSelectList
                  options={departments}
                  selectedIds={form.departmentIds}
                  onChange={handleDepartmentIdsChange}
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
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isBeingDiscontinued}
                onChange={e => setForm(p => ({ ...p, isBeingDiscontinued: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300"
              />
              <span className="text-sm font-medium text-slate-700">廃止予定のシステム</span>
            </label>
            <div className="space-y-1.5">
              <Label>課題</Label>
              <Textarea value={form.issues} onChange={f("issues")} placeholder="このシステムに関する課題..." rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>備考</Label>
              <Textarea value={form.notes} onChange={f("notes")} placeholder="その他の注意事項など..." rows={2} />
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
        isPending={deleteSystem.isPending}
        title="このシステムを削除しますか？"
      />
    </div>
  );
}
