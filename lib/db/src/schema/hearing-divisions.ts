import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const hearingDivisionsTable = pgTable("hearing_divisions", {
  id: serial("id").primaryKey(),
  hearingId: integer("hearing_id").notNull(),
  divisionId: integer("division_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
