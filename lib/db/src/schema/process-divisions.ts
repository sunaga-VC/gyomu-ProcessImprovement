import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const processDivisionsTable = pgTable("process_divisions", {
  id: serial("id").primaryKey(),
  processId: integer("process_id").notNull(),
  divisionId: integer("division_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
