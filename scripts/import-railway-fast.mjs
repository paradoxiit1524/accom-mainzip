/**
 * Fast Railway import — batched inserts, single password hash for all students.
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
  max: 5,
  connectionTimeoutMillis: 15000,
});

function uid() { return crypto.randomBytes(8).toString("hex"); }
function normalizePhone(p) { if (!p) return null; const d = p.replace(/\D/g,""); return d.length >= 8 ? d.slice(-10) : null; }
function normalizeRole(r) {
  const s = r.trim().toLowerCase().replace(/\s+/g,"");
  if (s==="superadmin"||s==="super admin") return "superadmin";
  if (s==="admin") return "admin";
  if (s==="coordinator") return "coordinator";
  return "volunteer";
}

async function main() {
  const client = await pool.connect();
  console.log("Connected to Railway DB.");

  try {
    // Pre-compute ONE password hash for all students (huge speed gain)
    const DEFAULT_PW = await bcrypt.hash("123456", 6);
    console.log("Password hash ready.");

    // ── Hostels ──────────────────────────────────────────────────────────────
    const HOSTELS = ["Bhadra","Brahmaputra","Cauvery","Ganga","Godavari",
      "Jamuna","Krishna","Mandakini","Narmada","Saraswathi","Sharavathi","Swarnamukhi","Tapti"];
    for (const name of HOSTELS) {
      await client.query(
        `INSERT INTO hostels (id,name,location) VALUES ($1,$2,'IITM Campus') ON CONFLICT(id) DO NOTHING`,
        [name, name]
      );
    }
    console.log("✓ 13 hostels ready");

    // ── Students (batch of 50) ────────────────────────────────────────────────
    const hostelsCsv = fs.readFileSync(path.join(ROOT,"data/hostels.csv"),"utf8");
    const students = parse(hostelsCsv, { columns:true, skip_empty_lines:true, trim:true });
    console.log(`Importing ${students.length} students in batches...`);

    let inserted=0, updated=0;
    const BATCH=50;

    for (let i=0; i<students.length; i+=BATCH) {
      const batch = students.slice(i, i+BATCH);
      for (const row of batch) {
        const roll = (row["Roll no."]||"").trim().toUpperCase();
        const name = (row["Name of the Student"]||"").trim();
        if (!roll||!name) continue;
        const email = ((row["Email"]||"").trim().toLowerCase()) || `${roll.toLowerCase()}@ds.study.iitm.ac.in`;
        const hostelId = (row["Allotted Hostel"]||"").trim()||null;
        const roomNumber = (row["Room no."]||"").trim()||null;
        const mess = (row["Allotted Mess"]||"").trim()||null;
        const gender = (row["Gender"]||"").trim()||null;
        const phone = normalizePhone(row["Mobile no."]);

        const ex = await client.query(`SELECT id FROM users WHERE email=$1 OR roll_number=$2 LIMIT 1`,[email,roll]);
        if (ex.rows.length>0) {
          await client.query(
            `UPDATE users SET name=$1,hostel_id=$2,room_number=$3,assigned_mess=$4,gender=$5,phone=$6,roll_number=$7,email=$8 WHERE id=$9`,
            [name,hostelId,roomNumber,mess,gender,phone,roll,email,ex.rows[0].id]
          );
          updated++;
        } else {
          await client.query(
            `INSERT INTO users(id,name,email,password_hash,role,roll_number,hostel_id,room_number,assigned_mess,gender,phone,is_active,assigned_hostel_ids)
             VALUES($1,$2,$3,$4,'student',$5,$6,$7,$8,$9,$10,true,'[]') ON CONFLICT(email) DO NOTHING`,
            [uid(),name,email,DEFAULT_PW,roll,hostelId,roomNumber,mess,gender,phone]
          );
          inserted++;
        }
      }
      process.stdout.write(`  ${i+batch.length}/${students.length} done\r`);
    }
    console.log(`\n✓ Students: ${inserted} inserted, ${updated} updated`);

    // Update hostel room counts
    await client.query(`UPDATE hostels h SET total_rooms=(SELECT COUNT(*) FROM users u WHERE u.hostel_id=h.id AND u.role='student')`);

    // ── Staff (DeptMembers2.csv) ──────────────────────────────────────────────
    const staffCsv = fs.readFileSync(path.join(ROOT,"data/DeptMembers2.csv"),"utf8");
    const staffRows = parse(staffCsv, { columns:true, skip_empty_lines:true, trim:true });
    console.log(`Importing ${staffRows.length} staff...`);
    let sIns=0, sUpd=0;
    for (const row of staffRows) {
      const email = (row["Email"]||"").trim().toLowerCase();
      const name = (row["Name"]||"").trim();
      if (!email||!name) continue;
      const role = normalizeRole(row["Role"]||"volunteer");
      const gender = (row["Gender"]||"").trim()||null;
      const phone = normalizePhone(row["Contact Number"]);
      const pwHash = await bcrypt.hash("123456", 6);
      const roll = email.split("@")[0].toUpperCase();
      const ex = await client.query(`SELECT id FROM users WHERE email=$1 LIMIT 1`,[email]);
      if (ex.rows.length>0) {
        await client.query(`UPDATE users SET name=$1,role=$2,gender=$3,phone=$4,password_hash=$5,is_active=true WHERE id=$6`,
          [name,role,gender,phone,pwHash,ex.rows[0].id]);
        sUpd++;
      } else {
        await client.query(
          `INSERT INTO users(id,name,email,password_hash,role,roll_number,gender,phone,is_active,assigned_hostel_ids)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,'[]') ON CONFLICT(email) DO NOTHING`,
          [uid(),name,email,pwHash,role,roll,gender,phone]
        );
        sIns++;
      }
    }
    console.log(`✓ Staff: ${sIns} inserted, ${sUpd} updated`);

    // ── Demo accounts (always ensure these exist) ─────────────────────────────
    const demos = [
      { email:"superadmin@iitm.ac.in", name:"Super Admin", role:"superadmin" },
      { email:"admin@iitm.ac.in",      name:"Admin User",  role:"admin" },
      { email:"coordinator@iitm.ac.in",name:"Coordinator", role:"coordinator" },
      { email:"volunteer@iitm.ac.in",  name:"Volunteer",   role:"volunteer" },
      { email:"student@iitm.ac.in",    name:"Student User",role:"student", hostelId:"Bhadra", roll:"21f3000000" },
    ];
    for (const d of demos) {
      const pw = await bcrypt.hash("123456", 8);
      const ex = await client.query(`SELECT id FROM users WHERE email=$1`,[d.email]);
      if (ex.rows.length>0) {
        await client.query(`UPDATE users SET password_hash=$1,role=$2,is_active=true WHERE id=$3`,[pw,d.role,ex.rows[0].id]);
      } else {
        await client.query(
          `INSERT INTO users(id,name,email,password_hash,role,hostel_id,roll_number,is_active,assigned_hostel_ids)
           VALUES($1,$2,$3,$4,$5,$6,$7,true,'[]') ON CONFLICT(email) DO NOTHING`,
          [uid(),d.name,d.email,pw,d.role,d.hostelId||null,d.roll||null]
        );
      }
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
    console.log("✓ All data imported into Railway!");

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
