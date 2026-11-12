import { Router, type IRouter } from "express";
import { eq, and, inArray, sql, asc } from "drizzle-orm";
import { db, processesTable, usersTable, departmentsTable, divisionsTable, departmentDivisionsTable, processDepartmentsTable, processRelatedDepartmentsTable, processDivisionsTable, managementTaskProcessesTable, managementTasksTable, processStakeholdersTable, processDocumentsTable, processSystemsTable, documentsTable, systemsTable, issuesTable, improvementsTable, hearingsTable, processFlowsTable } from "@workspace/db";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

async function getLinkedDocuments(processId: number) {
  const docLinks = await db.select({ doc: documentsTable }).from(processDocumentsTable).leftJoin(documentsTable, eq(processDocumentsTable.documentId, documentsTable.id)).where(eq(processDocumentsTable.processId, processId));
  return docLinks.filter((r) => r.doc).map((r) => ({ ...r.doc!, processCount: 0, departmentName: null, createdAt: r.doc!.createdAt.toISOString(), updatedAt: r.doc!.updatedAt.toISOString() }));
}

async function getLinkedSystems(processId: number) {
  const sysLinks = await db.select({ sys: systemsTable }).from(processSystemsTable).leftJoin(systemsTable, eq(processSystemsTable.systemId, systemsTable.id)).where(eq(processSystemsTable.processId, processId));
  return sysLinks.filter((r) => r.sys).map((r) => ({ ...r.sys!, monthlyFee: r.sys!.monthlyFee ? Number(r.sys!.monthlyFee) : null, annualFee: r.sys!.annualFee ? Number(r.sys!.annualFee) : null, processCount: 0, createdAt: r.sys!.createdAt.toISOString(), updatedAt: r.sys!.updatedAt.toISOString() }));
}

type LinkedDepartment = { id: number; name: string; divisionNames: string[] };

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

async function getDepartmentsForProcess(p: typeof processesTable.$inferSelect): Promise<LinkedDepartment[]> {
  const links = await db.select({ dept: departmentsTable }).from(processDepartmentsTable).leftJoin(departmentsTable, eq(processDepartmentsTable.departmentId, departmentsTable.id)).where(eq(processDepartmentsTable.processId, p.id));
  let depts = links.filter((l) => l.dept).map((l) => l.dept!);

  // Fall back to the legacy single departmentId for processes created before multi-department linking existed.
  if (depts.length === 0 && p.departmentId) {
    const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, p.departmentId));
    if (dept) depts = [dept];
  }
  if (depts.length === 0) return [];

  const divisionNamesByDept = await resolveDivisionNamesForDepartments(depts.map((d) => d.id));
  return depts.map((d) => ({ id: d.id, name: d.name, divisionNames: divisionNamesByDept.get(d.id) ?? [] }));
}

async function setDepartmentsForProcess(processId: number, departmentIds: number[]) {
  await db.delete(processDepartmentsTable).where(eq(processDepartmentsTable.processId, processId));
  if (departmentIds.length > 0) {
    await db.insert(processDepartmentsTable).values(departmentIds.map((departmentId) => ({ processId, departmentId })));
  }
}

async function getRelatedDepartmentsForProcess(p: typeof processesTable.$inferSelect): Promise<LinkedDepartment[]> {
  const links = await db.select({ dept: departmentsTable }).from(processRelatedDepartmentsTable).leftJoin(departmentsTable, eq(processRelatedDepartmentsTable.departmentId, departmentsTable.id)).where(eq(processRelatedDepartmentsTable.processId, p.id));
  const depts = links.filter((l) => l.dept).map((l) => l.dept!);
  if (depts.length === 0) return [];
  const divisionNamesByDept = await resolveDivisionNamesForDepartments(depts.map((d) => d.id));
  return depts.map((d) => ({ id: d.id, name: d.name, divisionNames: divisionNamesByDept.get(d.id) ?? [] }));
}

async function setRelatedDepartmentsForProcess(processId: number, departmentIds: number[]) {
  await db.delete(processRelatedDepartmentsTable).where(eq(processRelatedDepartmentsTable.processId, processId));
  if (departmentIds.length > 0) {
    await db.insert(processRelatedDepartmentsTable).values(departmentIds.map((departmentId) => ({ processId, departmentId })));
  }
}

type LinkedDivision = { id: number; name: string };

async function getDivisionsForProcess(p: typeof processesTable.$inferSelect): Promise<LinkedDivision[]> {
  const links = await db.select({ div: divisionsTable }).from(processDivisionsTable).leftJoin(divisionsTable, eq(processDivisionsTable.divisionId, divisionsTable.id)).where(eq(processDivisionsTable.processId, p.id));
  return links.filter((l) => l.div).map((l) => ({ id: l.div!.id, name: l.div!.name }));
}

async function setDivisionsForProcess(processId: number, divisionIds: number[]) {
  await db.delete(processDivisionsTable).where(eq(processDivisionsTable.processId, processId));
  if (divisionIds.length > 0) {
    await db.insert(processDivisionsTable).values(divisionIds.map((divisionId) => ({ processId, divisionId })));
  }
}

type LinkedManagementTask = { id: number; name: string };

async function getManagementTasksForProcess(p: typeof processesTable.$inferSelect): Promise<LinkedManagementTask[]> {
  const links = await db.select({ task: managementTasksTable }).from(managementTaskProcessesTable).leftJoin(managementTasksTable, eq(managementTaskProcessesTable.managementTaskId, managementTasksTable.id)).where(eq(managementTaskProcessesTable.processId, p.id));
  return links.filter((l) => l.task && l.task.isActive).map((l) => ({ id: l.task!.id, name: l.task!.name }));
}

async function setManagementTasksForProcess(processId: number, managementTaskIds: number[]) {
  await db.delete(managementTaskProcessesTable).where(eq(managementTaskProcessesTable.processId, processId));
  if (managementTaskIds.length > 0) {
    await db.insert(managementTaskProcessesTable).values(managementTaskIds.map((managementTaskId) => ({ processId, managementTaskId })));
  }
}

async function getManagementTaskIdsForProcessId(processId: number): Promise<number[]> {
  const links = await db.select().from(managementTaskProcessesTable).where(eq(managementTaskProcessesTable.processId, processId));
  return links.map((l) => l.managementTaskId);
}

// A child process inherits its parent's 管理業務 tags at the moment it's created or moved
// under that parent, merged with (not replacing) any tags of its own. When a parent process's
// own tags are edited later (see cascadeManagementTasksToDescendants below), the newly added
// ones are pushed down to its existing descendants too.
async function mergeParentManagementTaskIds(parentId: number | null | undefined, ownIds: number[]): Promise<number[]> {
  if (!parentId) return ownIds;
  const parentIds = await getManagementTaskIdsForProcessId(parentId);
  if (parentIds.length === 0) return ownIds;
  return Array.from(new Set([...ownIds, ...parentIds]));
}

async function getDescendantProcessIds(processId: number): Promise<number[]> {
  const result: number[] = [];
  let frontier = [processId];
  while (frontier.length > 0) {
    const children = await db.select({ id: processesTable.id }).from(processesTable).where(and(inArray(processesTable.parentId, frontier), eq(processesTable.isActive, true)));
    const childIds = children.map((c) => c.id);
    if (childIds.length === 0) break;
    result.push(...childIds);
    frontier = childIds;
  }
  return result;
}

// When a process's own 管理業務 tags gain new entries, those additions cascade down to every
// existing descendant (children, grandchildren, ...), merged with each descendant's own tags —
// this never removes a tag, so descendant-only tags are preserved.
async function cascadeManagementTasksToDescendants(processId: number, addedManagementTaskIds: number[]) {
  if (addedManagementTaskIds.length === 0) return;
  const descendantIds = await getDescendantProcessIds(processId);
  for (const descendantId of descendantIds) {
    const ownIds = await getManagementTaskIdsForProcessId(descendantId);
    const finalIds = Array.from(new Set([...ownIds, ...addedManagementTaskIds]));
    if (finalIds.length !== ownIds.length) await setManagementTasksForProcess(descendantId, finalIds);
  }
}

// Batch-resolves departments, divisions and management tasks for a set of processes in a
// handful of queries, instead of the per-process queries the getXForProcess helpers would need.
async function batchLoadProcessDeptDivisions(rows: (typeof processesTable.$inferSelect)[]) {
  const processIds = rows.map((r) => r.id);
  const [allDepartments, allDivisions, deptDivLinks, deptLinks, relatedDeptLinks, divLinks, allManagementTasks, mtLinks] = await Promise.all([
    db.select().from(departmentsTable),
    db.select().from(divisionsTable),
    db.select().from(departmentDivisionsTable),
    processIds.length > 0 ? db.select().from(processDepartmentsTable).where(inArray(processDepartmentsTable.processId, processIds)) : Promise.resolve([]),
    processIds.length > 0 ? db.select().from(processRelatedDepartmentsTable).where(inArray(processRelatedDepartmentsTable.processId, processIds)) : Promise.resolve([]),
    processIds.length > 0 ? db.select().from(processDivisionsTable).where(inArray(processDivisionsTable.processId, processIds)) : Promise.resolve([]),
    db.select().from(managementTasksTable).where(eq(managementTasksTable.isActive, true)),
    processIds.length > 0 ? db.select().from(managementTaskProcessesTable).where(inArray(managementTaskProcessesTable.processId, processIds)) : Promise.resolve([]),
  ]);

  const departmentById = new Map(allDepartments.map((d) => [d.id, d]));
  const divisionById = new Map(allDivisions.map((d) => [d.id, d]));
  const divisionIdsByDept = new Map<number, number[]>();
  for (const link of deptDivLinks) {
    const list = divisionIdsByDept.get(link.departmentId) ?? [];
    list.push(link.divisionId);
    divisionIdsByDept.set(link.departmentId, list);
  }

  const deptIdsByProcess = new Map<number, number[]>();
  for (const l of deptLinks) {
    const list = deptIdsByProcess.get(l.processId) ?? [];
    list.push(l.departmentId);
    deptIdsByProcess.set(l.processId, list);
  }
  const relatedDeptIdsByProcess = new Map<number, number[]>();
  for (const l of relatedDeptLinks) {
    const list = relatedDeptIdsByProcess.get(l.processId) ?? [];
    list.push(l.departmentId);
    relatedDeptIdsByProcess.set(l.processId, list);
  }
  const divIdsByProcess = new Map<number, number[]>();
  for (const l of divLinks) {
    const list = divIdsByProcess.get(l.processId) ?? [];
    list.push(l.divisionId);
    divIdsByProcess.set(l.processId, list);
  }

  const managementTaskById = new Map(allManagementTasks.map((t) => [t.id, t]));
  const mtIdsByProcess = new Map<number, number[]>();
  for (const l of mtLinks) {
    const list = mtIdsByProcess.get(l.processId) ?? [];
    list.push(l.managementTaskId);
    mtIdsByProcess.set(l.processId, list);
  }

  const departmentsByProcess = new Map<number, LinkedDepartment[]>();
  const relatedDepartmentsByProcess = new Map<number, LinkedDepartment[]>();
  const divisionsByProcess = new Map<number, LinkedDivision[]>();
  const managementTasksByProcess = new Map<number, LinkedManagementTask[]>();
  for (const row of rows) {
    const mapDeptIds = (ids: number[]) => ids
      .map((id) => departmentById.get(id))
      .filter((d): d is typeof allDepartments[number] => !!d)
      .map((d) => ({ id: d.id, name: d.name, divisionNames: (divisionIdsByDept.get(d.id) ?? []).map((did) => divisionById.get(did)?.name).filter((n): n is string => !!n) }));

    // Fall back to the legacy single departmentId column for processes created before multi-department linking existed.
    const deptIds = deptIdsByProcess.get(row.id) ?? (row.departmentId ? [row.departmentId] : []);
    departmentsByProcess.set(row.id, mapDeptIds(deptIds));
    relatedDepartmentsByProcess.set(row.id, mapDeptIds(relatedDeptIdsByProcess.get(row.id) ?? []));

    const divIds = divIdsByProcess.get(row.id) ?? [];
    const divisions = divIds
      .map((id) => divisionById.get(id))
      .filter((d): d is typeof allDivisions[number] => !!d)
      .map((d) => ({ id: d.id, name: d.name }));
    divisionsByProcess.set(row.id, divisions);

    const mtIds = mtIdsByProcess.get(row.id) ?? [];
    const managementTasks = mtIds
      .map((id) => managementTaskById.get(id))
      .filter((t): t is typeof allManagementTasks[number] => !!t)
      .map((t) => ({ id: t.id, name: t.name }));
    managementTasksByProcess.set(row.id, managementTasks);
  }

  return { departmentsByProcess, relatedDepartmentsByProcess, divisionsByProcess, managementTasksByProcess };
}

async function enrichProcess(p: typeof processesTable.$inferSelect, precomputed?: { departments: LinkedDepartment[]; relatedDepartments: LinkedDepartment[]; divisions: LinkedDivision[]; managementTasks: LinkedManagementTask[] }) {
  const departments = precomputed?.departments ?? (await getDepartmentsForProcess(p));
  const relatedDepartments = precomputed?.relatedDepartments ?? (await getRelatedDepartmentsForProcess(p));
  const divisions = precomputed?.divisions ?? (await getDivisionsForProcess(p));
  const managementTasks = precomputed?.managementTasks ?? (await getManagementTasksForProcess(p));
  const primary = departments[0];
  const [parent] = p.parentId ? await db.select().from(processesTable).where(eq(processesTable.id, p.parentId)) : [];

  const [{ childCount }] = await db.select({ childCount: sql<number>`count(*)` }).from(processesTable).where(and(eq(processesTable.parentId, p.id), eq(processesTable.isActive, true)));
  const [{ issueCount }] = await db.select({ issueCount: sql<number>`count(*)` }).from(issuesTable).where(eq(issuesTable.processId, p.id));
  const [{ improvCount }] = await db.select({ improvCount: sql<number>`count(*)` }).from(improvementsTable).where(eq(improvementsTable.processId, p.id));
  const [{ docCount }] = await db.select({ docCount: sql<number>`count(*)` }).from(processDocumentsTable).where(eq(processDocumentsTable.processId, p.id));
  const [{ sysCount }] = await db.select({ sysCount: sql<number>`count(*)` }).from(processSystemsTable).where(eq(processSystemsTable.processId, p.id));
  const [{ hearingCount }] = await db.select({ hearingCount: sql<number>`count(*)` }).from(hearingsTable).where(eq(hearingsTable.processId, p.id));

  return {
    ...p,
    parentName: parent?.name ?? null,
    departmentId: primary?.id ?? null,
    departmentName: primary?.name ?? null,
    divisionName: divisions.map((d) => d.name).join(", ") || null,
    departments,
    relatedDepartments,
    divisions,
    managementTasks,
    childCount: Number(childCount),
    issueCount: Number(issueCount),
    improvementCount: Number(improvCount),
    documentCount: Number(docCount),
    systemCount: Number(sysCount),
    hearingCount: Number(hearingCount),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

// GET /processes
router.get("/processes", async (req, res): Promise<void> => {
  const { departmentId, divisionId, parentId, status, category, keyword } = req.query as Record<string, string>;
  let rows = await db.select().from(processesTable).where(eq(processesTable.isActive, true)).orderBy(asc(processesTable.sortOrder), asc(processesTable.id));
  if (parentId) {
    if (parentId === "null") rows = rows.filter((r) => r.parentId === null);
    else rows = rows.filter((r) => r.parentId === parseInt(parentId, 10));
  }
  if (status) rows = rows.filter((r) => r.status === status);
  if (category) rows = rows.filter((r) => r.category === category);
  if (keyword) rows = rows.filter((r) => r.name.toLowerCase().includes(keyword.toLowerCase()));

  const { departmentsByProcess, relatedDepartmentsByProcess, divisionsByProcess, managementTasksByProcess } = await batchLoadProcessDeptDivisions(rows);
  let result = await Promise.all(rows.map((r) => enrichProcess(r, { departments: departmentsByProcess.get(r.id) ?? [], relatedDepartments: relatedDepartmentsByProcess.get(r.id) ?? [], divisions: divisionsByProcess.get(r.id) ?? [], managementTasks: managementTasksByProcess.get(r.id) ?? [] })));

  if (departmentId !== undefined) {
    if (departmentId === "null" || departmentId === "") result = result.filter((r) => r.departments.length === 0);
    else { const did = parseInt(departmentId, 10); result = result.filter((r) => r.departments.some((d) => d.id === did)); }
  }
  if (divisionId !== undefined) {
    if (divisionId === "null" || divisionId === "") result = result.filter((r) => r.divisions.length === 0);
    else { const vid = parseInt(divisionId, 10); result = result.filter((r) => r.divisions.some((d) => d.id === vid)); }
  }
  res.json(result);
});

// POST /processes
router.post("/processes", async (req, res): Promise<void> => {
  const { name, parentId, overview, purpose, departmentId, departmentIds, relatedDepartmentIds, divisionIds, managementTaskIds, ownerName, category, status, frequency, duration, trigger, completionCondition, deliverable, sortOrder } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const ids: number[] = Array.isArray(departmentIds) ? departmentIds : (departmentId ? [departmentId] : []);
  const relatedIds: number[] = Array.isArray(relatedDepartmentIds) ? relatedDepartmentIds : [];
  const divIds: number[] = Array.isArray(divisionIds) ? divisionIds : [];
  const mtIds: number[] = Array.isArray(managementTaskIds) ? managementTaskIds : [];
  const [proc] = await db.insert(processesTable).values({
    name, parentId: parentId ?? null, overview: overview ?? null, purpose: purpose ?? null, departmentId: ids[0] ?? null, ownerName: ownerName ?? null, category: category ?? null, status: status ?? "draft", frequency: frequency ?? null, duration: duration ?? null, trigger: trigger ?? null, completionCondition: completionCondition ?? null, deliverable: deliverable ?? null, sortOrder: sortOrder ?? 0,
  }).returning();
  if (ids.length > 0) await setDepartmentsForProcess(proc.id, ids);
  if (relatedIds.length > 0) await setRelatedDepartmentsForProcess(proc.id, relatedIds);
  if (divIds.length > 0) await setDivisionsForProcess(proc.id, divIds);
  const inheritedMtIds = await mergeParentManagementTaskIds(proc.parentId, mtIds);
  if (inheritedMtIds.length > 0) await setManagementTasksForProcess(proc.id, inheritedMtIds);
  res.status(201).json(await enrichProcess(proc));
});

// GET /processes/tree
router.get("/processes/tree", async (req, res): Promise<void> => {
  const { departmentId, divisionId, rootId } = req.query as Record<string, string>;
  let rows = await db.select().from(processesTable).where(eq(processesTable.isActive, true));

  const processIds = rows.map((r) => r.id);
  const [deptLinks, divLinks] = processIds.length > 0 ? await Promise.all([
    db.select().from(processDepartmentsTable).where(inArray(processDepartmentsTable.processId, processIds)),
    db.select().from(processDivisionsTable).where(inArray(processDivisionsTable.processId, processIds)),
  ]) : [[], []];
  const deptIdsByProcess = new Map<number, number[]>();
  for (const l of deptLinks) {
    const list = deptIdsByProcess.get(l.processId) ?? [];
    list.push(l.departmentId);
    deptIdsByProcess.set(l.processId, list);
  }
  const divIdsByProcess = new Map<number, number[]>();
  for (const l of divLinks) {
    const list = divIdsByProcess.get(l.processId) ?? [];
    list.push(l.divisionId);
    divIdsByProcess.set(l.processId, list);
  }
  const resolvedDeptIds = (r: typeof rows[0]) => deptIdsByProcess.get(r.id) ?? (r.departmentId ? [r.departmentId] : []);
  const resolvedDivIds = (r: typeof rows[0]) => divIdsByProcess.get(r.id) ?? [];

  if (departmentId) {
    const did = parseInt(departmentId, 10);
    rows = rows.filter((r) => resolvedDeptIds(r).includes(did));
  }
  if (divisionId) {
    const vid = parseInt(divisionId, 10);
    rows = rows.filter((r) => resolvedDivIds(r).includes(vid));
  }

  // Counts
  const issueCounts: Record<number, number> = {};
  const improvCounts: Record<number, number> = {};
  const issueRows = await db.select().from(issuesTable);
  for (const i of issueRows) { if (i.processId) issueCounts[i.processId] = (issueCounts[i.processId] ?? 0) + 1; }
  const improvRows = await db.select().from(improvementsTable);
  for (const i of improvRows) { if (i.processId) improvCounts[i.processId] = (improvCounts[i.processId] ?? 0) + 1; }

  const depts = await db.select().from(departmentsTable);
  const deptMap: Record<number, string> = {};
  for (const d of depts) deptMap[d.id] = d.name;
  const divs = await db.select().from(divisionsTable);
  const divMap: Record<number, string> = {};
  for (const d of divs) divMap[d.id] = d.name;
  const deptDivLinks = await db.select().from(departmentDivisionsTable);
  const divisionNamesByDept = new Map<number, string[]>();
  for (const l of deptDivLinks) {
    const divName = divMap[l.divisionId];
    if (!divName) continue;
    const list = divisionNamesByDept.get(l.departmentId) ?? [];
    list.push(divName);
    divisionNamesByDept.set(l.departmentId, list);
  }

  type Node = typeof rows[0] & { children: Node[] };
  const nodeMap = new Map<number, Node>();
  for (const r of rows) nodeMap.set(r.id, { ...r, children: [] });
  const roots: Node[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId) && (!rootId || String(node.parentId) !== "null")) {
      nodeMap.get(node.parentId)!.children.push(node);
    } else if (!node.parentId || (rootId && node.parentId === parseInt(rootId, 10))) {
      if (!node.parentId) roots.push(node);
    }
  }

  const mapNode = (n: Node): unknown => {
    const deptIds = resolvedDeptIds(n);
    const divIds = resolvedDivIds(n);
    return {
      id: n.id,
      name: n.name,
      parentId: n.parentId,
      departmentId: deptIds[0] ?? null,
      departmentName: deptIds.map((id) => deptMap[id]).filter(Boolean).join(", ") || null,
      departments: deptIds.filter((id) => deptMap[id]).map((id) => ({ id, name: deptMap[id], divisionNames: divisionNamesByDept.get(id) ?? [] })),
      divisions: divIds.filter((id) => divMap[id]).map((id) => ({ id, name: divMap[id] })),
      ownerName: n.ownerName ?? null,
      status: n.status,
      category: n.category,
      sortOrder: n.sortOrder,
      childCount: n.children.length,
      issueCount: issueCounts[n.id] ?? 0,
      improvementCount: improvCounts[n.id] ?? 0,
      children: n.children.sort((a, b) => a.sortOrder - b.sortOrder).map(mapNode),
    };
  };

  res.json(roots.sort((a, b) => a.sortOrder - b.sortOrder).map(mapNode));
});

// GET /processes/:id
router.get("/processes/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [proc] = await db.select().from(processesTable).where(eq(processesTable.id, id));
  if (!proc) { res.status(404).json({ error: "Process not found" }); return; }

  const enriched = await enrichProcess(proc);

  // Children
  const children = await db.select().from(processesTable).where(and(eq(processesTable.parentId, id), eq(processesTable.isActive, true)));
  const enrichedChildren = await Promise.all(children.map((c) => enrichProcess(c)));

  // Stakeholders
  const stakeholderRows = await db.select({ s: processStakeholdersTable, u: usersTable, d: departmentsTable })
    .from(processStakeholdersTable)
    .leftJoin(usersTable, eq(processStakeholdersTable.userId, usersTable.id))
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(eq(processStakeholdersTable.processId, id));
  const stakeholders = stakeholderRows.map((r) => ({ id: r.s.id, processId: r.s.processId, userId: r.s.userId, userName: r.u?.name ?? "", departmentName: r.d?.name ?? null, role: r.s.role }));

  // Documents
  const docs = await getLinkedDocuments(id);

  // Systems
  const systems = await getLinkedSystems(id);

  // Issues
  const issues = await db.select().from(issuesTable).where(eq(issuesTable.processId, id));
  const enrichedIssues = issues.map((i) => ({ ...i, processName: proc.name, departmentName: null, ownerName: null, createdAt: i.createdAt.toISOString(), updatedAt: i.updatedAt.toISOString() }));

  // Improvements
  const improvs = await db.select().from(improvementsTable).where(eq(improvementsTable.processId, id));
  const enrichedImprovs = improvs.map((i) => ({ ...i, processName: proc.name, departmentName: null, ownerName: null, assigneeName: null, isOverdue: false, createdAt: i.createdAt.toISOString(), updatedAt: i.updatedAt.toISOString() }));

  // Hearings
  const hearings = await db.select().from(hearingsTable).where(eq(hearingsTable.processId, id));
  const enrichedHearings = hearings.map((h) => ({ ...h, departmentName: null, processName: proc.name, intervieweeName: null, assigneeName: null, pendingCount: 0, isOverdue: false, scheduledAt: h.scheduledAt?.toISOString() ?? null, conductedAt: h.conductedAt?.toISOString() ?? null, nextScheduledAt: h.nextScheduledAt?.toISOString() ?? null, createdAt: h.createdAt.toISOString(), updatedAt: h.updatedAt.toISOString() }));

  // Flows
  const predRows = await db.select().from(processFlowsTable).where(eq(processFlowsTable.toProcessId, id));
  const succRows = await db.select().from(processFlowsTable).where(eq(processFlowsTable.fromProcessId, id));
  const allProcs = await db.select().from(processesTable);
  const procMap: Record<number, string> = {};
  for (const p of allProcs) procMap[p.id] = p.name;
  const mapFlow = (f: typeof processFlowsTable.$inferSelect) => ({ ...f, fromProcessName: procMap[f.fromProcessId] ?? null, toProcessName: procMap[f.toProcessId] ?? null, createdAt: f.createdAt.toISOString() });

  res.json({ ...enriched, children: enrichedChildren, stakeholders, documents: docs, systems, issues: enrichedIssues, improvements: enrichedImprovs, hearings: enrichedHearings, predecessors: predRows.map(mapFlow), successors: succRows.map(mapFlow) });
});

// PATCH /processes/:id
router.patch("/processes/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const upd: Partial<typeof processesTable.$inferInsert> = {};
  const fields = ["name", "overview", "purpose", "category", "status", "frequency", "duration", "trigger", "completionCondition", "deliverable", "sortOrder"] as const;
  for (const f of fields) { if (req.body[f] !== undefined) (upd as Record<string, unknown>)[f] = req.body[f]; }
  if (Object.prototype.hasOwnProperty.call(req.body, "parentId")) upd.parentId = req.body.parentId ?? null;
  if (Object.prototype.hasOwnProperty.call(req.body, "ownerName")) upd.ownerName = req.body.ownerName ?? null;

  let ids: number[] | undefined;
  if (Array.isArray(req.body.departmentIds)) {
    ids = req.body.departmentIds as number[];
    upd.departmentId = ids[0] ?? null;
  } else if (Object.prototype.hasOwnProperty.call(req.body, "departmentId")) {
    upd.departmentId = req.body.departmentId ?? null;
  }
  let relatedIds: number[] | undefined;
  if (Array.isArray(req.body.relatedDepartmentIds)) {
    relatedIds = req.body.relatedDepartmentIds as number[];
  }
  let divIds: number[] | undefined;
  if (Array.isArray(req.body.divisionIds)) {
    divIds = req.body.divisionIds as number[];
  }
  let mtIds: number[] | undefined;
  if (Array.isArray(req.body.managementTaskIds)) {
    mtIds = req.body.managementTaskIds as number[];
  }
  const parentChanged = Object.prototype.hasOwnProperty.call(req.body, "parentId");

  const [proc] = Object.keys(upd).length > 0
    ? await db.update(processesTable).set(upd).where(eq(processesTable.id, id)).returning()
    : await db.select().from(processesTable).where(eq(processesTable.id, id));
  if (!proc) { res.status(404).json({ error: "Process not found" }); return; }
  if (ids !== undefined) await setDepartmentsForProcess(id, ids);
  if (relatedIds !== undefined) await setRelatedDepartmentsForProcess(id, relatedIds);
  if (divIds !== undefined) await setDivisionsForProcess(id, divIds);
  if (parentChanged || mtIds !== undefined) {
    const previousOwnIds = await getManagementTaskIdsForProcessId(id);
    const baseIds = mtIds !== undefined ? mtIds : previousOwnIds;
    const finalIds = parentChanged ? await mergeParentManagementTaskIds(proc.parentId, baseIds) : baseIds;
    await setManagementTasksForProcess(id, finalIds);
    if (mtIds !== undefined) {
      const addedIds = mtIds.filter((mtId) => !previousOwnIds.includes(mtId));
      await cascadeManagementTasksToDescendants(id, addedIds);
    }
  }
  res.json(await enrichProcess(proc));
});

// DELETE /processes/:id
router.delete("/processes/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  await db.update(processesTable).set({ isActive: false }).where(eq(processesTable.id, id));
  res.json({ success: true });
});

// PATCH /processes/:id/move
router.patch("/processes/:id/move", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const { newParentId, sortOrder } = req.body;
  const upd: Partial<typeof processesTable.$inferInsert> = {};
  const parentChanged = Object.prototype.hasOwnProperty.call(req.body, "newParentId");
  if (parentChanged) upd.parentId = newParentId ?? null;
  if (sortOrder !== undefined) upd.sortOrder = sortOrder;
  const [proc] = await db.update(processesTable).set(upd).where(eq(processesTable.id, id)).returning();
  if (!proc) { res.status(404).json({ error: "Process not found" }); return; }
  if (parentChanged) {
    const ownIds = await getManagementTaskIdsForProcessId(id);
    const finalIds = await mergeParentManagementTaskIds(proc.parentId, ownIds);
    if (finalIds.length !== ownIds.length) await setManagementTasksForProcess(id, finalIds);
  }
  res.json(await enrichProcess(proc));
});

// POST /processes/:id/documents
router.post("/processes/:id/documents", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const { documentId } = req.body;
  const [proc] = await db.select().from(processesTable).where(eq(processesTable.id, id));
  if (!proc) { res.status(404).json({ error: "Process not found" }); return; }
  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, documentId));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

  const [existing] = await db.select().from(processDocumentsTable).where(and(eq(processDocumentsTable.processId, id), eq(processDocumentsTable.documentId, documentId)));
  if (!existing) {
    await db.insert(processDocumentsTable).values({ processId: id, documentId });
  }
  res.status(201).json(await getLinkedDocuments(id));
});

// DELETE /processes/:id/documents/:documentId
router.delete("/processes/:id/documents/:documentId", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const documentId = parseId(req.params.documentId);
  await db.delete(processDocumentsTable).where(and(eq(processDocumentsTable.processId, id), eq(processDocumentsTable.documentId, documentId)));
  res.json({ success: true });
});

// POST /processes/:id/systems
router.post("/processes/:id/systems", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const { systemId } = req.body;
  const [proc] = await db.select().from(processesTable).where(eq(processesTable.id, id));
  if (!proc) { res.status(404).json({ error: "Process not found" }); return; }
  const [sys] = await db.select().from(systemsTable).where(eq(systemsTable.id, systemId));
  if (!sys) { res.status(404).json({ error: "System not found" }); return; }

  const [existing] = await db.select().from(processSystemsTable).where(and(eq(processSystemsTable.processId, id), eq(processSystemsTable.systemId, systemId)));
  if (!existing) {
    await db.insert(processSystemsTable).values({ processId: id, systemId });
  }
  res.status(201).json(await getLinkedSystems(id));
});

// DELETE /processes/:id/systems/:systemId
router.delete("/processes/:id/systems/:systemId", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const systemId = parseId(req.params.systemId);
  await db.delete(processSystemsTable).where(and(eq(processSystemsTable.processId, id), eq(processSystemsTable.systemId, systemId)));
  res.json({ success: true });
});

export default router;
