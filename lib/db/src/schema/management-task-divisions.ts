import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const managementTaskDivisionsTable = pgTable("management_task_divisions", {
  id: serial("id").primaryKey(),
  managementTaskId: integer("management_task_id").notNull(),
  divisionId: integer("division_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
