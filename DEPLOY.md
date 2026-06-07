# CampusOps — Deployment Guide

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                       PRODUCTION                         │
│                                                          │
│  Render.com  ──────────────────────────────────────────  │
│  │  Express API  (/api/*)            port 8080          │ │
│  │  Web Admin    (/)                 Vite static build  │ │
│  │  PostgreSQL   (Render DB)         DATABASE_URL       │ │
│  └──────────────────────────────────────────────────────│ │
│                         ▲                                │
│                         │ HTTPS                          │
│                         │                                │
│  Mobile App  ───────────┘                                │
│  │  Android APK / iOS IPA (EAS build)                   │
│  │  OR Expo Go (testing only — scan QR)                 │
│  └────────────────────────────────────────────────────  │
└──────────────────────────────────────────────────────────┘
```

**Live URLs (after Render deployment):**

| URL | What |
|---|---|
| `https://accom-iitm26.onrender.com/` | Web Admin login page |
| `https://accom-iitm26.onrender.com/api` | REST API root |
| `https://accom-iitm26.onrender.com/api/health` | Health check → `{"status":"ok"}` |

---

## Part 1 — Backend + Web Admin on Render.com

### Step 1 — Push your code to GitHub

```bash
git add -A
git commit -m "deploy"
git push origin main
```

### Step 2 — Create the Render service

1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub repository
3. Render detects `render.yaml` automatically — click **"Use render.yaml"**

### Step 3 — Create the PostgreSQL database

1. Render Dashboard → **New → PostgreSQL** (free tier)
2. Name it `campusops-db`
3. After creation, go to the database → **Info** → copy the **Internal Database URL**
   - It looks like: `postgresql://campusops:PASSWORD@dpg-XXXX.oregon-postgres.render.com/campusops`
4. Paste this as `DATABASE_URL` in your Web Service → **Environment** tab

### Step 4 — Set environment variables on Render

In your Web Service → **Environment** tab:

| Key | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Internal Postgres URL | From Step 3 — use **Internal**, not External |
| `JWT_SECRET` | 64-char random hex string | Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `NODE_ENV` | `production` | Required for serving the Web Admin |
| `PORT` | `8080` | Must match render.yaml |
| `SEED_REAL_DATA` | `true` | **First deploy only** — loads 3,075 students + 52 staff |
| `AUTO_SEED` | `false` | Leave false (SEED_REAL_DATA handles seeding) |

> After the first successful deploy with real data loaded, set `SEED_REAL_DATA=false` to skip re-seeding on every restart.

### Step 5 — Deploy

Render deploys automatically when you push to GitHub. Build takes 3–5 minutes.

The build does these steps automatically (from `render.yaml`):
```
pnpm install --no-frozen-lockfile
pnpm --filter @workspace/api-server run build      # builds Express to dist/
pnpm --filter @workspace/web-admin run build       # builds React to dist/
pnpm --filter @workspace/db run push               # creates all DB tables
node artifacts/api-server/dist/index.cjs           # starts server
```

### Step 6 — Verify deployment

```bash
# Health check
curl https://accom-iitm26.onrender.com/api/health
# → {"status":"ok","timestamp":"..."}

# Login test
curl -X POST https://accom-iitm26.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@iitm.ac.in","password":"123456"}'
# → {"success":true,"token":"...","user":{...}}
```

Then open `https://accom-iitm26.onrender.com/` in a browser → Web Admin login page.

### Preventing cold starts (Render free tier sleeps after 15 min)

**Recommended — UptimeRobot (free):**
1. Sign up at [uptimerobot.com](https://uptimerobot.com)
2. New Monitor → HTTP(s)
3. URL: `https://accom-iitm26.onrender.com/api/health`
4. Interval: **5 minutes**

**Alt — cron-job.org (free):**
1. [cron-job.org](https://cron-job.org) → Create cronjob
2. URL: `https://accom-iitm26.onrender.com/api/health`
3. Schedule: every **14 minutes**

---

## Part 2 — Backend + Web Admin on Railway (alternative)

### Step 1 — Push code to GitHub (same as above)

### Step 2 — Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
2. Select your repository
3. Railway detects `railway.json` automatically

### Step 3 — Add PostgreSQL

In your Railway project: **New → Database → PostgreSQL**

Railway auto-injects `DATABASE_URL` into your service.

### Step 4 — Set environment variables

In your Railway service → **Variables** tab:

| Key | Value |
|---|---|
| `JWT_SECRET` | 64-char random hex string |
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `AUTO_SEED` | `true` (first deploy only, then set to `false`) |
| `SEED_REAL_DATA` | `true` (first deploy only, then set to `false`) |

### Step 5 — Deploy and get your URL

Railway auto-deploys and gives you a URL like:
`https://campusops-production.up.railway.app`

Update the mobile app's API URL (see Part 4) to:
`https://campusops-production.up.railway.app/api`

---

## Part 3 — Expo Go (Quick Testing — no build needed)

Use this to test the mobile app live on your phone in under 2 minutes.

### Requirements

- [Expo Go](https://expo.dev/go) installed on your Android or iOS phone
- Replit project running (all three workflows active)

### Steps

1. In Replit, start the **"Expo Go (Tunnel)"** workflow (it may already be running)
2. Watch the terminal — it shows a QR code once the tunnel is ready:
   ```
   Tunnel connected.
   ▄▄▄▄▄▄▄▄▄▄▄...  ← QR code
   › Metro: exp://r9i4ogu-anonymous-8099.exp.direct
   ```
3. Open **Expo Go** on your phone → **Scan QR code**
4. Point your phone camera at the QR code
5. The app loads and logs in against your live backend

### What the Expo Go app uses for API

The tunnel workflow is configured with:
```
EXPO_PUBLIC_API_URL=https://$REPLIT_DEV_DOMAIN/api
```
This points to your Replit backend via the web admin proxy (no Render required for testing).

### Demo accounts (all password `123456`)

| Email | Role | Access |
|---|---|---|
| `superadmin@iitm.ac.in` | Super Admin | Full access + CSV import + PDF export |
| `admin@iitm.ac.in` | Admin | Reports + Master Table |
| `coordinator@iitm.ac.in` | Coordinator | Manages multiple hostels |
| `volunteer@iitm.ac.in` | Volunteer | Attendance + Inventory marking |
| `student@iitm.ac.in` | Student | Hostel info + Lost & Found |

### Real user logins (from seeded data)

- **Department staff**: email = as imported, password = email prefix (e.g. `24f3100093`)
- **Students**: email = `{rollnumber}@ds.study.iitm.ac.in`, password = roll number lowercase

---

## Part 4 — EAS Build (Production APK / IPA)

Use this to create a real installable app for Android or iOS.

### Prerequisites

```bash
# EAS CLI is pre-installed in this Replit via Nix
eas --version

# Log in to your Expo account (account: sportifykartik)
eas login
```

Your EAS project is already configured:
- **Project ID**: `0533180b-87ac-4b76-82a8-c48de7d426c7`
- **Owner**: `sportifykartik`
- **Android package**: `in.iitm.campusops`
- **iOS bundle ID**: `in.iitm.campusops`

### Step 1 — Make sure your backend is deployed on Render

The production EAS build always points to:
`https://accom-iitm26.onrender.com/api`

Verify it's live first:
```bash
curl https://accom-iitm26.onrender.com/api/health
```

### Step 2 — Build Android APK (internal testing, no Play Store needed)

```bash
cd artifacts/mobile

eas build --platform android --profile preview
```

- Takes ~10–15 minutes (builds in Expo's cloud)
- When done, you get a download link → install the `.apk` directly on any Android phone
- Enable "Install from unknown sources" in Android settings first

### Step 3 — Build iOS (requires Apple Developer account)

```bash
cd artifacts/mobile

eas build --platform ios --profile preview
```

- Requires Apple Developer Program membership ($99/year)
- EAS handles signing automatically if you have an Apple account

### Step 4 — Production build (for Google Play / App Store)

```bash
cd artifacts/mobile

# Android (produces .aab for Google Play)
eas build --platform android --profile production

# iOS (produces .ipa for App Store)
eas build --platform ios --profile production

# Both at once
eas build --platform all --profile production
```

### Step 5 — Download and install

1. Go to [expo.dev](https://expo.dev) → Projects → CampusOps → Builds
2. Click the build → **Download**
3. For Android: send the `.apk` to your phone and install
4. For iOS: use TestFlight (via EAS Submit) or Ad Hoc distribution

### Step 6 — Submit to stores (optional)

```bash
cd artifacts/mobile

# Submit to Google Play
eas submit --platform android

# Submit to App Store
eas submit --platform ios
```

---

## Part 5 — Updating the Mobile API URL

When you change backends (e.g. new Render URL), update the mobile app in **one place**:

**File:** `artifacts/mobile/eas.json`

Change the `EXPO_PUBLIC_API_URL` in all three build profiles:

```json
{
  "build": {
    "development": { "env": { "EXPO_PUBLIC_API_URL": "https://YOUR-URL.onrender.com/api" } },
    "preview":     { "env": { "EXPO_PUBLIC_API_URL": "https://YOUR-URL.onrender.com/api" } },
    "production":  { "env": { "EXPO_PUBLIC_API_URL": "https://YOUR-URL.onrender.com/api" } }
  }
}
```

Then rebuild with `eas build`.

For Expo Go in Replit (without rebuilding), set `EXPO_PUBLIC_API_URL` in Replit Secrets — the Expo Go workflow picks it up on restart.

---

## Environment Variables Reference

### Backend / Web Admin (Render or Railway)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | 64-char hex string — keep this secret |
| `NODE_ENV` | Yes | Set to `production` |
| `PORT` | Yes | Set to `8080` |
| `SEED_REAL_DATA` | First deploy | `true` = loads 3,075 students + 52 staff. Set `false` after. |
| `AUTO_SEED` | Optional | `true` = creates 5 demo accounts only. Skip if using SEED_REAL_DATA. |

### Mobile App (EAS Build)

| Variable | Where | Description |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `eas.json` build env | Backend API URL e.g. `https://accom-iitm26.onrender.com/api` |

### Replit (Development)

| Variable | Where | Description |
|---|---|---|
| `DATABASE_URL` | Replit Secrets | Auto-provisioned by Replit PostgreSQL |
| `JWT_SECRET` | Replit Secrets | Set via Replit Secrets panel |
| `EXPO_PUBLIC_API_URL` | Expo workflow | Set dynamically via `$REPLIT_DEV_DOMAIN` in workflow command |

---

## Real Data Summary

After deploying with `SEED_REAL_DATA=true`:

| Data | Count |
|---|---|
| Students | 3,075 real IITM BS students |
| Hostels | 26 (real IITM hostel names) |
| Department staff | 52 (volunteers, admins, coordinators, superadmins) |
| Demo accounts | 5 (superadmin / admin / coordinator / volunteer / student) |

---

## Web Admin Portal

The Web Admin is served from the same Render service at the root URL.

**Login:** `https://accom-iitm26.onrender.com/` → use any demo account or real staff account.

**Pages available by role:**

| Page | Min Role |
|---|---|
| Dashboard | volunteer |
| Students | volunteer |
| Attendance | volunteer |
| Hostels | volunteer |
| Staff | volunteer |
| Lost & Found | volunteer |
| Activity Logs | volunteer |
| Master Table | admin |
| Reports | admin |
| CSV Import | superadmin |
| Manage Staff | superadmin |

---

## Troubleshooting

### "ENOENT: no such file or directory .../web-admin/dist/index.html"
The Vite build step didn't run. Check Render build logs — the build command must include:
```
pnpm --filter @workspace/web-admin run build
```
This is already fixed in `render.yaml`. Redeploy.

### "relation does not exist" / database error
The DB schema wasn't pushed. Check that the start command includes:
```
pnpm --filter @workspace/db run push
```
Already fixed in `render.yaml` and `railway.json`.

### Empty tables / no students
Set `SEED_REAL_DATA=true` and `AUTO_SEED=true` in Render env → Save → **Manual Deploy**.
After first boot with data, set both back to `false`.

### Expo Go shows white screen
The Expo Go tunnel isn't running. In Replit, start the **"Expo Go (Tunnel)"** workflow and wait for the QR code to appear in the terminal.

### Expo Go "Login Failed" error
The API URL is wrong or the backend is down. Check:
1. Render health check: `https://accom-iitm26.onrender.com/api/health`
2. If it returns HTML → Render is down (cold start or error — check Render logs)
3. If health returns `{"status":"ok"}` but login fails → wrong credentials or empty DB

### JWT errors / sessions breaking after restart
`JWT_SECRET` is not set or changed between restarts. Set it as a **stable Replit Secret** (not a shared env var) — it must be the same value every time the backend starts.

### Mobile app connects to wrong backend
Check `artifacts/mobile/eas.json` — all three build profiles must have `EXPO_PUBLIC_API_URL` pointing to the correct deployed URL.

### Render cold start (30–60 second delay)
Set up UptimeRobot (free) to ping `/api/health` every 5 minutes. See Part 1 above.
