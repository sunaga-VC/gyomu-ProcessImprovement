import { Router, type IRouter } from "express";
import { eq, or } from "drizzle-orm";
import { db, processFlowsTable, processesTable } from "@workspace/db";

const router: IRouter = Router();

function mapFlow(f: typeof processFlowsTable.$inferSelect, procMap: Record<number, string>) {
  return { ...f, fromProcessName: procMap[f.fromProcessId] ?? null, toProcessName: procMap[f.toProcessId] ?? null, createdAt: f.createdAt.toISOString() };
}

// Walks parentId up to the root, mirroring the frontend's getRootAncestorId (lib/group-by-department.ts).
function getRootAncestorId(processId: number, byId: Map<number, typeof processesTable.$inferSelect>): number {
  let current = processId;
  const seen = new Set<number>([current]);
  for (let i = 0; i < byId.size + 1; i++) {
    const parentId = byId.get(current)?.parentId;
    if (!parentId || seen.has(parentId)) return current;
    current = parentId;
    seen.add(current);
  }
  return current;
}

/**
 * A flow connects two "通常業務" (regular tasks) that belong to the same "管理業務"
 * (management task = a process with no parent). Returns an error message, or null if valid.
 */
async function validateFlowEndpoints(fromProcessId: number, toProcessId: number): Promise<string | null> {
  if (fromProcessId === toProcessId) return "起点業務と終点業務に同じ業務は選択できません";
  const allProcesses = await db.select().from(processesTable);
  const byId = new Map(allProcesses.map((p) => [p.id, p]));
  const fromProc = byId.get(fromProcessId);
  const toProc = byId.get(toProcessId);
  if (!fromProc) return "起点業務が見つかりません";
  if (!toProc) return "終点業務が見つかりません";
  if (!fromProc.parentId) return "起点業務には管理業務（親業務を持たない業務）自体を選択できません";
  if (!toProc.parentId) return "終点業務には管理業務（親業務を持たない業務）自体を選択できません";
  const fromRoot = getRootAncestorId(fromProcessId, byId);
  const toRoot = getRootAncestorId(toProcessId, byId);
  if (fromRoot !== toRoot) return "起点業務と終点業務は同じ管理業務に属している必要があります";
  return null;
}

router.get("/process-flows", async (req, res): Promise<void> => {
  const { processId } = req.query as Record<string, string>;
  let rows = await db.select().from(processFlowsTable);
  if (processId) {
    const pid = parseInt(processId, 10);
    rows = rows.filter((r) => r.fromProcessId === pid || r.toProcessId === pid);
  }
  const procs = await db.select().from(processesTable);
  const procMap: Record<number, string> = {};
  for (const p of procs) procMap[p.id] = p.name;
  res.json(rows.map((r) => mapFlow(r, procMap)));
});

router.post("/process-flows", async (req, res): Promise<void> => {
  const { fromProcessId, toProcessId, condition, handoverInfo, fromDepartmentId, toDepartmentId, isRequired, isException, description } = req.body;
  if (!fromProcessId || !toProcessId) { res.status(400).json({ error: "fromProcessId and toProcessId are required" }); return; }
  const validationError = await validateFlowEndpoints(fromProcessId, toProcessId);
  if (validationError) { res.status(400).json({ error: validationError }); return; }
  const [flow] = await db.insert(processFlowsTable).values({ fromProcessId, toProcessId, condition: condition ?? null, handoverInfo: handoverInfo ?? null, fromDepartmentId: fromDepartmentId ?? null, toDepartmentId: toDepartmentId ?? null, isRequired: isRequired ?? true, isException: isException ?? false, description: description ?? null }).returning();
  const procs = await db.select().from(processesTable);
  const procMap: Record<number, string> = {};
  for (const p of procs) procMap[p.id] = p.name;
  res.status(201).json(mapFlow(flow, procMap));
});

router.patch("/process-flows/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [existing] = await db.select().from(processFlowsTable).where(eq(processFlowsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Process flow not found" }); return; }

  const upd: Partial<typeof processFlowsTable.$inferInsert> = {};
  for (const key of ["condition", "handoverInfo", "isRequired", "isException", "description"] as const) {
    if (req.body[key] !== undefined) (upd as Record<string, unknown>)[key] = req.body[key];
  }
  if (req.body.fromProcessId !== undefined) upd.fromProcessId = req.body.fromProcessId;
  if (req.body.toProcessId !== undefined) upd.toProcessId = req.body.toProcessId;

  if (upd.fromProcessId !== undefined || upd.toProcessId !== undefined) {
    const nextFromProcessId = upd.fromProcessId ?? existing.fromProcessId;
    const nextToProcessId = upd.toProcessId ?? existing.toProcessId;
    const validationError = await validateFlowEndpoints(nextFromProcessId, nextToProcessId);
    if (validationError) { res.status(400).json({ error: validationError }); return; }
  }

  const [flow] = await db.update(processFlowsTable).set(upd).where(eq(processFlowsTable.id, id)).returning();
  if (!flow) { res.status(404).json({ error: "Process flow not found" }); return; }
  const procs = await db.select().from(processesTable);
  const procMap: Record<number, string> = {};
  for (const p of procs) procMap[p.id] = p.name;
  res.json(mapFlow(flow, procMap));
});

router.delete("/process-flows/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(processFlowsTable).where(eq(processFlowsTable.id, id));
  res.json({ success: true });
});

export default router;
