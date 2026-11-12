import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, improvementsTable, processesTable, departmentsTable, divisionsTable, improvementDivisionsTable } from "@workspace/db";

const router: IRouter = Router();

async function getDivisionsForImprovement(improvementId: number): Promise<{ id: number; name: string }[]> {
  const links = await db.select({ division: divisionsTable }).from(improvementDivisionsTable).leftJoin(divisionsTable, eq(improvementDivisionsTable.divisionId, divisionsTable.id)).where(eq(improvementDivisionsTable.improvementId, improvementId));
  return links.filter((l) => l.division).map((l) => ({ id: l.division!.id, name: l.division!.name }));
}

async function setDivisionsForImprovement(improvementId: number, divisionIds: number[]) {
  await db.delete(improvementDivisionsTable).where(eq(improvementDivisionsTable.improvementId, improvementId));
  if (divisionIds.length > 0) {
    await db.insert(improvementDivisionsTable).values(divisionIds.map((divisionId) => ({ improvementId, divisionId })));
  }
}

async function enrichImprovement(i: typeof improvementsTable.$inferSelect) {
  const [proc] = i.processId ? await db.select().from(processesTable).where(eq(processesTable.id, i.processId)) : [];
  const [dept] = i.departmentId ? await db.select().from(departmentsTable).where(eq(departmentsTable.id, i.departmentId)) : [];
  const divisions = await getDivisionsForImprovement(i.id);
  const divisionName = divisions.map((d) => d.name).join(", ") || null;
  const now = new Date().toISOString().split("T")[0];
  const isOverdue = !!(i.plannedEndDate && i.plannedEndDate < now && i.status !== "completed" && i.status !== "cancelled");
  return { ...i, processName: proc?.name ?? null, departmentName: dept?.name ?? null, divisionName, divisions, isOverdue, createdAt: i.createdAt.toISOString(), updatedAt: i.updatedAt.toISOString() };
}

router.get("/improvements", async (req, res): Promise<void> => {
  const { processId, departmentId, status, method, priority } = req.query as Record<string, string>;
  let rows = await db.select().from(improvementsTable).where(eq(improvementsTable.isActive, true)).orderBy(asc(improvementsTable.sortOrder), asc(improvementsTable.id));
  if (processId) rows = rows.filter((r) => r.processId === parseInt(processId, 10));
  if (departmentId) rows = rows.filter((r) => r.departmentId === parseInt(departmentId, 10));
  if (status) rows = rows.filter((r) => r.status === status);
  if (method) rows = rows.filter((r) => r.method === method);
  if (priority) rows = rows.filter((r) => r.priority === priority);
  res.json(await Promise.all(rows.map(enrichImprovement)));
});

router.post("/improvements", async (req, res): Promise<void> => {
  const { title, processId, issueId, departmentId, divisionIds, purpose, content, method, ownerName, assigneeName, priority, plannedStartDate, plannedEndDate, status, progress, expectedEffect, notes, sortOrder } = req.body;
  if (!title) { res.status(400).json({ error: "title is required" }); return; }
  const [imp] = await db.insert(improvementsTable).values({ title, processId: processId ?? null, issueId: issueId ?? null, departmentId: departmentId ?? null, purpose: purpose ?? null, content: content ?? null, method: method ?? null, ownerName: ownerName ?? null, assigneeName: assigneeName ?? null, priority: priority ?? null, plannedStartDate: plannedStartDate ?? null, plannedEndDate: plannedEndDate ?? null, status: status ?? "not_started", progress: progress ?? null, expectedEffect: expectedEffect ?? null, notes: notes ?? null, sortOrder: sortOrder ?? 0 }).returning();
  if (Array.isArray(divisionIds) && divisionIds.length > 0) await setDivisionsForImprovement(imp.id, divisionIds);
  res.status(201).json(await enrichImprovement(imp));
});

router.get("/improvements/summary", async (_req, res): Promise<void> => {
  const all = await db.select().from(improvementsTable).where(eq(improvementsTable.isActive, true));
  const now = new Date().toISOString().split("T")[0];
  const overdue = all.filter((i) => i.plannedEndDate && i.plannedEndDate < now && i.status !== "completed" && i.status !== "cancelled").length;
  const byStatus: Record<string, number> = {};
  const byMethod: Record<string, number> = {};
  for (const i of all) {
    byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
    if (i.method) byMethod[i.method] = (byMethod[i.method] ?? 0) + 1;
  }
  res.json({
    total: all.length,
    overdue,
    byStatus: Object.entries(byStatus).map(([label, count]) => ({ label, count })),
    byMethod: Object.entries(byMethod).map(([label, count]) => ({ label, count })),
  });
});

router.get("/improvements/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [imp] = await db.select().from(improvementsTable).where(eq(improvementsTable.id, id));
  if (!imp) { res.status(404).json({ error: "Improvement not found" }); return; }
  res.json(await enrichImprovement(imp));
});

router.patch("/improvements/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const upd: Partial<typeof improvementsTable.$inferInsert> = {};
  const fields = ["title", "purpose", "content", "method", "priority", "plannedStartDate", "plannedEndDate", "actualStartDate", "actualEndDate", "status", "progress", "expectedEffect", "actualEffect", "notes", "ownerName", "assigneeName", "sortOrder"] as const;
  for (const f of fields) { if (req.body[f] !== undefined) (upd as Record<string, unknown>)[f] = req.body[f]; }
  for (const nf of ["processId", "issueId", "departmentId"] as const) {
    if (Object.prototype.hasOwnProperty.call(req.body, nf)) (upd as Record<string, unknown>)[nf] = req.body[nf] ?? null;
  }
  const [imp] = Object.keys(upd).length > 0
    ? await db.update(improvementsTable).set(upd).where(eq(improvementsTable.id, id)).returning()
    : await db.select().from(improvementsTable).where(eq(improvementsTable.id, id));
  if (!imp) { res.status(404).json({ error: "Improvement not found" }); return; }
  if (Array.isArray(req.body.divisionIds)) await setDivisionsForImprovement(id, req.body.divisionIds);
  res.json(await enrichImprovement(imp));
});

router.delete("/improvements/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.update(improvementsTable).set({ isActive: false }).where(eq(improvementsTable.id, id));
  res.json({ success: true });
});

export default router;
