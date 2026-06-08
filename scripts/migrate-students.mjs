/**
 * Student data migration — Paradox '26
 * Optimised: async bcrypt cost-6, parallel hashing + batch inserts
 * Run: node scripts/migrate-students.mjs
 */

import { readdirSync } from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";
import bcrypt from "bcryptjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

// ─── Read Excel ───────────────────────────────────────────────────────────────
const xlsxFile = readdirSync(join(__dirname, "../attached_assets")).find(f => f.endsWith(".xlsx"));
console.log(`Reading: ${xlsxFile}`);
const wb = XLSX.readFile(join(__dirname, "../attached_assets", xlsxFile));
const ws = wb.Sheets[wb.SheetNames[0]];
const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
const dataRows = rawRows.slice(1).filter(r => r[2]);
console.log(`Found ${dataRows.length} student rows`);

const COL = { messCardNo:1, roll:2, name:3, gender:4, hostel:5, room:6, assignedMess:13, email:18, contact:19 };

function toHostelId(name) {
  // "Mandakini - B" → "Mandakini-B"
  return name.trim().replace(/\s*-\s*/g, "-").replace(/\s+/g, "-");
}

// ─── Phase 1: pre-hash all passwords in parallel (cost 6) ────────────────────
console.log("Hashing passwords (cost 6, async)…");
const t0 = Date.now();

const seenRolls = new Set();
const students = [];
for (const row of dataRows) {
  const roll = String(row[COL.roll] || "").trim().toLowerCase();
  if (!roll || seenRolls.has(roll)) continue;
  seenRolls.add(roll);
  const email = String(row[COL.email] || `${roll}@ds.study.iitm.ac.in`).trim().toLowerCase();
  const hostelName = String(row[COL.hostel] || "").trim();
  students.push({
    id: roll,
    name: String(row[COL.name] || "").trim(),
    email,
    roll,
    gender: String(row[COL.gender] || "").trim() || null,
    hostelId: hostelName ? toHostelId(hostelName) : null,
    roomNumber: row[COL.room] ? String(row[COL.room]).trim() : null,
    assignedMess: row[COL.assignedMess] ? String(row[COL.assignedMess]).trim() : null,
    contact: row[COL.contact] ? String(row[COL.contact]).trim() : null,
    messCardNo: row[COL.messCardNo] ? String(row[COL.messCardNo]).trim() : null,
  });
}

// Hash in parallel chunks of 50
const HASH_CHUNK = 50;
const hashes = new Array(students.length);
for (let i = 0; i < students.length; i += HASH_CHUNK) {
  const chunk = students.slice(i, i + HASH_CHUNK);
  const results = await Promise.all(chunk.map(s => bcrypt.hash(s.roll, 6)));
  results.forEach((h, j) => { hashes[i + j] = h; });
  if (i % 500 === 0) process.stdout.write(`  ${i}/${students.length} hashed\r`);
}
console.log(`\nHashing done in ${((Date.now()-t0)/1000).toFixed(1)}s`);

// ─── Phase 2: DB operations ───────────────────────────────────────────────────
const EXISTING_HOSTEL_IDS = new Set([
  "Bhadra","Brahmaputra","Cauvery","Ganga","Godavari",
  "Jamuna","Krishna","Mandakini","Narmada","Saraswathi",
  "Sharavathi","Swarnamukhi","Tapti",
]);

const uniqueHostelIds = [...new Set(students.map(s => s.hostelId).filter(Boolean))];
const missingHostels = uniqueHostelIds
  .filter(id => !EXISTING_HOSTEL_IDS.has(id))
  .map(id => {
    // Restore readable name from id
    const name = id.replace(/-/g, " ").replace("Mandakini B", "Mandakini - B");
    return { id, name };
  });

console.log("Missing hostels:", missingHostels.map(h=>h.id));

const client = await pool.connect();
try {
  await client.query("BEGIN");

  // 1. Add missing hostels
  for (const h of missingHostels) {
    await client.query(
      `INSERT INTO hostels (id, name, created_at) VALUES ($1,$2,NOW()) ON CONFLICT (id) DO NOTHING`,
      [h.id, h.name]
    );
    console.log(`  + Hostel: ${h.id} ("${h.name}")`);
  }

  // 2. Get existing student IDs and purge related data
  const { rows: existingStudents } = await client.query(
    `SELECT id FROM users WHERE role='student'`
  );
  const existingIds = existingStudents.map(r => r.id);
  console.log(`Purging ${existingIds.length} existing students…`);

  if (existingIds.length > 0) {
    const ph = existingIds.map((_,i)=>`$${i+1}`).join(",");
    await client.query(`DELETE FROM student_inventory WHERE student_id IN (${ph})`, existingIds);
    await client.query(`DELETE FROM checkins WHERE student_id IN (${ph})`, existingIds);
    await client.query(`DELETE FROM attendance WHERE student_id IN (${ph})`, existingIds);
    await client.query(`DELETE FROM time_logs WHERE user_id IN (${ph})`, existingIds);
    await client.query(`DELETE FROM notifications WHERE user_id IN (${ph})`, existingIds);
    await client.query(`DELETE FROM lost_items WHERE reported_by IN (${ph})`, existingIds);
  }
  await client.query(`DELETE FROM users WHERE role='student'`);
  console.log("Purge done");

  // 3. Batch INSERT students (100 per statement)
  const INSERT_BATCH = 100;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < students.length; i += INSERT_BATCH) {
    const batch = students.slice(i, i + INSERT_BATCH);
    const batchHashes = hashes.slice(i, i + INSERT_BATCH);

    const values = [];
    const params = [];
    let pi = 1;

    for (let j = 0; j < batch.length; j++) {
      const s = batch[j];
      const h = batchHashes[j];
      values.push(`($${pi},$${pi+1},$${pi+2},$${pi+3},'student',$${pi+4},$${pi+5},$${pi+6},$${pi+7},$${pi+8},$${pi+9},$${pi+10},true,'[]',NOW())`);
      params.push(s.id, s.name, s.email, h, s.roll, s.gender, s.hostelId, s.roomNumber, s.assignedMess, s.contact, s.messCardNo);
      pi += 11;
    }

    try {
      const res = await client.query(
        `INSERT INTO users
           (id,name,email,password_hash,role,roll_number,gender,hostel_id,
            room_number,assigned_mess,contact_number,mess_card_no,is_active,
            assigned_hostel_ids,created_at)
         VALUES ${values.join(",")}
         ON CONFLICT (email) DO UPDATE SET
           name=EXCLUDED.name, roll_number=EXCLUDED.roll_number,
           gender=EXCLUDED.gender, hostel_id=EXCLUDED.hostel_id,
           room_number=EXCLUDED.room_number, assigned_mess=EXCLUDED.assigned_mess,
           contact_number=EXCLUDED.contact_number, mess_card_no=EXCLUDED.mess_card_no`,
        params
      );
      inserted += batch.length;
    } catch (err) {
      console.warn(`  Batch ${i}-${i+INSERT_BATCH} failed (${err.message.slice(0,80)}), inserting one-by-one…`);
      for (let j = 0; j < batch.length; j++) {
        const s = batch[j];
        try {
          await client.query(
            `INSERT INTO users (id,name,email,password_hash,role,roll_number,gender,hostel_id,room_number,assigned_mess,contact_number,mess_card_no,is_active,assigned_hostel_ids,created_at)
             VALUES ($1,$2,$3,$4,'student',$5,$6,$7,$8,$9,$10,$11,true,'[]',NOW())
             ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name,roll_number=EXCLUDED.roll_number,gender=EXCLUDED.gender,hostel_id=EXCLUDED.hostel_id,room_number=EXCLUDED.room_number,assigned_mess=EXCLUDED.assigned_mess,contact_number=EXCLUDED.contact_number,mess_card_no=EXCLUDED.mess_card_no`,
            [s.id, s.name, s.email, batchHashes[j], s.roll, s.gender, s.hostelId, s.roomNumber, s.assignedMess, s.contact, s.messCardNo]
          );
          inserted++;
        } catch (e2) {
          console.warn(`  SKIP ${s.roll}: ${e2.message.slice(0,60)}`);
          skipped++;
        }
      }
    }

    if (i % 500 === 0) console.log(`  Inserted ${Math.min(i+INSERT_BATCH, students.length)}/${students.length}`);
  }

  await client.query("COMMIT");
  console.log(`\n✓ Migration complete! Inserted: ${inserted}, Skipped: ${skipped}`);
  console.log(`  Total time: ${((Date.now()-t0)/1000).toFixed(1)}s`);

  // Summary
  const { rows: counts } = await client.query(
    `SELECT hostel_id, COUNT(*) as n FROM users WHERE role='student' GROUP BY hostel_id ORDER BY n DESC`
  );
  console.log("\nStudents per hostel:");
  for (const r of counts) console.log(`  ${(r.hostel_id||"(none)").padEnd(20)} ${r.n}`);

} catch (err) {
  await client.query("ROLLBACK");
  console.error("\nROLLBACK:", err.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
