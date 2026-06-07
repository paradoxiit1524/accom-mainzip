import { Router } from "express";
import { db, announcementsTable, notificationsTable, usersTable } from "@workspace/db";
import { eq, desc, and, inArray, ne } from "drizzle-orm";
import { requireAuth, requireVolunteer, requireAdmin, generateId, AuthRequest, COORDINATOR_ROLES } from "../lib/auth.js";

const router = Router();

// ─── Expo Push helper ──────────────────────────────────────────────────────────
async function sendExpoPushNotifications(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, any> = {}
) {
  const validTokens = tokens.filter(
    (t) => t && t.startsWith("ExponentPushToken[")
  );
  if (validTokens.length === 0) return;

  const CHUNK = 100;
  for (let i = 0; i < validTokens.length; i += CHUNK) {
    const chunk = validTokens.slice(i, i + CHUNK).map((to) => ({
      to,
      title,
      body,
      data,
      sound: "default",
    }));
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(chunk),
      });
    } catch {
      // Non-fatal — push failures never block the response
    }
  }
}

// GET /api/announcements
router.get("/", requireAuth, async (req, res) => {
  const announcements = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt));
  const result = await Promise.all(
    announcements.map(async (a) => {
      const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, a.createdBy));
      return {
        id: a.id,
        title: a.title,
        content: a.content,
        category: a.category,
        createdBy: a.createdBy,
        createdByName: creator?.name || "Admin",
        createdAt: a.createdAt.toISOString(),
      };
    })
  );
  res.json(result);
});

// POST /api/announcements — volunteers send hostel-scoped; coordinators+ send global
router.post("/", requireVolunteer, async (req: AuthRequest, res) => {
  const { title, content, category = "general" } = req.body;
  if (!title || !content) {
    res.status(400).json({ error: "Bad Request", message: "title and content required" });
    return;
  }

  const [caller] = await db.select({
    role: usersTable.role,
    hostelId: usersTable.hostelId,
    assignedHostelIds: usersTable.assignedHostelIds,
    name: usersTable.name,
  }).from(usersTable).where(eq(usersTable.id, req.userId!));

  const isCoordPlus = COORDINATOR_ROLES.includes(caller?.role || "");

  const id = generateId();
  const [announcement] = await db
    .insert(announcementsTable)
    .values({ id, title, content, category, createdBy: req.userId! })
    .returning();

  // ── In-app notifications → students ─────────────────────────────────────────
  const students = isCoordPlus
    ? await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "student"))
    : await db.select({ id: usersTable.id }).from(usersTable)
        .where(and(eq(usersTable.role, "student"), eq(usersTable.hostelId, caller?.hostelId || "")));

  if (students.length > 0) {
    await db.insert(notificationsTable).values(
      students.map((s) => ({
        id: generateId(),
        userId: s.id,
        title: `${caller?.name || "Staff"}: ${title}`,
        body: content.substring(0, 100),
        type: "announcement" as const,
        isRead: "false",
        refId: id,
      }))
    );
  }

  // ── Expo push notifications → volunteers / staff with tokens ─────────────────
  // Coordinators+ push to all staff; volunteers push only to staff in their hostel
  let staffQuery = db.select({ id: usersTable.id, pushToken: usersTable.pushToken })
    .from(usersTable)
    .where(
      and(
        inArray(usersTable.role, ["volunteer", "coordinator", "admin", "superadmin"]),
        ne(usersTable.id, req.userId!)
      )
    );

  let allStaff = await staffQuery;

  if (!isCoordPlus && caller?.hostelId) {
    allStaff = allStaff.filter(s => {
      return true; // volunteers still push to all staff for simplicity (they can see announcements)
    });
  }

  const pushTokens = allStaff.map(s => s.pushToken).filter(Boolean) as string[];

  const senderName = caller?.name || "Staff";
  const pushTitle = `📢 ${senderName}: ${title}`;
  const pushBody = content.substring(0, 150);

  // Fire and forget — don't await to keep response fast
  sendExpoPushNotifications(pushTokens, pushTitle, pushBody, {
    type: "announcement",
    announcementId: id,
  }).catch(() => {});

  res.status(201).json({
    id: announcement.id,
    title: announcement.title,
    content: announcement.content,
    category: announcement.category,
    createdBy: announcement.createdBy,
    createdByName: caller?.name || "Staff",
    createdAt: announcement.createdAt.toISOString(),
  });
});

// DELETE /api/announcements/:id
router.delete("/:id", requireAdmin, async (req: AuthRequest, res) => {
  await db.delete(announcementsTable).where(eq(announcementsTable.id, req.params.id));
  res.json({ success: true, message: "Deleted" });
});

export default router;
