import { useState, useMemo } from "react";
import { useGetHearingCalendar, useListIssues, useListDepartments, useListDivisions, useListImprovements, getGetHearingCalendarQueryKey } from "@workspace/api-client-react";
import { useTopLevelSystemCandidates } from "@/lib/top-level-system-candidates";
import { Badge, Button, Card } from "@/components/ui";
import { Accordion } from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HearingsAxisSection, type AxisRef } from "@/components/hearings-axis-section";
import { HearingsWeeklyGantt } from "@/components/hearings-weekly-gantt";
import {
  hearingToGanttItem, issueToGanttItem, systemCandidateToGanttItem,
  GANTT_KIND_ICON, ganttItemIcon, GANTT_KIND_LABEL, ganttStatusBadgeClass, type GanttItem,
} from "@/lib/gantt-item";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, startOfWeek, endOfWeek, isSameDay } from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronLeft, ChevronRight, List, ChartGantt } from "lucide-react";
import { useLocation } from "wouter";

type ViewMode = "gantt" | "list";
type AxisMode = "management" | "department" | "division";

// Colors cycle per week-row so 1週目/2週目/... are visually distinguishable in the list view,
// matching the Monday-start week chunks (`weeks`) used by the Gantt view above.
const WEEK_COLORS = [
  { border: "border-l-blue-400", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  { border: "border-l-emerald-400", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { border: "border-l-amber-400", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  { border: "border-l-purple-400", badge: "bg-purple-50 text-purple-700 border-purple-200" },
  { border: "border-l-pink-400", badge: "bg-pink-50 text-pink-700 border-pink-200" },
  { border: "border-l-cyan-400", badge: "bg-cyan-50 text-cyan-700 border-cyan-200" },
];

function getWeekIndex(date: Date | null, weeks: Date[][]): number {
  if (!date) return -1;
  return weeks.findIndex((week) => week.some((d) => isSameDay(d, date)));
}

export default function HearingsCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("gantt");
  const [axisMode, setAxisMode] = useState<AxisMode>("management");
  const [, navigate] = useLocation();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const monthStart = useMemo(() => startOfMonth(currentDate), [currentDate]);
  const monthEnd = useMemo(() => endOfMonth(currentDate), [currentDate]);
  // Extend to full Monday-start weeks so boundary weeks (straddling two months) show all 7 days.
  const calendarStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 1 }), [monthStart]);
  const calendarEnd = useMemo(() => endOfWeek(monthEnd, { weekStartsOn: 1 }), [monthEnd]);
  const needsPrevMonth = calendarStart < monthStart;
  const needsNextMonth = calendarEnd > monthEnd;
  const prevDate = useMemo(() => subMonths(currentDate, 1), [currentDate]);
  const nextDate = useMemo(() => addMonths(currentDate, 1), [currentDate]);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth() + 1;
  const nextYear = nextDate.getFullYear();
  const nextMonth = nextDate.getMonth() + 1;

  const { data: hearings = [], isLoading: hearingsLoading } = useGetHearingCalendar(
    { year, month },
    { query: { queryKey: getGetHearingCalendarQueryKey({ year, month }) } }
  );
  // Boundary weeks can dip into the adjacent month; fetch it too so those days aren't empty.
  const { data: prevHearings = [], isLoading: prevHearingsLoading } = useGetHearingCalendar(
    { year: prevYear, month: prevMonth },
    { query: { queryKey: getGetHearingCalendarQueryKey({ year: prevYear, month: prevMonth }), enabled: needsPrevMonth } }
  );
  const { data: nextHearings = [], isLoading: nextHearingsLoading } = useGetHearingCalendar(
    { year: nextYear, month: nextMonth },
    { query: { queryKey: getGetHearingCalendarQueryKey({ year: nextYear, month: nextMonth }), enabled: needsNextMonth } }
  );
  const { data: issuesRaw = [], isLoading: issuesLoading } = useListIssues();
  const { data: systemCandidatesRaw = [], isLoading: systemCandidatesLoading } = useTopLevelSystemCandidates();
  const { data: departments, isLoading: departmentsLoading } = useListDepartments();
  const { data: divisions, isLoading: divisionsLoading } = useListDivisions();
  const { data: improvements, isLoading: improvementsLoading } = useListImprovements();
  const isLoading =
    hearingsLoading ||
    (needsPrevMonth && prevHearingsLoading) ||
    (needsNextMonth && nextHearingsLoading) ||
    departmentsLoading ||
    divisionsLoading ||
    improvementsLoading ||
    issuesLoading ||
    systemCandidatesLoading;

  // All hearings whose scheduled date falls anywhere in the displayed (week-aligned) range.
  const allHearings = useMemo(() => {
    if (!needsPrevMonth && !needsNextMonth) return hearings;
    return [...(needsPrevMonth ? prevHearings : []), ...hearings, ...(needsNextMonth ? nextHearings : [])];
  }, [hearings, prevHearings, nextHearings, needsPrevMonth, needsNextMonth]);

  const days = useMemo(() => eachDayOfInterval({ start: calendarStart, end: calendarEnd }), [calendarStart, calendarEnd]);

  // Monday-start week chunks spanning the full displayed range (including adjacent-month days).
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

  // Gantt view: hearings + tasks + system candidates merged into a common shape, so all show up
  // side by side on the same timeline. None is naturally scoped to the full displayed
  // (week-aligned, possibly adjacent-month) range, so all are filtered here to that range.
  const ganttItems = useMemo(() => {
    const hearingItems = allHearings.map(hearingToGanttItem).filter((x): x is GanttItem => x !== null);
    const issueItems = issuesRaw
      .map(issueToGanttItem)
      .filter((x): x is GanttItem => x !== null)
      .filter((item) => item.end >= calendarStart && item.start <= calendarEnd);
    const systemCandidateItems = systemCandidatesRaw
      .map(systemCandidateToGanttItem)
      .filter((x): x is GanttItem => x !== null)
      .filter((item) => item.end >= calendarStart && item.start <= calendarEnd);
    return [...hearingItems, ...issueItems, ...systemCandidateItems].sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [allHearings, issuesRaw, systemCandidatesRaw, calendarStart, calendarEnd]);

  // List view: same merged hearings + tasks + system candidates, but narrowed to the actual
  // displayed month (not the week-aligned padding used by the Gantt grid).
  const listItems = useMemo(() => {
    return ganttItems
      .filter((item) => item.end >= monthStart && item.start <= monthEnd)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [ganttItems, monthStart, monthEnd]);

  const departmentNameById = useMemo(() => new Map((departments ?? []).map((d) => [d.id, d.name])), [departments]);

  // Section lists are driven by the department/division masters (組織管理) so every
  // configured one shows up from the start, not just ones with items this month.
  const departmentSections = useMemo(() => {
    return (departments ?? [])
      .map((d) => ({ primary: { id: d.id, name: d.name } as AxisRef, sortOrder: d.sortOrder ?? 0, items: ganttItems.filter((item) => item.departmentId === d.id) }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.primary.name.localeCompare(b.primary.name, "ja"));
  }, [departments, ganttItems]);

  const divisionSections = useMemo(() => {
    return (divisions ?? [])
      .map((d) => ({ primary: { id: d.id, name: d.name } as AxisRef, sortOrder: d.sortOrder ?? 0, items: ganttItems.filter((item) => item.divisions.some((x) => x.id === d.id)) }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.primary.name.localeCompare(b.primary.name, "ja"));
  }, [divisions, ganttItems]);

  const improvementSections = useMemo(() => {
    return (improvements ?? [])
      .map((p) => ({ primary: { id: p.id, name: p.title } as AxisRef, items: ganttItems.filter((item) => item.improvements.some((x) => x.id === p.id)) }))
      .sort((a, b) => a.primary.name.localeCompare(b.primary.name, "ja"));
  }, [improvements, ganttItems]);

  const unassignedDepartment = useMemo(() => ganttItems.filter((item) => !item.departmentId), [ganttItems]);
  const unassignedDivision = useMemo(() => ganttItems.filter((item) => item.divisions.length === 0), [ganttItems]);
  const unassignedImprovement = useMemo(() => ganttItems.filter((item) => item.improvements.length === 0), [ganttItems]);

  const departmentOptions: AxisRef[] = (departments ?? []).map((d) => ({ id: d.id, name: d.name }));
  const divisionOptions: AxisRef[] = (divisions ?? []).map((d) => ({ id: d.id, name: d.name }));

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ガントチャート</h1>
          <p className="text-sm text-muted-foreground mt-1">部署・部門ごとに、ヒアリング・タスク・システム化の予定を期間で確認します。</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "gantt" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setViewMode("gantt")}
          >
            <ChartGantt className="w-3.5 h-3.5" />
            ガント
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setViewMode("list")}
          >
            <List className="w-3.5 h-3.5" />
            リスト
          </Button>
        </div>
      </div>

      {/* Month navigation */}
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
        <div className="text-sm text-muted-foreground">
          {isLoading ? "読み込み中..." : viewMode === "list" ? `${listItems.length} 件` : `${ganttItems.length} 件`}
        </div>
        {viewMode === "gantt" && (
          <Tabs value={axisMode} onValueChange={(v) => setAxisMode(v as AxisMode)} className="ml-auto">
            <TabsList>
              <TabsTrigger value="management">一覧</TabsTrigger>
              <TabsTrigger value="department">部署ごと</TabsTrigger>
              <TabsTrigger value="division">部門ごと</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* Gantt view: management-task/department/division sections (like 業務ツリーの「部署ごと」「部門ごと」), each with a weekly calendar inside */}
      {viewMode === "gantt" && (
        <div className="space-y-4">
          {axisMode === "management" ? (
            isLoading ? (
              <Card className="p-12 text-center text-muted-foreground text-sm">読み込み中...</Card>
            ) : (
              <Card className="p-3">
                <HearingsWeeklyGantt items={ganttItems} weeks={weeks} />
              </Card>
            )
          ) : axisMode === "department" ? (
            <>
              {unassignedDepartment.length > 0 && (
                <div className="text-xs px-2.5 py-1.5 rounded-md border bg-amber-50 border-amber-200 text-amber-700 inline-block">
                  部署未設定の予定が {unassignedDepartment.length}件あります
                </div>
              )}
              {isLoading ? (
                <Card className="p-12 text-center text-muted-foreground text-sm">読み込み中...</Card>
              ) : departmentSections.length === 0 ? (
                <Card className="p-12 text-center text-muted-foreground text-sm">部署が登録されていません（組織管理 &gt; 部署管理から登録できます）</Card>
              ) : (
                <Card>
                  <Accordion type="multiple">
                    {departmentSections.map((s) => (
                      <HearingsAxisSection
                        key={s.primary.id}
                        primary={s.primary}
                        items={s.items}
                        secondaryOptions={divisionOptions}
                        getSecondaryRefs={(item) => item.divisions}
                        weeks={weeks}
                      />
                    ))}
                  </Accordion>
                </Card>
              )}
            </>
          ) : (
            <>
              {unassignedDivision.length > 0 && (
                <div className="text-xs px-2.5 py-1.5 rounded-md border bg-amber-50 border-amber-200 text-amber-700 inline-block">
                  部門未設定の予定が {unassignedDivision.length}件あります
                </div>
              )}
              {isLoading ? (
                <Card className="p-12 text-center text-muted-foreground text-sm">読み込み中...</Card>
              ) : divisionSections.length === 0 ? (
                <Card className="p-12 text-center text-muted-foreground text-sm">部門が登録されていません（組織管理 &gt; 部門管理から登録できます）</Card>
              ) : (
                <Card>
                  <Accordion type="multiple">
                    {divisionSections.map((s) => (
                      <HearingsAxisSection
                        key={s.primary.id}
                        primary={s.primary}
                        items={s.items}
                        secondaryOptions={departmentOptions}
                        getSecondaryRefs={(item) => (item.departmentId ? departmentOptions.filter((d) => d.id === item.departmentId) : [])}
                        weeks={weeks}
                      />
                    ))}
                  </Accordion>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* 改善プロジェクトごとの内訳: always shown below the main Gantt (not one of the axis tabs above) */}
      {viewMode === "gantt" && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-700">改善プロジェクトごと</h3>
          {unassignedImprovement.length > 0 && (
            <div className="text-xs px-2.5 py-1.5 rounded-md border bg-amber-50 border-amber-200 text-amber-700 inline-block">
              改善プロジェクト未設定の予定が {unassignedImprovement.length}件あります
            </div>
          )}
          {isLoading ? (
            <Card className="p-12 text-center text-muted-foreground text-sm">読み込み中...</Card>
          ) : improvementSections.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground text-sm">改善プロジェクトが登録されていません（改善プロジェクトから登録できます）</Card>
          ) : (
            <Card>
              <Accordion type="multiple">
                {improvementSections.map((s) => (
                  <HearingsAxisSection
                    key={s.primary.id}
                    primary={s.primary}
                    items={s.items}
                    secondaryOptions={[]}
                    getSecondaryRefs={() => []}
                    weeks={weeks}
                    hideSecondaryTabs
                  />
                ))}
              </Accordion>
            </Card>
          )}
        </div>
      )}

      {/* List view: hearings + tasks + system candidates, merged */}
      {viewMode === "list" && (
        <Card className="divide-y">
          {listItems.length === 0 && !isLoading && (
            <div className="p-12 text-center text-muted-foreground text-sm">
              この月の予定はありません。
            </div>
          )}
          {listItems.map((item) => {
            const weekIndex = getWeekIndex(item.start, weeks);
            const weekColor = weekIndex >= 0 ? WEEK_COLORS[weekIndex % WEEK_COLORS.length] : null;
            const Icon = ganttItemIcon(item);
            const departmentName = item.departmentId ? departmentNameById.get(item.departmentId) : null;
            const divisionNames = item.divisions.map((d) => d.name).join("、");
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.href)}
                className={`w-full text-left flex items-center gap-5 px-6 py-4 hover:bg-slate-50 transition-colors group border-l-4 ${weekColor ? weekColor.border : "border-l-transparent"}`}
              >
                {/* Date block */}
                <div className="w-14 shrink-0 text-center">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">{format(item.start, "EEE", { locale: ja })}</div>
                  <div className="text-2xl font-black text-primary leading-none">{format(item.start, "d")}</div>
                  {weekColor && (
                    <div className={`mt-1 text-[9px] font-bold px-1 py-0.5 rounded border ${weekColor.badge}`}>{weekIndex + 1}週目</div>
                  )}
                </div>

                {/* Divider */}
                <div className="w-px h-10 bg-slate-200 shrink-0" />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span className="font-semibold text-slate-800 group-hover:text-primary truncate">{item.title}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                    <span>{GANTT_KIND_LABEL[item.kind]}</span>
                    {departmentName && (
                      <>
                        <span className="text-slate-300">|</span>
                        <span className="truncate">{departmentName}</span>
                      </>
                    )}
                    {divisionNames && (
                      <>
                        <span className="text-slate-300">|</span>
                        <span className="truncate">{divisionNames}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-3 shrink-0">
                  {item.isOverdue && (
                    <Badge className="bg-red-50 text-red-700 border-red-200" variant="outline">期限超過</Badge>
                  )}
                  <Badge className={ganttStatusBadgeClass(item.barColorClass)} variant="outline">
                    {item.statusLabel}
                  </Badge>
                </div>
              </button>
            );
          })}
        </Card>
      )}
    </div>
  );
}
