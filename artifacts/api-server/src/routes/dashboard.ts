import { Router, type IRouter } from "express";
import { eq, gte, lte, lt, and, ne, count, desc, sql, isNotNull, inArray } from "drizzle-orm";
import { db, departmentsTable, processesTable, hearingsTable, issuesTable, improvementsTable, systemCandidatesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const now = new Date();
  const nowStr = now.toISOString().split("T")[0];
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    [{ value: totalDepartments }],
    [{ value: totalProcesses }],
    [{ value: confirmedProcesses }],
    [{ value: totalIssues }],
    [{ value: totalImprovements }],
    [{ value: systemCandidates }],
    processStatusRows,
    improvStatusRows,
    methodRows,
    priorityRows,
    depts,
    upcomingRows,
    overdueImprovementsRows,
    overdueHearingsRows,
    hearingDeptRows,
    completedDeptRows,
    hearingProgressRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(departmentsTable).where(eq(departmentsTable.isActive, true)),
    db.select({ value: count() }).from(processesTable).where(eq(processesTable.isActive, true)),
    db.select({ value: count() }).from(processesTable).where(and(eq(processesTable.isActive, true), eq(processesTable.status, "confirmed"))),
    db.select({ value: count() }).from(issuesTable).where(eq(issuesTable.isActive, 1)),
    db.select({ value: count() }).from(improvementsTable).where(eq(improvementsTable.isActive, true)),
    db.select({ value: count() }).from(systemCandidatesTable).where(eq(systemCandidatesTable.isActive, true)),
    db.select({ label: processesTable.status, count: count() }).from(processesTable).where(eq(processesTable.isActive, true)).groupBy(processesTable.status),
    db.select({ label: improvementsTable.status, count: count() }).from(improvementsTable).where(eq(improvementsTable.isActive, true)).groupBy(improvementsTable.status),
    db.select({ label: improvementsTable.method, count: count() }).from(improvementsTable).where(and(eq(improvementsTable.isActive, true), isNotNull(improvementsTable.method))).groupBy(improvementsTable.method),
    db.select({ label: sql<string>`coalesce(${issuesTable.priority}, '未設定')`, count: count() }).from(issuesTable).where(eq(issuesTable.isActive, 1)).groupBy(sql`coalesce(${issuesTable.priority}, '未設定')`),
    db.select({ id: departmentsTable.id, name: departmentsTable.name }).from(departmentsTable).where(eq(departmentsTable.isActive, true)).orderBy(departmentsTable.sortOrder).limit(10),
    db.select().from(hearingsTable).where(and(isNotNull(hearingsTable.scheduledAt), gte(hearingsTable.scheduledAt, now), lte(hearingsTable.scheduledAt, nextWeek))).orderBy(hearingsTable.scheduledAt).limit(5),
    db.select({ value: count() }).from(improvementsTable).where(and(
      eq(improvementsTable.isActive, true),
      isNotNull(improvementsTable.plannedEndDate),
      lt(improvementsTable.plannedEndDate, nowStr),
      ne(improvementsTable.status, "completed"),
      ne(improvementsTable.status, "cancelled"),
    )),
    db.select({ value: count() }).from(hearingsTable).where(and(
      isNotNull(hearingsTable.scheduledAt),
      lt(hearingsTable.scheduledAt, now),
      ne(hearingsTable.status, "conducted"),
    )),
    db.select({ departmentId: hearingsTable.departmentId }).from(hearingsTable).where(isNotNull(hearingsTable.departmentId)),
    db.select({ departmentId: hearingsTable.departmentId }).from(hearingsTable).where(and(eq(hearingsTable.status, "conducted"), isNotNull(hearingsTable.departmentId))),
    db.select({
      departmentId: hearingsTable.departmentId,
      status: hearingsTable.status,
      n: count(),
    }).from(hearingsTable).where(isNotNull(hearingsTable.departmentId)).groupBy(hearingsTable.departmentId, hearingsTable.status),
  ]);

  const hearingDeptIds = new Set(hearingDeptRows.map((r) => r.departmentId).filter(Boolean) as number[]);
  const completedDeptIds = new Set(completedDeptRows.map((r) => r.departmentId).filter(Boolean) as number[]);

  const processIds = [...new Set(upcomingRows.map((h) => h.processId).filter(Boolean) as number[])];
  const processes = processIds.length
    ? await db.select({ id: processesTable.id, name: processesTable.name }).from(processesTable).where(inArray(processesTable.id, processIds))
    : [];
  const procMap: Record<number, string> = {};
  for (const p of processes) procMap[p.id] = p.name;
  const deptMap: Record<number, string> = {};
  for (const d of depts) deptMap[d.id] = d.name;

  const deptHearingMap: Record<number, { total: number; completed: number; inProgress: number }> = {};
  for (const row of hearingProgressRows) {
    if (!row.departmentId) continue;
    if (!deptHearingMap[row.departmentId]) deptHearingMap[row.departmentId] = { total: 0, completed: 0, inProgress: 0 };
    const n = Number(row.n);
    deptHearingMap[row.departmentId].total += n;
    if (row.status === "conducted") deptHearingMap[row.departmentId].completed += n;
    else if (row.status !== "not_started") deptHearingMap[row.departmentId].inProgress += n;
  }

  const departmentHearingProgress = depts.map((d) => {
    const stats = deptHearingMap[d.id] ?? { total: 0, completed: 0, inProgress: 0 };
    return { departmentId: d.id, departmentName: d.name, ...stats, notStarted: stats.total - stats.completed - stats.inProgress };
  });

  const enrichedUpcoming = upcomingRows.map((h) => ({
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
    totalDepartments: Number(totalDepartments),
    hearingTargetDepts: hearingDeptIds.size,
    hearingCompletedDepts: completedDeptIds.size,
    pendingDepts: Number(totalDepartments) - completedDeptIds.size,
    totalProcesses: Number(totalProcesses),
    confirmedProcesses: Number(confirmedProcesses),
    totalIssues: Number(totalIssues),
    totalImprovements: Number(totalImprovements),
    systemCandidates: Number(systemCandidates),
    overdueCount: Number(overdueImprovementsRows[0]?.value ?? 0) + Number(overdueHearingsRows[0]?.value ?? 0),
    upcomingHearings: enrichedUpcoming,
    processStatusBreakdown: processStatusRows.map((r) => ({ label: r.label, count: Number(r.count) })),
    improvementStatusBreakdown: improvStatusRows.map((r) => ({ label: r.label, count: Number(r.count) })),
    improvementMethodBreakdown: methodRows.filter((r) => r.label).map((r) => ({ label: r.label as string, count: Number(r.count) })),
    issuePriorityBreakdown: priorityRows.map((r) => ({ label: r.label, count: Number(r.count) })),
    departmentHearingProgress,
  });
});

router.get("/dashboard/recent-activity", async (_req, res): Promise<void> => {
  const [recentProcesses, recentHearings, recentIssues, recentImprovements, depts] = await Promise.all([
    db.select({ id: processesTable.id, name: processesTable.name, departmentId: processesTable.departmentId, updatedAt: processesTable.updatedAt })
      .from(processesTable).where(eq(processesTable.isActive, true)).orderBy(desc(processesTable.updatedAt)).limit(5),
    db.select({ id: hearingsTable.id, title: hearingsTable.title, departmentId: hearingsTable.departmentId, updatedAt: hearingsTable.updatedAt })
      .from(hearingsTable).orderBy(desc(hearingsTable.updatedAt)).limit(5),
    db.select({ id: issuesTable.id, title: issuesTable.title, departmentId: issuesTable.departmentId, updatedAt: issuesTable.updatedAt })
      .from(issuesTable).where(eq(issuesTable.isActive, 1)).orderBy(desc(issuesTable.updatedAt)).limit(5),
    db.select({ id: improvementsTable.id, title: improvementsTable.title, departmentId: improvementsTable.departmentId, updatedAt: improvementsTable.updatedAt })
      .from(improvementsTable).where(eq(improvementsTable.isActive, true)).orderBy(desc(improvementsTable.updatedAt)).limit(5),
    db.select({ id: departmentsTable.id, name: departmentsTable.name }).from(departmentsTable),
  ]);

  const deptMap: Record<number, string> = {};
  for (const d of depts) deptMap[d.id] = d.name;

  type ActivityItem = { id: number; type: string; title: string; action: string; timestamp: string; departmentName: string | null; userName: string | null };

  const items: ActivityItem[] = [
    ...recentProcesses.map((p) => ({ id: p.id, type: "process", title: p.name, action: "更新", timestamp: p.updatedAt.toISOString(), departmentName: p.departmentId ? (deptMap[p.departmentId] ?? null) : null, userName: null })),
    ...recentHearings.map((h) => ({ id: h.id, type: "hearing", title: h.title, action: "更新", timestamp: h.updatedAt.toISOString(), departmentName: h.departmentId ? (deptMap[h.departmentId] ?? null) : null, userName: null })),
    ...recentIssues.map((i) => ({ id: i.id, type: "issue", title: i.title, action: "更新", timestamp: i.updatedAt.toISOString(), departmentName: i.departmentId ? (deptMap[i.departmentId] ?? null) : null, userName: null })),
    ...recentImprovements.map((i) => ({ id: i.id, type: "improvement", title: i.title, action: "更新", timestamp: i.updatedAt.toISOString(), departmentName: i.departmentId ? (deptMap[i.departmentId] ?? null) : null, userName: null })),
  ];

  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  res.json(items.slice(0, 20));
});

export default router;
