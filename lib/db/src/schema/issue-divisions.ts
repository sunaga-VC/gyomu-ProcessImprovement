import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const issueDivisionsTable = pgTable("issue_divisions", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id").notNull(),
  divisionId: integer("division_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
