import { pgTable, text, serial, integer, boolean, timestamp, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const systemsTable = pgTable("systems", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  systemType: text("system_type"),
  url: text("url"),
  monthlyFee: numeric("monthly_fee"),
  annualFee: numeric("annual_fee"),
  contractUntil: date("contract_until", { mode: "string" }),
  accountCount: integer("account_count"),
  isActive: boolean("is_active").notNull().default(true),
  isBeingDiscontinued: boolean("is_being_discontinued").notNull().default(false),
  issues: text("issues"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSystemSchema = createInsertSchema(systemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSystem = z.infer<typeof insertSystemSchema>;
export type SystemRecord = typeof systemsTable.$inferSelect;
