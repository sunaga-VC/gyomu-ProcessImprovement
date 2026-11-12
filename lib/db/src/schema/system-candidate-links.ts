import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const systemCandidateLinksTable = pgTable("system_candidate_links", {
  id: serial("id").primaryKey(),
  systemCandidateId: integer("system_candidate_id").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
