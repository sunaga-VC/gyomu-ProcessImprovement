import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const managementTaskProcessesTable = pgTable("management_task_processes", {
  id: serial("id").primaryKey(),
  managementTaskId: integer("management_task_id").notNull(),
  processId: integer("process_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
