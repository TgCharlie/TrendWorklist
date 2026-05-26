import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware";
import { findCutlistsByProject, findCutlistById } from "../lib/filemaker";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", requireAuth, async (req, res): Promise<void> => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) {
    res.status(400).json({ error: "projectId query parameter is required" });
    return;
  }
  try {
    const cutlists = await findCutlistsByProject(projectId);
    res.json(cutlists);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: message });
  }
});

router.get("/:cutlistId", requireAuth, async (req, res): Promise<void> => {
  const cutlistId = String(req.params.cutlistId);
  try {
    const cutlist = await findCutlistById(cutlistId);
    if (!cutlist) {
      res.status(404).json({ error: "Cutlist not found" });
      return;
    }
    logger.info({ cutlistKeys: Object.keys(cutlist), projectName: cutlist["projectName"], ProjectName: cutlist["ProjectName"] }, "cutlist debug fields");
    res.json(cutlist);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: message });
  }
});

export default router;
