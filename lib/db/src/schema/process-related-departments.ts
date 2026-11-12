import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const processRelatedDepartmentsTable = pgTable("process_related_departments", {
  id: serial("id").primaryKey(),
  processId: integer("process_id").notNull(),
  departmentId: integer("department_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
