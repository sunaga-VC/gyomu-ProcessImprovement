import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const improvementHearingsTable = pgTable("improvement_hearings", {
  id: serial("id").primaryKey(),
  improvementId: integer("improvement_id").notNull(),
  hearingId: integer("hearing_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
