import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware";
import { getStockLevel } from "../lib/filemaker";

const router = Router();

router.get("/:pcode", requireAuth, async (req, res): Promise<void> => {
  const pcode = String(req.params.pcode);
  try {
    const stock = await getStockLevel(pcode);
    if (!stock) {
      res.status(404).json({ error: "PCODE not found in StockBook" });
      return;
    }
    res.json(stock);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: message });
  }
});

export default router;
