import { Router } from "express";
import PDFDocument from "pdfkit";
import { db, usersTable, hostelsTable, attendanceTable, timeLogsTable, checkinsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAdmin, requireSuperAdmin } from "../lib/auth.js";

const router = Router();

// ─── Constants ────────────────────────────────────────────────────────────────

const ROW_H = 20;
const HDR_H = 24;
const CELL_PAD = 6;
const FONT_HDR = 8.5;
const FONT_ROW = 8;

const C = {
  purple:    "#7C3AED",
  purpleLt:  "#DDD6FE",
  blue:      "#1E3A8A",
  blueMid:   "#2563EB",
  white:     "#FFFFFF",
  rowEven:   "#FFFFFF",
  rowOdd:    "#F8FAFC",
  border:    "#CBD5E1",
  text:      "#1E293B",
  textSub:   "#64748B",
  green:     "#15803D",
  greenLt:   "#DCFCE7",
  red:       "#DC2626",
  redLt:     "#FEE2E2",
  amber:     "#B45309",
  amberLt:   "#FEF3C7",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Buffer the entire PDF document, then send it with Content-Length so the
 * browser always receives a complete file (avoids truncation with piped streams).
 */
function sendPdf(doc: InstanceType<typeof PDFDocument>, res: any, filename: string) {
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  doc.on("end", () => {
    const pdf = Buffer.concat(chunks);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(pdf.length));
    res.end(pdf);
  });
  doc.on("error", (err: Error) => {
    console.error("[PDF] Error generating PDF:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "PDF generation failed", message: err.message });
    }
  });
}

/**
 * Format a timelog note for human-readable display.
 * Assignment notes are stored as JSON objects; all others are plain text.
 */
function formatNoteForPdf(note: string | null | undefined, type: string): string {
  if (!note) return "—";
  try {
    const obj = JSON.parse(note);
    if (typeof obj !== "object" || obj === null) return note;
    if (type === "assignment") {
      const sentences: string[] = [];
      const fromRole = obj.from?.role;
      const toRole = obj.to?.role;
      if (fromRole && toRole && fromRole !== toRole) {
        sentences.push(`Role was changed from ${fromRole} to ${toRole}.`);
      } else if (fromRole) {
        sentences.push(`Role remains ${fromRole}.`);
      }
      const fh: string[] = obj.from?.assignedHostelIds || [];
      const th: string[] = obj.to?.assignedHostelIds || [];
      if (JSON.stringify(fh) !== JSON.stringify(th)) {
        const from = fh.length ? fh.join(", ") : "none";
        const to = th.length ? th.join(", ") : "none";
        sentences.push(`Hostel assignment changed from ${from} to ${to}.`);
      }
      if (obj.to?.area) sentences.push(`Area set to ${obj.to.area}.`);
      return sentences.length > 0 ? sentences.join(" ") : "Staff assignment was updated.";
    }
    return note;
  } catch {
    return note;
  }
}

function t(s: string | null | undefined, n: number): string {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function fmtTS(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts as string).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: true,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts as string).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour12: true,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Draw the full-width purple header bar at the top of the current page. */
function drawPageHeader(doc: any, reportTitle: string, subtitle: string) {
  const pw = doc.page.width;
  const generated = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  // Purple bar
  doc.rect(0, 0, pw, 62).fill(C.purple);

  // White accent strip
  doc.rect(0, 62, pw, 3).fill(C.purpleLt);

  // Top-left brand
  doc.fontSize(9).fillColor(C.purpleLt).font("Helvetica")
    .text("IIT MADRAS BS  ·  CAMPUSOPS", 40, 10, { lineBreak: false });

  // Report title
  doc.fontSize(18).fillColor(C.white).font("Helvetica-Bold")
    .text(reportTitle, 40, 24, { lineBreak: false });

  // Subtitle / generated
  doc.fontSize(7.5).fillColor(C.purpleLt).font("Helvetica")
    .text(
      subtitle ? `${subtitle}   ·   Generated: ${generated}` : `Generated: ${generated}`,
      40, 48, { lineBreak: false }
    );
}

/** Draw page number + brand footer at the bottom of the current page. */
function drawPageFooter(doc: any, pageNum: number) {
  const pw = doc.page.width;
  const ph = doc.page.height;
  const generated = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  doc.moveTo(40, ph - 28).lineTo(pw - 40, ph - 28)
    .strokeColor(C.border).lineWidth(0.5).stroke();

  doc.fontSize(7).fillColor(C.textSub).font("Helvetica")
    .text(`CampusOps — IIT Madras BS  ·  ${generated}`, 40, ph - 20, {
      width: pw - 200,
      lineBreak: false,
    });

  doc.fontSize(7).fillColor(C.textSub).font("Helvetica")
    .text(`Page ${pageNum}`, pw - 90, ph - 20, { width: 60, align: "right", lineBreak: false });
}

/** Draw a stat box (colored card). Returns the right edge x. */
function drawStatBox(
  doc: any, x: number, y: number, w: number, h: number,
  label: string, value: string, accent: string
) {
  doc.rect(x, y, w, h).fill("#F8FAFC");
  doc.rect(x, y, w, h).strokeColor(C.border).lineWidth(0.5).stroke();
  doc.rect(x, y, 4, h).fill(accent);

  doc.fontSize(16).fillColor(accent).font("Helvetica-Bold")
    .text(value, x + 12, y + 5, { width: w - 16, lineBreak: false });

  doc.fontSize(7.5).fillColor(C.textSub).font("Helvetica")
    .text(label.toUpperCase(), x + 12, y + h - 16, { width: w - 16, lineBreak: false });
}

/**
 * Render a full table.
 * Returns the y position after the last row.
 * multilineCol: if set, this column index will wrap text (lineBreak:true) and row height grows dynamically.
 */
function drawTable(
  doc: any,
  headers: string[],
  rows: (string | number)[][],
  colW: number[],
  tableLeft: number,
  startY: number,
  maxY: number,
  colColors?: (string | null)[],
  onNewPage?: (doc: any, pageNum: number) => number,
  multilineCol?: number
): number {
  const totalW = colW.reduce((a, b) => a + b, 0);
  let y = startY;
  let pageNum = 1;

  const drawHeader = (atY: number) => {
    doc.rect(tableLeft, atY, totalW, HDR_H).fill(C.blue);
    let cx = tableLeft;
    headers.forEach((h, i) => {
      doc.fontSize(FONT_HDR).fillColor(C.white).font("Helvetica-Bold")
        .text(h, cx + CELL_PAD, atY + (HDR_H - FONT_HDR) / 2, {
          width: colW[i] - CELL_PAD * 2,
          lineBreak: false,
          ellipsis: true,
        });
      cx += colW[i];
    });
    doc.rect(tableLeft, atY, totalW, HDR_H).strokeColor(C.blue).lineWidth(0.3).stroke();
    return atY + HDR_H;
  };

  y = drawHeader(y);

  rows.forEach((row, ri) => {
    // Calculate effective row height — expand if multiline column has lots of text
    let rowH = ROW_H;
    if (multilineCol !== undefined) {
      const cellText = String(row[multilineCol] ?? "—");
      const charsPerLine = Math.floor((colW[multilineCol] - CELL_PAD * 2) / (FONT_ROW * 0.52));
      const lines = Math.max(1, Math.ceil(cellText.length / charsPerLine));
      rowH = Math.max(ROW_H, lines * (FONT_ROW + 4) + 8);
    }

    if (y + rowH > maxY) {
      drawPageFooter(doc, pageNum);
      doc.addPage();
      pageNum++;
      y = onNewPage ? onNewPage(doc, pageNum) : 75;
      y = drawHeader(y);
    }

    const bg = ri % 2 === 0 ? C.rowEven : C.rowOdd;
    doc.rect(tableLeft, y, totalW, rowH).fill(bg);

    let cx = tableLeft;
    row.forEach((cell, ci) => {
      const override = colColors?.[ci];
      const color = override || C.text;
      const isMulti = multilineCol !== undefined && ci === multilineCol;
      doc.fontSize(FONT_ROW).fillColor(color).font("Helvetica")
        .text(String(cell ?? "—"), cx + CELL_PAD, y + CELL_PAD, {
          width: colW[ci] - CELL_PAD * 2,
          lineBreak: isMulti,
          ellipsis: !isMulti,
          height: isMulti ? rowH - CELL_PAD * 2 : undefined,
        });
      cx += colW[ci];
    });

    doc.moveTo(tableLeft, y + rowH)
      .lineTo(tableLeft + totalW, y + rowH)
      .strokeColor(C.border).lineWidth(0.3).stroke();
    doc.moveTo(tableLeft, y).lineTo(tableLeft, y + rowH).strokeColor(C.border).lineWidth(0.3).stroke();
    doc.moveTo(tableLeft + totalW, y).lineTo(tableLeft + totalW, y + rowH).strokeColor(C.border).lineWidth(0.3).stroke();

    y += rowH;
  });

  return y;
}

// ─── GET /api/pdf/students ────────────────────────────────────────────────────

router.get("/students", requireAdmin, async (_req, res) => {
  const students = await db.select({
    name:       usersTable.name,
    rollNumber: usersTable.rollNumber,
    room:       usersTable.roomNumber,
    mess:       usersTable.assignedMess,
    area:       usersTable.area,
    hostelName: hostelsTable.name,
    attendance: usersTable.attendanceStatus,
  }).from(usersTable)
    .leftJoin(hostelsTable, eq(usersTable.hostelId, hostelsTable.id))
    .where(eq(usersTable.role, "student"));

  const entered = students.filter(s => s.attendance === "entered").length;
  const out     = students.length - entered;

  const doc = new PDFDocument({ margin: 0, size: [841, 595], autoFirstPage: true });
  sendPdf(doc, res, "students.pdf");

  let pageNum = 1;
  drawPageHeader(doc, "Students Directory", `Total: ${students.length}`);

  // Stat boxes
  const boxY = 72;
  const boxH = 46;
  const boxW = 130;
  drawStatBox(doc, 40,         boxY, boxW, boxH, "Total Students", String(students.length), C.purple);
  drawStatBox(doc, 40+boxW+8,  boxY, boxW, boxH, "In Campus",      String(entered),          C.green);
  drawStatBox(doc, 40+boxW*2+16, boxY, boxW, boxH, "Out / Pending", String(out),              C.red);

  // Table — landscape 761pt usable (841 - 40*2)
  // Name:195, Roll:100, Room:45, Mess:180, Hostel:155, Area:36, Status:50 = 761
  const colW    = [195, 100, 45, 180, 155, 36, 50];
  const headers = ["Name", "Roll Number", "Room", "Mess", "Hostel", "Area", "Status"];
  const tableLeft = 40;
  const startY = boxY + boxH + 12;
  const maxY   = 595 - 35;

  const rows = students.map(s => [
    t(s.name, 32),
    t(s.rollNumber, 16),
    t(s.room, 6),
    t(s.mess, 28),
    t(s.hostelName, 24),
    t(s.area, 5),
    s.attendance === "entered" ? "✓ In" : "Out",
  ]);

  // Per-column colors (null = default)
  const colColors: (string | null)[] = [null, null, null, null, null, null, null];

  const finalY = drawTable(doc, headers, rows, colW, tableLeft, startY, maxY, colColors, (d, pn) => {
    drawPageHeader(d, "Students Directory", `Total: ${students.length}`);
    drawPageFooter(d, pn - 1);
    return 72;
  });

  drawPageFooter(doc, pageNum);
  doc.end();
});

// ─── GET /api/pdf/attendance ──────────────────────────────────────────────────

router.get("/attendance", requireAdmin, async (_req, res) => {
  const date = ((_req as any).query.date as string) || new Date().toISOString().split("T")[0];

  const records = await db.select({
    studentName: usersTable.name,
    rollNumber:  usersTable.rollNumber,
    room:        attendanceTable.roomNumber,
    mess:        attendanceTable.mess,
    status:      attendanceTable.status,
    hostelName:  hostelsTable.name,
  }).from(attendanceTable)
    .leftJoin(usersTable,  eq(attendanceTable.studentId, usersTable.id))
    .leftJoin(hostelsTable, eq(attendanceTable.hostelId, hostelsTable.id))
    .where(eq(attendanceTable.date, date));

  const entered = records.filter(r => r.status === "entered").length;
  const out     = records.length - entered;

  const doc = new PDFDocument({ margin: 0, size: [841, 595], autoFirstPage: true });
  sendPdf(doc, res, `attendance-${date}.pdf`);

  let pageNum = 1;
  drawPageHeader(doc, "Attendance Report", `Date: ${date}  ·  ${records.length} records`);

  const boxY = 72;
  const boxH = 46;
  const boxW = 130;
  drawStatBox(doc, 40,         boxY, boxW, boxH, "Total Records", String(records.length), C.purple);
  drawStatBox(doc, 40+boxW+8,  boxY, boxW, boxH, "Entered Campus", String(entered),        C.green);
  drawStatBox(doc, 40+boxW*2+16, boxY, boxW, boxH, "Out / Absent",  String(out),            C.red);

  // Name:195, Roll:100, Room:45, Mess:180, Hostel:191, Status:50 = 761
  const colW    = [195, 100, 45, 180, 191, 50];
  const headers = ["Student Name", "Roll Number", "Room", "Mess", "Hostel", "Status"];
  const tableLeft = 40;
  const startY = boxY + boxH + 12;
  const maxY   = 595 - 35;

  const rows = records.map(r => [
    t(r.studentName, 32),
    t(r.rollNumber, 16),
    t(r.room, 6),
    t(r.mess, 28),
    t(r.hostelName, 30),
    r.status === "entered" ? "✓ In" : "✗ Out",
  ]);

  drawTable(doc, headers, rows, colW, tableLeft, startY, maxY, null as any, (d, pn) => {
    drawPageHeader(d, "Attendance Report", `Date: ${date}`);
    return 72;
  });

  drawPageFooter(doc, pageNum);
  doc.end();
});

// ─── GET /api/pdf/activity-logs ───────────────────────────────────────────────

router.get("/activity-logs", requireAdmin, async (_req, res) => {
  const logs = await db.select({
    type:      timeLogsTable.type,
    note:      timeLogsTable.note,
    createdAt: timeLogsTable.createdAt,
    userName:  usersTable.name,
    userRole:  usersTable.role,
    userEmail: usersTable.email,
  }).from(timeLogsTable)
    .leftJoin(usersTable, eq(timeLogsTable.userId, usersTable.id))
    .orderBy(desc(timeLogsTable.createdAt))
    .limit(1000);

  const doc = new PDFDocument({ margin: 0, size: [841, 595], autoFirstPage: true });
  sendPdf(doc, res, "activity-logs.pdf");

  let pageNum = 1;
  drawPageHeader(doc, "Staff Activity Logs", `${logs.length} entries`);

  const boxY = 72;
  const boxH = 46;
  const boxW = 130;
  const loginCount  = logs.filter(l => l.type === "login").length;
  const checkinCount = logs.filter(l => l.type === "checkin").length;
  const otherCount  = logs.length - loginCount - checkinCount;
  drawStatBox(doc, 40,          boxY, boxW, boxH, "Total Events",   String(logs.length),   C.purple);
  drawStatBox(doc, 40+boxW+8,   boxY, boxW, boxH, "Login Events",   String(loginCount),    C.blueMid);
  drawStatBox(doc, 40+boxW*2+16, boxY, boxW, boxH, "Check-in Events", String(checkinCount), C.green);
  drawStatBox(doc, 40+boxW*3+24, boxY, boxW, boxH, "Other Events",   String(otherCount),   C.amber);

  // Date:145, Staff:155, Role:75, Action:80, Note:306 = 761
  const colW    = [145, 155, 75, 80, 306];
  const headers = ["Date & Time", "Staff Name", "Role", "Action", "Note / Remark"];
  const tableLeft = 40;
  const startY = boxY + boxH + 12;
  const maxY   = 595 - 35;

  const rows = logs.map(l => [
    fmtDate(l.createdAt),
    t(l.userName || "Unknown", 24),
    t(l.userRole || "—", 12),
    t(l.type, 12),
    formatNoteForPdf(l.note, l.type),
  ]);

  drawTable(doc, headers, rows, colW, tableLeft, startY, maxY, null as any, (d, pn) => {
    drawPageHeader(d, "Staff Activity Logs", `${logs.length} entries`);
    return 72;
  }, 4);

  drawPageFooter(doc, pageNum);
  doc.end();
});

// ─── GET /api/pdf/full-report ─────────────────────────────────────────────────

router.get("/full-report", requireSuperAdmin, async (_req, res) => {
  const students = await db.select({
    name:       usersTable.name,
    rollNumber: usersTable.rollNumber,
    room:       usersTable.roomNumber,
    mess:       usersTable.assignedMess,
    area:       usersTable.area,
    hostelName: hostelsTable.name,
    attendance: usersTable.attendanceStatus,
  }).from(usersTable)
    .leftJoin(hostelsTable, eq(usersTable.hostelId, hostelsTable.id))
    .where(eq(usersTable.role, "student"));

  const entered = students.filter(s => s.attendance === "entered").length;
  const out     = students.length - entered;

  // Build hostel summary
  const hostelMap: Record<string, { total: number; entered: number }> = {};
  students.forEach(s => {
    const h = s.hostelName || "Unknown";
    if (!hostelMap[h]) hostelMap[h] = { total: 0, entered: 0 };
    hostelMap[h].total++;
    if (s.attendance === "entered") hostelMap[h].entered++;
  });
  const hostelSummary = Object.entries(hostelMap)
    .sort((a, b) => b[1].total - a[1].total);

  const doc = new PDFDocument({ margin: 0, size: [841, 595], autoFirstPage: true });
  sendPdf(doc, res, "full-report.pdf");

  let pageNum = 1;
  const generated = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  drawPageHeader(doc, "Full Campus Report", `Total Students: ${students.length}`);

  // Stat boxes — row 1
  const boxY = 72;
  const boxH = 46;
  const boxW = 180;
  drawStatBox(doc, 40,          boxY, boxW, boxH, "Total Students", String(students.length), C.purple);
  drawStatBox(doc, 40+boxW+8,   boxY, boxW, boxH, "In Campus",      String(entered),          C.green);
  drawStatBox(doc, 40+boxW*2+16, boxY, boxW, boxH, "Out / Pending", String(out),              C.red);
  drawStatBox(doc, 40+boxW*3+24, boxY, boxW, boxH, "Total Hostels", String(hostelSummary.length), C.blueMid);

  // Hostel summary mini-table
  const colWH    = [220, 80, 80, 80];
  const headersH = ["Hostel", "Total", "In Campus", "Out"];
  let summaryY = boxY + boxH + 12;
  const tableLeft = 40;

  // Section label
  doc.fontSize(8).fillColor(C.textSub).font("Helvetica-Bold")
    .text("HOSTEL SUMMARY", tableLeft, summaryY, { lineBreak: false });
  summaryY += 13;

  const hostelRows: (string | number)[][] = hostelSummary.slice(0, 8).map(([name, s]) => [
    t(name, 34),
    String(s.total),
    String(s.entered),
    String(s.total - s.entered),
  ]);

  summaryY = drawTable(doc, headersH, hostelRows, colWH, tableLeft, summaryY, 595 - 35, null as any, undefined);

  // Student detail table — right side of page
  const detailLeft = tableLeft + colWH.reduce((a, b) => a + b, 0) + 20;
  const detailWidth = 841 - 40 - detailLeft;
  // Name:165, Roll:90, Room:40, Status:45 = 340... adjust
  const remainW = 841 - 40 - detailLeft;
  const colWD = [Math.round(remainW * 0.43), Math.round(remainW * 0.26), Math.round(remainW * 0.13), Math.round(remainW * 0.18)];
  const headersD = ["Name", "Roll Number", "Room", "Status"];
  let detailY = boxY + boxH + 12;

  doc.fontSize(8).fillColor(C.textSub).font("Helvetica-Bold")
    .text("STUDENT DETAILS (preview)", detailLeft, detailY, { lineBreak: false });
  detailY += 13;

  const detailRows: (string | number)[][] = students.slice(0, 18).map(s => [
    t(s.name, 24),
    t(s.rollNumber, 14),
    t(s.room, 5),
    s.attendance === "entered" ? "✓ In" : "Out",
  ]);

  drawTable(doc, headersD, detailRows, colWD, detailLeft, detailY, 595 - 35, null as any, undefined);

  drawPageFooter(doc, pageNum);

  // ── Page 2+: full student table ───────────────────────────────────────────
  pageNum++;
  doc.addPage();
  drawPageHeader(doc, "Full Campus Report — All Students", `Total: ${students.length}`);
  drawPageFooter(doc, pageNum);

  const colW    = [195, 100, 45, 175, 155, 40, 51];
  const headers = ["Name", "Roll Number", "Room", "Mess", "Hostel", "Area", "Status"];
  const startY  = 72;
  const maxY    = 595 - 35;

  const rows = students.map(s => [
    t(s.name, 30),
    t(s.rollNumber, 16),
    t(s.room, 6),
    t(s.mess, 27),
    t(s.hostelName, 24),
    t(s.area, 5),
    s.attendance === "entered" ? "✓ In" : "Out",
  ]);

  drawTable(doc, headers, rows, colW, 40, startY, maxY, null as any, (d, pn) => {
    pageNum = pn;
    drawPageHeader(d, "Full Campus Report — All Students", `Total: ${students.length}`);
    drawPageFooter(d, pn);
    return 72;
  });

  doc.end();
});

// ─── GET /api/pdf/checkins ────────────────────────────────────────────────────

router.get("/checkins", requireAdmin, async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

  const records = await db.select({
    studentName:  usersTable.name,
    rollNumber:   usersTable.rollNumber,
    hostelName:   hostelsTable.name,
    room:         usersTable.roomNumber,
    checkInTime:  checkinsTable.checkInTime,
    checkOutTime: checkinsTable.checkOutTime,
    note:         checkinsTable.note,
  }).from(checkinsTable)
    .leftJoin(usersTable,  eq(checkinsTable.studentId, usersTable.id))
    .leftJoin(hostelsTable, eq(checkinsTable.hostelId, hostelsTable.id))
    .where(eq(checkinsTable.date, date))
    .orderBy(desc(checkinsTable.checkInTime));

  const stillIn  = records.filter(r => r.checkInTime && !r.checkOutTime).length;
  const checkedOut = records.filter(r => r.checkOutTime).length;

  const doc = new PDFDocument({ margin: 0, size: [841, 595], autoFirstPage: true });
  sendPdf(doc, res, `checkins-${date}.pdf`);

  let pageNum = 1;
  drawPageHeader(doc, "Campus Check-in Report", `Date: ${date}  ·  ${records.length} entries`);

  const boxY = 72;
  const boxH = 46;
  const boxW = 130;
  drawStatBox(doc, 40,          boxY, boxW, boxH, "Total Check-ins", String(records.length), C.purple);
  drawStatBox(doc, 40+boxW+8,   boxY, boxW, boxH, "Still Inside",    String(stillIn),         C.green);
  drawStatBox(doc, 40+boxW*2+16, boxY, boxW, boxH, "Checked Out",    String(checkedOut),       C.blueMid);

  // Name:175, Roll:95, Hostel:155, Room:45, In:120, Out:120, Status:51 = 761
  const colW    = [175, 95, 155, 45, 120, 120, 51];
  const headers = ["Student Name", "Roll No.", "Hostel", "Room", "Check-in Time", "Check-out Time", "Status"];
  const tableLeft = 40;
  const startY = boxY + boxH + 12;
  const maxY   = 595 - 35;

  const rows = records.map(r => [
    t(r.studentName, 28),
    t(r.rollNumber, 14),
    t(r.hostelName, 24),
    t(r.room, 6),
    fmtTS(r.checkInTime),
    r.checkOutTime ? fmtTS(r.checkOutTime) : "—",
    r.checkOutTime ? "Out" : r.checkInTime ? "Inside" : "—",
  ]);

  drawTable(doc, headers, rows, colW, tableLeft, startY, maxY, null as any, (d, pn) => {
    drawPageHeader(d, "Campus Check-in Report", `Date: ${date}`);
    drawPageFooter(d, pn - 1);
    return 72;
  });

  drawPageFooter(doc, pageNum);
  doc.end();
});

export default router;
