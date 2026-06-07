import fs from "fs";
import { parse } from "csv-parse/sync";
import { db, usersTable, hostelsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { initSchema } from "./initSchema.js";

const CSV_PATH = process.argv[2] || "";

async function main() {
  await initSchema();
  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }) as Record<string, string>[];
  console.log(`[update] ${rows.length} rows`);

  const allHostels = await db.select().from(hostelsTable);
  const hostelMap: Record<string, string> = Object.fromEntries(allHostels.map(h => [h.name, h.id]));

  let updated = 0;
  for (const row of rows) {
    const roll = (row["Roll no."] || "").trim();
    const email = (row["Email"] || "").trim().toLowerCase();
    const name = (row["Name"] || "").trim();
    if (!email || !roll) continue;

    const hostelRaw = (row["Allotted Hostel"] || "").trim();
    const hostelId = hostelRaw ? (hostelMap[hostelRaw] || null) : null;
    const roomNumber = (row["Room no."] || "").trim() || null;
    const assignedMess = (row["Allotted Mess"] || "").trim() || null;
    const phoneD = (row["Contact_no"] || "").replace(/\D/g, "").slice(-10);
    const phone = phoneD.length === 10 ? phoneD : null;
    const gender = (row["Gender"] || "").trim() || null;
    const messCardNo = (row["Serial no. for printing"] || "").trim() || null;

    await db.execute(sql`
      UPDATE users SET
        name = ${name},
        roll_number = ${roll},
        hostel_id   = CASE WHEN ${hostelId}::text IS NOT NULL THEN ${hostelId} ELSE hostel_id END,
        room_number = CASE WHEN ${roomNumber}::text IS NOT NULL THEN ${roomNumber} ELSE room_number END,
        assigned_mess = CASE WHEN ${assignedMess}::text IS NOT NULL THEN ${assignedMess} ELSE assigned_mess END,
        phone       = CASE WHEN ${phone}::text IS NOT NULL THEN ${phone} ELSE phone END,
        gender      = CASE WHEN ${gender}::text IS NOT NULL THEN ${gender} ELSE gender END,
        mess_card_no = CASE WHEN ${messCardNo}::text IS NOT NULL THEN ${messCardNo} ELSE mess_card_no END
      WHERE email = ${email}
    `);
    updated++;
    if (updated % 500 === 0) console.log(`[update] ${updated}/${rows.length}`);
  }
  console.log(`[update] ✅ Done — ${updated} rows updated`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
