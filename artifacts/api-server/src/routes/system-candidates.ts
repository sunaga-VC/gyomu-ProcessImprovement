import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, systemCandidatesTable, improvementsTable, processesTable, usersTable, systemCandidateLinksTable } from "@workspace/db";

const router: IRouter = Router();

type LinkInput = { name: string; url: string };

async function getLinksForSystemCandidate(systemCandidateId: number): Promise<{ id: number; name: string; url: string }[]> {
  const rows = await db.select().from(systemCandidateLinksTable).where(eq(systemCandidateLinksTable.systemCandidateId, systemCandidateId)).orderBy(asc(systemCandidateLinksTable.sortOrder), asc(systemCandidateLinksTable.id));
  return rows.map((r) => ({ id: r.id, name: r.name, url: r.url }));
}

async function setLinksForSystemCandidate(systemCandidateId: number, links: LinkInput[]) {
  await db.delete(systemCandidateLinksTable).where(eq(systemCandidateLinksTable.systemCandidateId, systemCandidateId));
  const valid = links.filter((l) => l.name?.trim() && l.url?.trim());
  if (valid.length > 0) {
    await db.insert(systemCandidateLinksTable).values(valid.map((l, idx) => ({ systemCandidateId, name: l.name, url: l.url, sortOrder: idx })));
  }
}

async function enrich(sc: typeof systemCandidatesTable.$inferSelect) {
  const [imp] = sc.improvementId ? await db.select().from(improvementsTable).where(eq(improvementsTable.id, sc.improvementId)) : [];
  const [proc] = sc.processId ? await db.select().from(processesTable).where(eq(processesTable.id, sc.processId)) : [];
  const [dev] = sc.developerId ? await db.select().from(usersTable).where(eq(usersTable.id, sc.developerId)) : [];
  const links = await getLinksForSystemCandidate(sc.id);
  return { ...sc, improvementTitle: imp?.title ?? null, processName: proc?.name ?? null, developerName: dev?.name ?? null, links, createdAt: sc.createdAt.toISOString(), updatedAt: sc.updatedAt.toISOString() };
}

router.get("/system-candidates", async (req, res): Promise<void> => {
  const { status, priority } = req.query as Record<string, string>;
  let rows = await db.select().from(systemCandidatesTable).where(eq(systemCandidatesTable.isActive, true));
  if (status) rows = rows.filter((r) => r.status === status);
  if (priority) rows = rows.filter((r) => r.priority === priority);
  res.json(await Promise.all(rows.map(enrich)));
});

router.post("/system-candidates", async (req, res): Promise<void> => {
  const { title, parentId, improvementId, processId, targetUsers, problemToSolve, currentFlow, improvedFlow, requiredFeatures, connectedSystems, hasPersonalInfo, priority, estimatedUsers, developerId, ownerName, plannedStartDate, plannedEndDate, status, progress, links } = req.body;
  if (!title) { res.status(400).json({ error: "title is required" }); return; }
  const [sc] = await db.insert(systemCandidatesTable).values({ title, parentId: parentId ?? null, improvementId: improvementId ?? null, processId: processId ?? null, targetUsers: targetUsers ?? null, problemToSolve: problemToSolve ?? null, currentFlow: currentFlow ?? null, improvedFlow: improvedFlow ?? null, requiredFeatures: requiredFeatures ?? null, connectedSystems: connectedSystems ?? null, hasPersonalInfo: hasPersonalInfo ?? false, priority: priority ?? null, estimatedUsers: estimatedUsers ?? null, developerId: developerId ?? null, ownerName: ownerName ?? null, plannedStartDate: plannedStartDate ?? null, plannedEndDate: plannedEndDate ?? null, status: status ?? "candidate", progress: progress ?? null }).returning();
  if (Array.isArray(links) && links.length > 0) await setLinksForSystemCandidate(sc.id, links);
  res.status(201).json(await enrich(sc));
});

router.get("/system-candidates/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [sc] = await db.select().from(systemCandidatesTable).where(eq(systemCandidatesTable.id, id));
  if (!sc) { res.status(404).json({ error: "System candidate not found" }); return; }
  res.json(await enrich(sc));
});

router.patch("/system-candidates/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const upd: Partial<typeof systemCandidatesTable.$inferInsert> = {};
  const fields = ["title", "targetUsers", "problemToSolve", "currentFlow", "improvedFlow", "requiredFeatures", "connectedSystems", "hasPersonalInfo", "priority", "estimatedUsers", "ownerName", "plannedStartDate", "plannedEndDate", "status", "progress", "boardSortOrder", "listSortOrder"] as const;
  for (const f of fields) { if (req.body[f] !== undefined) (upd as Record<string, unknown>)[f] = req.body[f]; }
  for (const nf of ["parentId", "improvementId", "processId", "developerId"] as const) {
    if (Object.prototype.hasOwnProperty.call(req.body, nf)) (upd as Record<string, unknown>)[nf] = req.body[nf] ?? null;
  }
  const [sc] = await db.update(systemCandidatesTable).set(upd).where(eq(systemCandidatesTable.id, id)).returning();
  if (!sc) { res.status(404).json({ error: "System candidate not found" }); return; }
  if (Array.isArray(req.body.links)) await setLinksForSystemCandidate(id, req.body.links);
  res.json(await enrich(sc));
});

router.delete("/system-candidates/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.update(systemCandidatesTable).set({ isActive: false }).where(eq(systemCandidatesTable.id, id));
  res.json({ success: true });
});

export default router;
