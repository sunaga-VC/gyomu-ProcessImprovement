import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const improvementDivisionsTable = pgTable("improvement_divisions", {
  id: serial("id").primaryKey(),
  improvementId: integer("improvement_id").notNull(),
  divisionId: integer("division_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
