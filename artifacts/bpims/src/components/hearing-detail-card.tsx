import { useEffect, useState, type ReactNode } from "react";
import {
  useDeleteHearing, useUpdateHearing, getListHearingsQueryKey,
  useListDocuments, useLinkHearingDocument, useUnlinkHearingDocument,
  useListSystems, useLinkHearingSystem, useUnlinkHearingSystem,
  type Hearing,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Input, Label } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { HEARING_STATUS, getPriorityBadgeClass, getStatusColor } from "@/lib/constants";
import {
  Search as SearchIcon, Pencil, Trash2, UsersRoundCollaboration, MicAudioLines,
  FileText, Server, X, ChevronRight, GripVertical,
} from "lucide-react";
import { Link } from "wouter";

export type HearingDetailPrimary = { id: number; name: string };

const EMPTY_CONTENT_FORM = { content: "" };

/** A conducted hearing with no content filled in is easy to forget about, so it gets the same kind of alert as 期限超過. */
function hasHearingContent(h: Hearing) {
  return !!h.answers?.trim();
}

/** ヒアリング内容・関連書類・利用システムの各アイコン: 中身がある場合は紫、未記入の実施済みは赤で強調する。 */
function relatedIconClass(hasContent: boolean, isAlert = false) {
  if (isAlert) {
    return "flex items-center gap-1 rounded-md border px-2 py-1 border-red-200 bg-red-50 text-red-600 hover:bg-red-100";
  }
  return `flex items-center gap-1 rounded-md border px-2 py-1 ${
    hasContent
      ? "border-purple-200 bg-purple-50 text-purple-600 hover:bg-purple-100"
      : "border-slate-200 bg-white text-slate-500 hover:text-primary hover:border-slate-300"
  }`;
}

/**
 * Default display order when nothing has been manually dragged: 未対応（not_started/scheduled）
 * を予定日が近い順（予定日未設定は登録が古い順）で先に、その後に実施済みを予定日が新しい順で並べる。
 */
function compareHearingsDefault(a: Hearing, b: Hearing): number {
  const aDone = a.status === "conducted";
  const bDone = b.status === "conducted";
  if (aDone !== bDone) return aDone ? 1 : -1;
  if (!aDone) {
    if (a.scheduledAt && b.scheduledAt) return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    if (a.scheduledAt) return -1;
    if (b.scheduledAt) return 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }
  if (a.scheduledAt && b.scheduledAt) return new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime();
  if (a.scheduledAt) return -1;
  if (b.scheduledAt) return 1;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/** listSortOrder (manual drag) wins first; ties (e.g. everything still at the default 0) fall back to compareHearingsDefault. */
function compareHearings(a: Hearing, b: Hearing): number {
  return (a.listSortOrder ?? 0) - (b.listSortOrder ?? 0) || compareHearingsDefault(a, b);
}

/**
 * One axis-section card (管理業務 / 部署 / 部門, or a single flat "全件" section) for ヒアリング一覧,
 * matching 改善プロジェクト一覧・タスク一覧の card-list style exactly: icon+count header, 一括開閉 +
 * 検索 + フィルター, then each hearing rendered as its own rounded card with drag-and-drop reordering.
 */
export function HearingDetailCard({
  primary,
  items,
  onEdit,
  variant,
  autoSelectId,
  filterSlot,
}: {
  primary: HearingDetailPrimary;
  /** This primary's hearings, already resolved by the caller. */
  items: Hearing[];
  onEdit: (h: Hearing) => void;
  /** "warning" tints the header amber, for the synthetic "未設定" section. */
  variant?: "warning";
  /** Deep link from 改善ボード — expands (but doesn't open the edit dialog for) this hearing once it's found in `items`. */
  autoSelectId?: number | null;
  /** Optional filter control rendered to the right of this card's search box. */
  filterSlot?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const deleteHearing = useDeleteHearing();
  const updateHearing = useUpdateHearing();
  const { data: allDocuments = [] } = useListDocuments();
  const { data: allSystems = [] } = useListSystems();
  const linkDocument = useLinkHearingDocument();
  const unlinkDocument = useUnlinkHearingDocument();
  const linkSystem = useLinkHearingSystem();
  const unlinkSystem = useUnlinkHearingSystem();

  const [search, setSearch] = useState("");
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const sectionOpen = manualOpen ?? items.length > 0;
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [contentDialogHearing, setContentDialogHearing] = useState<Hearing | null>(null);
  const [contentForm, setContentForm] = useState(EMPTY_CONTENT_FORM);
  const [relatedHover, setRelatedHover] = useState<{ id: number; kind: "content" | "documents" | "systems" } | null>(null);
  const [docDialogHearing, setDocDialogHearing] = useState<Hearing | null>(null);
  const [sysDialogHearing, setSysDialogHearing] = useState<Hearing | null>(null);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [selectedSysId, setSelectedSysId] = useState("");
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const searchLower = search.trim().toLowerCase();
  const filteredItems = searchLower ? items.filter((h) => h.title.toLowerCase().includes(searchLower)) : items;
  const sorted = [...filteredItems].sort(compareHearings);

  function reindexHearings(orderedIds: number[]) {
    orderedIds.forEach((id, idx) => {
      const h = sorted.find((x) => x.id === id);
      if (h && h.listSortOrder !== idx) {
        updateHearing.mutate({ id, data: { listSortOrder: idx } }, { onSuccess: invalidate });
      }
    });
  }

  function handleRowDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleRowDrop(e: React.DragEvent, targetId: number) {
    e.preventDefault();
    if (draggedId === null || draggedId === targetId) { setDraggedId(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const dropAfter = e.clientY > rect.top + rect.height / 2;
    const others = sorted.filter((h) => h.id !== draggedId).map((h) => h.id);
    const targetIdx = others.findIndex((id) => id === targetId);
    const insertIdx = targetIdx === -1 ? others.length : dropAfter ? targetIdx + 1 : targetIdx;
    const orderedIds = [...others.slice(0, insertIdx), draggedId, ...others.slice(insertIdx)];
    reindexHearings(orderedIds);
    setDraggedId(null);
  }

  useEffect(() => {
    if (!autoSelectId) return;
    if (items.some((h) => h.id === autoSelectId)) {
      setHighlightedId(autoSelectId);
    }
  }, [autoSelectId, items]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListHearingsQueryKey() });
  }

  function handleDelete() {
    if (!deletingId) return;
    deleteHearing.mutate({ id: deletingId }, { onSuccess: () => { invalidate(); setDeletingId(null); } });
  }

  function handleStatusChange(hearingId: number, status: string) {
    updateHearing.mutate({ id: hearingId, data: { status } }, { onSuccess: invalidate });
  }

  function openContentDialog(h: Hearing) {
    setContentForm({ content: h.answers ?? "" });
    setContentDialogHearing(h);
  }

  function handleContentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contentDialogHearing) return;
    updateHearing.mutate({
      id: contentDialogHearing.id,
      data: { answers: contentForm.content || null },
    }, { onSuccess: () => { invalidate(); setContentDialogHearing(null); } });
  }

  function handleAddDocument() {
    if (!docDialogHearing || !selectedDocId) return;
    linkDocument.mutate({ id: docDialogHearing.id, data: { documentId: Number(selectedDocId) } }, {
      onSuccess: () => { invalidate(); setDocDialogHearing(null); setSelectedDocId(""); },
    });
  }

  function handleRemoveDocument(h: Hearing, documentId: number) {
    unlinkDocument.mutate({ id: h.id, documentId }, { onSuccess: invalidate });
  }

  function handleAddSystem() {
    if (!sysDialogHearing || !selectedSysId) return;
    linkSystem.mutate({ id: sysDialogHearing.id, data: { systemId: Number(selectedSysId) } }, {
      onSuccess: () => { invalidate(); setSysDialogHearing(null); setSelectedSysId(""); },
    });
  }

  function handleRemoveSystem(h: Hearing, systemId: number) {
    unlinkSystem.mutate({ id: h.id, systemId }, { onSuccess: invalidate });
  }

  return (
    <div>
      <div
        className="flex flex-wrap items-start justify-between gap-4 cursor-pointer py-2"
        onClick={() => setManualOpen(!sectionOpen)}
      >
        <div className="flex items-start gap-2">
          <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform shrink-0 mt-2 ${sectionOpen ? "rotate-90" : ""}`} />
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${variant === "warning" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
            <UsersRoundCollaboration className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className={`text-sm font-bold ${variant === "warning" ? "text-amber-700" : "text-slate-900"}`}>{primary.name}</h3>
            <Badge variant="outline" className={variant === "warning" ? "bg-amber-50 text-amber-700 border-amber-200 font-medium" : "bg-blue-50 text-blue-700 border-blue-200 font-medium"}>{items.length}件</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="ヒアリングを検索" className="pl-8 h-8 text-sm w-48" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {filterSlot}
        </div>
      </div>

      {sectionOpen && (
        <div className="mt-3 space-y-1">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{search ? "該当するヒアリングがありません" : "ヒアリングがありません"}</p>
          ) : (
            sorted.map((h) => {
              return (
                <section
                  key={h.id}
                  draggable
                  onDragStart={(e) => { e.stopPropagation(); setDraggedId(h.id); }}
                  onDragOver={handleRowDragOver}
                  onDrop={(e) => { e.stopPropagation(); handleRowDrop(e, h.id); }}
                  className={`rounded-xl border bg-white shadow-sm overflow-hidden ${draggedId === h.id ? "opacity-50" : ""} ${highlightedId === h.id ? "border-primary bg-primary/5" : "border-slate-200"}`}
                >
                  <div className="bg-slate-50/70 px-4 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0 cursor-grab active:cursor-grabbing" />
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500">
                        <UsersRoundCollaboration className="w-3.5 h-3.5" />
                      </span>
                      {h.departmentName && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-900 text-white border-slate-900 font-medium shrink-0">
                          {h.departmentName}
                        </Badge>
                      )}
                      {h.divisionName && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-800 border-blue-200 font-medium shrink-0">
                          {h.divisionName}
                        </Badge>
                      )}
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <span className={`truncate text-xs font-semibold ${h.status === "conducted" ? "line-through text-slate-500" : "text-slate-900"}`}>{h.title}</span>
                        {h.priority ? (
                          <Badge variant="outline" className={`shrink-0 rounded-full w-6 h-6 p-0 flex items-center justify-center text-[10px] leading-none font-medium ${getPriorityBadgeClass(h.priority)}`}>
                            {h.priority}
                          </Badge>
                        ) : null}
                        {h.isOverdue && (
                          <Badge className="text-[10px] px-1.5 py-0 bg-red-50 text-red-700 border-red-200 shrink-0" variant="outline">期限超過</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Popover open={relatedHover?.id === h.id && relatedHover?.kind === "content"} onOpenChange={(o) => !o && setRelatedHover(null)}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={relatedIconClass(hasHearingContent(h), h.status === "conducted" && !hasHearingContent(h))}
                              onMouseEnter={() => setRelatedHover({ id: h.id, kind: "content" })}
                              onMouseLeave={() => setRelatedHover(null)}
                            >
                              <MicAudioLines className="w-3.5 h-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="end"
                            className="w-64 p-2"
                            onMouseEnter={() => setRelatedHover({ id: h.id, kind: "content" })}
                            onMouseLeave={() => setRelatedHover(null)}
                          >
                            <div className="space-y-1">
                              <div className="text-[10px] font-bold text-slate-400 px-1">ヒアリング内容</div>
                              <p className="text-xs text-slate-700 px-1 py-1 whitespace-pre-wrap">{h.answers || "未記入"}</p>
                              <button
                                type="button"
                                className="w-full text-left rounded px-2 py-1.5 text-xs text-primary hover:bg-slate-100"
                                onClick={() => { setRelatedHover(null); openContentDialog(h); }}
                              >
                                内容を編集
                              </button>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <Popover open={relatedHover?.id === h.id && relatedHover?.kind === "documents"} onOpenChange={(o) => !o && setRelatedHover(null)}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={relatedIconClass((h.documents?.length ?? 0) > 0)}
                              onMouseEnter={() => setRelatedHover({ id: h.id, kind: "documents" })}
                              onMouseLeave={() => setRelatedHover(null)}
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="end"
                            className="w-64 p-2"
                            onMouseEnter={() => setRelatedHover({ id: h.id, kind: "documents" })}
                            onMouseLeave={() => setRelatedHover(null)}
                          >
                            <div className="space-y-1">
                              <div className="text-xs font-bold text-slate-400 px-1">関連書類</div>
                              {(h.documents ?? []).length === 0 && <p className="text-xs text-slate-400 px-1 py-1">未設定</p>}
                              {(h.documents ?? []).map((d) => (
                                <div key={d.id} className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100">
                                  <Link href={`/documents?openId=${d.id}`} className="flex-1 min-w-0 truncate hover:text-primary">{d.name}</Link>
                                  <button type="button" onClick={() => handleRemoveDocument(h, d.id)} className="text-slate-400 hover:text-red-600 shrink-0">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                className="w-full text-left rounded px-2 py-1.5 text-xs text-primary hover:bg-slate-100"
                                onClick={() => { setRelatedHover(null); setDocDialogHearing(h); }}
                              >
                                + 関連書類を追加
                              </button>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <Popover open={relatedHover?.id === h.id && relatedHover?.kind === "systems"} onOpenChange={(o) => !o && setRelatedHover(null)}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={relatedIconClass((h.systems?.length ?? 0) > 0)}
                              onMouseEnter={() => setRelatedHover({ id: h.id, kind: "systems" })}
                              onMouseLeave={() => setRelatedHover(null)}
                            >
                              <Server className="w-3.5 h-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="end"
                            className="w-64 p-2"
                            onMouseEnter={() => setRelatedHover({ id: h.id, kind: "systems" })}
                            onMouseLeave={() => setRelatedHover(null)}
                          >
                            <div className="space-y-1">
                              <div className="text-xs font-bold text-slate-400 px-1">利用システム</div>
                              {(h.systems ?? []).length === 0 && <p className="text-xs text-slate-400 px-1 py-1">未設定</p>}
                              {(h.systems ?? []).map((s) => (
                                <div key={s.id} className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100">
                                  <Link href={`/systems?openId=${s.id}`} className="flex-1 min-w-0 truncate hover:text-primary">{s.name}</Link>
                                  <button type="button" onClick={() => handleRemoveSystem(h, s.id)} className="text-slate-400 hover:text-red-600 shrink-0">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                className="w-full text-left rounded px-2 py-1.5 text-xs text-primary hover:bg-slate-100"
                                onClick={() => { setRelatedHover(null); setSysDialogHearing(h); }}
                              >
                                + 利用システムを追加
                              </button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400 whitespace-nowrap">{h.intervieweeName || "-"}</span>
                      <span className="ml-auto shrink-0 text-xs text-slate-500 whitespace-nowrap">{h.scheduledAt ? h.scheduledAt.slice(0, 10).replace(/-/g, "/") : "-"}</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button type="button" className="shrink-0" onClick={(e) => e.stopPropagation()} title="ステータスを変更">
                            <Badge className={`cursor-pointer ${getStatusColor(h.status, HEARING_STATUS)}`} variant="outline">
                              {HEARING_STATUS[h.status as keyof typeof HEARING_STATUS] || h.status}
                            </Badge>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-40 p-1" align="start" onClick={(e) => e.stopPropagation()}>
                          <div className="space-y-0.5">
                            {Object.entries(HEARING_STATUS).map(([k, v]) => (
                              <button
                                key={k}
                                type="button"
                                className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-100"
                                onClick={() => handleStatusChange(h.id, k)}
                              >
                                <Badge className={getStatusColor(k, HEARING_STATUS)} variant="outline">{v}</Badge>
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-4 w-4 text-slate-400 hover:text-primary"
                          onClick={(e) => { e.stopPropagation(); onEdit(h); }}
                          title="ヒアリングを編集"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-4 w-4 text-slate-400 hover:text-red-600"
                          onClick={(e) => { e.stopPropagation(); setDeletingId(h.id); }}
                          title="ヒアリングを削除"
                        >
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

      <ConfirmDeleteDialog
        open={deletingId !== null}
        onOpenChange={(o) => !o && setDeletingId(null)}
        onConfirm={handleDelete}
        isPending={deleteHearing.isPending}
        title="このヒアリングを削除しますか？"
      />

      <Dialog open={contentDialogHearing !== null} onOpenChange={(o) => !o && setContentDialogHearing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>ヒアリング内容</DialogTitle></DialogHeader>
          <form onSubmit={handleContentSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>ヒアリング内容</Label>
              <Textarea value={contentForm.content} onChange={(e) => setContentForm(p => ({ ...p, content: e.target.value }))} placeholder="ヒアリングで得られた内容を入力..." rows={6} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setContentDialogHearing(null)}>キャンセル</Button>
              <Button type="submit" disabled={updateHearing.isPending}>
                {updateHearing.isPending ? "保存中..." : "保存する"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={docDialogHearing !== null} onOpenChange={(o) => !o && setDocDialogHearing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>関連書類を追加</DialogTitle></DialogHeader>
          <Select value={selectedDocId} onValueChange={setSelectedDocId}>
            <SelectTrigger><SelectValue placeholder="書類を選択..." /></SelectTrigger>
            <SelectContent>
              {allDocuments.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDocDialogHearing(null)}>キャンセル</Button>
            <Button type="button" disabled={!selectedDocId || linkDocument.isPending} onClick={handleAddDocument}>
              {linkDocument.isPending ? "追加中..." : "追加する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sysDialogHearing !== null} onOpenChange={(o) => !o && setSysDialogHearing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>利用システムを追加</DialogTitle></DialogHeader>
          <Select value={selectedSysId} onValueChange={setSelectedSysId}>
            <SelectTrigger><SelectValue placeholder="システムを選択..." /></SelectTrigger>
            <SelectContent>
              {allSystems.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSysDialogHearing(null)}>キャンセル</Button>
            <Button type="button" disabled={!selectedSysId || linkSystem.isPending} onClick={handleAddSystem}>
              {linkSystem.isPending ? "追加中..." : "追加する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
