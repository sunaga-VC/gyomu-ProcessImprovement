import { pgTable, text, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const managementTasksTable = pgTable("management_tasks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertManagementTaskSchema = createInsertSchema(managementTasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertManagementTask = z.infer<typeof insertManagementTaskSchema>;
export type ManagementTask = typeof managementTasksTable.$inferSelect;
