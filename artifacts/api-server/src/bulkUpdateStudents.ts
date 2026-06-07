import fs from "fs";
import { parse } from "csv-parse/sync";
import { db, hostelsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { initSchema } from "./initSchema.js";

const CSV_PATH = process.argv[2] || "";
const CHUNK = 500;

function cleanPhone(p: string): string | null {
  const d = (p || "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? d : null;
}

async function main() {
  await initSchema();
  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }) as Record<string, string>[];
  console.log(`[bulk] ${rows.length} rows parsed`);

  const allHostels = await db.select().from(hostelsTable);
  const hostelMap: Record<string, string> = Object.fromEntries(allHostels.map(h => [h.name, h.id]));

  // Parse all rows into tuples
  const tuples: [string, string, string, string, string|null, string|null, string|null, string|null, string|null][] = [];
  for (const row of rows) {
    const roll = (row["Roll no."] || "").trim();
    const email = (row["Email"] || "").trim().toLowerCase();
    const name = (row["Name"] || "").trim();
    if (!email || !roll) continue;

    const hostelRaw = (row["Allotted Hostel"] || "").trim();
    tuples.push([
      email,
      name,
      roll,
      hostelRaw ? (hostelMap[hostelRaw] || "") : "",
      (row["Room no."] || "").trim() || null,
      (row["Allotted Mess"] || "").trim() || null,
      cleanPhone(row["Contact_no"] || ""),
      (row["Gender"] || "").trim() || null,
      (row["Serial no. for printing"] || "").trim() || null,
    ]);
  }

  console.log(`[bulk] Processing ${tuples.length} records in chunks of ${CHUNK}`);
  let total = 0;

  for (let i = 0; i < tuples.length; i += CHUNK) {
    const chunk = tuples.slice(i, i + CHUNK);
    // Build VALUES string
    const valuesStr = chunk.map(t =>
      `(${t.map(v => v === null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`).join(",")})`
    ).join(",\n");

    await db.execute(sql.raw(`
      UPDATE users u SET
        name         = v.name,
        roll_number  = v.roll,
        hostel_id    = CASE WHEN v.hostel_id <> '' THEN v.hostel_id ELSE u.hostel_id END,
        room_number  = COALESCE(v.room_number, u.room_number),
        assigned_mess= COALESCE(v.assigned_mess, u.assigned_mess),
        phone        = COALESCE(v.phone, u.phone),
        gender       = COALESCE(v.gender, u.gender),
        mess_card_no = COALESCE(v.mess_card_no, u.mess_card_no)
      FROM (VALUES ${valuesStr})
        AS v(email, name, roll, hostel_id, room_number, assigned_mess, phone, gender, mess_card_no)
      WHERE u.email = v.email
    `));
    total += chunk.length;
    console.log(`[bulk] Updated chunk ${i / CHUNK + 1} — total: ${total}/${tuples.length}`);
  }
  console.log(`[bulk] ✅ Done — ${total} rows processed`);
}

main().then(() => process.exit(0)).catch(e => { console.error("[bulk] ERROR:", e.message); process.exit(1); });
