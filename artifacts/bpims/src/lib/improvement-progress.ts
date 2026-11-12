import type { Hearing, Issue, SystemCandidate } from "@workspace/api-client-react";

export type EstimatedProgress = {
  percent: number;
  hearingCount: number;
  taskCount: number;
  systemCount: number;
};

function hearingScore(status: string): number {
  if (status === "conducted") return 100;
  if (status === "scheduled") return 50;
  return 0;
}

function taskScore(status: string): number {
  if (status === "resolved") return 100;
  if (status === "in_progress" || status === "on_hold") return 50;
  return 0;
}

const SYSTEM_STATUS_ESTIMATE: Record<string, number> = {
  candidate: 0,
  requirements: 20,
  in_development: 20,
  testing: 70,
  cancelled: 50,
  released: 100,
};

export function estimateSystemProgressByStatus(status: string): number {
  return SYSTEM_STATUS_ESTIMATE[status] ?? 0;
}

/** Manually entered progress wins; otherwise falls back to the per-status estimate. 候補/ﾘﾘｰｽ済 are always 0/100. */
export function systemProgress(sc: Pick<SystemCandidate, "status" | "progress">): { value: number; estimated: boolean } {
  if (sc.status === "released" || sc.status === "candidate" || sc.progress == null) {
    return { value: estimateSystemProgressByStatus(sc.status), estimated: sc.status !== "released" && sc.status !== "candidate" };
  }
  return { value: Math.min(100, Math.max(0, sc.progress)), estimated: false };
}

function systemScore(sc: SystemCandidate): number {
  return systemProgress(sc).value;
}

/** A system candidate counts as this many hearings/tasks in the average. */
const SYSTEM_WEIGHT = 2;

/**
 * Weighted average over every hearing / task / system candidate linked to the improvement
 * (same membership rule as 改善ボード). Returns null when nothing is linked.
 */
export function estimateImprovementProgress(
  improvementId: number,
  hearings: Hearing[],
  issues: Issue[],
  systemCandidates: SystemCandidate[],
): EstimatedProgress | null {
  const hs = hearings.filter((h) => (h.improvements ?? []).some((r) => r.id === improvementId));
  const ts = issues.filter((i) => (i.improvements ?? []).some((r) => r.id === improvementId));
  const ss = systemCandidates.filter((sc) => sc.improvementId === improvementId);
  const weighted = [
    ...hs.map((h) => ({ score: hearingScore(h.status), weight: 1 })),
    ...ts.map((t) => ({ score: taskScore(t.status), weight: 1 })),
    ...ss.map((sc) => ({ score: systemScore(sc), weight: SYSTEM_WEIGHT })),
  ];
  if (weighted.length === 0) return null;
  const totalWeight = weighted.reduce((a, w) => a + w.weight, 0);
  const percent = Math.round(weighted.reduce((a, w) => a + w.score * w.weight, 0) / totalWeight);
  return { percent, hearingCount: hs.length, taskCount: ts.length, systemCount: ss.length };
}

export function formatEstimateBreakdown(e: EstimatedProgress): string {
  const parts = [
    e.hearingCount ? `ヒアリング${e.hearingCount}件` : null,
    e.taskCount ? `タスク${e.taskCount}件` : null,
    e.systemCount ? `システム化${e.systemCount}件` : null,
  ].filter(Boolean);
  return parts.join("・");
}
