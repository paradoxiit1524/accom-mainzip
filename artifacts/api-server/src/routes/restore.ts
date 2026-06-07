/**
 * POST /api/admin/restore-data
 * One-time bulk data restore endpoint.
 * Requires header: X-Restore-Secret matching RESTORE_SECRET env var.
 * Accepts: { hostels: [...], users: [...] }
 * Idempotent — uses ON CONFLICT DO UPDATE for both tables.
 */
import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

const RESTORE_SECRET = process.env.RESTORE_SECRET || "";

router.post("/restore-data", async (req: Request, res: Response) => {
  const secret = req.headers["x-restore-secret"] as string || "";
  if (!RESTORE_SECRET || secret !== RESTORE_SECRET) {
    res.status(403).json({ error: "Forbidden", message: "Invalid or missing restore secret" });
    return;
  }

  const { hostels = [], users = [] } = req.body as {
    hostels: Array<{ id: string; name: string; location?: string }>;
    users: Array<{
      id: string; name: string; email: string; password_hash: string;
      role: string; roll_number?: string; phone?: string; contact_number?: string;
      gender?: string; hostel_id?: string; room_number?: string; assigned_mess?: string;
      mess_card_no?: string; is_active?: boolean; assigned_hostel_ids?: string;
    }>;
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Upsert hostels
    for (const h of hostels) {
      await client.query(
        `INSERT INTO hostels (id, name, location, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, location = EXCLUDED.location`,
        [h.id, h.name, h.location || "IITM Campus"]
      );
    }

    // Upsert users in chunks of 100
    const CHUNK = 100;
    for (let i = 0; i < users.length; i += CHUNK) {
      const chunk = users.slice(i, i + CHUNK);
      for (const u of chunk) {
        await client.query(
          `INSERT INTO users
             (id, name, email, password_hash, role, roll_number, phone, contact_number,
              gender, hostel_id, room_number, assigned_mess, mess_card_no,
              is_active, assigned_hostel_ids, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
           ON CONFLICT (email) DO UPDATE SET
             name=EXCLUDED.name, password_hash=EXCLUDED.password_hash,
             role=EXCLUDED.role, roll_number=EXCLUDED.roll_number,
             phone=EXCLUDED.phone, contact_number=EXCLUDED.contact_number,
             gender=EXCLUDED.gender, hostel_id=EXCLUDED.hostel_id,
             room_number=EXCLUDED.room_number, assigned_mess=EXCLUDED.assigned_mess,
             mess_card_no=EXCLUDED.mess_card_no, is_active=EXCLUDED.is_active,
             assigned_hostel_ids=EXCLUDED.assigned_hostel_ids`,
          [
            u.id, u.name, u.email, u.password_hash, u.role,
            u.roll_number || null, u.phone || null, u.contact_number || null,
            u.gender || null, u.hostel_id || null, u.room_number || null,
            u.assigned_mess || null, u.mess_card_no || null,
            u.is_active !== false, u.assigned_hostel_ids || "[]",
          ]
        );
      }
    }

    await client.query("COMMIT");
    res.json({
      success: true,
      message: `Restored ${hostels.length} hostels and ${users.length} users`,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("[restore] Error:", err.message);
    res.status(500).json({ error: "Restore failed", message: err.message });
  } finally {
    client.release();
  }
});

export default router;
