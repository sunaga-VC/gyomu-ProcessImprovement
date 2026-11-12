import { useMemo, useState } from "react";
import { useListSystemCandidates, type SystemCandidate } from "@workspace/api-client-react";
import { Button, Card } from "@/components/ui";
import { Accordion } from "@/components/ui/accordion";
import { HearingsAxisSection } from "@/components/hearings-axis-section";
import { HearingsWeeklyGantt } from "@/components/hearings-weekly-gantt";
import { systemCandidateToGanttItem, type GanttItem } from "@/lib/gantt-item";
import { systemCandidateIcon } from "@/lib/kind-icons";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

function getDescendants(parentId: number, all: SystemCandidate[]): SystemCandidate[] {
  const result: SystemCandidate[] = [];
  const queue = [parentId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const sc of all) {
      if (sc.parentId === id) { result.push(sc); queue.push(sc.id); }
    }
  }
  return result;
}

/**
 * システム化専用のガントチャート。ガントチャートの「改善プロジェクトごと」に当たるのが親のシステム化で、
 * その中に子のシステム化（孫以下も含む）を並べる。上段の一覧には親のシステム化だけを表示する。
 */
export default function SystemGantt() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const { data: allSystemCandidates = [], isLoading } = useListSystemCandidates();
  const systemCandidates = useMemo(() => allSystemCandidates.filter((sc) => sc.status !== "released"), [allSystemCandidates]);

  const monthStart = useMemo(() => startOfMonth(currentDate), [currentDate]);
  const monthEnd = useMemo(() => endOfMonth(currentDate), [currentDate]);
  const calendarStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 1 }), [monthStart]);
  const calendarEnd = useMemo(() => endOfWeek(monthEnd, { weekStartsOn: 1 }), [monthEnd]);
  const days = useMemo(() => eachDayOfInterval({ start: calendarStart, end: calendarEnd }), [calendarStart, calendarEnd]);

  const weeks = useMemo(() => {
    const chunks: Date[][] = [];
    let current: Date[] = [];
    let currentKey = "";
    for (const d of days) {
      const key = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
      if (key !== currentKey) {
        if (current.length > 0) chunks.push(current);
        current = [];
        currentKey = key;
      }
      current.push(d);
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
  }, [days]);

  const toItems = (list: SystemCandidate[]) => list
    .map((sc): GanttItem | null => {
      const item = systemCandidateToGanttItem(sc);
      return item ? { ...item, barLabel: sc.ownerName ?? null } : null;
    })
    .filter((x): x is GanttItem => x !== null)
    .filter((item) => item.end >= calendarStart && item.start <= calendarEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const parents = useMemo(
    () => systemCandidates.filter((sc) => !sc.parentId).sort((a, b) => a.title.localeCompare(b.title, "ja")),
    [systemCandidates],
  );
  const parentItems = useMemo(() => toItems(parents), [parents, calendarStart, calendarEnd]);
  const sections = useMemo(
    () => parents.map((p) => ({ primary: { id: p.id, name: p.title }, icon: systemCandidateIcon(p.status), items: toItems(getDescendants(p.id, systemCandidates)) })),
    [parents, systemCandidates, calendarStart, calendarEnd],
  );
  const unscheduledChildCount = systemCandidates.filter((sc) => sc.parentId && !sc.plannedStartDate).length;

  // リリース済みは上の進行中ブロックから外し、下の「リリース済み」ブロックにまとめて表示する。
  const released = useMemo(() => allSystemCandidates.filter((sc) => sc.status === "released"), [allSystemCandidates]);
  const releasedItems = useMemo(() => toItems(released), [released, calendarStart, calendarEnd]);
  const releasedSections = useMemo(
    () => released
      .filter((sc) => !sc.parentId)
      .sort((a, b) => a.title.localeCompare(b.title, "ja"))
      .map((p) => ({ primary: { id: p.id, name: p.title }, icon: systemCandidateIcon(p.status), items: toItems(getDescendants(p.id, allSystemCandidates)) })),
    [released, allSystemCandidates, calendarStart, calendarEnd],
  );

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">システムガントチャート</h1>
        <p className="text-sm text-muted-foreground mt-1">システム化ごとに、配下の子のシステム化の予定を期間で確認します。</p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="outline" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-xl font-bold text-slate-800 w-36 text-center">
          {format(currentDate, "yyyy年 M月", { locale: ja })}
        </h2>
        <Button variant="outline" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" className="text-sm text-muted-foreground" onClick={() => setCurrentDate(new Date())}>
          今月
        </Button>
        <div className="text-sm text-muted-foreground">{isLoading ? "読み込み中..." : `${parentItems.length} 件`}</div>
      </div>

      {isLoading ? (
        <Card className="p-12 text-center text-muted-foreground text-sm">読み込み中...</Card>
      ) : (
        <Card className="p-3">
          <HearingsWeeklyGantt items={parentItems} weeks={weeks} />
        </Card>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-700">システム化ごと</h3>
        {unscheduledChildCount > 0 && (
          <div className="text-xs px-2.5 py-1.5 rounded-md border bg-amber-50 border-amber-200 text-amber-700 inline-block">
            開始予定日が未設定の子のシステム化が {unscheduledChildCount}件あります（ガントには表示されません）
          </div>
        )}
        {isLoading ? (
          <Card className="p-12 text-center text-muted-foreground text-sm">読み込み中...</Card>
        ) : sections.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground text-sm">システム化が登録されていません（システム化一覧から登録できます）</Card>
        ) : (
          <Card>
            <Accordion type="multiple">
              {sections.map((s) => (
                <HearingsAxisSection
                  key={s.primary.id}
                  primary={s.primary}
                  items={s.items}
                  secondaryOptions={[]}
                  getSecondaryRefs={() => []}
                  weeks={weeks}
                  hideSecondaryTabs
                  icon={s.icon}
                />
              ))}
            </Accordion>
          </Card>
        )}
      </div>

      {!isLoading && released.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-slate-200">
          <h3 className="text-sm font-bold text-slate-700">
            リリース済み<span className="font-normal text-slate-400 ml-1">（{released.length}件）</span>
          </h3>
          <Card className="p-3">
            {releasedItems.length > 0 ? (
              <HearingsWeeklyGantt items={releasedItems} weeks={weeks} />
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">この月に予定のあるリリース済みのシステム化はありません</p>
            )}
          </Card>
          {releasedSections.length > 0 && (
            <Card>
              <Accordion type="multiple">
                {releasedSections.map((s) => (
                  <HearingsAxisSection
                    key={s.primary.id}
                    primary={s.primary}
                    items={s.items}
                    secondaryOptions={[]}
                    getSecondaryRefs={() => []}
                    weeks={weeks}
                    hideSecondaryTabs
                    icon={s.icon}
                  />
                ))}
              </Accordion>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
