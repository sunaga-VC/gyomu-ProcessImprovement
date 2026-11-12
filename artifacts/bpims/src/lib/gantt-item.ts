import { type Hearing, type Issue, type SystemCandidate } from "@workspace/api-client-react";
import { HEARING_STATUS, ISSUE_STATUS, SYSTEM_CANDIDATE_STATUS } from "@/lib/constants";
import { UsersRoundCollaboration, Target, MonitorCog, Settings, MessageCircleCheck } from "lucide-react";

export type GanttItemKind = "hearing" | "issue" | "systemCandidate";

export const GANTT_KIND_ICON = { hearing: UsersRoundCollaboration, issue: Target, systemCandidate: MonitorCog } as const;
export function ganttItemIcon(item: Pick<GanttItem, "kind" | "statusLabel" | "isChildSystem">) {
  if (item.isChildSystem) return MessageCircleCheck;
  if (item.kind === "systemCandidate" && item.statusLabel === SYSTEM_CANDIDATE_STATUS.released) return Settings;
  return GANTT_KIND_ICON[item.kind];
}
export const GANTT_KIND_LABEL = { hearing: "ヒアリング", issue: "タスク", systemCandidate: "システム化" } as const;

/** Maps a GanttItem's pre-resolved bar color to a matching outline badge style, so list-view status badges stay visually consistent with the Gantt bars. */
export function ganttStatusBadgeClass(barColorClass: string): string {
  const map: Record<string, string> = {
    "bg-emerald-400": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "bg-red-400": "bg-red-50 text-red-700 border-red-200",
    "bg-amber-400": "bg-amber-50 text-amber-700 border-amber-200",
    "bg-blue-400": "bg-blue-50 text-blue-700 border-blue-200",
    "bg-slate-300": "bg-slate-50 text-slate-600 border-slate-200",
  };
  return map[barColorClass] ?? "bg-slate-50 text-slate-600 border-slate-200";
}

export type GanttItem = {
  id: string;
  kind: GanttItemKind;
  title: string;
  start: Date;
  end: Date;
  statusLabel: string;
  /** Tailwind bg-* class used to fill the bar, pre-resolved per kind since each uses a different status vocabulary. */
  barColorClass: string;
  isOverdue: boolean;
  departmentId: number | null;
  divisions: { id: number; name: string }[];
  improvements: { id: number; name: string }[];
  href: string;
  /** システムガントチャートで、親のシステム化の配下に表示する子のシステム化。 */
  isChildSystem?: boolean;
  /** Text drawn inside the bar (e.g. 担当者 on システムガントチャート). */
  barLabel?: string | null;
};

function hearingBarColor(status: string, isOverdue: boolean): string {
  if (status === "conducted") return "bg-emerald-400";
  if (isOverdue) return "bg-red-400";
  return "bg-amber-400";
}

function issueBarColor(status: string, isOverdue: boolean): string {
  if (status === "resolved") return "bg-emerald-400";
  if (isOverdue) return "bg-red-400";
  return "bg-amber-400";
}

function systemCandidateBarColor(status: string, isOverdue: boolean): string {
  if (status === "released") return "bg-emerald-400";
  if (status === "cancelled") return "bg-slate-300";
  if (isOverdue) return "bg-red-400";
  if (status === "in_development" || status === "testing") return "bg-blue-400";
  return "bg-amber-400";
}

export function hearingToGanttItem(h: Hearing): GanttItem | null {
  if (!h.scheduledAt) return null;
  const start = new Date(h.scheduledAt);
  const endRaw = h.nextScheduledAt ? new Date(h.nextScheduledAt) : start;
  const isOverdue = !!h.isOverdue;
  return {
    id: `hearing-${h.id}`,
    kind: "hearing",
    title: h.title,
    start,
    end: endRaw < start ? start : endRaw,
    statusLabel: HEARING_STATUS[h.status as keyof typeof HEARING_STATUS] ?? h.status,
    barColorClass: hearingBarColor(h.status, isOverdue),
    isOverdue,
    departmentId: h.departmentId ?? null,
    divisions: h.divisions ?? [],
    improvements: (h.improvements ?? []).map((r) => ({ id: r.id, name: r.title })),
    href: `/hearings/${h.id}`,
  };
}

/** Tasks span their 開始予定日〜完了予定日. */
export function issueToGanttItem(i: Issue): GanttItem | null {
  if (!i.plannedStartDate) return null;
  const start = new Date(i.plannedStartDate);
  const endRaw = i.plannedEndDate ? new Date(i.plannedEndDate) : start;
  const end = endRaw < start ? start : endRaw;
  const isOverdue = i.status !== "resolved" && end < new Date(new Date().toDateString());
  return {
    id: `issue-${i.id}`,
    kind: "issue",
    title: i.title,
    start,
    end,
    statusLabel: ISSUE_STATUS[i.status as keyof typeof ISSUE_STATUS] ?? i.status,
    barColorClass: issueBarColor(i.status, isOverdue),
    isOverdue,
    departmentId: i.departmentId ?? null,
    divisions: i.divisions ?? [],
    improvements: (i.improvements ?? []).map((r) => ({ id: r.id, name: r.title })),
    href: `/issues`,
  };
}

/** システム化 (system candidates) span their 開始予定日〜完了予定日. */
export function systemCandidateToGanttItem(sc: SystemCandidate): GanttItem | null {
  if (!sc.plannedStartDate) return null;
  const start = new Date(sc.plannedStartDate);
  const endRaw = sc.plannedEndDate ? new Date(sc.plannedEndDate) : start;
  const end = endRaw < start ? start : endRaw;
  const isOverdue = sc.status !== "released" && sc.status !== "cancelled" && end < new Date(new Date().toDateString());
  return {
    id: `systemCandidate-${sc.id}`,
    kind: "systemCandidate",
    title: sc.title,
    start,
    end,
    statusLabel: SYSTEM_CANDIDATE_STATUS[sc.status as keyof typeof SYSTEM_CANDIDATE_STATUS] ?? sc.status,
    barColorClass: systemCandidateBarColor(sc.status, isOverdue),
    isOverdue,
    departmentId: null,
    divisions: [],
    improvements: sc.improvementId ? [{ id: sc.improvementId, name: sc.improvementTitle ?? "" }] : [],
    href: `/system-candidates?openId=${sc.id}`,
    isChildSystem: !!sc.parentId,
  };
}
