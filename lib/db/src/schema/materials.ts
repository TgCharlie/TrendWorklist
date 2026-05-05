import {
  pgTable,
  serial,
  text,
  timestamp,
  real,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const materialsTable = pgTable("materials", {
  id: serial("id").primaryKey(),
  pcode: text("pcode").notNull().unique(),
  displayName: text("display_name").notNull(),
  length: real("length"),
  width: real("width"),
  thickness: real("thickness"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertMaterialSchema = createInsertSchema(materialsTable).omit({
  id: true,
  createdAt: true,
});
export const selectMaterialSchema = createSelectSchema(materialsTable);
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type Material = typeof materialsTable.$inferSelect;
