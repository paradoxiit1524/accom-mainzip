/**
 * Bulk-import all CSV data from /data folder into the local PostgreSQL database.
 * Run with: npx tsx scripts/import-csv-data.ts
 *
 * Files processed:
 *   data/hostels.csv      — 3,074 students with hostel + room + mess
 *   data/DeptMembers2.csv — 52 staff (superadmin/admin/volunteer)
 *   data/MessOnly.csv     — 42 mess-only updates by roll number
 */

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost")
    ? { rejectUnauthorized: false } : false,
  max: 10,
});

function id() { return crypto.randomBytes(8).toString("hex"); }
async function hash(p: string) { return bcrypt.hash(p, 6); }

function normalizeRole(r: string): string {
  const s = r.trim().toLowerCase().replace(/\s+/g, "");
  if (s === "superadmin" || s === "super admin") return "superadmin";
  if (s === "admin") return "admin";
  if (s === "coordinator") return "coordinator";
  if (s === "volunteer") return "volunteer";
  return "student";
}

function normalizePhone(p: string): string {
  if (!p) return "";
  const digits = p.replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

async function main() {
  const client = await pool.connect();
  console.log("Connected to DB.");

  try {
    // ── 1. Ensure hostels exist ──────────────────────────────────────────────
    const REAL_HOSTELS = [
      "Bhadra","Brahmaputra","Cauvery","Ganga","Godavari",
      "Jamuna","Krishna","Mandakini","Narmada","Saraswathi",
      "Sharavathi","Swarnamukhi","Tapti",
    ];
    for (const name of REAL_HOSTELS) {
      await client.query(
        `INSERT INTO hostels (id, name, location) VALUES ($1,$2,$3)
         ON CONFLICT (id) DO NOTHING`,
        [name, name, "IITM Campus"]
      );
    }
    console.log("✓ Hostels ready");

    // ── 2. Import students from hostels.csv ──────────────────────────────────
    const hostelsCsv = fs.readFileSync(path.join(process.cwd(), "data/hostels.csv"), "utf8");
    const students: any[] = parse(hostelsCsv, { columns: true, skip_empty_lines: true, trim: true });

    console.log(`Importing ${students.length} students from hostels.csv...`);
    let inserted = 0, updated = 0, skipped = 0;
    const DEFAULT_PW = await hash("123456");

    for (const row of students) {
      const rollRaw: string = (row["Roll no."] || "").trim();
      const name: string = (row["Name of the Student"] || "").trim();
      const gender: string = (row["Gender"] || "").trim();
      const hostelName: string = (row["Allotted Hostel"] || "").trim();
      const roomNumber: string = (row["Room no."] || "").trim();
      const mess: string = (row["Allotted Mess"] || "").trim();
      const phone: string = normalizePhone(row["Mobile no."] || "");
      const email: string = (row["Email"] || "").trim().toLowerCase();

      if (!rollRaw || !name) { skipped++; continue; }

      const roll = rollRaw.toUpperCase();
      const derivedEmail = email || `${roll.toLowerCase()}@ds.study.iitm.ac.in`;

      // Check if student exists by email or roll number
      const existing = await client.query(
        `SELECT id FROM users WHERE email=$1 OR roll_number=$2 LIMIT 1`,
        [derivedEmail, roll]
      );

      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE users SET
            name=$1, hostel_id=$2, room_number=$3, assigned_mess=$4,
            gender=$5, phone=$6, roll_number=$7, email=$8
           WHERE id=$9`,
          [name, hostelName || null, roomNumber || null, mess || null,
           gender || null, phone || null, roll, derivedEmail, existing.rows[0].id]
        );
        updated++;
      } else {
        await client.query(
          `INSERT INTO users
            (id, name, email, password_hash, role, roll_number, hostel_id, room_number,
             assigned_mess, gender, phone, is_active, assigned_hostel_ids)
           VALUES ($1,$2,$3,$4,'student',$5,$6,$7,$8,$9,$10,true,'[]')
           ON CONFLICT (email) DO NOTHING`,
          [id(), name, derivedEmail, DEFAULT_PW, roll,
           hostelName || null, roomNumber || null, mess || null,
           gender || null, phone || null]
        );
        inserted++;
      }

      if ((inserted + updated) % 200 === 0) {
        process.stdout.write(`  ... ${inserted + updated} processed\r`);
      }
    }
    console.log(`✓ Students: ${inserted} inserted, ${updated} updated, ${skipped} skipped`);

    // ── 3. Update mess allocation from MessOnly.csv ──────────────────────────
    const messCsv = fs.readFileSync(path.join(process.cwd(), "data/MessOnly.csv"), "utf8");
    const messRows: any[] = parse(messCsv, { columns: true, skip_empty_lines: true, trim: true });

    let messUpdated = 0;
    for (const row of messRows) {
      const roll = (row["Roll no."] || "").trim().toUpperCase();
      const mess = (row["Allotted Mess"] || "").trim();
      if (!roll || !mess) continue;
      const r = await client.query(
        `UPDATE users SET assigned_mess=$1 WHERE roll_number=$2`,
        [mess, roll]
      );
      if (r.rowCount && r.rowCount > 0) messUpdated++;
    }
    console.log(`✓ Mess allocations: ${messUpdated} updated`);

    // ── 4. Import staff from DeptMembers2.csv ────────────────────────────────
    const staffCsv = fs.readFileSync(path.join(process.cwd(), "data/DeptMembers2.csv"), "utf8");
    const staffRows: any[] = parse(staffCsv, { columns: true, skip_empty_lines: true, trim: true });

    console.log(`Importing ${staffRows.length} staff from DeptMembers2.csv...`);
    let staffInserted = 0, staffUpdated = 0;

    for (const row of staffRows) {
      const email = (row["Email"] || "").trim().toLowerCase();
      const name = (row["Name"] || "").trim();
      const phone = normalizePhone(row["Contact Number"] || "");
      const gender = (row["Gender"] || "").trim();
      const role = normalizeRole(row["Role"] || "volunteer");

      if (!email || !name) continue;

      const existing = await client.query(
        `SELECT id FROM users WHERE email=$1 LIMIT 1`, [email]
      );

      const pwHash = await hash("123456");

      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE users SET name=$1, role=$2, gender=$3, phone=$4,
            password_hash=$5, is_active=true
           WHERE id=$6`,
          [name, role, gender || null, phone || null, pwHash, existing.rows[0].id]
        );
        staffUpdated++;
      } else {
        // Derive roll number from email prefix
        const roll = email.split("@")[0].toUpperCase();
        await client.query(
          `INSERT INTO users
            (id, name, email, password_hash, role, roll_number, gender, phone,
             is_active, assigned_hostel_ids)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,'[]')
           ON CONFLICT (email) DO NOTHING`,
          [id(), name, email, pwHash, role, roll, gender || null, phone || null]
        );
        staffInserted++;
      }
    }
    console.log(`✓ Staff: ${staffInserted} inserted, ${staffUpdated} updated`);

    // ── 5. Final count ───────────────────────────────────────────────────────
    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role='student') AS students,
        (SELECT COUNT(*) FROM users WHERE role!='student') AS staff,
        (SELECT COUNT(*) FROM hostels) AS hostels
    `);
    const c = counts.rows[0];
    console.log("\n=== Final Database Counts ===");
    console.log(`  Students : ${c.students}`);
    console.log(`  Staff    : ${c.staff}`);
    console.log(`  Hostels  : ${c.hostels}`);
    console.log("=============================\n");
    console.log("All CSV data imported successfully ✓");

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
