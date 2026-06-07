/**
 * Fast direct seed into Railway Postgres.
 * Uses bcrypt rounds=4 for bulk student seeding (roll number passwords).
 * Fully idempotent — safe to run multiple times.
 */
import { Pool } from "pg";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAILWAY_DB = "postgresql://postgres:icWVmeDbCgZwTJUeZWFVToEESTIlyEGN@yamabiko.proxy.rlwy.net:42063/railway";
const pool = new Pool({ connectionString: RAILWAY_DB, ssl: { rejectUnauthorized: false }, max: 10 });

const uid = () => crypto.randomBytes(8).toString("hex");
const hp = (p: string, r = 8) => bcrypt.hash(p, r);
const cleanPhone = (p: string) => { const d = (p||"").replace(/\D/g,"").slice(-10); return d.length===10?d:null; };

const HOSTELS = ["Bhadra","Brahmaputra","Cauvery","Ganga","Godavari","Jamuna","Krishna","Mandakini","Narmada","Saraswathi","Sharavathi","Swarnamukhi","Tapti"];

async function main() {
  const c = await pool.connect();
  try {
    console.log("=== CampusOps Railway Seed (Fast Mode) ===\n");

    // ─── 1. Hostels ────────────────────────────────────────────────────────
    console.log("[1/5] Hostels...");
    for (const name of HOSTELS) {
      await c.query(
        `INSERT INTO hostels(id,name,location,total_rooms,created_at) VALUES($1,$2,'IITM BS Campus, Chennai',120,NOW()) ON CONFLICT(id) DO NOTHING`,
        [name.toLowerCase(), name]
      );
    }
    const { rows: hRows } = await c.query("SELECT id,name FROM hostels");
    const hMap: Record<string,string> = {};
    for (const h of hRows) hMap[h.name.toLowerCase()] = h.id;
    console.log(`    ✓ ${hRows.length} hostels`);

    // ─── 2. Demo staff (password: 123456) ──────────────────────────────────
    console.log("[2/5] Demo staff...");
    const demo = [
      { e:"superadmin@iitm.ac.in", n:"Super Admin",      r:"superadmin",  h:null,          ah:"[]" },
      { e:"admin@iitm.ac.in",      n:"Admin IITM",       r:"admin",       h:null,          ah:"[]" },
      { e:"coordinator@iitm.ac.in",n:"Ravi Coordinator", r:"coordinator", h:null,          ah:'["bhadra","brahmaputra"]' },
      { e:"volunteer@iitm.ac.in",  n:"Priya Volunteer",  r:"volunteer",   h:"bhadra",      ah:"[]" },
      { e:"volunteer2@iitm.ac.in", n:"Suresh Volunteer", r:"volunteer",   h:"brahmaputra", ah:"[]" },
      { e:"student@iitm.ac.in",    n:"Demo Student",     r:"student",     h:"cauvery",     ah:"[]" },
    ];
    for (const u of demo) {
      const hash = await hp("123456");
      await c.query(
        `INSERT INTO users(id,name,email,password_hash,role,hostel_id,assigned_hostel_ids,is_active,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,true,NOW())
         ON CONFLICT(email) DO UPDATE SET password_hash=$4,role=$5,is_active=true`,
        [uid(), u.n, u.e, hash, u.r, u.h, u.ah]
      );
    }
    console.log("    ✓ 6 demo accounts (password: 123456)");

    // ─── 3. Real dept members ──────────────────────────────────────────────
    console.log("[3/5] Dept members...");
    const dept: Array<{email:string;name:string;phone?:string;role:string}> =
      JSON.parse(fs.readFileSync(path.join(__dirname,"../artifacts/api-server/src/data/dept-members.json"),"utf8"));
    const DBATCH = 15;
    let dCount = 0;
    for (let i = 0; i < dept.length; i += DBATCH) {
      await Promise.all(dept.slice(i,i+DBATCH).filter(m=>m.email&&m.name).map(async m => {
        const pfx = m.email.split("@")[0];
        const hash = await hp(pfx);
        await c.query(
          `INSERT INTO users(id,name,email,password_hash,role,roll_number,phone,is_active,assigned_hostel_ids,created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,true,'[]',NOW())
           ON CONFLICT(email) DO UPDATE SET password_hash=$4,role=$5,is_active=true`,
          [uid(), m.name, m.email, hash, m.role, pfx.toUpperCase(), cleanPhone(m.phone||"")]
        );
        dCount++;
      }));
    }
    console.log(`    ✓ ${dCount} dept members`);

    // ─── 4. 3,075 students — fast bulk insert ──────────────────────────────
    console.log("[4/5] Students (bulk fast mode)...");
    const studs: Array<{roll:string;name:string;email:string;hostel:string;room:string;mess:string;phone:string;gender:string}> =
      JSON.parse(fs.readFileSync(path.join(__dirname,"../artifacts/api-server/src/data/students.json"),"utf8"));

    // Get already-existing student emails
    const { rows: exRows } = await c.query("SELECT email FROM users WHERE role='student'");
    const exSet = new Set(exRows.map((r:any)=>r.email.toLowerCase()));
    const todo = studs.filter(s=>s.roll&&s.name&&s.email&&!exSet.has(s.email.toLowerCase()));
    console.log(`    ${todo.length} to insert, ${studs.length-todo.length} already exist`);

    if (todo.length > 0) {
      // Hash in large parallel batches (rounds=4 → ~5ms each)
      const HASH_BATCH = 50;
      const INSERT_BATCH = 50;
      let inserted = 0;

      for (let i = 0; i < todo.length; i += HASH_BATCH) {
        const slice = todo.slice(i, i+HASH_BATCH);
        // Hash all passwords in this slice concurrently (rounds=4 for speed)
        const hashed = await Promise.all(slice.map(s => hp(s.roll.toLowerCase(), 4)));

        // Build multi-row INSERT
        for (let j = 0; j < slice.length; j += INSERT_BATCH) {
          const rows = slice.slice(j, j+INSERT_BATCH);
          const h2 = hashed.slice(j, j+INSERT_BATCH);
          if (!rows.length) continue;

          const values: any[] = [];
          const placeholders = rows.map((s, idx) => {
            const base = idx * 11;
            values.push(
              uid(), s.name, s.email.toLowerCase(), h2[idx], s.roll,
              hMap[s.hostel?.toLowerCase()]??null,
              s.room||null, s.mess||null,
              cleanPhone(s.phone), s.gender||null,
              "[]"
            );
            return `($${base+1},$${base+2},$${base+3},$${base+4},'student',$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},true,$${base+10},NOW())`;
          }).join(",");

          try {
            await c.query(
              `INSERT INTO users(id,name,email,password_hash,role,roll_number,hostel_id,room_number,assigned_mess,phone,gender,is_active,assigned_hostel_ids,created_at)
               VALUES ${placeholders} ON CONFLICT(email) DO NOTHING`,
              values
            );
            inserted += rows.length;
          } catch(e:any) {
            // Fallback: insert one-by-one
            for (let k = 0; k < rows.length; k++) {
              const s = rows[k]; const ph = h2[k];
              try {
                await c.query(
                  `INSERT INTO users(id,name,email,password_hash,role,roll_number,hostel_id,room_number,assigned_mess,phone,gender,is_active,assigned_hostel_ids,created_at)
                   VALUES($1,$2,$3,$4,'student',$5,$6,$7,$8,$9,$10,true,'[]',NOW()) ON CONFLICT(email) DO NOTHING`,
                  [uid(),s.name,s.email.toLowerCase(),ph,s.roll,hMap[s.hostel?.toLowerCase()]??null,s.room||null,s.mess||null,cleanPhone(s.phone),s.gender||null]
                );
                inserted++;
              } catch {}
            }
          }
        }
        process.stdout.write(`    ${Math.min(i+HASH_BATCH,todo.length)}/${todo.length} (${Math.round(Math.min(i+HASH_BATCH,todo.length)/todo.length*100)}%)\r`);
      }
      console.log(`\n    ✓ ${inserted} students inserted`);
    } else {
      console.log("    ✓ All students already present");
    }

    // ─── 5. Extras (emergency contacts, announcements) ─────────────────────
    console.log("[5/5] Extras...");
    const { rows:[{count:ec}] } = await c.query("SELECT COUNT(*) FROM emergency_contacts");
    if (Number(ec)===0) {
      for (const [n,r,p,a] of [
        ["Health Center","Medical","044-22578430","true"],
        ["Dean of Students Office","Administration","044-22578200","false"],
        ["Campus Police","Security","044-22578100","true"],
        ["Security Control Room","Security","044-22578500","true"],
        ["Ambulance (Campus)","Medical","044-22578911","true"],
      ]) await c.query("INSERT INTO emergency_contacts(id,hostel_id,name,role,phone,is_available_24x7,created_at) VALUES($1,'','$2',$3,$4,$5,$6,NOW()) ON CONFLICT DO NOTHING",[uid(),n,r,p,a]);
      console.log("    ✓ Emergency contacts");
    }
    const { rows:[{count:an}] } = await c.query("SELECT COUNT(*) FROM announcements");
    if (Number(an)===0) {
      const { rows:[adm] } = await c.query("SELECT id FROM users WHERE email='admin@iitm.ac.in' LIMIT 1");
      if (adm) {
        for (const [t,co,cat,pri] of [
          ["Welcome to CampusOps!","Centralized portal for hostel management, attendance & inventory.","general","high"],
          ["Mess Timings","Breakfast 7–9 AM · Lunch 12–2 PM · Dinner 7–9:30 PM","hostel","normal"],
          ["Hostel Inventory Drive","Submit mattress, bedsheet, pillow details to your hostel volunteer.","hostel","normal"],
          ["Room Inspection This Weekend","All hostels. Keep rooms tidy.","urgent","high"],
        ]) await c.query("INSERT INTO announcements(id,title,content,category,priority,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,NOW())",[uid(),t,co,cat,pri,adm.id]);
        console.log("    ✓ Announcements");
      }
    }

    // ─── Final summary ─────────────────────────────────────────────────────
    const { rows:[ct] } = await c.query(`SELECT
      (SELECT COUNT(*) FROM users WHERE role='student') s,
      (SELECT COUNT(*) FROM users WHERE role!='student') st,
      (SELECT COUNT(*) FROM hostels) h,
      (SELECT COUNT(*) FROM announcements) a`);
    console.log("\n╔═══════════════════════════╗");
    console.log(`║  Students   : ${String(ct.s).padEnd(11)}║`);
    console.log(`║  Staff      : ${String(ct.st).padEnd(11)}║`);
    console.log(`║  Hostels    : ${String(ct.h).padEnd(11)}║`);
    console.log(`║  Announce   : ${String(ct.a).padEnd(11)}║`);
    console.log("╚═══════════════════════════╝");
    console.log("\n✅ All data seeded! Railway is ready.\n");
    console.log("Demo logins (password: 123456):");
    console.log("  superadmin@iitm.ac.in  admin@iitm.ac.in");
    console.log("  coordinator@iitm.ac.in volunteer@iitm.ac.in");
    console.log("  student@iitm.ac.in");
    console.log("\nStudent login: email from CSV, password = roll number (lowercase)");
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch(e=>{console.error("FAILED:",e.message);process.exit(1);});
