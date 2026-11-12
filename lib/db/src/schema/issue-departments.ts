import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const issueDepartmentsTable = pgTable("issue_departments", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id").notNull(),
  departmentId: integer("department_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
