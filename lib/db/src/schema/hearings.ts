import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const hearingsTable = pgTable("hearings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  departmentId: integer("department_id"),
  processId: integer("process_id"),
  intervieweeId: integer("interviewee_id"),
  intervieweeName: text("interviewee_name"),
  assigneeName: text("assignee_name"),
  format: text("format"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  conductedAt: timestamp("conducted_at", { withTimezone: true }),
  durationMinutes: integer("duration_minutes"),
  location: text("location"),
  meetingUrl: text("meeting_url"),
  purpose: text("purpose"),
  questions: text("questions"),
  answers: text("answers"),
  decisions: text("decisions"),
  pendingItems: text("pending_items"),
  nextItems: text("next_items"),
  nextScheduledAt: timestamp("next_scheduled_at", { withTimezone: true }),
  nextHearingId: integer("next_hearing_id"),
  status: text("status").notNull().default("not_started"),
  priority: text("priority"),
  boardSortOrder: integer("board_sort_order").notNull().default(0),
  listSortOrder: integer("list_sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertHearingSchema = createInsertSchema(hearingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHearing = z.infer<typeof insertHearingSchema>;
export type Hearing = typeof hearingsTable.$inferSelect;
