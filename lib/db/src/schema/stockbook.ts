import {
  pgTable,
  serial,
  text,
  real,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const stockbookTable = pgTable("stockbook", {
  id: serial("id").primaryKey(),
  pcode: text("pcode").notNull().unique(),
  description: text("description").notNull().default(""),
  qtyOnHand: real("qty_on_hand").notNull().default(0),
  unit: text("unit"),
  location: text("location"),
  otype: text("otype"),
  project: text("project"),
  pid: text("pid"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertStockbookSchema = createInsertSchema(stockbookTable).omit({
  id: true,
  updatedAt: true,
});
export const selectStockbookSchema = createSelectSchema(stockbookTable);
export type InsertStockbookItem = z.infer<typeof insertStockbookSchema>;
export type StockbookItem = typeof stockbookTable.$inferSelect;
