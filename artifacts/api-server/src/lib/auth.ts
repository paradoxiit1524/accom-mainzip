import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Generate a random secret so the server starts. Tokens will be invalidated
  // on restart. Set JWT_SECRET in Railway Variables for stable auth.
  JWT_SECRET = crypto.randomBytes(32).toString("hex");
  console.warn("[SECURITY] JWT_SECRET env var is not set — using a random ephemeral secret. All sessions will reset on restart. Set JWT_SECRET in your environment.");
}

export function generateId(): string {
  return crypto.randomBytes(8).toString("hex");
}

export function generateToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET!, { expiresIn: "30d" });
}

// Async — never blocks the event loop
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 8);
}

// Async — never blocks the event loop
export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface AuthRequest extends Request<Record<string, string>> {
  userId?: string;
  userRole?: string;
}

export const COORDINATOR_ROLES = ["admin", "coordinator", "superadmin"];
export const VOLUNTEER_ROLES = [
  "volunteer",
  "admin",
  "coordinator",
  "superadmin",
];

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ error: "Unauthorized", message: "No token provided" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET!) as {
      userId: string;
      role: string;
    };
    // Always fetch fresh role/hostelId from DB so changes made via the web
    // admin portal (role change, hostel reassignment) take effect immediately
    // without the user needing to log out and back in.
    const [freshUser] = await db
      .select({ role: usersTable.role, hostelId: usersTable.hostelId, assignedHostelIds: usersTable.assignedHostelIds })
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId));
    if (!freshUser) {
      res.status(401).json({ error: "Unauthorized", message: "User account not found" });
      return;
    }
    req.userId = decoded.userId;
    req.userRole = freshUser.role;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized", message: "Invalid token" });
  }
}

export async function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  await requireAuth(req, res, async () => {
    if (!COORDINATOR_ROLES.includes(req.userRole || "")) {
      res
        .status(403)
        .json({ error: "Forbidden", message: "Admin access required" });
      return;
    }
    next();
  });
}

export async function requireSuperAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  await requireAuth(req, res, async () => {
    if (req.userRole !== "superadmin") {
      res
        .status(403)
        .json({ error: "Forbidden", message: "Super Admin access required" });
      return;
    }
    next();
  });
}

export async function requireVolunteer(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  await requireAuth(req, res, async () => {
    if (!VOLUNTEER_ROLES.includes(req.userRole || "")) {
      res.status(403).json({
        error: "Forbidden",
        message: "Volunteer or higher access required",
      });
      return;
    }
    next();
  });
}
