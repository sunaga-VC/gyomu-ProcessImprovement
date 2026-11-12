import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const hearingDocumentsTable = pgTable("hearing_documents", {
  id: serial("id").primaryKey(),
  hearingId: integer("hearing_id").notNull(),
  documentId: integer("document_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
