import {
  pgTable,
  serial,
  integer,
  char,
  text,
} from "drizzle-orm/pg-core";

export const folderSequencesTable = pgTable("folder_sequences", {
  id: serial("id").primaryKey(),
  machineType: char("machine_type", { length: 1 }).notNull().unique(),
  lastNumber: integer("last_number").notNull().default(0),
});

export const worklistSequenceTable = pgTable("worklist_sequence", {
  id: serial("id").primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
});

export type FolderSequence = typeof folderSequencesTable.$inferSelect;
export type WorklistSequence = typeof worklistSequenceTable.$inferSelect;
