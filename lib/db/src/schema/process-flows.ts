import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const processFlowsTable = pgTable("process_flows", {
  id: serial("id").primaryKey(),
  fromProcessId: integer("from_process_id").notNull(),
  toProcessId: integer("to_process_id").notNull(),
  condition: text("condition"),
  handoverInfo: text("handover_info"),
  fromDepartmentId: integer("from_department_id"),
  toDepartmentId: integer("to_department_id"),
  isRequired: boolean("is_required").notNull().default(true),
  isException: boolean("is_exception").notNull().default(false),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProcessFlowSchema = createInsertSchema(processFlowsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProcessFlow = z.infer<typeof insertProcessFlowSchema>;
export type ProcessFlow = typeof processFlowsTable.$inferSelect;
