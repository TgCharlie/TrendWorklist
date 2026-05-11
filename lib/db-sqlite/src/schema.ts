import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  role: text("role", { enum: ["admin", "operator"] }).notNull().default("operator"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export const selectUserSchema = createSelectSchema(usersTable);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const materialsTable = sqliteTable("materials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pcode: text("pcode").notNull().unique(),
  displayName: text("display_name").notNull(),
  length: integer("length"),
  width: integer("width"),
  thickness: integer("thickness"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertMaterialSchema = createInsertSchema(materialsTable).omit({ id: true, createdAt: true });
export const selectMaterialSchema = createSelectSchema(materialsTable);
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type Material = typeof materialsTable.$inferSelect;

export const worklistsTable = sqliteTable("worklists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  worklistNumber: text("worklist_number").notNull().unique(),
  projectId: text("project_id"),
  projectNumber: text("project_number"),
  projectAddress: text("project_address"),
  cutlistRefs: text("cutlist_refs", { mode: "json" }).$type<string[]>().default([]),
  machineType: text("machine_type", { enum: ["B", "C"] }).notNull(),
  folderNumber: integer("folder_number").notNull(),
  status: text("status", { enum: ["draft", "active", "complete"] }).notNull().default("draft"),
  createdBy: integer("created_by"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
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

export const worklistItemsTable = sqliteTable("worklist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  worklistId: integer("worklist_id")
    .notNull()
    .references(() => worklistsTable.id, { onDelete: "cascade" }),
  materialId: integer("material_id").references(() => materialsTable.id, { onDelete: "set null" }),
  pcode: text("pcode"),
  displayName: text("display_name"),
  quantity: integer("quantity").notNull().default(1),
  length: text("length"),
  width: text("width"),
  thickness: text("thickness"),
  notes: text("notes"),
});

export const insertWorklistItemSchema = createInsertSchema(worklistItemsTable).omit({ id: true });
export const selectWorklistItemSchema = createSelectSchema(worklistItemsTable);
export type InsertWorklistItem = z.infer<typeof insertWorklistItemSchema>;
export type WorklistItem = typeof worklistItemsTable.$inferSelect;

export const worklistFoldersTable = sqliteTable("worklist_folders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  worklistId: integer("worklist_id")
    .notNull()
    .references(() => worklistsTable.id, { onDelete: "cascade" }),
  folderReference: text("folder_reference").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  createdBy: integer("created_by"),
});

export type WorklistFolder = typeof worklistFoldersTable.$inferSelect;

export const folderSequencesTable = sqliteTable("folder_sequences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  machineType: text("machine_type").notNull().unique(),
  lastNumber: integer("last_number").notNull().default(0),
});

export const worklistSequenceTable = sqliteTable("worklist_sequence", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lastNumber: integer("last_number").notNull().default(0),
});

export type FolderSequence = typeof folderSequencesTable.$inferSelect;
export type WorklistSequence = typeof worklistSequenceTable.$inferSelect;

export const appSettingsTable = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type AppSetting = typeof appSettingsTable.$inferSelect;

export const userFavouritesTable = sqliteTable(
  "user_favourites",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    materialId: integer("material_id")
      .notNull()
      .references(() => materialsTable.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("user_favourites_unique").on(table.userId, table.materialId)],
);

export const stockbookTable = sqliteTable("stockbook", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pcode: text("pcode").notNull().unique(),
  description: text("description").notNull().default(""),
  qtyOnHand: real("qty_on_hand").notNull().default(0),
  cost: real("cost"),
  costSub: real("cost_sub"),
  unit: text("unit"),
  location: text("location"),
  otype: text("otype"),
  project: text("project"),
  pid: text("pid"),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertStockbookSchema = createInsertSchema(stockbookTable).omit({ id: true, updatedAt: true });
export const selectStockbookSchema = createSelectSchema(stockbookTable);
export type InsertStockbookItem = z.infer<typeof insertStockbookSchema>;
export type StockbookItem = typeof stockbookTable.$inferSelect;
