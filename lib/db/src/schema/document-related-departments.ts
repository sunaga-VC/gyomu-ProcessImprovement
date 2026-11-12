import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const documentRelatedDepartmentsTable = pgTable("document_related_departments", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  departmentId: integer("department_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
