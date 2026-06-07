/**
 * Fast CSV master importer — bulk upserts with parallel password hashing.
 * Usage: DATABASE_URL=... pnpm exec tsx ./src/importCsvMaster.ts <csv_path>
 */

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db, usersTable, hostelsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { initSchema } from "./initSchema.js";

const CSV_PATH = process.argv[2] || "";

function genId() { return crypto.randomBytes(8).toString("hex"); }
function cleanPhone(p: string): string | undefined {
  const d = (p || "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? d : undefined;
}

async function main() {
  console.log("[import] Initialising schema…");
  await initSchema();

  if (!CSV_PATH || !fs.existsSync(CSV_PATH)) {
    console.error("[import] CSV file not found:", CSV_PATH);
    process.exit(1);
  }

  console.log(`[import] Reading CSV: ${CSV_PATH}`);
  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parse(raw, {
    columns: true, skip_empty_lines: true, trim: true, relax_column_count: true,
  }) as Record<string, string>[];
  console.log(`[import] ${rows.length} rows parsed`);

  // ── 1. Upsert hostels ─────────────────────────────────────────────────────
  const hostelNames = [...new Set(rows.map(r => r["Allotted Hostel"]).filter(Boolean))];
  const hostelMap: Record<string, string> = {};

  for (const name of hostelNames) {
    const id = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    await db.insert(hostelsTable).values({ id, name, location: "IITM Campus" }).onConflictDoNothing();
    hostelMap[name] = id;
  }
  const allHostels = await db.select().from(hostelsTable);
  for (const h of allHostels) hostelMap[h.name] = h.id;
  console.log(`[import] Hostels ready (${allHostels.length}): ${hostelNames.join(", ")}`);

  // ── 2. Get all existing emails for quick lookup ───────────────────────────
  const existingRows = await db.select({ email: usersTable.email, id: usersTable.id }).from(usersTable);
  const existingEmails = new Map(existingRows.map(r => [r.email.toLowerCase(), r.id]));
  console.log(`[import] ${existingEmails.size} existing users in DB`);

  // ── 3. Parse all rows into new/update buckets ─────────────────────────────
  type StudentRow = {
    id: string; email: string; name: string; roll: string;
    hostelId?: string; roomNumber?: string; assignedMess?: string;
    phone?: string; gender?: string; messCardNo?: string;
  };

  const toInsert: StudentRow[] = [];
  const toUpdate: StudentRow[] = [];
  let skipped = 0;

  for (const row of rows) {
    const roll = (row["Roll no."] || "").trim();
    const email = (row["Email"] || "").trim().toLowerCase();
    const name = (row["Name"] || "").trim();
    if (!roll || !email || !name) { skipped++; continue; }

    const hostelRaw = (row["Allotted Hostel"] || "").trim();
    const rec: StudentRow = {
      id: genId(),
      email,
      name,
      roll,
      hostelId: hostelRaw ? hostelMap[hostelRaw] : undefined,
      roomNumber: (row["Room no."] || "").trim() || undefined,
      assignedMess: (row["Allotted Mess"] || "").trim() || undefined,
      phone: cleanPhone(row["Contact_no"] || ""),
      gender: (row["Gender"] || "").trim() || undefined,
      messCardNo: (row["Serial no. for printing"] || "").trim() || undefined,
    };

    if (existingEmails.has(email)) {
      toUpdate.push(rec);
    } else {
      toInsert.push(rec);
    }
  }

  console.log(`[import] To insert: ${toInsert.length}, to update: ${toUpdate.length}, skipped: ${skipped}`);

  // ── 4. Bulk INSERT new students (hash passwords in parallel batches) ───────
  const HASH_BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += HASH_BATCH) {
    const batch = toInsert.slice(i, i + HASH_BATCH);
    const hashed = await Promise.all(batch.map(r => bcrypt.hash(r.roll.toLowerCase(), 6)));
    const records = batch.map((r, j) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      passwordHash: hashed[j],
      role: "student" as const,
      rollNumber: r.roll,
      hostelId: r.hostelId,
      roomNumber: r.roomNumber,
      assignedMess: r.assignedMess,
      phone: r.phone,
      gender: r.gender,
      messCardNo: r.messCardNo,
      isActive: true,
      assignedHostelIds: "[]",
    }));
    try {
      await db.insert(usersTable).values(records).onConflictDoNothing();
      inserted += records.length;
    } catch {
      for (const rec of records) {
        try { await db.insert(usersTable).values(rec).onConflictDoNothing(); inserted++; } catch {}
      }
    }
    if (i % 200 === 0) console.log(`[import] Inserted: ${inserted}/${toInsert.length}`);
  }

  // ── 5. Bulk UPDATE existing students ─────────────────────────────────────
  let updated = 0;
  const UPDATE_BATCH = 100;
  for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
    const batch = toUpdate.slice(i, i + UPDATE_BATCH);
    for (const r of batch) {
      await db.execute(sql`
        UPDATE users SET
          name = ${r.name},
          roll_number = ${r.roll},
          hostel_id = COALESCE(${r.hostelId ?? null}, hostel_id),
          room_number = COALESCE(${r.roomNumber ?? null}, room_number),
          assigned_mess = COALESCE(${r.assignedMess ?? null}, assigned_mess),
          phone = COALESCE(${r.phone ?? null}, phone),
          gender = COALESCE(${r.gender ?? null}, gender),
          mess_card_no = COALESCE(${r.messCardNo ?? null}, mess_card_no)
        WHERE email = ${r.email}
      `);
      updated++;
    }
    if (i % 500 === 0) console.log(`[import] Updated: ${updated}/${toUpdate.length}`);
  }

  console.log(`[import] ✅ Complete — inserted:${inserted}, updated:${updated}, skipped:${skipped}`);
  process.exit(0);
}

main().catch(e => { console.error("[import] ERROR:", e.message, e.stack); process.exit(1); });
