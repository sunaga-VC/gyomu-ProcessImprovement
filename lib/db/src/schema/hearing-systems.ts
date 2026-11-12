import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const hearingSystemsTable = pgTable("hearing_systems", {
  id: serial("id").primaryKey(),
  hearingId: integer("hearing_id").notNull(),
  systemId: integer("system_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
