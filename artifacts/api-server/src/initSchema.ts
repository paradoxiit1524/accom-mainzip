/**
 * Programmatic schema initialisation — runs CREATE TABLE IF NOT EXISTS for
 * every table. Works without drizzle-kit or pnpm at runtime. Safe to call on
 * every boot (fully idempotent).
 */
import { pool } from "@workspace/db";

export async function initSchema() {
  let client: any;
  try {
    client = await pool.connect();
  } catch (connErr: any) {
    const msg = connErr?.message || JSON.stringify(connErr) || "unknown connection error";
    console.error("[schema] DB connection failed:", msg);
    throw new Error("DB connection failed: " + msg);
  }
  try {
    console.log("[schema] Initialising database schema...");
    await client.query(`
      -- Enums (CREATE TYPE IF NOT EXISTS via DO block)
      DO $$ BEGIN
        CREATE TYPE lost_item_status AS ENUM ('lost','found','claimed');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE announcement_category AS ENUM ('general','urgent','academic','hostel','event');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$ BEGIN
        CREATE TYPE notification_type AS ENUM ('announcement','lostitem','discipline','general');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      -- hostels
      CREATE TABLE IF NOT EXISTS hostels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        location TEXT,
        total_rooms INTEGER,
        warden_name TEXT,
        warden_phone TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      -- emergency_contacts
      CREATE TABLE IF NOT EXISTS emergency_contacts (
        id TEXT PRIMARY KEY,
        hostel_id TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        phone TEXT NOT NULL,
        is_available_24x7 TEXT DEFAULT 'false',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      -- users
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'student',
        roll_number TEXT,
        phone TEXT,
        contact_number TEXT,
        area TEXT,
        assigned_mess TEXT,
        attendance_status TEXT DEFAULT 'not_entered',
        hostel_id TEXT,
        room_number TEXT,
        gender TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        last_active_at TIMESTAMP,
        assigned_hostel_ids TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      -- attendance
      CREATE TABLE IF NOT EXISTS attendance (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        volunteer_id TEXT,
        hostel_id TEXT NOT NULL,
        mess TEXT,
        room_number TEXT,
        status TEXT NOT NULL DEFAULT 'not_entered',
        date TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      -- student_inventory
      CREATE TABLE IF NOT EXISTS student_inventory (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        hostel_id TEXT,
        mattress BOOLEAN DEFAULT FALSE,
        bedsheet BOOLEAN DEFAULT FALSE,
        pillow BOOLEAN DEFAULT FALSE,
        mattress_submitted BOOLEAN DEFAULT FALSE,
        bedsheet_submitted BOOLEAN DEFAULT FALSE,
        pillow_submitted BOOLEAN DEFAULT FALSE,
        mess_card BOOLEAN DEFAULT FALSE,
        mess_card_given_at TIMESTAMP,
        mess_card_revoked_at TIMESTAMP,
        inventory_locked BOOLEAN DEFAULT FALSE,
        locked_by TEXT,
        locked_at TIMESTAMP,
        updated_by TEXT,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      -- time_logs
      CREATE TABLE IF NOT EXISTS time_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        hostel_id TEXT,
        type TEXT NOT NULL DEFAULT 'login',
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      -- lost_items
      CREATE TABLE IF NOT EXISTS lost_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        image_url TEXT,
        status lost_item_status NOT NULL DEFAULT 'lost',
        reported_by TEXT NOT NULL,
        location TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      -- announcements
      CREATE TABLE IF NOT EXISTS announcements (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category announcement_category NOT NULL DEFAULT 'general',
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      -- notifications
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        type notification_type NOT NULL DEFAULT 'general',
        is_read TEXT NOT NULL DEFAULT 'false',
        ref_id TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      -- checkins
      CREATE TABLE IF NOT EXISTS checkins (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        volunteer_id TEXT,
        hostel_id TEXT,
        check_in_time TIMESTAMP,
        check_out_time TIMESTAMP,
        date TEXT NOT NULL,
        note TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      -- mess_attendance
      CREATE TABLE IF NOT EXISTS mess_attendance (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        volunteer_id TEXT,
        hostel_id TEXT,
        date TEXT NOT NULL,
        meal TEXT NOT NULL,
        present TEXT NOT NULL DEFAULT 'true',
        marked_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    // ── Column migrations (safe for existing DBs) ──────────────────────────
    // These ALTER TABLE … ADD COLUMN IF NOT EXISTS statements add columns that
    // were introduced after the initial schema deploy.  They are fully idempotent.
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_number TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS area TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS attendance_status TEXT DEFAULT 'not_entered';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_hostel_ids TEXT DEFAULT '[]';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP;
      ALTER TABLE announcements ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
      ALTER TABLE announcements ADD COLUMN IF NOT EXISTS hostel_id TEXT;
      ALTER TABLE lost_items ADD COLUMN IF NOT EXISTS location TEXT;
      ALTER TABLE student_inventory ADD COLUMN IF NOT EXISTS mess_card BOOLEAN DEFAULT FALSE;
      ALTER TABLE student_inventory ADD COLUMN IF NOT EXISTS mess_card_given_at TIMESTAMP;
      ALTER TABLE student_inventory ADD COLUMN IF NOT EXISTS mess_card_revoked_at TIMESTAMP;
      ALTER TABLE student_inventory ADD COLUMN IF NOT EXISTS mattress_submitted BOOLEAN DEFAULT FALSE;
      ALTER TABLE student_inventory ADD COLUMN IF NOT EXISTS bedsheet_submitted BOOLEAN DEFAULT FALSE;
      ALTER TABLE student_inventory ADD COLUMN IF NOT EXISTS pillow_submitted BOOLEAN DEFAULT FALSE;
      ALTER TABLE student_inventory ADD COLUMN IF NOT EXISTS updated_by TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS mess_card_no TEXT;
    `);
    console.log("[schema] ✅ Schema ready (migrations applied).");
  } catch (err: any) {
    console.error("[schema] Init error:", err.message);
  } finally {
    client.release();
  }
}
