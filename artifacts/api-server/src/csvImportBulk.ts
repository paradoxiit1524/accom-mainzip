/**
 * Bulk CSV import — runs on Railway after schema init + demo seed.
 * Imports hostels.csv (students), DeptMembers2.csv (staff), MessOnly.csv (mess updates).
 * Uses raw SQL via the pool for maximum speed.
 */
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { pool } from "@workspace/db";

function uid() { return crypto.randomBytes(8).toString("hex"); }
async function hash(p: string) { return bcrypt.hash(p, 6); }

function normalizeRole(r: string): string {
  const s = r.trim().toLowerCase().replace(/\s+/g, "");
  if (s === "superadmin" || s === "super admin") return "superadmin";
  if (s === "admin") return "admin";
  if (s === "coordinator") return "coordinator";
  return "volunteer";
}

function normalizePhone(p: string): string {
  if (!p) return "";
  return p.replace(/\D/g, "").slice(-10);
}

function findCsvFile(filename: string): string | null {
  const candidates = [
    path.join(process.cwd(), "data", filename),
    path.join(process.cwd(), "..", "..", "data", filename),
    path.join("/app", "data", filename),
    path.join("/workspace", "data", filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function importCsvData(): Promise<{
  students: { inserted: number; updated: number };
  staff: { inserted: number; updated: number };
  mess: { updated: number };
}> {
  const client = await pool.connect();
  const result = { students: { inserted: 0, updated: 0 }, staff: { inserted: 0, updated: 0 }, mess: { updated: 0 } };

  try {
    const DEFAULT_PW = await hash("123456");

    // ── Students (hostels.csv) ─────────────────────────────────────────────
    const hostelFile = findCsvFile("hostels.csv");
    if (hostelFile) {
      console.log("[csv-import] Importing students from", hostelFile);
      const rows: any[] = parse(fs.readFileSync(hostelFile, "utf8"), {
        columns: true, skip_empty_lines: true, trim: true,
      });

      for (const row of rows) {
        const roll = (row["Roll no."] || "").trim().toUpperCase();
        const name = (row["Name of the Student"] || "").trim();
        if (!roll || !name) continue;

        const email = (row["Email"] || `${roll.toLowerCase()}@ds.study.iitm.ac.in`).trim().toLowerCase();
        const hostelId = (row["Allotted Hostel"] || "").trim() || null;
        const roomNumber = (row["Room no."] || "").trim() || null;
        const mess = (row["Allotted Mess"] || "").trim() || null;
        const gender = (row["Gender"] || "").trim() || null;
        const phone = normalizePhone(row["Mobile no."] || "") || null;

        const existing = await client.query(
          `SELECT id FROM users WHERE email=$1 OR roll_number=$2 LIMIT 1`,
          [email, roll]
        );

        if (existing.rows.length > 0) {
          await client.query(
            `UPDATE users SET name=$1, hostel_id=$2, room_number=$3, assigned_mess=$4,
             gender=$5, phone=$6, roll_number=$7, email=$8 WHERE id=$9`,
            [name, hostelId, roomNumber, mess, gender, phone, roll, email, existing.rows[0].id]
          );
          result.students.updated++;
        } else {
          await client.query(
            `INSERT INTO users (id, name, email, password_hash, role, roll_number,
              hostel_id, room_number, assigned_mess, gender, phone, is_active, assigned_hostel_ids)
             VALUES ($1,$2,$3,$4,'student',$5,$6,$7,$8,$9,$10,true,'[]')
             ON CONFLICT (email) DO NOTHING`,
            [uid(), name, email, DEFAULT_PW, roll, hostelId, roomNumber, mess, gender, phone]
          );
          result.students.inserted++;
        }
      }

      // Update hostel capacities
      await client.query(`
        UPDATE hostels h SET total_rooms = (
          SELECT COUNT(*) FROM users u WHERE u.hostel_id = h.id AND u.role='student'
        )
      `);
      console.log(`[csv-import] Students: ${result.students.inserted} inserted, ${result.students.updated} updated`);
    } else {
      console.log("[csv-import] hostels.csv not found, skipping student import");
    }

    // ── Staff (DeptMembers2.csv) ───────────────────────────────────────────
    const staffFile = findCsvFile("DeptMembers2.csv");
    if (staffFile) {
      console.log("[csv-import] Importing staff from", staffFile);
      const rows: any[] = parse(fs.readFileSync(staffFile, "utf8"), {
        columns: true, skip_empty_lines: true, trim: true,
      });

      for (const row of rows) {
        const email = (row["Email"] || "").trim().toLowerCase();
        const name = (row["Name"] || "").trim();
        if (!email || !name) continue;

        const role = normalizeRole(row["Role"] || "volunteer");
        const gender = (row["Gender"] || "").trim() || null;
        const phone = normalizePhone(row["Contact Number"] || "") || null;
        const pwHash = await hash("123456");
        const roll = email.split("@")[0].toUpperCase();

        const existing = await client.query(
          `SELECT id FROM users WHERE email=$1 LIMIT 1`, [email]
        );

        if (existing.rows.length > 0) {
          await client.query(
            `UPDATE users SET name=$1, role=$2, gender=$3, phone=$4,
             password_hash=$5, is_active=true WHERE id=$6`,
            [name, role, gender, phone, pwHash, existing.rows[0].id]
          );
          result.staff.updated++;
        } else {
          await client.query(
            `INSERT INTO users (id, name, email, password_hash, role, roll_number,
              gender, phone, is_active, assigned_hostel_ids)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,'[]')
             ON CONFLICT (email) DO NOTHING`,
            [uid(), name, email, pwHash, role, roll, gender, phone]
          );
          result.staff.inserted++;
        }
      }
      console.log(`[csv-import] Staff: ${result.staff.inserted} inserted, ${result.staff.updated} updated`);
    } else {
      console.log("[csv-import] DeptMembers2.csv not found, skipping staff import");
    }

    // ── Mess allocation (MessOnly.csv) ────────────────────────────────────
    const messFile = findCsvFile("MessOnly.csv");
    if (messFile) {
      const rows: any[] = parse(fs.readFileSync(messFile, "utf8"), {
        columns: true, skip_empty_lines: true, trim: true,
      });
      for (const row of rows) {
        const roll = (row["Roll no."] || "").trim().toUpperCase();
        const mess = (row["Allotted Mess"] || "").trim();
        if (!roll || !mess) continue;
        const r = await client.query(
          `UPDATE users SET assigned_mess=$1 WHERE roll_number=$2`, [mess, roll]
        );
        if (r.rowCount && r.rowCount > 0) result.mess.updated++;
      }
      console.log(`[csv-import] Mess allocations updated: ${result.mess.updated}`);
    }

  } finally {
    client.release();
  }

  return result;
}
