import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, departmentsTable, usersTable, processesTable, divisionsTable, departmentDivisionsTable, processDepartmentsTable } from "@workspace/db";

const router: IRouter = Router();

async function getDivisionsForDepartments(departmentIds: number[]): Promise<Map<number, { id: number; name: string }[]>> {
  const map = new Map<number, { id: number; name: string }[]>();
  if (departmentIds.length === 0) return map;
  const rows = await db
    .select({ link: departmentDivisionsTable, division: divisionsTable })
    .from(departmentDivisionsTable)
    .leftJoin(divisionsTable, eq(departmentDivisionsTable.divisionId, divisionsTable.id))
    .where(inArray(departmentDivisionsTable.departmentId, departmentIds));
  for (const r of rows) {
    if (!r.division) continue;
    const list = map.get(r.link.departmentId) ?? [];
    list.push({ id: r.division.id, name: r.division.name });
    map.set(r.link.departmentId, list);
  }
  return map;
}

async function setDivisionsForDepartment(departmentId: number, divisionIds: number[]) {
  await db.delete(departmentDivisionsTable).where(eq(departmentDivisionsTable.departmentId, departmentId));
  if (divisionIds.length > 0) {
    await db.insert(departmentDivisionsTable).values(divisionIds.map((divisionId) => ({ departmentId, divisionId })));
  }
}

// GET /departments
router.get("/departments", async (req, res): Promise<void> => {
  const { parentId, divisionId, isActive } = req.query as Record<string, string>;

  const rows = await db
    .select({ dept: departmentsTable, manager: usersTable })
    .from(departmentsTable)
    .leftJoin(usersTable, eq(departmentsTable.managerId, usersTable.id));

  const activeFilter = isActive === undefined ? true : isActive === "true";
  let filtered = rows.filter((r) => r.dept.isActive === activeFilter);
  if (parentId !== undefined) {
    if (parentId === "null" || parentId === "") {
      filtered = filtered.filter((r) => r.dept.parentId === null);
    } else {
      const pid = parseInt(parentId, 10);
      filtered = filtered.filter((r) => r.dept.parentId === pid);
    }
  }

  const divisionsByDept = await getDivisionsForDepartments(filtered.map((r) => r.dept.id));

  if (divisionId !== undefined) {
    if (divisionId === "null" || divisionId === "") {
      filtered = filtered.filter((r) => (divisionsByDept.get(r.dept.id) ?? []).length === 0);
    } else {
      const did = parseInt(divisionId, 10);
      filtered = filtered.filter((r) => (divisionsByDept.get(r.dept.id) ?? []).some((d) => d.id === did));
    }
  }

  // Count active processes linked to each dept (via join table)
  const processLinks = await db
    .select({ departmentId: processDepartmentsTable.departmentId, processId: processDepartmentsTable.processId })
    .from(processDepartmentsTable)
    .leftJoin(processesTable, eq(processDepartmentsTable.processId, processesTable.id))
    .where(eq(processesTable.isActive, true));
  const countMap: Record<number, number> = {};
  for (const p of processLinks) {
    countMap[p.departmentId] = (countMap[p.departmentId] ?? 0) + 1;
  }

  const result = filtered.map((r) => {
    const divisions = divisionsByDept.get(r.dept.id) ?? [];
    return {
      ...r.dept,
      managerName: r.manager?.name ?? null,
      divisions,
      divisionName: divisions.map((d) => d.name).join(", ") || null,
      processCount: countMap[r.dept.id] ?? 0,
      hearingCount: 0,
      createdAt: r.dept.createdAt.toISOString(),
      updatedAt: r.dept.updatedAt.toISOString(),
    };
  });

  res.json(result);
});

// POST /departments
router.post("/departments", async (req, res): Promise<void> => {
  const { name, code, parentId, divisionIds, managerId, description, isActive, sortOrder } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const ids: number[] = Array.isArray(divisionIds) ? divisionIds : [];
  const [dept] = await db.insert(departmentsTable).values({
    name,
    code: code ?? null,
    parentId: parentId ?? null,
    divisionId: ids[0] ?? null,
    managerId: managerId ?? null,
    description: description ?? null,
    isActive: isActive ?? true,
    sortOrder: sortOrder ?? 0,
  }).returning();
  if (ids.length > 0) await setDivisionsForDepartment(dept.id, ids);
  const divisions = ids.length > 0 ? await db.select().from(divisionsTable).where(inArray(divisionsTable.id, ids)) : [];
  res.status(201).json({ ...dept, managerName: null, divisions, divisionName: divisions.map((d) => d.name).join(", ") || null, processCount: 0, hearingCount: 0, createdAt: dept.createdAt.toISOString(), updatedAt: dept.updatedAt.toISOString() });
});

// GET /departments/tree
router.get("/departments/tree", async (_req, res): Promise<void> => {
  const rows = await db.select().from(departmentsTable).where(eq(departmentsTable.isActive, true));

  const processLinks = await db
    .select({ departmentId: processDepartmentsTable.departmentId, processId: processDepartmentsTable.processId })
    .from(processDepartmentsTable)
    .leftJoin(processesTable, eq(processDepartmentsTable.processId, processesTable.id))
    .where(eq(processesTable.isActive, true));
  const countMap: Record<number, number> = {};
  for (const p of processLinks) {
    countMap[p.departmentId] = (countMap[p.departmentId] ?? 0) + 1;
  }

  type Node = typeof rows[0] & { children: Node[]; processCount: number };
  const nodeMap = new Map<number, Node>();
  for (const r of rows) {
    nodeMap.set(r.id, { ...r, children: [], processCount: countMap[r.id] ?? 0 });
  }
  const roots: Node[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const mapNode = (n: Node): unknown => ({
    id: n.id,
    name: n.name,
    code: n.code,
    parentId: n.parentId,
    isActive: n.isActive,
    sortOrder: n.sortOrder,
    processCount: n.processCount,
    children: n.children.sort((a, b) => a.sortOrder - b.sortOrder).map(mapNode),
  });

  res.json(roots.sort((a, b) => a.sortOrder - b.sortOrder).map(mapNode));
});

// GET /departments/:id
router.get("/departments/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [row] = await db
    .select({ dept: departmentsTable, manager: usersTable })
    .from(departmentsTable)
    .leftJoin(usersTable, eq(departmentsTable.managerId, usersTable.id))
    .where(eq(departmentsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Department not found" });
    return;
  }
  const divisionsByDept = await getDivisionsForDepartments([id]);
  const divisions = divisionsByDept.get(id) ?? [];
  res.json({ ...row.dept, managerName: row.manager?.name ?? null, divisions, divisionName: divisions.map((d) => d.name).join(", ") || null, processCount: 0, hearingCount: 0, createdAt: row.dept.createdAt.toISOString(), updatedAt: row.dept.updatedAt.toISOString() });
});

// PATCH /departments/:id
router.patch("/departments/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { name, code, parentId, divisionIds, managerId, description, isActive, sortOrder } = req.body;
  const updateData: Partial<typeof departmentsTable.$inferInsert> = {};
  if (name !== undefined) updateData.name = name;
  if (code !== undefined) updateData.code = code;
  if (Object.prototype.hasOwnProperty.call(req.body, "parentId")) updateData.parentId = parentId ?? null;
  if (Object.prototype.hasOwnProperty.call(req.body, "managerId")) updateData.managerId = managerId ?? null;
  if (description !== undefined) updateData.description = description;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

  let ids: number[] | undefined;
  if (Array.isArray(divisionIds)) {
    ids = divisionIds;
    updateData.divisionId = ids[0] ?? null;
  }

  const [dept] = await db.update(departmentsTable).set(updateData).where(eq(departmentsTable.id, id)).returning();
  if (!dept) {
    res.status(404).json({ error: "Department not found" });
    return;
  }
  if (ids !== undefined) await setDivisionsForDepartment(id, ids);
  const divisionsByDept = await getDivisionsForDepartments([id]);
  const divisions = divisionsByDept.get(id) ?? [];
  res.json({ ...dept, managerName: null, divisions, divisionName: divisions.map((d) => d.name).join(", ") || null, processCount: 0, hearingCount: 0, createdAt: dept.createdAt.toISOString(), updatedAt: dept.updatedAt.toISOString() });
});

// DELETE /departments/:id
router.delete("/departments/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [dept] = await db.update(departmentsTable).set({ isActive: false }).where(eq(departmentsTable.id, id)).returning();
  if (!dept) {
    res.status(404).json({ error: "Department not found" });
    return;
  }
  res.json({ success: true });
});

export default router;
