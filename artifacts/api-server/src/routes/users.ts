import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth-middleware";

const router = Router();

router.get("/", requireAdmin, async (req, res): Promise<void> => {
  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      role: usersTable.role,
      active: usersTable.active,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable);
  res.json(users);
});

router.post("/", requireAdmin, async (req, res): Promise<void> => {
  const { username, pin, role } = req.body as {
    username?: string;
    pin?: string;
    role?: "admin" | "operator";
  };

  if (!username || !pin) {
    res.status(400).json({ error: "username and pin are required" });
    return;
  }
  if (!/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "PIN must be exactly 4 digits" });
    return;
  }

  const pinHash = await bcrypt.hash(pin, 10);
  const [user] = await db
    .insert(usersTable)
    .values({
      username: username.toLowerCase(),
      pinHash,
      role: role ?? "operator",
      active: true,
    })
    .returning({
      id: usersTable.id,
      username: usersTable.username,
      role: usersTable.role,
      active: usersTable.active,
      createdAt: usersTable.createdAt,
    });
  res.status(201).json(user);
});

router.put("/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { pin, role, active } = req.body as {
    pin?: string;
    role?: "admin" | "operator";
    active?: boolean;
  };

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (pin !== undefined) {
    if (!/^\d{4}$/.test(pin)) {
      res.status(400).json({ error: "PIN must be exactly 4 digits" });
      return;
    }
    updates.pinHash = await bcrypt.hash(pin, 10);
  }
  if (role !== undefined) updates.role = role;
  if (active !== undefined) updates.active = active;

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning({
      id: usersTable.id,
      username: usersTable.username,
      role: usersTable.role,
      active: usersTable.active,
      createdAt: usersTable.createdAt,
    });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

router.delete("/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (id === req.session.userId) {
    res.status(400).json({ error: "Cannot delete yourself" });
    return;
  }
  const [deleted] = await db
    .delete(usersTable)
    .where(eq(usersTable.id, id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.status(204).end();
});

export default router;
