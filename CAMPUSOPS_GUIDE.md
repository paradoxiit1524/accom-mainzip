# CampusOps — Complete Guide
**IIT Madras BS Hostel Management System**  
Made by **Kartik Chilkoti**

---

## Live URLs

| Service | URL |
|---------|-----|
| **API (Railway)** | https://campusops-api-production.up.railway.app |
| **Web Admin** | https://campusops-api-production.up.railway.app (served by API at `/`) |
| **Health Check** | https://campusops-api-production.up.railway.app/health |

---

## 1. Running the App on Expo Go

### Prerequisites
- Install **Expo Go** on your phone:
  - iOS: https://apps.apple.com/app/expo-go/id982107779
  - Android: https://play.google.com/store/apps/details?id=host.exp.exponent

### Step-by-step

1. Open the **Expo Go (Tunnel)** workflow in Replit (or run locally):
   ```bash
   cd artifacts/mobile
   EXPO_PUBLIC_API_URL=https://campusops-api-production.up.railway.app/api \
   pnpm exec expo start --tunnel --port 8099
   ```

2. A **QR code** will appear in the terminal.

3. Open **Expo Go** on your phone and scan the QR code.
   - iOS: Use the Camera app to scan, it will open Expo Go automatically.
   - Android: Open Expo Go → tap **Scan QR code**.

4. The app will bundle and open on your device.

> **Note:** The tunnel option (`--tunnel`) means your phone connects via the internet — it works on any network, not just the same Wi-Fi.

### API URL Priority (Mobile)
The app resolves the API URL in this order:
1. `EXPO_PUBLIC_API_URL` environment variable (highest priority)
2. `app.json → extra.apiUrl` (set to Railway URL)
3. Hardcoded fallback: `https://campusops-api-production.up.railway.app/api`

---

## 2. Authentication — All Accounts

### Demo Staff Accounts
| Email | Password | Role | Access |
|-------|----------|------|--------|
| `superadmin@iitm.ac.in` | `123456` | Super Admin | Full access — CSV import, manage all users, PDF export, master table |
| `admin@iitm.ac.in` | `123456` | Admin | Full access except super-admin tools |
| `coordinator@iitm.ac.in` | `123456` | Coordinator | Manage multiple hostels, announcements |
| `volunteer@iitm.ac.in` | `123456` | Volunteer | Attendance, inventory, mess card for Bhadra hostel |
| `volunteer2@iitm.ac.in` | `123456` | Volunteer | Attendance, inventory for Brahmaputra hostel |
| `student@iitm.ac.in` | `123456` | Student | View hostel info, lost & found, notifications |

### Real Student Login (3,055 students)
- **Email**: Use the email from the student CSV (e.g. `21f2000845@ds.study.iitm.ac.in`)
- **Password**: Roll number in **lowercase** (e.g. `21f2000845`)
- **Pattern**: `{roll}@ds.study.iitm.ac.in` with password = `{roll}` (all lowercase)

### Real Dept Member Login (52 staff)
- **Email**: From `dept-members.json`
- **Password**: Email prefix (part before `@`) in lowercase

### Register a New Account
1. Open the app → tap **Register** tab on the auth screen
2. Fill in: Name, Email, Roll Number, Password (min 6 chars)
3. Submit — status becomes **pending**
4. Super Admin approves from **Manage Staff** screen (web admin or mobile)
5. Once approved, user can log in

---

## 3. Role-Based Features

### Student
- Home — campus news, announcements, hostel info
- Hostel tab — hostel details, room assignment
- Lost & Found — report lost items, view all items
- Notifications — personal notifications
- Profile — view details, logout

### Volunteer
All student features plus:
- **Attendance tab** — mark students as entered/not entered
- **Inventory** — track mattress, bedsheet, pillow per student
- **Mess Card** — toggle card given/not given per student
- **Submit inventory** — permanently lock a student's inventory record
- **Staff Status** — go active/inactive with remark
- **Global Search** — search any student by name, roll, room

### Coordinator
All volunteer features plus:
- Manage **multiple hostels**
- Post **announcements**
- View all attendance across assigned hostels

### Admin
All coordinator features plus:
- CSV export (students, attendance, inventory, timelogs)
- View master table

### Super Admin
All admin features plus:
- **CSV Import** — bulk upload students, mess allocation, hostel assignments, staff
- **PDF Export** — generate PDF reports for students, attendance, activity logs, full report
- **Master Table** — paginated view of all 3,000+ students
- **Manage Staff** — create accounts, approve/reject registrations, assign hostels
- **Activity Logs** — real-time log of all staff actions

---

## 4. Mobile App Screens

### Tab Bar (visible to all)
| Tab | Screen | Description |
|-----|--------|-------------|
| Home | `app/(tabs)/index.tsx` | Role-adaptive dashboard with stats, announcements, quick actions |
| Attendance/Lost&Found | `app/(tabs)/lostandfound.tsx` | Staff → Attendance+Inventory | Students → Lost & Found |
| Hostel | `app/(tabs)/hostel.tsx` | Hostel list, student list |
| Notifications | `app/(tabs)/notifications.tsx` | Personal notifications |
| Profile | `app/(tabs)/profile.tsx` | Profile details, tools menu, logout |

### Staff-Only Screens (via Profile tools menu)
| Screen | Path | Who Can Access |
|--------|------|----------------|
| Global Search | `app/admin/search.tsx` | Volunteer+ |
| Staff Status | `app/admin/staff-status.tsx` | Volunteer+ |
| Activity Logs | `app/admin/activity-logs.tsx` | Volunteer+ |
| Inventory Table | `app/admin/inventory-table.tsx` | Volunteer+ |
| Reports | `app/admin/reports.tsx` | SuperAdmin |
| CSV Import | `app/admin/csv-import.tsx` | SuperAdmin |
| Master Table | `app/admin/master-table.tsx` | Admin+ |
| Manage Staff | `app/admin/manage-admins.tsx` | SuperAdmin |

---

## 5. Web Admin Portal

Visit: https://campusops-api-production.up.railway.app

| Page | Role Required | Features |
|------|--------------|---------|
| Dashboard | Any staff | Stats, charts, active staff list, recent activity |
| Students | Any staff | Search, filter by hostel/mess, profile modal, CSV export |
| Attendance | Any staff | Date picker, hostel filter, check-in/out times |
| Hostels | Any staff | Grid view with occupancy bars |
| Staff | Any staff | Online/offline status, add staff modal |
| Lost & Found | Any staff | Status management, add items |
| Master Table | Admin+ | Full paginated table, all filters |
| CSV Import | SuperAdmin | Upload CSVs for bulk data import |
| Activity Logs | Any staff | Real-time logs, filter, CSV + PDF export |
| Reports | Admin+ | Charts, CSV/PDF download for all exports |
| Manage Staff | SuperAdmin | Create accounts, approve/reject registrations |

---

## 6. API Reference

**Base URL:** `https://campusops-api-production.up.railway.app/api`

All endpoints (except `/auth/login`, `/auth/register`, `/health`) require:
```
Authorization: Bearer <jwt_token>
```

### Auth
```
POST /auth/login          { email, password } → { success, token, user }
POST /auth/register       { name, email, password, rollNumber } → { message }
GET  /auth/me             → user object
POST /auth/logout         → { success }
```

### Students
```
GET  /students?limit=&offset=&hostelId=&search=   → { students, total }
GET  /students/:id                                 → student object
POST /students                                     → create student
PATCH /students/:id                                → update student
DELETE /students/:id                               → delete (superadmin)
```

### Hostels
```
GET /hostels              → array of hostels
GET /hostels/:id          → hostel with students
```

### Attendance
```
GET  /attendance?hostelId=  → students with attendance + inventory
POST /attendance/:studentId { status: "entered"|"not_entered" }
GET  /attendance/stats      → today's counts
PATCH /attendance/inventory/:studentId  { mattress, bedsheet, pillow }
POST  /attendance/inventory/:studentId/submit  → locks inventory permanently
PATCH /attendance/mess-card/:studentId  { messCard: true|false }
```

### Search
```
GET /search?q=&limit=&offset=  → paginated results (students + staff)
```

### Staff Status
```
POST /staff/go-active      { remark }  → { status, lastActiveAt }
POST /staff/go-inactive    { remark }  → { status }
POST /staff/heartbeat                  → { ok }
GET  /staff/me-status                  → { status, lastActiveAt }
GET  /staff/active-list                → active staff last 10 min
GET  /staff/all                        → all staff with online/offline
GET  /staff/logs?limit=&offset=        → paginated activity logs
```

### Lost & Found
```
GET    /lostitems                        → all items
POST   /lostitems  { title, description, location }
PATCH  /lostitems/:id  { status }        → admin+
DELETE /lostitems/:id                    → own item or admin+
```

### CSV Export (Admin+)
```
GET /export/students.csv
GET /export/attendance.csv?date=YYYY-MM-DD
GET /export/inventory.csv
GET /export/full-report.csv
GET /export/timelogs
```

### PDF Export (SuperAdmin)
```
GET /pdf/students
GET /pdf/attendance?date=YYYY-MM-DD
GET /pdf/activity-logs
GET /pdf/full-report
```

### CSV Import (SuperAdmin)
```
POST /import/students          multipart/form-data { file }
POST /import/mess              multipart/form-data { file }
POST /import/hostel-assignment multipart/form-data { file }
POST /import/staff?purge=true  multipart/form-data { file }

GET /import/template/students
GET /import/template/mess
GET /import/template/hostel-assignment
GET /import/template/staff
```

### Reports
```
GET /reports/summary  → { totalStudents, totalHostels, totalStaff, totalAnnouncements, recentActivity }
```

---

## 7. Data Summary (Production)

| Data | Count |
|------|-------|
| Students | 3,055 (real IITM BS students) |
| Staff (dept members) | 52 real + 5 demo = 57 |
| Hostels | 13 (Bhadra, Brahmaputra, Cauvery, Ganga, Godavari, Jamuna, Krishna, Mandakini, Narmada, Saraswathi, Sharavathi, Swarnamukhi, Tapti) |
| Emergency Contacts | 5 |
| Announcements | 4 |

---

## 8. Inventory Locking Flow

1. Volunteer opens a student's card in the Attendance tab
2. Marks campus in/out status
3. Updates mattress / bedsheet / pillow checkboxes
4. Clicks **Submit** — permanently locks inventory for that student
5. Once locked, nobody can edit (enforced server-side + client-side)
6. `inventoryLocked = true` is stored with `lockedBy` and `lockedAt`

---

## 9. CSV Import Format

### Students CSV
```csv
Roll Number,Name,Email,Hostel,Room Number,Mess,Phone,Gender
21f2000001,Arjun Kumar,21f2000001@ds.study.iitm.ac.in,Bhadra,101,Neelkesh - North - Veg,9876543210,Male
```

### Staff CSV
```csv
Email,Name,Contact Number,Gender,Role
volunteer@example.com,Priya Sharma,9876543210,Female,volunteer
```
Roles: `volunteer` | `coordinator` | `admin` | `superadmin`

### Mess Allocation CSV
```csv
Roll Number,Mess
21f2000001,Neelkesh - North - Veg
```

### Hostel Assignment CSV
```csv
Roll Number,Hostel,Room Number
21f2000001,Bhadra,A101
```

---

## 10. Tech Stack

| Layer | Tech |
|-------|------|
| Mobile | Expo SDK 53, React Native, Expo Router v6 |
| Web Admin | React + Vite + Tailwind CSS |
| API | Express 5, Node.js 24, TypeScript |
| Database | PostgreSQL 18 (Railway) |
| ORM | Drizzle ORM |
| Auth | JWT (30-day tokens) |
| Hosting | Railway (API + DB + Web Admin) |
| Monorepo | pnpm workspaces |

---

*CampusOps — Built for IIT Madras BS Programme*  
*Made by Kartik Chilkoti*
