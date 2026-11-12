import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const improvementIssuesTable = pgTable("improvement_issues", {
  id: serial("id").primaryKey(),
  improvementId: integer("improvement_id").notNull(),
  issueId: integer("issue_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
