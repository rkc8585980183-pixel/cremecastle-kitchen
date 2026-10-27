# SK Kitchen Inventory — Deployment Guide

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend + API | Next.js 16 (App Router, TypeScript) |
| Database | Neon PostgreSQL (serverless) |
| Auth | JWT signed cookies (jose) |
| Hosting | Vercel (Git push → auto-deploy) |

---

## Step 1 — Neon Database

The Neon project **sk-kitchen-inventory** (`calm-credit-89429206`) is already created and seeded.

**Connection string (keep secret):**
```
postgresql://neondb_owner:<PASSWORD>@ep-delicate-tooth-b88xrump-pooler.c-14.us-east-1.aws.neon.tech/neondb?sslmode=require
```

Get the full string (including password) from:
**Neon Console → sk-kitchen-inventory → Connection Details → Connection String**

If you ever need to re-run migrations on a fresh database:
```bash
psql "$DATABASE_URL" -f migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f scripts/seed.sql
```

---

## Step 2 — Environment Variables

### Local development
```bash
cp .env.example .env.local
# Fill in DATABASE_URL and SESSION_SECRET
npm run dev
```

### Vercel (production)
In Vercel dashboard: **Project → Settings → Environment Variables**, add:

| Name | Value |
|------|-------|
| `DATABASE_URL` | The Neon pooled connection string |
| `SESSION_SECRET` | A random 32+ character string |

Generate SESSION_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Step 3 — Git + Vercel Deploy

### First-time setup
```bash
# Initialize git repo
git init
git add .
git commit -m "Initial commit: SK Kitchen Inventory (Neon DB)"

# Push to GitHub
git remote add origin https://github.com/YOUR_USERNAME/sk-kitchen-inventory.git
git branch -M main
git push -u origin main
```

### Connect to Vercel
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Framework: **Next.js** (auto-detected)
4. Add environment variables (Step 2 above)
5. Click **Deploy**

### Subsequent deployments
```bash
git add .
git commit -m "Your change description"
git push
# Vercel automatically deploys on every push to main
```

---

## Step 4 — First Login

URL: `https://your-vercel-app.vercel.app`

| Field | Value |
|-------|-------|
| Username / Email | `admin` or `admin@skkitchen.com` |
| PIN | `1234` |

**⚠️ Change the PIN immediately after first login** via Admin → Users.

---

## Roles & Permissions

| Role | Access |
|------|--------|
| **Super Admin** | Everything — users, departments, all tabs |
| **Admin** | Configurable tabs: Dashboard, Report, Review, Items, Categories, Sections, Access, Devices, Logs, God Mode (back-date entries), Bulk Upload |
| **Department User** | Their department's daily inventory entry only |

---

## Features Implemented

- ✅ Multi-department inventory entry (section-based: Opening, Received, Issued, In Hand, Wastage)
- ✅ Date-based entry locking with configurable back-date days per department
- ✅ Special Edit Access grants (admin unlocks specific items/dates for a department)
- ✅ Entry history, void/correction tracking (append-only, never destructive)
- ✅ Stock reconciliation report (Opening + movements = expected vs actual In Hand)
- ✅ Admin "God Mode" — back-date entries across any department with audit trail
- ✅ Bulk item import (CSV/Excel)
- ✅ Admin bulk upload of historical inventory data
- ✅ User management with role/permission control
- ✅ Department management (newly created departments work without hardcoded IDs)
- ✅ Category, Item, Section management
- ✅ Department-scoped section overrides (custom names, enable/disable per department)
- ✅ Device session tracking
- ✅ Activity feed and full audit logs
- ✅ Super Admin protection (can't remove last Super Admin)
- ✅ All locks/permissions enforced server-side

---

## Database Schema Overview

```
departments          ← outlets (Janakpuri, Sikanderpur, …)
  └── categories     ← Vegetables, Dry Goods, …
       └── items     ← Tomatoes, Rice, … (dept-scoped)
sections             ← Opening, Received, Issued, In Hand, Wastage
inventory_entries    ← append-only daily records
users                ← Super Admin / Admin / Department User
special_edit_access  ← date+item unlock grants
device_sessions      ← login tracking per device
logs                 ← full audit trail
activity_history     ← user-facing activity feed
admin_settings       ← key/value config (e.g. AdminBackDateEditDays)
dept_section_overrides ← per-dept section visibility + custom names
```
