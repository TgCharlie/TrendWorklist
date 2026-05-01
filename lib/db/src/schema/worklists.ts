import {
  pgTable,
  serial,
  text,
  integer,
  jsonb,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const worklistStatusEnum = pgEnum("worklist_status", [
  "draft",
  "active",
  "complete",
]);

export const machineTypeEnum = pgEnum("machine_type", ["B", "C"]);

export const worklistsTable = pgTable("worklists", {
  id: serial("id").primaryKey(),
  worklistNumber: text("worklist_number").notNull().unique(),
  projectId: text("project_id"),
  projectNumber: text("project_number"),
  projectAddress: text("project_address"),
  cutlistRefs: jsonb("cutlist_refs").default([]),
  machineType: machineTypeEnum("machine_type").notNull(),
  folderNumber: integer("folder_number").notNull(),
  status: worklistStatusEnum("status").notNull().default("draft"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertWorklistSchema = createInsertSchema(worklistsTable).omit({
  id: true,
  worklistNumber: true,
  folderNumber: true,
  createdAt: true,
});
export const selectWorklistSchema = createSelectSchema(worklistsTable);
export type InsertWorklist = z.infer<typeof insertWorklistSchema>;
export type Worklist = typeof worklistsTable.$inferSelect;
