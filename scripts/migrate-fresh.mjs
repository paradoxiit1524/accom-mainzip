/**
 * Fresh migration — wipes ALL students + non-demo staff from Railway,
 * then inserts 3309 real students + 52 staff from the master CSVs.
 * Run: node scripts/migrate-fresh.mjs
 */
import pg from "pg";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RAILWAY_URL =
  process.env.RAILWAY_URL ||
  "postgresql://postgres:pOIkJEMkzAbkZVnupMXMxurohOVsbpga@acela.proxy.rlwy.net:28783/railway";

const pool = new Pool({
  connectionString: RAILWAY_URL,
  ssl: { rejectUnauthorized: false },
});

function uid() {
  return crypto.randomBytes(8).toString("hex");
}
async function hashPw(p) {
  return bcrypt.hash(p, 6);
}

function cleanPhone(p) {
  if (!p) return null;
  const s = String(p).trim();
  if (s === "-" || s === "" || s === "N/A") return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length < 7) return null;
  // keep last 10 digits (strips +91 country code)
  return digits.slice(-10);
}

// Hostel name (CSV) → ID (DB)
const HOSTEL_ID = {
  alakananda: "alakananda",
  bhadra: "bhadra",
  brahmaputra: "brahmaputra",
  cauvery: "cauvery",
  ganga: "ganga",
  godavari: "godavari",
  jamuna: "jamuna",
  krishna: "krishna",
  mahanadhi: "mahanadhi",
  mandakini: "mandakini",
  "mandakini - b": "mandakini---b",
  narmada: "narmada",
  pampa: "pampa",
  sabarmati: "sabarmati",
  saraswathi: "saraswathi",
  sharavathi: "sharavathi",
  swarnamukhi: "swarnamukhi",
  tamiraparani: "tamiraparani",
  tapti: "tapti",
  tunga: "tunga",
};

function toHostelId(name) {
  return HOSTEL_ID[(name || "").trim().toLowerCase()] || null;
}

function normalizeRole(r) {
  const s = (r || "").trim().toLowerCase().replace(/\s+/g, "");
  if (s === "superadmin" || s === "super admin") return "superadmin";
  if (s === "admin") return "admin";
  if (s === "coordinator") return "coordinator";
  return "volunteer";
}

// Demo accounts to always keep
const DEMO_EMAILS = [
  "superadmin@iitm.ac.in",
  "admin@iitm.ac.in",
  "coordinator@iitm.ac.in",
  "volunteer@iitm.ac.in",
  "volunteer2@iitm.ac.in",
  "student@iitm.ac.in",
];

async function main() {
  const client = await pool.connect();
  try {
    console.log("✅ Connected to Railway DB");

    // ── Read CSVs ───────────────────────────────────────────────────────────
    const masterPath = join(
      ROOT,
      "attached_assets",
      "Hostel_allotment_Paradox_'26_MASTERSHEET_xlsx_CCW_Final_(1)_1780890727489.csv"
    );
    const staffPath = join(
      ROOT,
      "attached_assets",
      "DeptMembers2_1780890727494.csv"
    );

    const masterRows = parse(readFileSync(masterPath, "utf8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
    });
    const staffRows = parse(readFileSync(staffPath, "utf8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    // Filter out empty rows (last row of CSV is blank)
    const students = masterRows.filter(
      (r) => r["Roll no."] && r["Roll no."].trim() && r["Name"] && r["Name"].trim()
    );
    const staff = staffRows.filter(
      (r) => r["Email"] && r["Email"].trim() && r["Name"] && r["Name"].trim()
    );

    console.log(`📋 ${students.length} students | ${staff.length} staff to import`);

    // ── WIPE existing students ──────────────────────────────────────────────
    console.log("🗑  Clearing existing students...");
    await client.query(`DELETE FROM student_inventory WHERE student_id IN (SELECT id FROM users WHERE role='student')`);
    await client.query(`DELETE FROM checkins WHERE student_id IN (SELECT id FROM users WHERE role='student')`);
    await client.query(`DELETE FROM attendance WHERE student_id IN (SELECT id FROM users WHERE role='student')`);
    await client.query(`DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE role='student')`);
    await client.query(`DELETE FROM time_logs WHERE user_id IN (SELECT id FROM users WHERE role='student')`);
    await client.query(`DELETE FROM users WHERE role='student'`);

    // ── WIPE non-demo staff ─────────────────────────────────────────────────
    console.log("🗑  Clearing non-demo staff...");
    const dp = DEMO_EMAILS.map((_, i) => `$${i + 1}`).join(",");
    await client.query(
      `DELETE FROM time_logs WHERE user_id IN (SELECT id FROM users WHERE role!='student' AND email NOT IN (${dp}))`,
      DEMO_EMAILS
    );
    await client.query(
      `DELETE FROM users WHERE role!='student' AND email NOT IN (${dp})`,
      DEMO_EMAILS
    );
    console.log("✅ Wipe done");

    // ── Hash student passwords in parallel batches ──────────────────────────
    console.log("🔐 Hashing student passwords (roll numbers)...");
    const rolls = students.map((r) => (r["Roll no."] || "").trim().toLowerCase());
    const BATCH = 100;
    const hashes = [];
    for (let i = 0; i < rolls.length; i += BATCH) {
      const bh = await Promise.all(rolls.slice(i, i + BATCH).map(hashPw));
      hashes.push(...bh);
      process.stdout.write(`\r  ${Math.min(i + BATCH, rolls.length)}/${rolls.length}`);
    }
    console.log("\n✅ Passwords hashed");

    // ── INSERT students in batches ──────────────────────────────────────────
    console.log("📥 Inserting students...");
    const CHUNK = 50;
    let inserted = 0;

    for (let i = 0; i < students.length; i += CHUNK) {
      const chunk = students.slice(i, i + CHUNK);
      const vals = [];
      const params = [];
      let p = 1;

      for (let j = 0; j < chunk.length; j++) {
        const row = chunk[j];
        const rollRaw = (row["Roll no."] || "").trim();
        const email =
          (row["Email"] || "").trim().toLowerCase() ||
          `${rollRaw.toLowerCase()}@ds.study.iitm.ac.in`;
        const name = (row["Name"] || "").trim();
        const hostelId = toHostelId(row["Allotted Hostel"]);
        const roomNumber = (row["Room no."] || "").trim() || null;
        const mess = (row["Allotted Mess"] || "").trim() || null;
        const gender = (row["Gender"] || "").trim() || null;
        const phone = cleanPhone(row["Contact_no"]);
        const messCardNo = (row["Serial no. for printing"] || "").trim() || null;
        const pw = hashes[i + j];

        vals.push(`($${p},$${p+1},$${p+2},$${p+3},'student',$${p+4},$${p+5},$${p+6},$${p+7},$${p+8},$${p+9},$${p+10},true,NOW())`);
        params.push(uid(), name, email, pw, rollRaw, hostelId, roomNumber, mess, gender, phone, messCardNo);
        p += 11;
      }

      await client.query(
        `INSERT INTO users (id,name,email,password_hash,role,roll_number,hostel_id,room_number,assigned_mess,gender,phone,mess_card_no,is_active,created_at)
         VALUES ${vals.join(",")}
         ON CONFLICT (email) DO UPDATE SET
           name=EXCLUDED.name, password_hash=EXCLUDED.password_hash,
           roll_number=EXCLUDED.roll_number, hostel_id=EXCLUDED.hostel_id,
           room_number=EXCLUDED.room_number, assigned_mess=EXCLUDED.assigned_mess,
           gender=EXCLUDED.gender, phone=EXCLUDED.phone, mess_card_no=EXCLUDED.mess_card_no`,
        params
      );
      inserted += chunk.length;
      process.stdout.write(`\r  ${inserted}/${students.length}`);
    }
    console.log(`\n✅ Inserted ${inserted} students`);

    // ── INSERT staff ────────────────────────────────────────────────────────
    console.log("👥 Inserting staff...");
    const staffPw = await hashPw("123456");
    let staffInserted = 0;

    for (const row of staff) {
      const email = (row["Email"] || "").trim().toLowerCase();
      if (!email || DEMO_EMAILS.includes(email)) continue;
      const name = (row["Name"] || "").trim();
      const phone = cleanPhone(row["Contact Number"]);
      const gender = (row["Gender"] || "").trim() || null;
      const role = normalizeRole(row["Role"]);
      const rollNumber = email.split("@")[0]; // use email prefix as roll number

      await client.query(
        `INSERT INTO users (id,name,email,password_hash,role,roll_number,phone,gender,is_active,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,NOW())
         ON CONFLICT (email) DO UPDATE SET
           name=EXCLUDED.name, password_hash=EXCLUDED.password_hash,
           role=EXCLUDED.role, phone=EXCLUDED.phone, gender=EXCLUDED.gender,
           roll_number=EXCLUDED.roll_number`,
        [uid(), name, email, staffPw, role, rollNumber, phone, gender]
      );
      staffInserted++;
    }
    console.log(`✅ Inserted ${staffInserted} staff`);

    // ── Final verification ──────────────────────────────────────────────────
    const { rows: [counts] } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE role='student') AS students,
        COUNT(*) FILTER (WHERE role='volunteer') AS volunteers,
        COUNT(*) FILTER (WHERE role='coordinator') AS coordinators,
        COUNT(*) FILTER (WHERE role='admin') AS admins,
        COUNT(*) FILTER (WHERE role='superadmin') AS superadmins
      FROM users
    `);
    console.log("\n📊 Final DB counts:");
    console.log(`  Students:    ${counts.students}`);
    console.log(`  Volunteers:  ${counts.volunteers}`);
    console.log(`  Coordinators: ${counts.coordinators}`);
    console.log(`  Admins:      ${counts.admins}`);
    console.log(`  Superadmins: ${counts.superadmins}`);

    // Sample verify
    const { rows: samples } = await client.query(`
      SELECT name, roll_number, hostel_id, room_number, mess_card_no, phone
      FROM users WHERE role='student' ORDER BY created_at LIMIT 3
    `);
    console.log("\n🔍 Sample students:");
    samples.forEach((s) =>
      console.log(`  ${s.name} | ${s.roll_number} | hostel:${s.hostel_id} | room:${s.room_number} | card:${s.mess_card_no} | phone:${s.phone}`)
    );

  } finally {
    client.release();
    await pool.end();
    console.log("\n✅ Migration complete!");
  }
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
