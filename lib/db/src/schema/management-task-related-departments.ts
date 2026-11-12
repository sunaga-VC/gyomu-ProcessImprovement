import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const managementTaskRelatedDepartmentsTable = pgTable("management_task_related_departments", {
  id: serial("id").primaryKey(),
  managementTaskId: integer("management_task_id").notNull(),
  departmentId: integer("department_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
