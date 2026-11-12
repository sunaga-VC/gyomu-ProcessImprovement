import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const processesTable = pgTable("processes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
  overview: text("overview"),
  purpose: text("purpose"),
  departmentId: integer("department_id"),
  ownerName: text("owner_name"),
  category: text("category"),
  status: text("status").notNull().default("draft"),
  frequency: text("frequency"),
  duration: text("duration"),
  trigger: text("trigger"),
  completionCondition: text("completion_condition"),
  deliverable: text("deliverable"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const processStakeholdersTable = pgTable("process_stakeholders", {
  id: serial("id").primaryKey(),
  processId: integer("process_id").notNull(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const processDocumentsTable = pgTable("process_documents", {
  id: serial("id").primaryKey(),
  processId: integer("process_id").notNull(),
  documentId: integer("document_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const processSystemsTable = pgTable("process_systems", {
  id: serial("id").primaryKey(),
  processId: integer("process_id").notNull(),
  systemId: integer("system_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProcessSchema = createInsertSchema(processesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProcess = z.infer<typeof insertProcessSchema>;
export type Process = typeof processesTable.$inferSelect;
