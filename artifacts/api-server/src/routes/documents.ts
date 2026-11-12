import { Router, type IRouter } from "express";
import { eq, sql, inArray } from "drizzle-orm";
import { db, documentsTable, departmentsTable, divisionsTable, departmentDivisionsTable, processDocumentsTable, documentDivisionsTable, documentDepartmentsTable, documentRelatedDepartmentsTable } from "@workspace/db";

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

async function getDepartmentsForDocument(doc: typeof documentsTable.$inferSelect): Promise<LinkedDepartment[]> {
  const links = await db.select({ dept: departmentsTable }).from(documentDepartmentsTable).leftJoin(departmentsTable, eq(documentDepartmentsTable.departmentId, departmentsTable.id)).where(eq(documentDepartmentsTable.documentId, doc.id));
  let depts = links.filter((l) => l.dept).map((l) => l.dept!);
  // Fall back to the legacy single departmentId for documents created before multi-department linking existed.
  if (depts.length === 0 && doc.departmentId) {
    const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, doc.departmentId));
    if (dept) depts = [dept];
  }
  if (depts.length === 0) return [];
  const divisionNamesByDept = await resolveDivisionNamesForDepartments(depts.map((d) => d.id));
  return depts.map((d) => ({ id: d.id, name: d.name, divisionNames: divisionNamesByDept.get(d.id) ?? [] }));
}

async function setDepartmentsForDocument(documentId: number, departmentIds: number[]) {
  await db.delete(documentDepartmentsTable).where(eq(documentDepartmentsTable.documentId, documentId));
  if (departmentIds.length > 0) {
    await db.insert(documentDepartmentsTable).values(departmentIds.map((departmentId) => ({ documentId, departmentId })));
  }
}

async function getRelatedDepartmentsForDocument(documentId: number): Promise<LinkedDepartment[]> {
  const links = await db.select({ dept: departmentsTable }).from(documentRelatedDepartmentsTable).leftJoin(departmentsTable, eq(documentRelatedDepartmentsTable.departmentId, departmentsTable.id)).where(eq(documentRelatedDepartmentsTable.documentId, documentId));
  const depts = links.filter((l) => l.dept).map((l) => l.dept!);
  if (depts.length === 0) return [];
  const divisionNamesByDept = await resolveDivisionNamesForDepartments(depts.map((d) => d.id));
  return depts.map((d) => ({ id: d.id, name: d.name, divisionNames: divisionNamesByDept.get(d.id) ?? [] }));
}

async function setRelatedDepartmentsForDocument(documentId: number, departmentIds: number[]) {
  await db.delete(documentRelatedDepartmentsTable).where(eq(documentRelatedDepartmentsTable.documentId, documentId));
  if (departmentIds.length > 0) {
    await db.insert(documentRelatedDepartmentsTable).values(departmentIds.map((departmentId) => ({ documentId, departmentId })));
  }
}

async function getDivisionsForDocument(documentId: number): Promise<LinkedDivision[]> {
  const links = await db.select({ division: divisionsTable }).from(documentDivisionsTable).leftJoin(divisionsTable, eq(documentDivisionsTable.divisionId, divisionsTable.id)).where(eq(documentDivisionsTable.documentId, documentId));
  return links.filter((l) => l.division).map((l) => ({ id: l.division!.id, name: l.division!.name }));
}

async function setDivisionsForDocument(documentId: number, divisionIds: number[]) {
  await db.delete(documentDivisionsTable).where(eq(documentDivisionsTable.documentId, documentId));
  if (divisionIds.length > 0) {
    await db.insert(documentDivisionsTable).values(divisionIds.map((divisionId) => ({ documentId, divisionId })));
  }
}

async function withDeptAndCount(doc: typeof documentsTable.$inferSelect) {
  const departments = await getDepartmentsForDocument(doc);
  const relatedDepartments = await getRelatedDepartmentsForDocument(doc.id);
  const divisions = await getDivisionsForDocument(doc.id);
  const primary = departments[0];
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(processDocumentsTable).where(eq(processDocumentsTable.documentId, doc.id));
  return {
    ...doc,
    departmentId: primary?.id ?? null,
    departmentName: primary?.name ?? null,
    departments,
    relatedDepartments,
    divisions,
    divisionName: divisions.map((d) => d.name).join(", ") || null,
    processCount: Number(count),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

router.get("/documents", async (req, res): Promise<void> => {
  const { type, departmentId, keyword } = req.query as Record<string, string>;
  let rows = await db.select().from(documentsTable);
  if (type) rows = rows.filter((r) => r.docType === type);
  if (keyword) rows = rows.filter((r) => r.name.toLowerCase().includes(keyword.toLowerCase()));
  let result = await Promise.all(rows.map(withDeptAndCount));
  if (departmentId) {
    const did = parseInt(departmentId, 10);
    result = result.filter((r) => r.departments.some((d) => d.id === did));
  }
  res.json(result);
});

router.post("/documents", async (req, res): Promise<void> => {
  const { name, docType, location, url, departmentId, departmentIds, relatedDepartmentIds, divisionIds, hasPersonalInfo, isActive, needsImprovement, notes } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const ids: number[] = Array.isArray(departmentIds) ? departmentIds : (departmentId ? [departmentId] : []);
  const [doc] = await db.insert(documentsTable).values({ name, docType: docType ?? null, location: location ?? null, url: url ?? null, departmentId: ids[0] ?? null, hasPersonalInfo: hasPersonalInfo ?? false, isActive: isActive ?? true, needsImprovement: needsImprovement ?? false, notes: notes ?? null }).returning();
  if (ids.length > 0) await setDepartmentsForDocument(doc.id, ids);
  if (Array.isArray(relatedDepartmentIds) && relatedDepartmentIds.length > 0) await setRelatedDepartmentsForDocument(doc.id, relatedDepartmentIds);
  if (Array.isArray(divisionIds) && divisionIds.length > 0) await setDivisionsForDocument(doc.id, divisionIds);
  res.status(201).json(await withDeptAndCount(doc));
});

router.get("/documents/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  res.json(await withDeptAndCount(doc));
});

router.patch("/documents/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const upd: Partial<typeof documentsTable.$inferInsert> = {};
  for (const key of ["name", "docType", "location", "url", "hasPersonalInfo", "isActive", "needsImprovement", "notes"] as const) {
    if (req.body[key] !== undefined) (upd as Record<string, unknown>)[key] = req.body[key];
  }
  let ids: number[] | undefined;
  if (Array.isArray(req.body.departmentIds)) {
    ids = req.body.departmentIds as number[];
    upd.departmentId = ids[0] ?? null;
  } else if (Object.prototype.hasOwnProperty.call(req.body, "departmentId")) {
    upd.departmentId = req.body.departmentId ?? null;
  }
  const [doc] = await db.update(documentsTable).set(upd).where(eq(documentsTable.id, id)).returning();
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  if (ids !== undefined) await setDepartmentsForDocument(id, ids);
  if (Array.isArray(req.body.relatedDepartmentIds)) await setRelatedDepartmentsForDocument(id, req.body.relatedDepartmentIds);
  if (Array.isArray(req.body.divisionIds)) await setDivisionsForDocument(id, req.body.divisionIds);
  res.json(await withDeptAndCount(doc));
});

router.delete("/documents/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(documentsTable).where(eq(documentsTable.id, id));
  res.json({ success: true });
});

export default router;
