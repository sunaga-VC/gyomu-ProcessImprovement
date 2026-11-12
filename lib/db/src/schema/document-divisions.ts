import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const documentDivisionsTable = pgTable("document_divisions", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  divisionId: integer("division_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
