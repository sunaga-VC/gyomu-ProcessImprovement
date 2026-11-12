import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, departmentsTable, divisionsTable, departmentDivisionsTable } from "@workspace/db";

const router: IRouter = Router();

async function resolveDivisionName(departmentId: number | null): Promise<string | null> {
  if (!departmentId) return null;
  const links = await db.select({ division: divisionsTable }).from(departmentDivisionsTable).leftJoin(divisionsTable, eq(departmentDivisionsTable.divisionId, divisionsTable.id)).where(eq(departmentDivisionsTable.departmentId, departmentId));
  return links.map((l) => l.division?.name).filter(Boolean).join(", ") || null;
}

// GET /users
router.get("/users", async (req, res): Promise<void> => {
  const { departmentId, role } = req.query as Record<string, string>;
  const rows = await db
    .select({ user: usersTable, dept: departmentsTable })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id));

  let filtered = rows;
  if (departmentId) filtered = filtered.filter((r) => r.user.departmentId === parseInt(departmentId, 10));
  if (role) filtered = filtered.filter((r) => r.user.role === role);

  res.json(await Promise.all(filtered.map(async (r) => ({
    ...r.user,
    departmentName: r.dept?.name ?? null,
    divisionName: await resolveDivisionName(r.user.departmentId),
    createdAt: r.user.createdAt.toISOString(),
    updatedAt: r.user.updatedAt.toISOString(),
  }))));
});

// POST /users
router.post("/users", async (req, res): Promise<void> => {
  const { name, email, departmentId, role, isActive } = req.body;
  if (!name || !email) {
    res.status(400).json({ error: "name and email are required" });
    return;
  }
  const [user] = await db.insert(usersTable).values({
    name, email, departmentId: departmentId ?? null, role: role ?? "staff", isActive: isActive ?? true,
  }).returning();
  res.status(201).json({ ...user, departmentName: null, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() });
});

// GET /users/:id
router.get("/users/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [row] = await db
    .select({ user: usersTable, dept: departmentsTable })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(eq(usersTable.id, id));
  if (!row) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...row.user, departmentName: row.dept?.name ?? null, createdAt: row.user.createdAt.toISOString(), updatedAt: row.user.updatedAt.toISOString() });
});

// PATCH /users/:id
router.patch("/users/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, email, departmentId, role, isActive } = req.body;
  const upd: Partial<typeof usersTable.$inferInsert> = {};
  if (name !== undefined) upd.name = name;
  if (email !== undefined) upd.email = email;
  if (Object.prototype.hasOwnProperty.call(req.body, "departmentId")) upd.departmentId = departmentId ?? null;
  if (role !== undefined) upd.role = role;
  if (isActive !== undefined) upd.isActive = isActive;
  const [user] = await db.update(usersTable).set(upd).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, departmentName: null, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() });
});

// DELETE /users/:id
router.delete("/users/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.json({ success: true });
});

export default router;
