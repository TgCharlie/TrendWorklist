import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { worklistsTable } from "./worklists";
import { materialsTable } from "./materials";

export const worklistItemsTable = pgTable("worklist_items", {
  id: serial("id").primaryKey(),
  worklistId: integer("worklist_id")
    .notNull()
    .references(() => worklistsTable.id, { onDelete: "cascade" }),
  materialId: integer("material_id").references(() => materialsTable.id, {
    onDelete: "set null",
  }),
  pcode: text("pcode"),
  displayName: text("display_name"),
  quantity: integer("quantity").notNull().default(1),
  length: numeric("length", { precision: 10, scale: 2 }),
  width: numeric("width", { precision: 10, scale: 2 }),
  thickness: numeric("thickness", { precision: 10, scale: 2 }),
  notes: text("notes"),
});

export const insertWorklistItemSchema = createInsertSchema(
  worklistItemsTable,
).omit({ id: true });
export const selectWorklistItemSchema = createSelectSchema(worklistItemsTable);
export type InsertWorklistItem = z.infer<typeof insertWorklistItemSchema>;
export type WorklistItem = typeof worklistItemsTable.$inferSelect;
