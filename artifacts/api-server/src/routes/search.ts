import { Router } from "express";
import { db, usersTable, hostelsTable } from "@workspace/db";
import { eq, ilike, or, and, inArray, count } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth.js";

const router = Router();

function parseAssignedHostelIds(raw?: string | null): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

// GET /api/search?q=&limit=20&offset=0
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const q = ((req.query.q as string) || "").trim();
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;

  if (!q || q.length < 2) { res.json({ results: [], total: 0 }); return; }

  const [caller] = await db.select({
    id: usersTable.id,
    role: usersTable.role,
    hostelId: usersTable.hostelId,
    assignedHostelIds: usersTable.assignedHostelIds,
  }).from(usersTable).where(eq(usersTable.id, req.userId!));

  if (!caller) { res.status(401).json({ message: "Unauthorized" }); return; }
  if (caller.role === "student") { res.json({ results: [], total: 0 }); return; }

  // Build hostel scope condition
  let hostelCondition: any = undefined;
  if (caller.role === "volunteer") {
    if (!caller.hostelId) { res.json({ results: [], total: 0, limit, offset }); return; }
    hostelCondition = and(eq(usersTable.hostelId, caller.hostelId), eq(usersTable.role, "student"));
  } else if (caller.role === "coordinator" || caller.role === "admin") {
    const assignedIds = parseAssignedHostelIds(caller.assignedHostelIds);
    const scoped = assignedIds.length > 0
      ? Array.from(new Set(assignedIds))
      : (caller.hostelId ? [caller.hostelId] : []);
    if (scoped.length === 0) { res.json({ results: [], total: 0, limit, offset }); return; }
    hostelCondition = inArray(usersTable.hostelId, scoped);
  }

  // DB-level search with ilike — fast even with 20k users
  const searchCondition = or(
    ilike(usersTable.name, `%${q}%`),
    ilike(usersTable.email, `%${q}%`),
    ilike(usersTable.rollNumber, `%${q}%`),
    ilike(usersTable.roomNumber, `%${q}%`),
    ilike(usersTable.assignedMess, `%${q}%`),
    ilike(usersTable.area, `%${q}%`),
    ilike(usersTable.phone, `%${q}%`),
    ilike(usersTable.contactNumber, `%${q}%`),
    ilike(usersTable.messCardNo, `%${q}%`),
  );

  const whereClause = hostelCondition
    ? and(hostelCondition, searchCondition)
    : searchCondition;

  const [{ total }] = await db
    .select({ total: count() })
    .from(usersTable)
    .where(whereClause);

  const paginated = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    rollNumber: usersTable.rollNumber,
    phone: usersTable.phone,
    contactNumber: usersTable.contactNumber,
    gender: usersTable.gender,
    area: usersTable.area,
    hostelId: usersTable.hostelId,
    roomNumber: usersTable.roomNumber,
    assignedMess: usersTable.assignedMess,
    messCardNo: usersTable.messCardNo,
    attendanceStatus: usersTable.attendanceStatus,
    isActive: usersTable.isActive,
  }).from(usersTable)
    .where(whereClause)
    .limit(limit)
    .offset(offset);

  // Enrich with hostel names in one query
  const hostelIds = [...new Set(paginated.map(u => u.hostelId).filter(Boolean) as string[])];
  const hostels = hostelIds.length > 0
    ? await db.select({ id: hostelsTable.id, name: hostelsTable.name })
        .from(hostelsTable)
        .where(inArray(hostelsTable.id, hostelIds))
    : [];
  const hostelMap: Record<string, string> = {};
  hostels.forEach(h => { hostelMap[h.id] = h.name; });

  const results = paginated.map(u => ({
    ...u,
    hostelName: hostelMap[u.hostelId || ""] || null,
  }));

  res.json({ results, total, limit, offset });
});

export default router;
