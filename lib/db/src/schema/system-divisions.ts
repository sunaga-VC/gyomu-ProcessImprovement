import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const systemDivisionsTable = pgTable("system_divisions", {
  id: serial("id").primaryKey(),
  systemId: integer("system_id").notNull(),
  divisionId: integer("division_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
