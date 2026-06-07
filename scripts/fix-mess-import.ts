import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import crypto from "crypto";

async function run() {
  const raw = fs.readFileSync(path.join(process.cwd(), "data/MessOnly.csv"), "utf-8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  const allStudents = await db.select({ id: usersTable.id, rollNumber: usersTable.rollNumber })
    .from(usersTable).where(eq(usersTable.role, "student"));

  const rollMap: Record<string, string> = {};
  allStudents.forEach((s: any) => {
    if (s.rollNumber) rollMap[s.rollNumber.toUpperCase().trim()] = s.id;
  });

  let updated = 0, created = 0, skipped = 0;
  for (const row of rows) {
    const roll = (row["Roll no."] || "").trim().toUpperCase();
    const name = (row["Name of the Student"] || "").trim();
    const mess = (row["Allotted Mess"] || "").trim();
    if (!roll || !mess) { skipped++; continue; }

    const existingId = rollMap[roll];
    if (existingId) {
      await db.update(usersTable).set({ assignedMess: mess }).where(eq(usersTable.id, existingId));
      updated++;
    } else {
      const email = roll.toLowerCase() + "@ds.study.iitm.ac.in";
      await db.insert(usersTable).values({
        id: crypto.randomBytes(8).toString("hex"),
        name: name || roll,
        email,
        passwordHash: await bcrypt.hash(roll.toLowerCase(), 8),
        role: "student",
        rollNumber: roll,
        assignedMess: mess,
        hostelId: null,
        isActive: true,
        assignedHostelIds: "[]",
      }).onConflictDoNothing();
      created++;
    }
  }
  console.log(`Mess allocations — updated: ${updated}, created: ${created}, skipped: ${skipped}`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
