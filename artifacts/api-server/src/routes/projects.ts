import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware";
import { findProjectsCached, findCutlistsByProject } from "../lib/filemaker";

const router = Router();

router.get("/", requireAuth, async (req, res): Promise<void> => {
  try {
    const search = req.query.search as string | undefined;
    const projects = await findProjectsCached(search);
    res.json(projects);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: message });
  }
});

router.get("/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const projectId = req.params.id as string;
    const all = await findProjectsCached();
    const project = all.find((p) => String(p.id) === projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(project);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: message });
  }
});

export default router;
