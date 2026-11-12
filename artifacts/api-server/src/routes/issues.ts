import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, issuesTable, processesTable, departmentsTable, divisionsTable, departmentDivisionsTable, issueDepartmentsTable, issueDivisionsTable, hearingsTable, hearingIssuesTable, improvementsTable, improvementIssuesTable } from "@workspace/db";

const router: IRouter = Router();

type LinkedDepartment = { id: number; name: string; divisionNames: string[] };
type LinkedDivision = { id: number; name: string };
type LinkedHearing = { id: number; title: string };
type LinkedImprovement = { id: number; title: string };

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

async function getProcessNameForIssue(i: typeof issuesTable.$inferSelect): Promise<string | null> {
  if (!i.processId) return null;
  const [proc] = await db.select().from(processesTable).where(eq(processesTable.id, i.processId));
  return proc?.name ?? null;
}

async function resolveDivisionNamesForDepartments(departmentIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (departmentIds.length === 0) return map;
  const rows = await db
    .select({ link: departmentDivisionsTable, division: divisionsTable })
    .from(departmentDivisionsTable)
    .leftJoin(divisionsTable, eq(departmentDivisionsTable.divisionId, divisionsTable.id))
    .where(inArray(departmentDivisionsTable.departmentId, departmentIds));
  for (const r of rows) {
    if (!r.division) continue;
    const list = map.get(r.link.departmentId) ?? [];
    list.push(r.division.name);
    map.set(r.link.departmentId, list);
  }
  return map;
}

async function getDepartmentsForIssue(i: typeof issuesTable.$inferSelect): Promise<LinkedDepartment[]> {
  const links = await db.select({ dept: departmentsTable }).from(issueDepartmentsTable).leftJoin(departmentsTable, eq(issueDepartmentsTable.departmentId, departmentsTable.id)).where(eq(issueDepartmentsTable.issueId, i.id));
  let depts = links.filter((l) => l.dept).map((l) => l.dept!);

  // Fall back to the legacy single departmentId for issues created before multi-department linking existed.
  if (depts.length === 0 && i.departmentId) {
    const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, i.departmentId));
    if (dept) depts = [dept];
  }
  if (depts.length === 0) return [];

  const divisionNamesByDept = await resolveDivisionNamesForDepartments(depts.map((d) => d.id));
  return depts.map((d) => ({ id: d.id, name: d.name, divisionNames: divisionNamesByDept.get(d.id) ?? [] }));
}

async function setDepartmentsForIssue(issueId: number, departmentIds: number[]) {
  await db.delete(issueDepartmentsTable).where(eq(issueDepartmentsTable.issueId, issueId));
  if (departmentIds.length > 0) {
    await db.insert(issueDepartmentsTable).values(departmentIds.map((departmentId) => ({ issueId, departmentId })));
  }
}

async function getDivisionsForIssue(i: typeof issuesTable.$inferSelect): Promise<LinkedDivision[]> {
  const links = await db.select({ div: divisionsTable }).from(issueDivisionsTable).leftJoin(divisionsTable, eq(issueDivisionsTable.divisionId, divisionsTable.id)).where(eq(issueDivisionsTable.issueId, i.id));
  return links.filter((l) => l.div).map((l) => ({ id: l.div!.id, name: l.div!.name }));
}

async function setDivisionsForIssue(issueId: number, divisionIds: number[]) {
  await db.delete(issueDivisionsTable).where(eq(issueDivisionsTable.issueId, issueId));
  if (divisionIds.length > 0) {
    await db.insert(issueDivisionsTable).values(divisionIds.map((divisionId) => ({ issueId, divisionId })));
  }
}

async function getHearingsForIssue(i: typeof issuesTable.$inferSelect): Promise<LinkedHearing[]> {
  const links = await db.select({ hearing: hearingsTable }).from(hearingIssuesTable).leftJoin(hearingsTable, eq(hearingIssuesTable.hearingId, hearingsTable.id)).where(eq(hearingIssuesTable.issueId, i.id));
  return links.filter((l) => l.hearing).map((l) => ({ id: l.hearing!.id, title: l.hearing!.title }));
}

async function setHearingsForIssue(issueId: number, hearingIds: number[]) {
  await db.delete(hearingIssuesTable).where(eq(hearingIssuesTable.issueId, issueId));
  if (hearingIds.length > 0) {
    await db.insert(hearingIssuesTable).values(hearingIds.map((hearingId) => ({ issueId, hearingId })));
  }
}

async function getHearingIdsForIssueId(issueId: number): Promise<number[]> {
  const links = await db.select().from(hearingIssuesTable).where(eq(hearingIssuesTable.issueId, issueId));
  return links.map((l) => l.hearingId);
}

// A child task inherits its parent's ヒアリング tags at the moment it's created or moved under
// that parent, merged with (not replacing) any tags of its own. When a parent task's own tags
// are edited later (see cascadeHearingsToDescendants below), the newly added ones are pushed
// down to its existing descendants too. Mirrors processes.ts's 管理業務 inheritance exactly.
async function mergeParentHearingIds(parentId: number | null | undefined, ownIds: number[]): Promise<number[]> {
  if (!parentId) return ownIds;
  const parentIds = await getHearingIdsForIssueId(parentId);
  if (parentIds.length === 0) return ownIds;
  return Array.from(new Set([...ownIds, ...parentIds]));
}

async function getDescendantIssueIds(issueId: number): Promise<number[]> {
  const result: number[] = [];
  let frontier = [issueId];
  while (frontier.length > 0) {
    const children = await db.select({ id: issuesTable.id }).from(issuesTable).where(and(inArray(issuesTable.parentId, frontier), eq(issuesTable.isActive, 1)));
    const childIds = children.map((c) => c.id);
    if (childIds.length === 0) break;
    result.push(...childIds);
    frontier = childIds;
  }
  return result;
}

async function cascadeHearingsToDescendants(issueId: number, addedHearingIds: number[]) {
  if (addedHearingIds.length === 0) return;
  const descendantIds = await getDescendantIssueIds(issueId);
  for (const descendantId of descendantIds) {
    const ownIds = await getHearingIdsForIssueId(descendantId);
    const finalIds = Array.from(new Set([...ownIds, ...addedHearingIds]));
    if (finalIds.length !== ownIds.length) await setHearingsForIssue(descendantId, finalIds);
  }
}

// Batch-resolves departments, divisions, processes and hearings for a set of issues in a
// handful of queries, instead of the per-issue queries the getXForIssue helpers would need.
async function batchLoadIssueDeptDivisions(rows: (typeof issuesTable.$inferSelect)[]) {
  const issueIds = rows.map((r) => r.id);
  const [allDepartments, allDivisions, allProcesses, allHearings, deptDivLinks, deptLinks, divLinks, hearingLinks] = await Promise.all([
    db.select().from(departmentsTable),
    db.select().from(divisionsTable),
    db.select().from(processesTable),
    db.select().from(hearingsTable),
    db.select().from(departmentDivisionsTable),
    issueIds.length > 0 ? db.select().from(issueDepartmentsTable).where(inArray(issueDepartmentsTable.issueId, issueIds)) : Promise.resolve([]),
    issueIds.length > 0 ? db.select().from(issueDivisionsTable).where(inArray(issueDivisionsTable.issueId, issueIds)) : Promise.resolve([]),
    issueIds.length > 0 ? db.select().from(hearingIssuesTable).where(inArray(hearingIssuesTable.issueId, issueIds)) : Promise.resolve([]),
  ]);
  const processById = new Map(allProcesses.map((p) => [p.id, p]));
  const hearingById = new Map(allHearings.map((h) => [h.id, h]));

  const departmentById = new Map(allDepartments.map((d) => [d.id, d]));
  const divisionById = new Map(allDivisions.map((d) => [d.id, d]));
  const divisionIdsByDept = new Map<number, number[]>();
  for (const link of deptDivLinks) {
    const list = divisionIdsByDept.get(link.departmentId) ?? [];
    list.push(link.divisionId);
    divisionIdsByDept.set(link.departmentId, list);
  }

  const deptIdsByIssue = new Map<number, number[]>();
  for (const l of deptLinks) {
    const list = deptIdsByIssue.get(l.issueId) ?? [];
    list.push(l.departmentId);
    deptIdsByIssue.set(l.issueId, list);
  }
  const divIdsByIssue = new Map<number, number[]>();
  for (const l of divLinks) {
    const list = divIdsByIssue.get(l.issueId) ?? [];
    list.push(l.divisionId);
    divIdsByIssue.set(l.issueId, list);
  }
  const hearingsByIssue = new Map<number, LinkedHearing[]>();
  for (const l of hearingLinks) {
    const hearing = hearingById.get(l.hearingId);
    if (!hearing) continue;
    const list = hearingsByIssue.get(l.issueId) ?? [];
    list.push({ id: hearing.id, title: hearing.title });
    hearingsByIssue.set(l.issueId, list);
  }

  const departmentsByIssue = new Map<number, LinkedDepartment[]>();
  const divisionsByIssue = new Map<number, LinkedDivision[]>();
  const processNameByIssue = new Map<number, string | null>();
  for (const row of rows) {
    // Fall back to the legacy single departmentId column for issues created before multi-department linking existed.
    const deptIds = deptIdsByIssue.get(row.id) ?? (row.departmentId ? [row.departmentId] : []);
    const departments = deptIds
      .map((id) => departmentById.get(id))
      .filter((d): d is typeof allDepartments[number] => !!d)
      .map((d) => ({ id: d.id, name: d.name, divisionNames: (divisionIdsByDept.get(d.id) ?? []).map((did) => divisionById.get(did)?.name).filter((n): n is string => !!n) }));
    departmentsByIssue.set(row.id, departments);

    const divIds = divIdsByIssue.get(row.id) ?? [];
    const divisions = divIds
      .map((id) => divisionById.get(id))
      .filter((d): d is typeof allDivisions[number] => !!d)
      .map((d) => ({ id: d.id, name: d.name }));
    divisionsByIssue.set(row.id, divisions);

    processNameByIssue.set(row.id, row.processId ? (processById.get(row.processId)?.name ?? null) : null);
  }

  return { departmentsByIssue, divisionsByIssue, processNameByIssue, hearingsByIssue };
}

async function getImprovementsForIssue(issueId: number): Promise<LinkedImprovement[]> {
  const links = await db.select({ imp: improvementsTable }).from(improvementIssuesTable).leftJoin(improvementsTable, eq(improvementIssuesTable.improvementId, improvementsTable.id)).where(eq(improvementIssuesTable.issueId, issueId));
  return links.filter((l) => l.imp && l.imp.isActive).map((l) => ({ id: l.imp!.id, title: l.imp!.title }));
}

async function setImprovementsForIssue(issueId: number, improvementIds: number[]) {
  await db.delete(improvementIssuesTable).where(eq(improvementIssuesTable.issueId, issueId));
  if (improvementIds.length > 0) {
    await db.insert(improvementIssuesTable).values(improvementIds.map((improvementId) => ({ issueId, improvementId })));
  }
}

async function enrichIssue(i: typeof issuesTable.$inferSelect, precomputed?: { departments: LinkedDepartment[]; divisions: LinkedDivision[]; processName?: string | null; hearings?: LinkedHearing[] }) {
  const departments = precomputed?.departments ?? (await getDepartmentsForIssue(i));
  const divisions = precomputed?.divisions ?? (await getDivisionsForIssue(i));
  const processName = precomputed && "processName" in precomputed ? (precomputed.processName ?? null) : (await getProcessNameForIssue(i));
  const hearings = precomputed?.hearings ?? (await getHearingsForIssue(i));
  const improvements = await getImprovementsForIssue(i.id);
  const primary = departments[0];
  return {
    ...i,
    processName,
    departmentId: primary?.id ?? null,
    departmentName: primary?.name ?? null,
    divisionName: divisions.map((d) => d.name).join(", ") || null,
    departments,
    divisions,
    hearings,
    improvements,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

router.get("/issues", async (req, res): Promise<void> => {
  const { processId, departmentId, divisionId, hearingId, status, priority, category, parentId } = req.query as Record<string, string>;
  let rows = await db.select().from(issuesTable).where(eq(issuesTable.isActive, 1));
  if (processId) rows = rows.filter((r) => r.processId === parseInt(processId, 10));
  if (status) rows = rows.filter((r) => r.status === status);
  if (priority) rows = rows.filter((r) => r.priority === priority);
  if (category) rows = rows.filter((r) => r.category === category);
  if (parentId) {
    if (parentId === "null") rows = rows.filter((r) => r.parentId === null);
    else rows = rows.filter((r) => r.parentId === parseInt(parentId, 10));
  }

  const { departmentsByIssue, divisionsByIssue, processNameByIssue, hearingsByIssue } = await batchLoadIssueDeptDivisions(rows);
  let result = await Promise.all(rows.map((r) => enrichIssue(r, { departments: departmentsByIssue.get(r.id) ?? [], divisions: divisionsByIssue.get(r.id) ?? [], processName: processNameByIssue.get(r.id) ?? null, hearings: hearingsByIssue.get(r.id) ?? [] })));

  if (departmentId !== undefined) {
    if (departmentId === "null" || departmentId === "") result = result.filter((r) => r.departments.length === 0);
    else { const did = parseInt(departmentId, 10); result = result.filter((r) => r.departments.some((d) => d.id === did)); }
  }
  if (divisionId !== undefined) {
    if (divisionId === "null" || divisionId === "") result = result.filter((r) => r.divisions.length === 0);
    else { const vid = parseInt(divisionId, 10); result = result.filter((r) => r.divisions.some((d) => d.id === vid)); }
  }
  if (hearingId !== undefined) {
    if (hearingId === "null" || hearingId === "") result = result.filter((r) => r.hearings.length === 0);
    else { const hid = parseInt(hearingId, 10); result = result.filter((r) => r.hearings.some((h) => h.id === hid)); }
  }
  res.json(result);
});

router.post("/issues", async (req, res): Promise<void> => {
  const { title, parentId, sortOrder, processId, departmentId, departmentIds, divisionIds, hearingIds, improvementIds, content, cause, category, frequency, impactScope, impactContent, priority, urgency, importance, ownerName, plannedStartDate, plannedEndDate, status } = req.body;
  if (!title) { res.status(400).json({ error: "title is required" }); return; }
  const ids: number[] = Array.isArray(departmentIds) ? departmentIds : (departmentId ? [departmentId] : []);
  const divIds: number[] = Array.isArray(divisionIds) ? divisionIds : [];
  const hIds: number[] = Array.isArray(hearingIds) ? hearingIds : [];
  const impIds: number[] = Array.isArray(improvementIds) ? improvementIds : [];
  const [issue] = await db.insert(issuesTable).values({ title, parentId: parentId ?? null, sortOrder: sortOrder ?? 0, processId: processId ?? null, departmentId: ids[0] ?? null, content: content ?? null, cause: cause ?? null, category: category ?? null, frequency: frequency ?? null, impactScope: impactScope ?? null, impactContent: impactContent ?? null, priority: priority ?? null, urgency: urgency ?? null, importance: importance ?? null, ownerName: ownerName ?? null, plannedStartDate: plannedStartDate ?? null, plannedEndDate: plannedEndDate ?? null, status: status ?? "not_started" }).returning();
  if (ids.length > 0) await setDepartmentsForIssue(issue.id, ids);
  if (divIds.length > 0) await setDivisionsForIssue(issue.id, divIds);
  if (impIds.length > 0) await setImprovementsForIssue(issue.id, impIds);
  const inheritedHearingIds = await mergeParentHearingIds(issue.parentId, hIds);
  if (inheritedHearingIds.length > 0) await setHearingsForIssue(issue.id, inheritedHearingIds);
  res.status(201).json(await enrichIssue(issue));
});

router.get("/issues/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [issue] = await db.select().from(issuesTable).where(eq(issuesTable.id, id));
  if (!issue) { res.status(404).json({ error: "Issue not found" }); return; }
  res.json(await enrichIssue(issue));
});

router.patch("/issues/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const upd: Partial<typeof issuesTable.$inferInsert> = {};
  const fields = ["title", "content", "cause", "category", "frequency", "impactScope", "impactContent", "priority", "urgency", "importance", "ownerName", "plannedStartDate", "plannedEndDate", "status", "sortOrder", "boardSortOrder"] as const;
  for (const f of fields) { if (req.body[f] !== undefined) (upd as Record<string, unknown>)[f] = req.body[f]; }
  const parentChanged = Object.prototype.hasOwnProperty.call(req.body, "parentId");
  if (parentChanged) upd.parentId = req.body.parentId ?? null;

  let ids: number[] | undefined;
  if (Array.isArray(req.body.departmentIds)) {
    ids = req.body.departmentIds as number[];
    upd.departmentId = ids[0] ?? null;
  } else if (Object.prototype.hasOwnProperty.call(req.body, "departmentId")) {
    upd.departmentId = req.body.departmentId ?? null;
  }
  let divIds: number[] | undefined;
  if (Array.isArray(req.body.divisionIds)) {
    divIds = req.body.divisionIds as number[];
  }
  if (Object.prototype.hasOwnProperty.call(req.body, "processId")) {
    upd.processId = req.body.processId ?? null;
  }
  let hIds: number[] | undefined;
  if (Array.isArray(req.body.hearingIds)) {
    hIds = req.body.hearingIds as number[];
  }

  const [issue] = Object.keys(upd).length > 0
    ? await db.update(issuesTable).set(upd).where(eq(issuesTable.id, id)).returning()
    : await db.select().from(issuesTable).where(eq(issuesTable.id, id));
  if (!issue) { res.status(404).json({ error: "Issue not found" }); return; }
  if (ids !== undefined) await setDepartmentsForIssue(id, ids);
  if (divIds !== undefined) await setDivisionsForIssue(id, divIds);
  if (Array.isArray(req.body.improvementIds)) await setImprovementsForIssue(id, req.body.improvementIds);
  if (parentChanged || hIds !== undefined) {
    const previousOwnIds = await getHearingIdsForIssueId(id);
    const baseIds = hIds !== undefined ? hIds : previousOwnIds;
    const finalIds = parentChanged ? await mergeParentHearingIds(issue.parentId, baseIds) : baseIds;
    await setHearingsForIssue(id, finalIds);
    if (hIds !== undefined) {
      const addedIds = hIds.filter((hId) => !previousOwnIds.includes(hId));
      await cascadeHearingsToDescendants(id, addedIds);
    }
  }
  res.json(await enrichIssue(issue));
});

// PATCH /issues/:id/move — drag-and-drop reparent / reorder, mirroring /processes/:id/move.
router.patch("/issues/:id/move", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const { newParentId, sortOrder } = req.body;
  const upd: Partial<typeof issuesTable.$inferInsert> = {};
  const parentChanged = Object.prototype.hasOwnProperty.call(req.body, "newParentId");
  if (parentChanged) upd.parentId = newParentId ?? null;
  if (sortOrder !== undefined) upd.sortOrder = sortOrder;
  const [issue] = await db.update(issuesTable).set(upd).where(eq(issuesTable.id, id)).returning();
  if (!issue) { res.status(404).json({ error: "Issue not found" }); return; }
  if (parentChanged) {
    const ownIds = await getHearingIdsForIssueId(id);
    const finalIds = await mergeParentHearingIds(issue.parentId, ownIds);
    if (finalIds.length !== ownIds.length) await setHearingsForIssue(id, finalIds);
  }
  res.json(await enrichIssue(issue));
});

router.delete("/issues/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  await db.update(issuesTable).set({ isActive: 0 }).where(eq(issuesTable.id, id));
  res.json({ success: true });
});

export default router;
