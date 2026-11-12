import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const departmentDivisionsTable = pgTable("department_divisions", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull(),
  divisionId: integer("division_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
