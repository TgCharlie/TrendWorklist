import { Router } from "express";
import { db, folderSequencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

router.get("/next", requireAuth, async (req, res): Promise<void> => {
  const machine = req.query.machine as string | undefined;
  if (!machine || !["B", "C"].includes(machine)) {
    res.status(400).json({ error: "machine query parameter must be B or C" });
    return;
  }
  const machineType = machine as "B" | "C";

  const [seq] = await db
    .select()
    .from(folderSequencesTable)
    .where(eq(folderSequencesTable.machineType, machineType))
    .limit(1);

  const next = seq ? seq.lastNumber + 1 : 1;
  const formatted = `${machineType}${String(next).padStart(4, "0")}`;

  res.json({ machineType, next, formatted });
});

export default router;
