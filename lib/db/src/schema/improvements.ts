import { pgTable, text, serial, integer, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const improvementsTable = pgTable("improvements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  processId: integer("process_id"),
  issueId: integer("issue_id"),
  departmentId: integer("department_id"),
  purpose: text("purpose"),
  content: text("content"),
  method: text("method"),
  ownerName: text("owner_name"),
  assigneeName: text("assignee_name"),
  priority: text("priority"),
  plannedStartDate: date("planned_start_date", { mode: "string" }),
  plannedEndDate: date("planned_end_date", { mode: "string" }),
  actualStartDate: date("actual_start_date", { mode: "string" }),
  actualEndDate: date("actual_end_date", { mode: "string" }),
  status: text("status").notNull().default("idea"),
  progress: integer("progress"),
  expectedEffect: text("expected_effect"),
  actualEffect: text("actual_effect"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertImprovementSchema = createInsertSchema(improvementsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertImprovement = z.infer<typeof insertImprovementSchema>;
export type Improvement = typeof improvementsTable.$inferSelect;
