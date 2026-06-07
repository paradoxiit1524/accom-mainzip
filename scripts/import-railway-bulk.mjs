/**
 * Ultra-fast Railway bulk import — single INSERT per table, no per-row round trips.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");
const { parse } = require("csv-parse/sync");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const pool = new Pool({
  connectionString: process.env.RAILWAY_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  connectionTimeoutMillis: 20000,
  idleTimeoutMillis: 30000,
});

function uid() { return crypto.randomBytes(8).toString("hex"); }
function normalizePhone(p) {
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-10) : null;
}
function normalizeRole(r) {
  const s = (r||"").trim().toLowerCase().replace(/\s+/g,"");
  if (s === "superadmin" || s === "super admin") return "superadmin";
  if (s === "admin") return "admin";
  if (s === "coordinator") return "coordinator";
  return "volunteer";
}

async function main() {
  const client = await pool.connect();
  console.log("Connected to Railway DB.");

  try {
    // Single hash for all students (bcrypt is slow, do it once)
    const STUDENT_PW = await bcrypt.hash("123456", 6);
    console.log("Password hash computed.");

    // ── Hostels ───────────────────────────────────────────────────────────────
    const HOSTELS = ["Bhadra","Brahmaputra","Cauvery","Ganga","Godavari",
      "Jamuna","Krishna","Mandakini","Narmada","Saraswathi","Sharavathi","Swarnamukhi","Tapti"];

    const hostelValues = HOSTELS.map((n,i) => `($${i*3+1},$${i*3+2},$${i*3+3})`).join(",");
    const hostelParams = HOSTELS.flatMap(n => [n, n, "IITM Campus"]);
    await client.query(
      `INSERT INTO hostels(id,name,location) VALUES ${hostelValues} ON CONFLICT(id) DO NOTHING`,
      hostelParams
    );
    console.log("✓ 13 hostels ready");

    // ── Students — build one big parameterised INSERT ─────────────────────────
    const hostelsCsv = fs.readFileSync(path.join(ROOT,"data/hostels.csv"),"utf8");
    const students = parse(hostelsCsv, { columns:true, skip_empty_lines:true, trim:true });
    console.log(`Building insert for ${students.length} students...`);

    const rows = [];
    for (const row of students) {
      const roll = (row["Roll no."]||"").trim().toUpperCase();
      const name = (row["Name of the Student"]||"").trim();
      if (!roll || !name) continue;
      const email = ((row["Email"]||"").trim().toLowerCase()) || `${roll.toLowerCase()}@ds.study.iitm.ac.in`;
      rows.push({
        id: uid(),
        name,
        email,
        passwordHash: STUDENT_PW,
        role: "student",
        rollNumber: roll,
        hostelId: (row["Allotted Hostel"]||"").trim()||null,
        roomNumber: (row["Room no."]||"").trim()||null,
        assignedMess: (row["Allotted Mess"]||"").trim()||null,
        gender: (row["Gender"]||"").trim()||null,
        phone: normalizePhone(row["Mobile no."]),
      });
    }

    // Insert in chunks of 500 rows (PostgreSQL param limit ~65535)
    const CHUNK = 500;
    let totalInserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const cols = 11;
      const placeholders = chunk.map((_, ri) =>
        `($${ri*cols+1},$${ri*cols+2},$${ri*cols+3},$${ri*cols+4},$${ri*cols+5},$${ri*cols+6},$${ri*cols+7},$${ri*cols+8},$${ri*cols+9},$${ri*cols+10},$${ri*cols+11})`
      ).join(",");
      const params = chunk.flatMap(r => [
        r.id, r.name, r.email, r.passwordHash, r.role,
        r.rollNumber, r.hostelId, r.roomNumber, r.assignedMess, r.gender, r.phone
      ]);
      const result = await client.query(
        `INSERT INTO users(id,name,email,password_hash,role,roll_number,hostel_id,room_number,assigned_mess,gender,phone)
         VALUES ${placeholders}
         ON CONFLICT(email) DO UPDATE SET
           name=EXCLUDED.name, hostel_id=EXCLUDED.hostel_id,
           room_number=EXCLUDED.room_number, assigned_mess=EXCLUDED.assigned_mess,
           gender=EXCLUDED.gender, phone=EXCLUDED.phone, roll_number=EXCLUDED.roll_number`,
        params
      );
      totalInserted += result.rowCount || 0;
      process.stdout.write(`  ${Math.min(i+CHUNK, rows.length)}/${rows.length} students...\r`);
    }
    console.log(`\n✓ Students upserted: ${totalInserted}`);

    // Update hostel room counts
    await client.query(`UPDATE hostels h SET total_rooms=(SELECT COUNT(*) FROM users u WHERE u.hostel_id=h.id AND u.role='student')`);

    // ── Staff — DeptMembers2.csv ──────────────────────────────────────────────
    const staffCsv = fs.readFileSync(path.join(ROOT,"data/DeptMembers2.csv"),"utf8");
    const staffRows = parse(staffCsv, { columns:true, skip_empty_lines:true, trim:true });
    console.log(`Importing ${staffRows.length} staff...`);

    // Hash once per role (only 4 needed)
    const STAFF_PW = await bcrypt.hash("123456", 8);

    const staffData = staffRows
      .map(row => ({
        id: uid(),
        name: (row["Name"]||"").trim(),
        email: (row["Email"]||"").trim().toLowerCase(),
        role: normalizeRole(row["Role"]),
        gender: (row["Gender"]||"").trim()||null,
        phone: normalizePhone(row["Contact Number"]),
        roll: (row["Email"]||"").split("@")[0].toUpperCase(),
      }))
      .filter(r => r.email && r.name);

    const sCols = 8;
    const sPlaceholders = staffData.map((_,ri) =>
      `($${ri*sCols+1},$${ri*sCols+2},$${ri*sCols+3},$${ri*sCols+4},$${ri*sCols+5},$${ri*sCols+6},$${ri*sCols+7},$${ri*sCols+8})`
    ).join(",");
    const sParams = staffData.flatMap(r => [r.id, r.name, r.email, STAFF_PW, r.role, r.roll, r.gender, r.phone]);

    await client.query(
      `INSERT INTO users(id,name,email,password_hash,role,roll_number,gender,phone)
       VALUES ${sPlaceholders}
       ON CONFLICT(email) DO UPDATE SET
         name=EXCLUDED.name, role=EXCLUDED.role,
         gender=EXCLUDED.gender, phone=EXCLUDED.phone,
         password_hash=EXCLUDED.password_hash, is_active=true`,
      sParams
    );
    console.log(`✓ Staff upserted: ${staffData.length}`);

    // ── Demo accounts (guaranteed always present + correct password) ──────────
    const demos = [
      { email:"superadmin@iitm.ac.in", name:"Super Admin",     role:"superadmin", hostelId:null,    roll:"21f3001001", assignedHostelIds:"[]" },
      { email:"admin@iitm.ac.in",      name:"Admin User",      role:"admin",       hostelId:null,    roll:"21f3001002", assignedHostelIds:'["Bhadra","Brahmaputra","Cauvery","Ganga"]' },
      { email:"coordinator@iitm.ac.in",name:"Coordinator User",role:"coordinator", hostelId:"Bhadra",roll:"21f3001003", assignedHostelIds:'["Bhadra","Brahmaputra"]' },
      { email:"volunteer@iitm.ac.in",  name:"Volunteer User",  role:"volunteer",   hostelId:"Bhadra",roll:"21f3001004", assignedHostelIds:"[]" },
      { email:"student@iitm.ac.in",    name:"Student User",    role:"student",     hostelId:"Bhadra",roll:"21f3000000", assignedHostelIds:"[]" },
    ];
    for (const d of demos) {
      const pw = await bcrypt.hash("123456", 8);
      await client.query(
        `INSERT INTO users(id,name,email,password_hash,role,hostel_id,roll_number,is_active,assigned_hostel_ids)
         VALUES($1,$2,$3,$4,$5,$6,$7,true,$8)
         ON CONFLICT(email) DO UPDATE SET
           password_hash=EXCLUDED.password_hash, role=EXCLUDED.role,
           hostel_id=EXCLUDED.hostel_id, assigned_hostel_ids=EXCLUDED.assigned_hostel_ids, is_active=true`,
        [uid(), d.name, d.email, pw, d.role, d.hostelId, d.roll, d.assignedHostelIds]
      );
    }
    console.log("✓ Demo accounts ready");

    // ── Final counts ──────────────────────────────────────────────────────────
    const r = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role='student') students,
        (SELECT COUNT(*) FROM users WHERE role!='student') staff,
        (SELECT COUNT(*) FROM hostels) hostels
    `);
    const c = r.rows[0];
    console.log("\n=== Railway DB Final Counts ===");
    console.log(`  Students : ${c.students}`);
    console.log(`  Staff    : ${c.staff}`);
    console.log(`  Hostels  : ${c.hostels}`);
    console.log("================================");
    console.log("All data is live on Railway!");

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error("FAILED:", e.message, e.stack); process.exit(1); });
