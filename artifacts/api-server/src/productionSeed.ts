/**
 * Production seed — imports real dept members + students from bundled JSON.
 * Triggered by SEED_REAL_DATA=true env var.
 * Fully idempotent: skips records that already exist (onConflictDoNothing).
 */
import { db, usersTable, hostelsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { initSchema } from "./initSchema.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import deptMembers from "./data/dept-members.json";
import students from "./data/students.json";

function generateId() { return crypto.randomBytes(8).toString("hex"); }
async function hp(p: string) { return bcrypt.hash(p, 8); }

function cleanPhone(p: string): string | undefined {
  const d = (p || "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? d : undefined;
}

const REAL_HOSTELS = [
  "Bhadra","Brahmaputra","Cauvery","Ganga","Godavari",
  "Jamuna","Krishna","Mandakini","Narmada","Saraswathi",
  "Sharavathi","Swarnamukhi","Tapti",
];

export async function productionSeed() {
  console.log("[prod-seed] Starting production seed...");
  // Always ensure schema is up-to-date first (safe to call multiple times)
  await initSchema();

  // ── 1. Hostels ───────────────────────────────────────────────────────────
  for (const name of REAL_HOSTELS) {
    await db.insert(hostelsTable).values({
      id: name.toLowerCase(), name, location: "IITM Campus",
    }).onConflictDoNothing();
  }
  const allHostels = await db.select().from(hostelsTable);
  const hostelMap: Record<string, string> = {};
  for (const h of allHostels) hostelMap[h.name.toLowerCase()] = h.id;
  console.log(`[prod-seed] Hostels ready (${allHostels.length})`);

  // ── 2. Demo staff (keep login accounts) ──────────────────────────────────
  const demoStaff = [
    { email:"superadmin@iitm.ac.in", name:"Super Admin",  role:"superadmin" },
    { email:"admin@iitm.ac.in",      name:"Admin IITM",   role:"admin"      },
    { email:"coordinator@iitm.ac.in",name:"Ravi Coord",   role:"coordinator"},
    { email:"volunteer@iitm.ac.in",  name:"Priya Vol",    role:"volunteer"  },
    { email:"volunteer2@iitm.ac.in", name:"Suresh Vol",   role:"volunteer"  },
    { email:"student@iitm.ac.in",    name:"Demo Student", role:"student"    },
  ];
  for (const u of demoStaff) {
    await db.insert(usersTable).values({
      id: generateId(), name: u.name, email: u.email,
      passwordHash: await hp("123456"), role: u.role,
      isActive: true, assignedHostelIds: "[]",
    }).onConflictDoNothing();
  }
  console.log("[prod-seed] Demo staff ready");

  // ── 3. Real dept members (password = email prefix / roll number) ─────────
  let deptInserted = 0;
  for (const m of deptMembers as Array<{email:string;name:string;phone?:string;role:string}>) {
    if (!m.email || !m.name) continue;
    const prefix = m.email.split("@")[0];
    try {
      await db.insert(usersTable).values({
        id: generateId(),
        name: m.name,
        email: m.email,
        passwordHash: await hp(prefix),
        role: m.role,
        rollNumber: prefix.toUpperCase(),
        phone: cleanPhone(m.phone || ""),
        isActive: true,
        assignedHostelIds: "[]",
      }).onConflictDoNothing();
      deptInserted++;
    } catch { /* skip duplicates */ }
  }
  console.log(`[prod-seed] Dept members: ${deptInserted} inserted`);

  // ── 4. Real students (password = roll number lowercase) ──────────────────
  const BATCH = 50;
  const existingEmails = new Set(
    (await db.select({ email: usersTable.email }).from(usersTable))
      .map((u: {email:string}) => u.email.toLowerCase())
  );

  let studInserted = 0, studSkipped = 0;
  const allStudents = students as Array<{
    roll:string; name:string; email:string;
    hostel:string; room:string; mess:string;
    phone:string; gender:string;
  }>;

  for (let i = 0; i < allStudents.length; i += BATCH) {
    const batch = allStudents.slice(i, i + BATCH);
    const toInsert = [];
    for (const s of batch) {
      if (!s.roll || !s.name || !s.email) { studSkipped++; continue; }
      if (existingEmails.has(s.email.toLowerCase())) { studSkipped++; continue; }
      const hostelId = hostelMap[s.hostel.toLowerCase()] ?? undefined;
      toInsert.push({
        id: generateId(),
        name: s.name,
        email: s.email.toLowerCase(),
        passwordHash: await hp(s.roll.toLowerCase()),
        role: "student" as const,
        rollNumber: s.roll,
        hostelId,
        roomNumber: s.room || undefined,
        assignedMess: s.mess || undefined,
        phone: cleanPhone(s.phone),
        gender: s.gender || undefined,
        isActive: true,
        assignedHostelIds: "[]",
      });
      existingEmails.add(s.email.toLowerCase());
    }
    if (toInsert.length) {
      try {
        await db.insert(usersTable).values(toInsert).onConflictDoNothing();
        studInserted += toInsert.length;
      } catch {
        for (const u of toInsert) {
          try { await db.insert(usersTable).values(u).onConflictDoNothing(); } catch {}
        }
      }
    }
    if (i % 500 === 0) console.log(`[prod-seed] Students progress: ${i}/${allStudents.length}`);
  }
  console.log(`[prod-seed] Students: ${studInserted} inserted, ${studSkipped} skipped`);
  console.log("[prod-seed] ✅ Production seed complete!");
}
