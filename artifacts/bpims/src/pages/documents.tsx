import { useEffect, useState } from "react";
import { useListDocuments, useCreateDocument, useUpdateDocument, useDeleteDocument, useListDepartments, useListDivisions, getListDocumentsQueryKey, type Document } from "@workspace/api-client-react";
import { Badge, Button, Input, Label } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { MultiSelectList } from "@/components/multi-select-list";
import { DepartmentBadgeGroup, DivisionBadges } from "@/components/department-division-badges";
import { FileText, Plus, Search as SearchIcon, Filter, Pencil, Trash2, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "wouter";

const EMPTY = { name: "", docType: "", departmentIds: [] as number[], relatedDepartmentIds: [] as number[], divisionIds: [] as number[], location: "", url: "", hasPersonalInfo: false, needsImprovement: false, notes: "" };
const DOC_TYPES = ["Excel", "Word", "PDF", "PowerPoint", "紙", "その他"];

/** ヒアリング一覧などと同じ規則: アイコンに中身がある場合は紫で強調する。 */
function relatedIconClass(hasContent: boolean) {
  return `flex items-center gap-1 rounded-md border px-2 py-1 ${
    hasContent
      ? "border-purple-200 bg-purple-50 text-purple-600 hover:bg-purple-100"
      : "border-slate-200 bg-white text-slate-500 hover:text-primary hover:border-slate-300"
  }`;
}

export default function Documents() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [viewingDocument, setViewingDocument] = useState<Document | null>(null);
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [contentDraft, setContentDraft] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [keyword, setKeyword] = useState("");
  const [filters, setFilters] = useState({ docType: "", hasPersonalInfo: "" });
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: items = [], isLoading } = useListDocuments();
  const { data: departments = [] } = useListDepartments();
  const { data: divisions = [] } = useListDivisions();
  const createDocument = useCreateDocument();
  const updateDocument = useUpdateDocument();
  const deleteDocument = useDeleteDocument();

  const openId = searchParams.get("openId");
  useEffect(() => {
    if (!openId || !items) return;
    const target = items.find((i) => String(i.id) === openId);
    if (target) {
      setHighlightId(target.id);
      requestAnimationFrame(() => {
        document.getElementById(`document-row-${target.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete("openId"); return next; }, { replace: true });
  }, [openId, items]);

  const f = (k: "name" | "location" | "url" | "notes") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(doc: Document) {
    setEditingId(doc.id);
    setForm({
      name: doc.name,
      docType: doc.docType ?? "",
      departmentIds: (doc.departments ?? []).map(d => d.id),
      relatedDepartmentIds: (doc.relatedDepartments ?? []).map(d => d.id),
      divisionIds: (doc.divisions ?? []).map(d => d.id),
      location: doc.location ?? "",
      url: doc.url ?? "",
      hasPersonalInfo: doc.hasPersonalInfo ?? false,
      needsImprovement: doc.needsImprovement ?? false,
      notes: doc.notes ?? "",
    });
    setOpen(true);
  }

  function openView(doc: Document) {
    setViewingDocument(doc);
    setContentDraft(doc.notes ?? "");
    setIsEditingContent(false);
  }

  function startContentEdit() {
    if (!viewingDocument) return;
    setContentDraft(viewingDocument.notes ?? "");
    setIsEditingContent(true);
  }

  function saveContentOnly() {
    if (!viewingDocument) return;
    updateDocument.mutate(
      { id: viewingDocument.id, data: { notes: contentDraft || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
          setViewingDocument((prev) => (prev ? { ...prev, notes: contentDraft || null } : prev));
          setIsEditingContent(false);
        },
      }
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const data = {
      name: form.name,
      docType: form.docType || undefined,
      departmentIds: form.departmentIds,
      relatedDepartmentIds: form.relatedDepartmentIds,
      divisionIds: form.divisionIds,
      location: form.location || undefined,
      url: form.url || undefined,
      hasPersonalInfo: form.hasPersonalInfo,
      needsImprovement: form.needsImprovement,
      notes: form.notes || undefined,
    };
    const finish = () => {
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
      setOpen(false);
      setForm(EMPTY);
      setEditingId(null);
    };
    if (editingId) {
      updateDocument.mutate({ id: editingId, data }, { onSuccess: finish });
    } else {
      createDocument.mutate({ data }, { onSuccess: finish });
    }
  }

  function handleDelete() {
    if (!deletingId) return;
    deleteDocument.mutate({ id: deletingId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
        setDeletingId(null);
      }
    });
  }

  function handleDepartmentIdsChange(ids: number[]) {
    setForm(p => ({ ...p, departmentIds: ids }));
  }

  const isPending = createDocument.isPending || updateDocument.isPending;
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const filtered = items
    .filter(i => !keyword || i.name.toLowerCase().includes(keyword.toLowerCase()))
    .filter(i => !filters.docType || i.docType === filters.docType)
    .filter(i => !filters.hasPersonalInfo || String(i.hasPersonalInfo ?? false) === filters.hasPersonalInfo);
  const sectionOpen = manualOpen ?? items.length > 0;

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">関連書類</h1>
          <p className="text-sm text-muted-foreground mt-1">業務で使用される帳票やマニュアルの台帳です。</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />新規書類登録
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
                <FileText className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">関連書類一覧</h3>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-medium">{filtered.length}件</Badge>
              </div>
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="書類名で検索" className="pl-8 h-8 text-sm w-48" value={keyword} onChange={e => setKeyword(e.target.value)} />
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
                    <Label className="text-xs">種類</Label>
                    <Select value={filters.docType} onValueChange={v => setFilters(p => ({ ...p, docType: v }))}>
                      <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
                      <SelectContent>{DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">個人情報</Label>
                    <Select value={filters.hasPersonalInfo} onValueChange={v => setFilters(p => ({ ...p, hasPersonalInfo: v }))}>
                      <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">あり</SelectItem>
                        <SelectItem value="false">なし</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="ghost" size="sm" className="w-full" disabled={activeFilterCount === 0} onClick={() => setFilters({ docType: "", hasPersonalInfo: "" })}>
                    フィルターをクリア
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {sectionOpen && (
            <div className="mt-3 space-y-2">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">{keyword || activeFilterCount > 0 ? "該当する書類がありません" : "書類がありません"}</p>
              ) : (
                filtered.map(i => (
                  <section
                    key={i.id}
                    id={`document-row-${i.id}`}
                    className={`rounded-xl border bg-white shadow-sm overflow-hidden ${highlightId === i.id ? "border-primary bg-primary/5" : "border-slate-200"}`}
                  >
                    <div className="bg-slate-50/70 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className={relatedIconClass(!!i.notes?.trim())}
                          onClick={() => openView(i)}
                          title="内容を表示"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <button type="button" className="min-w-0 text-left hover:text-primary transition-colors" onClick={() => openView(i)}>
                            <span className="truncate text-sm font-semibold text-slate-900">{i.name}</span>
                          </button>
                          {i.docType ? (
                            <Badge variant="outline" className="shrink-0 bg-slate-50 text-slate-700 border-slate-200 font-normal">
                              {i.docType}
                            </Badge>
                          ) : null}
                          {i.hasPersonalInfo ? (
                            <Badge className="text-[10px] px-1.5 py-0 bg-red-50 text-red-700 border-red-200 shrink-0" variant="outline">個人情報あり</Badge>
                          ) : null}
                          {i.needsImprovement ? (
                            <Badge className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200 shrink-0" variant="outline">改善要</Badge>
                          ) : null}
                        </div>
                        <div className="shrink-0"><DepartmentBadgeGroup primary={i.departments} related={i.relatedDepartments} /></div>
                        <div className="shrink-0"><DivisionBadges divisions={i.divisions} /></div>
                        <span className="ml-auto shrink-0 text-xs text-slate-500 whitespace-nowrap">{format(new Date(i.createdAt), 'yyyy/MM/dd')}</span>
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <Button size="icon" variant="ghost" className="h-4 w-4 text-slate-400 hover:text-primary" onClick={() => openEdit(i)} title="書類を編集">
                            <Pencil className="w-2.5 h-2.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-4 w-4 text-slate-400 hover:text-red-600" onClick={() => setDeletingId(i.id)} title="書類を削除">
                            <Trash2 className="w-2.5 h-2.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </section>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "書類を編集" : "新規書類登録"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>書類名 <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={f("name")} placeholder="例：求人票テンプレート" required />
            </div>
            <div className="space-y-1.5">
              <Label>種類・形式</Label>
              <Select value={form.docType} onValueChange={v => setForm(p => ({ ...p, docType: v }))}>
                <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                <SelectContent>{DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
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
            <div className="space-y-1.5">
              <Label>保存場所・パス</Label>
              <Input value={form.location} onChange={f("location")} placeholder="例：\\server\HR\採用\" />
            </div>
            <div className="space-y-1.5">
              <Label>URL・リンク</Label>
              <Input value={form.url} onChange={f("url")} placeholder="https://..." />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.hasPersonalInfo}
                  onChange={e => setForm(p => ({ ...p, hasPersonalInfo: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm font-medium text-slate-700">個人情報を含む</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.needsImprovement}
                  onChange={e => setForm(p => ({ ...p, needsImprovement: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm font-medium text-slate-700">改善が必要</span>
              </label>
            </div>
            <div className="space-y-1.5">
              <Label>内容</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="書類の概要、使い方、補足情報など..."
                rows={6}
              />
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

      <Dialog open={viewingDocument !== null} onOpenChange={(o) => {
        if (!o) {
          setViewingDocument(null);
          setIsEditingContent(false);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle>書類内容</DialogTitle>
                {viewingDocument && (
                  <div className="mt-1 text-xs text-slate-500">
                    {viewingDocument.docType || "種類未設定"} ・ {format(new Date(viewingDocument.createdAt), 'yyyy/MM/dd')} 登録
                  </div>
                )}
              </div>
              {viewingDocument && !isEditingContent && (
                <Button type="button" variant="outline" onClick={startContentEdit}>
                  <Pencil className="w-4 h-4 mr-2" />
                  編集する
                </Button>
              )}
              {viewingDocument && isEditingContent && (
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsEditingContent(false)}>
                    キャンセル
                  </Button>
                  <Button type="button" onClick={saveContentOnly} disabled={updateDocument.isPending}>
                    {updateDocument.isPending ? "保存中..." : "保存する"}
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>
          {viewingDocument && (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-slate-900">{viewingDocument.name}</div>
              </div>
              <div className="rounded-lg border bg-slate-50 p-4">
                <div className="text-xs font-bold text-slate-400 mb-2">内容</div>
                {isEditingContent ? (
                  <Textarea
                    value={contentDraft}
                    onChange={(e) => setContentDraft(e.target.value)}
                    rows={12}
                    className="min-h-[280px] bg-white"
                    placeholder="書類の概要、使い方、補足情報など..."
                  />
                ) : (
                  <div className="whitespace-pre-wrap text-sm leading-7 text-slate-800 min-h-[280px]">
                    {viewingDocument.notes?.trim() || "内容が登録されていません。"}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deletingId !== null}
        onOpenChange={(o) => !o && setDeletingId(null)}
        onConfirm={handleDelete}
        isPending={deleteDocument.isPending}
        title="この書類を削除しますか？"
      />
    </div>
  );
}
