import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("student"),
  rollNumber: text("roll_number"),
  phone: text("phone"),
  contactNumber: text("contact_number"),
  gender: text("gender"),
  area: text("area"),
  assignedMess: text("assigned_mess"),
  messCardNo: text("mess_card_no"),
  attendanceStatus: text("attendance_status").default("not_entered"),
  hostelId: text("hostel_id"),
  roomNumber: text("room_number"),
  isActive: boolean("is_active").default(true),
  lastActiveAt: timestamp("last_active_at"),
  assignedHostelIds: text("assigned_hostel_ids").default("[]"),
  pushToken: text("push_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
