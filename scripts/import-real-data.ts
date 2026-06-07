import { db, usersTable, hostelsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

function generateId() {
  return crypto.randomBytes(8).toString("hex");
}

async function hashPassword(p: string) {
  return bcrypt.hash(p, 8);
}

function cleanPhone(p: string | undefined): string | undefined {
  if (!p) return undefined;
  const digits = p.replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return undefined;
}

function normalizeRole(raw: string): string {
  const v = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (v.includes("superadmin") || v.includes("super")) return "superadmin";
  if (v === "admin") return "admin";
  if (v === "coordinator" || v === "co-ordinator") return "coordinator";
  return "volunteer";
}

async function importStaff() {
  console.log("\n=== Importing Real Staff (DeptMembers2.csv) ===");
  const raw = fs.readFileSync(path.join(process.cwd(), "data/DeptMembers2.csv"), "utf-8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  let inserted = 0, updated = 0, skipped = 0;
  for (const row of rows) {
    const email = (row["Email"] || "").trim().toLowerCase();
    const name = (row["Name"] || "").trim();
    const phone = cleanPhone(row["Contact Number"]);
    const role = normalizeRole(row["Role"] || "volunteer");

    if (!email || !name) { skipped++; continue; }

    const emailPrefix = email.split("@")[0] || "";
    const passwordHash = await hashPassword(emailPrefix);

    const [existing] = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.email, email));

    if (existing) {
      await db.update(usersTable).set({ name, role, phone, isActive: true })
        .where(eq(usersTable.id, existing.id));
      updated++;
    } else {
      await db.insert(usersTable).values({
        id: generateId(), name, email, passwordHash, role,
        rollNumber: emailPrefix.toUpperCase(),
        phone, isActive: true, assignedHostelIds: "[]",
      }).onConflictDoNothing();
      inserted++;
    }
    console.log(`  [${role}] ${name} (${email})`);
  }
  console.log(`  Done: ${inserted} inserted, ${updated} updated, ${skipped} skipped`);
}

async function importStudents() {
  console.log("\n=== Importing Students from hostels.csv ===");

  const hostels = await db.select({ id: hostelsTable.id, name: hostelsTable.name }).from(hostelsTable);
  const hostelMap: Record<string, string> = {};
  for (const h of hostels) hostelMap[h.name.toLowerCase().trim()] = h.id;
  console.log("  Hostels in DB:", Object.keys(hostelMap).join(", "));

  const raw = fs.readFileSync(path.join(process.cwd(), "data/hostels.csv"), "utf-8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
  console.log(`  Total rows to import: ${rows.length}`);

  const existingUsers = await db.select({ email: usersTable.email }).from(usersTable);
  const existingEmails = new Set(existingUsers.map((u: { email: string }) => u.email.toLowerCase()));

  let inserted = 0, skipped = 0, noHostel = 0;
  const BATCH = 50;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const toInsert = [];

    for (const row of batch) {
      const rollNumber = (row["Roll no."] || "").trim().toUpperCase();
      const name = (row["Name of the Student"] || "").trim();
      const email = (row["Email"] || "").trim().toLowerCase();
      const hostelName = (row["Allotted Hostel"] || "").trim();
      const roomNumber = (row["Room no."] || "").trim();
      const mess = (row["Allotted Mess"] || "").trim();
      const phone = cleanPhone(row["Mobile no."]);
      const contactNumber = cleanPhone(row["Emergency contact"]);

      if (!rollNumber || !name || !email) { skipped++; continue; }
      if (existingEmails.has(email)) { skipped++; continue; }

      const hostelId = hostelMap[hostelName.toLowerCase()] || undefined;
      if (!hostelId) noHostel++;

      const passwordHash = await hashPassword(rollNumber.toLowerCase());

      toInsert.push({
        id: generateId(), name, email, passwordHash,
        role: "student" as const,
        rollNumber,
        hostelId,
        roomNumber: roomNumber || undefined,
        assignedMess: mess || undefined,
        phone,
        contactNumber,
        isActive: true,
        assignedHostelIds: "[]",
      });
      existingEmails.add(email);
    }

    if (toInsert.length > 0) {
      try {
        await db.insert(usersTable).values(toInsert).onConflictDoNothing();
        inserted += toInsert.length;
      } catch (e: any) {
        for (const u of toInsert) {
          try { await db.insert(usersTable).values(u).onConflictDoNothing(); inserted++; } catch {}
        }
      }
    }

    if ((i + BATCH) % 500 === 0 || i + BATCH >= rows.length) {
      console.log(`  Progress: ${Math.min(i + BATCH, rows.length)}/${rows.length} | Inserted: ${inserted} | Skipped: ${skipped} | No hostel: ${noHostel}`);
    }
  }
  console.log(`\n  DONE: ${inserted} inserted, ${skipped} skipped, ${noHostel} without hostel match`);
}

async function importMessAllocations() {
  console.log("\n=== Importing Mess Allocations (MessOnly.csv) ===");
  const raw = fs.readFileSync(path.join(process.cwd(), "data/MessOnly.csv"), "utf-8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  const allStudents = await db.select({ id: usersTable.id, rollNumber: usersTable.rollNumber })
    .from(usersTable).where(eq(usersTable.role, "student"));
  const rollMap: Record<string, string> = {};
  allStudents.forEach((s: { id: string; rollNumber: string | null }) => {
    if (s.rollNumber) rollMap[s.rollNumber.toLowerCase().trim()] = s.id;
  });

  let updated = 0, notFound = 0;
  for (const row of rows) {
    const roll = (row["Roll no."] || "").trim().toUpperCase();
    const mess = (row["Allotted Mess"] || "").trim();
    if (!roll || !mess) continue;

    const studentId = rollMap[roll.toLowerCase()];
    if (studentId) {
      await db.update(usersTable).set({ assignedMess: mess }).where(eq(usersTable.id, studentId));
      updated++;
    } else {
      notFound++;
    }
  }
  console.log(`  Done: ${updated} updated, ${notFound} not found`);
}

async function main() {
  console.log("Starting real data import...\n");
  await importStaff();
  await importStudents();
  await importMessAllocations();
  console.log("\n✅ All real data imported successfully!");
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
