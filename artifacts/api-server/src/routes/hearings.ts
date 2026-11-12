import { Router, type IRouter } from "express";
import { eq, and, gte, lte } from "drizzle-orm";
import { db, hearingsTable, departmentsTable, divisionsTable, processesTable, hearingDivisionsTable, improvementsTable, improvementHearingsTable, documentsTable, systemsTable, hearingDocumentsTable, hearingSystemsTable } from "@workspace/db";

const router: IRouter = Router();

type LinkedHearing = { id: number; title: string };
type LinkedImprovement = { id: number; title: string };
type LinkedDocument = { id: number; name: string };
type LinkedSystem = { id: number; name: string };

function mapHearing(h: typeof hearingsTable.$inferSelect, deptName: string | null, divisionName: string | null, divisions: { id: number; name: string }[], processName: string | null, intervieweeName: string | null, assigneeName: string | null, nextHearing: LinkedHearing | null, previousHearing: LinkedHearing | null, improvements: LinkedImprovement[], documents: LinkedDocument[], systems: LinkedSystem[]) {
  const now = new Date();
  const isOverdue = h.scheduledAt ? h.scheduledAt < now && h.status !== "conducted" : false;
  const pendingCount = h.pendingItems ? h.pendingItems.split("\n").filter(Boolean).length : 0;
  return {
    ...h,
    departmentName: deptName,
    divisionName,
    divisions,
    processName,
    intervieweeName,
    assigneeName,
    nextHearing,
    previousHearing,
    improvements,
    documents,
    systems,
    pendingCount,
    isOverdue,
    scheduledAt: h.scheduledAt?.toISOString() ?? null,
    conductedAt: h.conductedAt?.toISOString() ?? null,
    nextScheduledAt: h.nextScheduledAt?.toISOString() ?? null,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
  };
}

async function getDivisionsForHearing(hearingId: number): Promise<{ id: number; name: string }[]> {
  const links = await db.select({ division: divisionsTable }).from(hearingDivisionsTable).leftJoin(divisionsTable, eq(hearingDivisionsTable.divisionId, divisionsTable.id)).where(eq(hearingDivisionsTable.hearingId, hearingId));
  return links.filter((l) => l.division).map((l) => ({ id: l.division!.id, name: l.division!.name }));
}

async function setDivisionsForHearing(hearingId: number, divisionIds: number[]) {
  await db.delete(hearingDivisionsTable).where(eq(hearingDivisionsTable.hearingId, hearingId));
  if (divisionIds.length > 0) {
    await db.insert(hearingDivisionsTable).values(divisionIds.map((divisionId) => ({ hearingId, divisionId })));
  }
}

async function getProcessNameForHearing(h: typeof hearingsTable.$inferSelect): Promise<string | null> {
  if (!h.processId) return null;
  const [proc] = await db.select().from(processesTable).where(eq(processesTable.id, h.processId));
  return proc?.name ?? null;
}

// A hearing's own nextHearingId points forward; the "previous" hearing is derived by looking
// for whichever other hearing points at this one — a simple one-directional chain (1:1), with
// no separate column to keep in sync.
async function getAdjacentHearings(h: typeof hearingsTable.$inferSelect): Promise<{ nextHearing: LinkedHearing | null; previousHearing: LinkedHearing | null }> {
  const [next] = h.nextHearingId ? await db.select().from(hearingsTable).where(eq(hearingsTable.id, h.nextHearingId)) : [];
  const [previous] = await db.select().from(hearingsTable).where(eq(hearingsTable.nextHearingId, h.id));
  return {
    nextHearing: next ? { id: next.id, title: next.title } : null,
    previousHearing: previous ? { id: previous.id, title: previous.title } : null,
  };
}

async function getImprovementsForHearing(hearingId: number): Promise<LinkedImprovement[]> {
  const links = await db.select({ imp: improvementsTable }).from(improvementHearingsTable).leftJoin(improvementsTable, eq(improvementHearingsTable.improvementId, improvementsTable.id)).where(eq(improvementHearingsTable.hearingId, hearingId));
  return links.filter((l) => l.imp && l.imp.isActive).map((l) => ({ id: l.imp!.id, title: l.imp!.title }));
}

async function setImprovementsForHearing(hearingId: number, improvementIds: number[]) {
  await db.delete(improvementHearingsTable).where(eq(improvementHearingsTable.hearingId, hearingId));
  if (improvementIds.length > 0) {
    await db.insert(improvementHearingsTable).values(improvementIds.map((improvementId) => ({ hearingId, improvementId })));
  }
}

async function getDocumentsForHearing(hearingId: number): Promise<LinkedDocument[]> {
  const links = await db.select({ doc: documentsTable }).from(hearingDocumentsTable).leftJoin(documentsTable, eq(hearingDocumentsTable.documentId, documentsTable.id)).where(eq(hearingDocumentsTable.hearingId, hearingId));
  return links.filter((l) => l.doc).map((l) => ({ id: l.doc!.id, name: l.doc!.name }));
}

async function getSystemsForHearing(hearingId: number): Promise<LinkedSystem[]> {
  const links = await db.select({ sys: systemsTable }).from(hearingSystemsTable).leftJoin(systemsTable, eq(hearingSystemsTable.systemId, systemsTable.id)).where(eq(hearingSystemsTable.hearingId, hearingId));
  return links.filter((l) => l.sys).map((l) => ({ id: l.sys!.id, name: l.sys!.name }));
}

async function enrichHearing(h: typeof hearingsTable.$inferSelect) {
  const [dept] = h.departmentId ? await db.select().from(departmentsTable).where(eq(departmentsTable.id, h.departmentId)) : [];
  const divisions = await getDivisionsForHearing(h.id);
  const divisionName = divisions.map((d) => d.name).join(", ") || null;
  const processName = await getProcessNameForHearing(h);
  const { nextHearing, previousHearing } = await getAdjacentHearings(h);
  const improvements = await getImprovementsForHearing(h.id);
  const documents = await getDocumentsForHearing(h.id);
  const systems = await getSystemsForHearing(h.id);
  return mapHearing(h, dept?.name ?? null, divisionName, divisions, processName, h.intervieweeName ?? null, h.assigneeName ?? null, nextHearing, previousHearing, improvements, documents, systems);
}

router.get("/hearings", async (req, res): Promise<void> => {
  const { departmentId, processId, status, fromDate, toDate } = req.query as Record<string, string>;
  let rows = await db.select().from(hearingsTable);
  if (departmentId) rows = rows.filter((r) => r.departmentId === parseInt(departmentId, 10));
  if (processId) rows = rows.filter((r) => r.processId === parseInt(processId, 10));
  if (status) rows = rows.filter((r) => r.status === status);
  if (fromDate) rows = rows.filter((r) => r.scheduledAt && r.scheduledAt >= new Date(fromDate));
  if (toDate) rows = rows.filter((r) => r.scheduledAt && r.scheduledAt <= new Date(toDate));
  const result = await Promise.all(rows.map(enrichHearing));
  res.json(result);
});

router.post("/hearings", async (req, res): Promise<void> => {
  const { title, departmentId, processId, divisionIds, intervieweeName, assigneeName, format, scheduledAt, durationMinutes, location, meetingUrl, purpose, questions, answers, decisions, pendingItems, nextItems, nextScheduledAt, nextHearingId, priority, status, improvementIds } = req.body;
  if (!title) { res.status(400).json({ error: "title is required" }); return; }
  const divIds: number[] = Array.isArray(divisionIds) ? divisionIds : [];
  const [h] = await db.insert(hearingsTable).values({
    title, departmentId: departmentId ?? null, processId: processId ?? null, intervieweeName: intervieweeName ?? null, assigneeName: assigneeName ?? null, format: format ?? null, scheduledAt: scheduledAt ? new Date(scheduledAt) : null, durationMinutes: durationMinutes ?? null, location: location ?? null, meetingUrl: meetingUrl ?? null, purpose: purpose ?? null, questions: questions ?? null, answers: answers ?? null, decisions: decisions ?? null, pendingItems: pendingItems ?? null, nextItems: nextItems ?? null, nextScheduledAt: nextScheduledAt ? new Date(nextScheduledAt) : null, nextHearingId: nextHearingId ?? null, priority: priority ?? null, status: status ?? "not_started",
  }).returning();
  if (divIds.length > 0) await setDivisionsForHearing(h.id, divIds);
  if (Array.isArray(improvementIds) && improvementIds.length > 0) await setImprovementsForHearing(h.id, improvementIds);
  res.status(201).json(await enrichHearing(h));
});

// GET /hearings/board
router.get("/hearings/board", async (req, res): Promise<void> => {
  const { departmentId } = req.query as Record<string, string>;
  let rows = await db.select().from(hearingsTable);
  if (departmentId) rows = rows.filter((r) => r.departmentId === parseInt(departmentId, 10));
  const enriched = await Promise.all(rows.map(enrichHearing));

  const board: Record<string, typeof enriched> = {
    not_started: [], conducted: [],
  };
  for (const h of enriched) {
    if (board[h.status]) board[h.status].push(h);
  }
  res.json(board);
});

// GET /hearings/calendar
router.get("/hearings/calendar", async (req, res): Promise<void> => {
  const { year, month } = req.query as Record<string, string>;
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0, 23, 59, 59);
  let rows = await db.select().from(hearingsTable);
  rows = rows.filter((r) => r.scheduledAt && r.scheduledAt >= start && r.scheduledAt <= end);
  const result = await Promise.all(rows.map(enrichHearing));
  res.json(result);
});

router.get("/hearings/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [h] = await db.select().from(hearingsTable).where(eq(hearingsTable.id, id));
  if (!h) { res.status(404).json({ error: "Hearing not found" }); return; }
  res.json(await enrichHearing(h));
});

router.patch("/hearings/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const upd: Partial<typeof hearingsTable.$inferInsert> = {};
  const fields = ["title", "format", "durationMinutes", "location", "meetingUrl", "purpose", "questions", "answers", "decisions", "pendingItems", "nextItems", "status", "priority", "assigneeName", "intervieweeName", "boardSortOrder", "listSortOrder"] as const;
  for (const f of fields) { if (req.body[f] !== undefined) (upd as Record<string, unknown>)[f] = req.body[f]; }
  for (const tsField of ["scheduledAt", "conductedAt", "nextScheduledAt"] as const) {
    if (Object.prototype.hasOwnProperty.call(req.body, tsField)) {
      (upd as Record<string, unknown>)[tsField] = req.body[tsField] ? new Date(req.body[tsField]) : null;
    }
  }
  for (const nullField of ["departmentId", "nextHearingId", "processId"] as const) {
    if (Object.prototype.hasOwnProperty.call(req.body, nullField)) (upd as Record<string, unknown>)[nullField] = req.body[nullField] ?? null;
  }
  const [h] = Object.keys(upd).length > 0
    ? await db.update(hearingsTable).set(upd).where(eq(hearingsTable.id, id)).returning()
    : await db.select().from(hearingsTable).where(eq(hearingsTable.id, id));
  if (!h) { res.status(404).json({ error: "Hearing not found" }); return; }
  if (Array.isArray(req.body.divisionIds)) await setDivisionsForHearing(id, req.body.divisionIds);
  if (Array.isArray(req.body.improvementIds)) await setImprovementsForHearing(id, req.body.improvementIds);
  res.json(await enrichHearing(h));
});

router.delete("/hearings/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(hearingsTable).where(eq(hearingsTable.id, id));
  res.json({ success: true });
});

// POST /hearings/:id/documents
router.post("/hearings/:id/documents", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { documentId } = req.body;
  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, documentId));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  const [existing] = await db.select().from(hearingDocumentsTable).where(and(eq(hearingDocumentsTable.hearingId, id), eq(hearingDocumentsTable.documentId, documentId)));
  if (!existing) await db.insert(hearingDocumentsTable).values({ hearingId: id, documentId });
  res.status(201).json(await getDocumentsForHearing(id));
});

// DELETE /hearings/:id/documents/:documentId
router.delete("/hearings/:id/documents/:documentId", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const documentId = parseInt(Array.isArray(req.params.documentId) ? req.params.documentId[0] : req.params.documentId, 10);
  await db.delete(hearingDocumentsTable).where(and(eq(hearingDocumentsTable.hearingId, id), eq(hearingDocumentsTable.documentId, documentId)));
  res.json({ success: true });
});

// POST /hearings/:id/systems
router.post("/hearings/:id/systems", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { systemId } = req.body;
  const [sys] = await db.select().from(systemsTable).where(eq(systemsTable.id, systemId));
  if (!sys) { res.status(404).json({ error: "System not found" }); return; }
  const [existing] = await db.select().from(hearingSystemsTable).where(and(eq(hearingSystemsTable.hearingId, id), eq(hearingSystemsTable.systemId, systemId)));
  if (!existing) await db.insert(hearingSystemsTable).values({ hearingId: id, systemId });
  res.status(201).json(await getSystemsForHearing(id));
});

// DELETE /hearings/:id/systems/:systemId
router.delete("/hearings/:id/systems/:systemId", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const systemId = parseInt(Array.isArray(req.params.systemId) ? req.params.systemId[0] : req.params.systemId, 10);
  await db.delete(hearingSystemsTable).where(and(eq(hearingSystemsTable.hearingId, id), eq(hearingSystemsTable.systemId, systemId)));
  res.json({ success: true });
});

// PATCH /hearings/:id/status
router.patch("/hearings/:id/status", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { status } = req.body;
  if (!status) { res.status(400).json({ error: "status is required" }); return; }
  const [h] = await db.update(hearingsTable).set({ status }).where(eq(hearingsTable.id, id)).returning();
  if (!h) { res.status(404).json({ error: "Hearing not found" }); return; }
  res.json(await enrichHearing(h));
});

export default router;
