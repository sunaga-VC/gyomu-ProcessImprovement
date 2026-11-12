import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, managementTasksTable, managementTaskProcessesTable, managementTaskDepartmentsTable, managementTaskRelatedDepartmentsTable, managementTaskDivisionsTable, processesTable, departmentsTable, divisionsTable } from "@workspace/db";

const router: IRouter = Router();

async function getProcessesForManagementTasks(managementTaskIds: number[]): Promise<Map<number, { id: number; name: string }[]>> {
  const map = new Map<number, { id: number; name: string }[]>();
  if (managementTaskIds.length === 0) return map;
  const rows = await db
    .select({ link: managementTaskProcessesTable, proc: processesTable })
    .from(managementTaskProcessesTable)
    .leftJoin(processesTable, eq(managementTaskProcessesTable.processId, processesTable.id))
    .where(inArray(managementTaskProcessesTable.managementTaskId, managementTaskIds));
  for (const r of rows) {
    if (!r.proc || !r.proc.isActive) continue;
    const list = map.get(r.link.managementTaskId) ?? [];
    list.push({ id: r.proc.id, name: r.proc.name });
    map.set(r.link.managementTaskId, list);
  }
  return map;
}

async function setProcessesForManagementTask(managementTaskId: number, processIds: number[]) {
  await db.delete(managementTaskProcessesTable).where(eq(managementTaskProcessesTable.managementTaskId, managementTaskId));
  if (processIds.length > 0) {
    await db.insert(managementTaskProcessesTable).values(processIds.map((processId) => ({ managementTaskId, processId })));
  }
}

async function getDepartmentsForManagementTasks(managementTaskIds: number[]): Promise<Map<number, { id: number; name: string }[]>> {
  const map = new Map<number, { id: number; name: string }[]>();
  if (managementTaskIds.length === 0) return map;
  const rows = await db
    .select({ link: managementTaskDepartmentsTable, dept: departmentsTable })
    .from(managementTaskDepartmentsTable)
    .leftJoin(departmentsTable, eq(managementTaskDepartmentsTable.departmentId, departmentsTable.id))
    .where(inArray(managementTaskDepartmentsTable.managementTaskId, managementTaskIds));
  for (const r of rows) {
    if (!r.dept) continue;
    const list = map.get(r.link.managementTaskId) ?? [];
    list.push({ id: r.dept.id, name: r.dept.name });
    map.set(r.link.managementTaskId, list);
  }
  return map;
}

async function setDepartmentsForManagementTask(managementTaskId: number, departmentIds: number[]) {
  await db.delete(managementTaskDepartmentsTable).where(eq(managementTaskDepartmentsTable.managementTaskId, managementTaskId));
  if (departmentIds.length > 0) {
    await db.insert(managementTaskDepartmentsTable).values(departmentIds.map((departmentId) => ({ managementTaskId, departmentId })));
  }
}

async function getRelatedDepartmentsForManagementTasks(managementTaskIds: number[]): Promise<Map<number, { id: number; name: string }[]>> {
  const map = new Map<number, { id: number; name: string }[]>();
  if (managementTaskIds.length === 0) return map;
  const rows = await db
    .select({ link: managementTaskRelatedDepartmentsTable, dept: departmentsTable })
    .from(managementTaskRelatedDepartmentsTable)
    .leftJoin(departmentsTable, eq(managementTaskRelatedDepartmentsTable.departmentId, departmentsTable.id))
    .where(inArray(managementTaskRelatedDepartmentsTable.managementTaskId, managementTaskIds));
  for (const r of rows) {
    if (!r.dept) continue;
    const list = map.get(r.link.managementTaskId) ?? [];
    list.push({ id: r.dept.id, name: r.dept.name });
    map.set(r.link.managementTaskId, list);
  }
  return map;
}

async function setRelatedDepartmentsForManagementTask(managementTaskId: number, departmentIds: number[]) {
  await db.delete(managementTaskRelatedDepartmentsTable).where(eq(managementTaskRelatedDepartmentsTable.managementTaskId, managementTaskId));
  if (departmentIds.length > 0) {
    await db.insert(managementTaskRelatedDepartmentsTable).values(departmentIds.map((departmentId) => ({ managementTaskId, departmentId })));
  }
}

async function getDivisionsForManagementTasks(managementTaskIds: number[]): Promise<Map<number, { id: number; name: string }[]>> {
  const map = new Map<number, { id: number; name: string }[]>();
  if (managementTaskIds.length === 0) return map;
  const rows = await db
    .select({ link: managementTaskDivisionsTable, div: divisionsTable })
    .from(managementTaskDivisionsTable)
    .leftJoin(divisionsTable, eq(managementTaskDivisionsTable.divisionId, divisionsTable.id))
    .where(inArray(managementTaskDivisionsTable.managementTaskId, managementTaskIds));
  for (const r of rows) {
    if (!r.div) continue;
    const list = map.get(r.link.managementTaskId) ?? [];
    list.push({ id: r.div.id, name: r.div.name });
    map.set(r.link.managementTaskId, list);
  }
  return map;
}

async function setDivisionsForManagementTask(managementTaskId: number, divisionIds: number[]) {
  await db.delete(managementTaskDivisionsTable).where(eq(managementTaskDivisionsTable.managementTaskId, managementTaskId));
  if (divisionIds.length > 0) {
    await db.insert(managementTaskDivisionsTable).values(divisionIds.map((divisionId) => ({ managementTaskId, divisionId })));
  }
}

async function enrichManagementTasks(rows: (typeof managementTasksTable.$inferSelect)[]) {
  const ids = rows.map((r) => r.id);
  const [processesByTask, departmentsByTask, relatedDepartmentsByTask, divisionsByTask] = await Promise.all([
    getProcessesForManagementTasks(ids),
    getDepartmentsForManagementTasks(ids),
    getRelatedDepartmentsForManagementTasks(ids),
    getDivisionsForManagementTasks(ids),
  ]);
  return rows.map((r) => {
    const processes = processesByTask.get(r.id) ?? [];
    return {
      ...r,
      processes,
      processCount: processes.length,
      departments: departmentsByTask.get(r.id) ?? [],
      relatedDepartments: relatedDepartmentsByTask.get(r.id) ?? [],
      divisions: divisionsByTask.get(r.id) ?? [],
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

// GET /management-tasks
router.get("/management-tasks", async (req, res): Promise<void> => {
  const { isActive } = req.query as Record<string, string>;
  const activeFilter = isActive === undefined ? true : isActive === "true";
  const rows = await db.select().from(managementTasksTable).where(eq(managementTasksTable.isActive, activeFilter));
  res.json(await enrichManagementTasks(rows));
});

// POST /management-tasks
router.post("/management-tasks", async (req, res): Promise<void> => {
  const { name, description, isActive, sortOrder, processIds, departmentIds, relatedDepartmentIds, divisionIds } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const procIds: number[] = Array.isArray(processIds) ? processIds : [];
  const deptIds: number[] = Array.isArray(departmentIds) ? departmentIds : [];
  const relatedDeptIds: number[] = Array.isArray(relatedDepartmentIds) ? relatedDepartmentIds : [];
  const divIds: number[] = Array.isArray(divisionIds) ? divisionIds : [];
  const [task] = await db.insert(managementTasksTable).values({
    name, description: description ?? null, isActive: isActive ?? true, sortOrder: sortOrder ?? 0,
  }).returning();
  if (procIds.length > 0) await setProcessesForManagementTask(task.id, procIds);
  if (deptIds.length > 0) await setDepartmentsForManagementTask(task.id, deptIds);
  if (relatedDeptIds.length > 0) await setRelatedDepartmentsForManagementTask(task.id, relatedDeptIds);
  if (divIds.length > 0) await setDivisionsForManagementTask(task.id, divIds);
  const [enriched] = await enrichManagementTasks([task]);
  res.status(201).json(enriched);
});

// GET /management-tasks/:id
router.get("/management-tasks/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [task] = await db.select().from(managementTasksTable).where(eq(managementTasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Management task not found" }); return; }
  const [enriched] = await enrichManagementTasks([task]);
  res.json(enriched);
});

// PATCH /management-tasks/:id
router.patch("/management-tasks/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, description, isActive, sortOrder, processIds, departmentIds, relatedDepartmentIds, divisionIds } = req.body;
  const updateData: Partial<typeof managementTasksTable.$inferInsert> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

  let procIds: number[] | undefined;
  if (Array.isArray(processIds)) procIds = processIds;
  let deptIds: number[] | undefined;
  if (Array.isArray(departmentIds)) deptIds = departmentIds;
  let relatedDeptIds: number[] | undefined;
  if (Array.isArray(relatedDepartmentIds)) relatedDeptIds = relatedDepartmentIds;
  let divIds: number[] | undefined;
  if (Array.isArray(divisionIds)) divIds = divisionIds;

  const [task] = Object.keys(updateData).length > 0
    ? await db.update(managementTasksTable).set(updateData).where(eq(managementTasksTable.id, id)).returning()
    : await db.select().from(managementTasksTable).where(eq(managementTasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Management task not found" }); return; }
  if (procIds !== undefined) await setProcessesForManagementTask(id, procIds);
  if (deptIds !== undefined) await setDepartmentsForManagementTask(id, deptIds);
  if (relatedDeptIds !== undefined) await setRelatedDepartmentsForManagementTask(id, relatedDeptIds);
  if (divIds !== undefined) await setDivisionsForManagementTask(id, divIds);

  const [enriched] = await enrichManagementTasks([task]);
  res.json(enriched);
});

// DELETE /management-tasks/:id
router.delete("/management-tasks/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [task] = await db.update(managementTasksTable).set({ isActive: false }).where(eq(managementTasksTable.id, id)).returning();
  if (!task) { res.status(404).json({ error: "Management task not found" }); return; }
  res.json({ success: true });
});

export default router;
