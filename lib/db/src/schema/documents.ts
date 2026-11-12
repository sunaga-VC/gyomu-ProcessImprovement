import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  docType: text("doc_type"),
  location: text("location"),
  url: text("url"),
  departmentId: integer("department_id"),
  hasPersonalInfo: boolean("has_personal_info").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  needsImprovement: boolean("needs_improvement").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;
