import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();

router.post("/login", async (req, res): Promise<void> => {
  const { username, pin } = req.body as { username?: string; pin?: string };

  if (!username || !pin) {
    res.status(400).json({ error: "username and pin are required" });
    return;
  }

  if (!/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "PIN must be exactly 4 digits" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username.toLowerCase()))
    .limit(1);

  if (!user || !user.active) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(pin, user.pinHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.username = user.username;

  req.session.save((err) => {
    if (err) {
      req.log?.error(err, "Session save error");
      res.status(500).json({ error: "Session save failed" });
      return;
    }
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
    });
  });
});

router.post("/logout", (req, res): void => {
  req.session.destroy(() => {
    res.json({ message: "Logged out" });
  });
});

router.get("/me", requireAuth, (req, res): void => {
  res.json({
    id: req.session.userId,
    username: req.session.username,
    role: req.session.role,
  });
});

export default router;
