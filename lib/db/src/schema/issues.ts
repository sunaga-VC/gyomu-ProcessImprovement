import { pgTable, text, serial, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const issuesTable = pgTable("issues", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  parentId: integer("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  processId: integer("process_id"),
  departmentId: integer("department_id"),
  content: text("content"),
  cause: text("cause"),
  category: text("category"),
  frequency: text("frequency"),
  impactScope: text("impact_scope"),
  impactContent: text("impact_content"),
  priority: text("priority"),
  urgency: text("urgency"),
  importance: text("importance"),
  ownerName: text("owner_name"),
  plannedStartDate: date("planned_start_date", { mode: "string" }),
  plannedEndDate: date("planned_end_date", { mode: "string" }),
  status: text("status").notNull().default("unconfirmed"),
  boardSortOrder: integer("board_sort_order").notNull().default(0),
  isActive: integer("is_active").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertIssueSchema = createInsertSchema(issuesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIssue = z.infer<typeof insertIssueSchema>;
export type Issue = typeof issuesTable.$inferSelect;
