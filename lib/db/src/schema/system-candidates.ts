import { pgTable, text, serial, integer, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const systemCandidatesTable = pgTable("system_candidates", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  parentId: integer("parent_id"),
  improvementId: integer("improvement_id"),
  processId: integer("process_id"),
  targetUsers: text("target_users"),
  problemToSolve: text("problem_to_solve"),
  currentFlow: text("current_flow"),
  improvedFlow: text("improved_flow"),
  requiredFeatures: text("required_features"),
  connectedSystems: text("connected_systems"),
  hasPersonalInfo: boolean("has_personal_info").notNull().default(false),
  priority: text("priority"),
  estimatedUsers: integer("estimated_users"),
  developerId: integer("developer_id"),
  ownerName: text("owner_name"),
  plannedStartDate: date("planned_start_date", { mode: "string" }),
  plannedEndDate: date("planned_end_date", { mode: "string" }),
  status: text("status").notNull().default("candidate"),
  progress: integer("progress"),
  boardSortOrder: integer("board_sort_order").notNull().default(0),
  listSortOrder: integer("list_sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSystemCandidateSchema = createInsertSchema(systemCandidatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSystemCandidate = z.infer<typeof insertSystemCandidateSchema>;
export type SystemCandidate = typeof systemCandidatesTable.$inferSelect;
