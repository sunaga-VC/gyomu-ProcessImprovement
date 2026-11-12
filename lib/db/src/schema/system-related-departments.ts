import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const systemRelatedDepartmentsTable = pgTable("system_related_departments", {
  id: serial("id").primaryKey(),
  systemId: integer("system_id").notNull(),
  departmentId: integer("department_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
