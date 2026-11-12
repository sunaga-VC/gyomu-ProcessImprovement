import { Router, type IRouter } from "express";
import { eq, sql, inArray } from "drizzle-orm";
import { db, systemsTable, processSystemsTable, systemDivisionsTable, divisionsTable, systemDepartmentsTable, systemRelatedDepartmentsTable, departmentsTable, departmentDivisionsTable } from "@workspace/db";

const router: IRouter = Router();

type LinkedDepartment = { id: number; name: string; divisionNames: string[] };
type LinkedDivision = { id: number; name: string };

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

async function getDepartmentsForSystem(systemId: number): Promise<LinkedDepartment[]> {
  const links = await db.select({ dept: departmentsTable }).from(systemDepartmentsTable).leftJoin(departmentsTable, eq(systemDepartmentsTable.departmentId, departmentsTable.id)).where(eq(systemDepartmentsTable.systemId, systemId));
  const depts = links.filter((l) => l.dept).map((l) => l.dept!);
  if (depts.length === 0) return [];
  const divisionNamesByDept = await resolveDivisionNamesForDepartments(depts.map((d) => d.id));
  return depts.map((d) => ({ id: d.id, name: d.name, divisionNames: divisionNamesByDept.get(d.id) ?? [] }));
}

async function setDepartmentsForSystem(systemId: number, departmentIds: number[]) {
  await db.delete(systemDepartmentsTable).where(eq(systemDepartmentsTable.systemId, systemId));
  if (departmentIds.length > 0) {
    await db.insert(systemDepartmentsTable).values(departmentIds.map((departmentId) => ({ systemId, departmentId })));
  }
}

async function getRelatedDepartmentsForSystem(systemId: number): Promise<LinkedDepartment[]> {
  const links = await db.select({ dept: departmentsTable }).from(systemRelatedDepartmentsTable).leftJoin(departmentsTable, eq(systemRelatedDepartmentsTable.departmentId, departmentsTable.id)).where(eq(systemRelatedDepartmentsTable.systemId, systemId));
  const depts = links.filter((l) => l.dept).map((l) => l.dept!);
  if (depts.length === 0) return [];
  const divisionNamesByDept = await resolveDivisionNamesForDepartments(depts.map((d) => d.id));
  return depts.map((d) => ({ id: d.id, name: d.name, divisionNames: divisionNamesByDept.get(d.id) ?? [] }));
}

async function setRelatedDepartmentsForSystem(systemId: number, departmentIds: number[]) {
  await db.delete(systemRelatedDepartmentsTable).where(eq(systemRelatedDepartmentsTable.systemId, systemId));
  if (departmentIds.length > 0) {
    await db.insert(systemRelatedDepartmentsTable).values(departmentIds.map((departmentId) => ({ systemId, departmentId })));
  }
}

async function getDivisionsForSystem(systemId: number): Promise<LinkedDivision[]> {
  const links = await db.select({ division: divisionsTable }).from(systemDivisionsTable).leftJoin(divisionsTable, eq(systemDivisionsTable.divisionId, divisionsTable.id)).where(eq(systemDivisionsTable.systemId, systemId));
  return links.filter((l) => l.division).map((l) => ({ id: l.division!.id, name: l.division!.name }));
}

async function setDivisionsForSystem(systemId: number, divisionIds: number[]) {
  await db.delete(systemDivisionsTable).where(eq(systemDivisionsTable.systemId, systemId));
  if (divisionIds.length > 0) {
    await db.insert(systemDivisionsTable).values(divisionIds.map((divisionId) => ({ systemId, divisionId })));
  }
}

async function withCount(sys: typeof systemsTable.$inferSelect) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(processSystemsTable).where(eq(processSystemsTable.systemId, sys.id));
  const departments = await getDepartmentsForSystem(sys.id);
  const relatedDepartments = await getRelatedDepartmentsForSystem(sys.id);
  const divisions = await getDivisionsForSystem(sys.id);
  const primary = departments[0];
  return {
    ...sys,
    monthlyFee: sys.monthlyFee ? Number(sys.monthlyFee) : null,
    annualFee: sys.annualFee ? Number(sys.annualFee) : null,
    departmentId: primary?.id ?? null,
    departmentName: primary?.name ?? null,
    departments,
    relatedDepartments,
    divisions,
    divisionName: divisions.map((d) => d.name).join(", ") || null,
    processCount: Number(count),
    createdAt: sys.createdAt.toISOString(),
    updatedAt: sys.updatedAt.toISOString(),
  };
}

router.get("/systems", async (req, res): Promise<void> => {
  const { type, keyword } = req.query as Record<string, string>;
  let rows = await db.select().from(systemsTable);
  if (type) rows = rows.filter((r) => r.systemType === type);
  if (keyword) rows = rows.filter((r) => r.name.toLowerCase().includes(keyword.toLowerCase()));
  res.json(await Promise.all(rows.map(withCount)));
});

router.post("/systems", async (req, res): Promise<void> => {
  const { name, systemType, url, monthlyFee, annualFee, contractUntil, accountCount, departmentIds, relatedDepartmentIds, divisionIds, isActive, isBeingDiscontinued, issues, notes } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const [sys] = await db.insert(systemsTable).values({ name, systemType: systemType ?? null, url: url ?? null, monthlyFee: monthlyFee ?? null, annualFee: annualFee ?? null, contractUntil: contractUntil ?? null, accountCount: accountCount ?? null, isActive: isActive ?? true, isBeingDiscontinued: isBeingDiscontinued ?? false, issues: issues ?? null, notes: notes ?? null }).returning();
  if (Array.isArray(departmentIds) && departmentIds.length > 0) await setDepartmentsForSystem(sys.id, departmentIds);
  if (Array.isArray(relatedDepartmentIds) && relatedDepartmentIds.length > 0) await setRelatedDepartmentsForSystem(sys.id, relatedDepartmentIds);
  if (Array.isArray(divisionIds) && divisionIds.length > 0) await setDivisionsForSystem(sys.id, divisionIds);
  res.status(201).json(await withCount(sys));
});

router.get("/systems/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [sys] = await db.select().from(systemsTable).where(eq(systemsTable.id, id));
  if (!sys) { res.status(404).json({ error: "System not found" }); return; }
  res.json(await withCount(sys));
});

router.patch("/systems/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const upd: Partial<typeof systemsTable.$inferInsert> = {};
  for (const key of ["name", "systemType", "url", "monthlyFee", "annualFee", "contractUntil", "accountCount", "isActive", "isBeingDiscontinued", "issues", "notes"] as const) {
    if (req.body[key] !== undefined) (upd as Record<string, unknown>)[key] = req.body[key];
  }
  const [sys] = await db.update(systemsTable).set(upd).where(eq(systemsTable.id, id)).returning();
  if (!sys) { res.status(404).json({ error: "System not found" }); return; }
  if (Array.isArray(req.body.departmentIds)) await setDepartmentsForSystem(id, req.body.departmentIds);
  if (Array.isArray(req.body.relatedDepartmentIds)) await setRelatedDepartmentsForSystem(id, req.body.relatedDepartmentIds);
  if (Array.isArray(req.body.divisionIds)) await setDivisionsForSystem(id, req.body.divisionIds);
  res.json(await withCount(sys));
});

router.delete("/systems/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(systemsTable).where(eq(systemsTable.id, id));
  res.json({ success: true });
});

export default router;
