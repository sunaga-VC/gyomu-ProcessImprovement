import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const departmentsTable = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code"),
  parentId: integer("parent_id"),
  divisionId: integer("division_id"),
  managerId: integer("manager_id"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDepartmentSchema = createInsertSchema(departmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departmentsTable.$inferSelect;
