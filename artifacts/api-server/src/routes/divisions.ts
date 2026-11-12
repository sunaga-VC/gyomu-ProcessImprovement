import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, divisionsTable, departmentDivisionsTable } from "@workspace/db";

const router: IRouter = Router();

async function withDepartmentCount(division: typeof divisionsTable.$inferSelect) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(departmentDivisionsTable).where(eq(departmentDivisionsTable.divisionId, division.id));
  return {
    ...division,
    departmentCount: Number(count),
    createdAt: division.createdAt.toISOString(),
    updatedAt: division.updatedAt.toISOString(),
  };
}

// GET /divisions
router.get("/divisions", async (req, res): Promise<void> => {
  const { isActive } = req.query as Record<string, string>;
  const activeFilter = isActive === undefined ? true : isActive === "true";
  const rows = await db.select().from(divisionsTable).where(eq(divisionsTable.isActive, activeFilter));
  res.json(await Promise.all(rows.map(withDepartmentCount)));
});

// POST /divisions
router.post("/divisions", async (req, res): Promise<void> => {
  const { name, description, sortOrder } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const [division] = await db.insert(divisionsTable).values({ name, description: description ?? null, sortOrder: sortOrder ?? 0 }).returning();
  res.status(201).json(await withDepartmentCount(division));
});

// GET /divisions/:id
router.get("/divisions/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [division] = await db.select().from(divisionsTable).where(eq(divisionsTable.id, id));
  if (!division) { res.status(404).json({ error: "Division not found" }); return; }
  res.json(await withDepartmentCount(division));
});

// PATCH /divisions/:id
router.patch("/divisions/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const upd: Partial<typeof divisionsTable.$inferInsert> = {};
  for (const key of ["name", "description", "isActive", "sortOrder"] as const) {
    if (req.body[key] !== undefined) (upd as Record<string, unknown>)[key] = req.body[key];
  }
  const [division] = await db.update(divisionsTable).set(upd).where(eq(divisionsTable.id, id)).returning();
  if (!division) { res.status(404).json({ error: "Division not found" }); return; }
  res.json(await withDepartmentCount(division));
});

// DELETE /divisions/:id
router.delete("/divisions/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [division] = await db.update(divisionsTable).set({ isActive: false }).where(eq(divisionsTable.id, id)).returning();
  if (!division) { res.status(404).json({ error: "Division not found" }); return; }
  res.json({ success: true });
});

export default router;
