import { Router, type IRouter } from "express";
import { eq, gte, lte, and } from "drizzle-orm";
import { db, departmentsTable, processesTable, hearingsTable, issuesTable, improvementsTable, systemCandidatesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [depts, processes, hearings, issues, improvements, candidates] = await Promise.all([
    db.select().from(departmentsTable).where(eq(departmentsTable.isActive, true)),
    db.select().from(processesTable).where(eq(processesTable.isActive, true)),
    db.select().from(hearingsTable),
    db.select().from(issuesTable).where(eq(issuesTable.isActive, 1)),
    db.select().from(improvementsTable).where(eq(improvementsTable.isActive, true)),
    db.select().from(systemCandidatesTable).where(eq(systemCandidatesTable.isActive, true)),
  ]);

  const now = new Date();
  const nowStr = now.toISOString().split("T")[0];
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Hearing stats
  const hearingDeptIds = new Set(hearings.map((h) => h.departmentId).filter(Boolean));
  const completedDeptIds = new Set(
    hearings.filter((h) => h.status === "conducted").map((h) => h.departmentId).filter(Boolean)
  );
  const upcomingHearings = hearings.filter(
    (h) => h.scheduledAt && h.scheduledAt >= now && h.scheduledAt <= nextWeek
  );

  // Overdue
  const overdueImprovements = improvements.filter(
    (i) => i.plannedEndDate && i.plannedEndDate < nowStr && i.status !== "completed" && i.status !== "cancelled"
  ).length;
  const overdueHearings = hearings.filter(
    (h) => h.scheduledAt && h.scheduledAt < now && h.status !== "conducted"
  ).length;
  const overdueCount = overdueImprovements + overdueHearings;

  // Process status breakdown
  const processStatusMap: Record<string, number> = {};
  for (const p of processes) processStatusMap[p.status] = (processStatusMap[p.status] ?? 0) + 1;

  // Improvement status breakdown
  const improvStatusMap: Record<string, number> = {};
  const methodMap: Record<string, number> = {};
  for (const i of improvements) {
    improvStatusMap[i.status] = (improvStatusMap[i.status] ?? 0) + 1;
    if (i.method) methodMap[i.method] = (methodMap[i.method] ?? 0) + 1;
  }

  // Issue priority breakdown
  const priorityMap: Record<string, number> = {};
  for (const i of issues) {
    const key = i.priority ?? "未設定";
    priorityMap[key] = (priorityMap[key] ?? 0) + 1;
  }

  // Department hearing progress
  const deptHearingMap: Record<number, { total: number; completed: number; inProgress: number }> = {};
  for (const h of hearings) {
    if (!h.departmentId) continue;
    if (!deptHearingMap[h.departmentId]) deptHearingMap[h.departmentId] = { total: 0, completed: 0, inProgress: 0 };
    deptHearingMap[h.departmentId].total++;
    if (h.status === "conducted") deptHearingMap[h.departmentId].completed++;
    else if (h.status !== "not_started") deptHearingMap[h.departmentId].inProgress++;
  }

  const departmentHearingProgress = depts.slice(0, 10).map((d) => {
    const stats = deptHearingMap[d.id] ?? { total: 0, completed: 0, inProgress: 0 };
    return { departmentId: d.id, departmentName: d.name, ...stats, notStarted: stats.total - stats.completed - stats.inProgress };
  });

  // Enrich upcoming hearings
  const deptMap: Record<number, string> = {};
  for (const d of depts) deptMap[d.id] = d.name;
  const procMap: Record<number, string> = {};
  for (const p of processes) procMap[p.id] = p.name;

  const enrichedUpcoming = upcomingHearings.slice(0, 5).map((h) => ({
    ...h,
    departmentName: h.departmentId ? (deptMap[h.departmentId] ?? null) : null,
    processName: h.processId ? (procMap[h.processId] ?? null) : null,
    intervieweeName: h.intervieweeName ?? null,
    assigneeName: h.assigneeName ?? null,
    pendingCount: h.pendingItems ? h.pendingItems.split("\n").filter(Boolean).length : 0,
    isOverdue: false,
    scheduledAt: h.scheduledAt?.toISOString() ?? null,
    conductedAt: h.conductedAt?.toISOString() ?? null,
    nextScheduledAt: h.nextScheduledAt?.toISOString() ?? null,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
  }));

  res.json({
    totalDepartments: depts.length,
    hearingTargetDepts: hearingDeptIds.size,
    hearingCompletedDepts: completedDeptIds.size,
    pendingDepts: depts.length - completedDeptIds.size,
    totalProcesses: processes.length,
    confirmedProcesses: processes.filter((p) => p.status === "confirmed").length,
    totalIssues: issues.length,
    totalImprovements: improvements.length,
    systemCandidates: candidates.length,
    overdueCount,
    upcomingHearings: enrichedUpcoming,
    processStatusBreakdown: Object.entries(processStatusMap).map(([label, count]) => ({ label, count })),
    improvementStatusBreakdown: Object.entries(improvStatusMap).map(([label, count]) => ({ label, count })),
    improvementMethodBreakdown: Object.entries(methodMap).map(([label, count]) => ({ label, count })),
    issuePriorityBreakdown: Object.entries(priorityMap).map(([label, count]) => ({ label, count })),
    departmentHearingProgress,
  });
});

router.get("/dashboard/recent-activity", async (_req, res): Promise<void> => {
  const [recentProcesses, recentHearings, recentIssues, recentImprovements] = await Promise.all([
    db.select().from(processesTable).where(eq(processesTable.isActive, true)),
    db.select().from(hearingsTable),
    db.select().from(issuesTable).where(eq(issuesTable.isActive, 1)),
    db.select().from(improvementsTable).where(eq(improvementsTable.isActive, true)),
  ]);

  const depts = await db.select().from(departmentsTable);
  const deptMap: Record<number, string> = {};
  for (const d of depts) deptMap[d.id] = d.name;

  type ActivityItem = { id: number; type: string; title: string; action: string; timestamp: string; departmentName: string | null; userName: string | null };

  const items: ActivityItem[] = [
    ...recentProcesses.slice(-5).map((p) => ({ id: p.id, type: "process", title: p.name, action: "更新", timestamp: p.updatedAt.toISOString(), departmentName: p.departmentId ? (deptMap[p.departmentId] ?? null) : null, userName: null })),
    ...recentHearings.slice(-5).map((h) => ({ id: h.id, type: "hearing", title: h.title, action: "更新", timestamp: h.updatedAt.toISOString(), departmentName: h.departmentId ? (deptMap[h.departmentId] ?? null) : null, userName: null })),
    ...recentIssues.slice(-5).map((i) => ({ id: i.id, type: "issue", title: i.title, action: "更新", timestamp: i.updatedAt.toISOString(), departmentName: i.departmentId ? (deptMap[i.departmentId] ?? null) : null, userName: null })),
    ...recentImprovements.slice(-5).map((i) => ({ id: i.id, type: "improvement", title: i.title, action: "更新", timestamp: i.updatedAt.toISOString(), departmentName: i.departmentId ? (deptMap[i.departmentId] ?? null) : null, userName: null })),
  ];

  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  res.json(items.slice(0, 20));
});

export default router;
