import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { worklistsTable } from "./worklists";

export const worklistFoldersTable = pgTable("worklist_folders", {
  id: serial("id").primaryKey(),
  worklistId: integer("worklist_id")
    .notNull()
    .references(() => worklistsTable.id, { onDelete: "cascade" }),
  folderReference: text("folder_reference").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: integer("created_by"),
});

export type WorklistFolder = typeof worklistFoldersTable.$inferSelect;
