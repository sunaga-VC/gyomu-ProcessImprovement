import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const hearingIssuesTable = pgTable("hearing_issues", {
  id: serial("id").primaryKey(),
  hearingId: integer("hearing_id").notNull(),
  issueId: integer("issue_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
