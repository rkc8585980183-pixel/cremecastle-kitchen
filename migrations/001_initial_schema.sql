-- SK Kitchen Inventory — Initial Schema Migration
-- Run this once against your Neon database to create all required tables.
-- Safe to re-run (uses IF NOT EXISTS / ON CONFLICT DO NOTHING).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  back_date_edit_days INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id),
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id),
  category_id TEXT NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'Pcs',
  display_order INTEGER NOT NULL DEFAULT 0,
  remarks TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  department_scope TEXT NOT NULL DEFAULT '',
  movement_sign TEXT NOT NULL DEFAULT 'PLUS' CHECK (movement_sign IN ('PLUS','MINUS')),
  include_in_reconciliation BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dept_section_overrides (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  department_id TEXT NOT NULL REFERENCES departments(id),
  section_id TEXT NOT NULL REFERENCES sections(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  custom_name TEXT NOT NULL DEFAULT '',
  UNIQUE(department_id, section_id)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Department User' CHECK (role IN ('Super Admin','Admin','Department User')),
  department_id TEXT REFERENCES departments(id),
  permissions JSONB NOT NULL DEFAULT '{}',
  admin_back_date_edit_days TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_entries (
  id TEXT PRIMARY KEY,
  entry_date TEXT NOT NULL,   -- stored as YYYY-MM-DD for easy date comparison
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category_name TEXT NOT NULL DEFAULT '',
  section_name TEXT NOT NULL,
  qty NUMERIC NOT NULL DEFAULT 0,
  entered_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Void')),
  void_reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT NOT NULL REFERENCES users(id),
  user_name TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_info TEXT NOT NULL DEFAULT '',
  login_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS activity_history (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  department_id TEXT NOT NULL DEFAULT '',
  activity_type TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS special_edit_access (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  department_id TEXT NOT NULL REFERENCES departments(id),
  item_id TEXT NOT NULL DEFAULT '',
  item_name TEXT NOT NULL DEFAULT '(All items)',
  entry_date TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_categories_dept ON categories(department_id);
CREATE INDEX IF NOT EXISTS idx_items_dept ON items(department_id);
CREATE INDEX IF NOT EXISTS idx_items_cat ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_entries_item ON inventory_entries(item_id);
CREATE INDEX IF NOT EXISTS idx_entries_date ON inventory_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_entries_item_date ON inventory_entries(item_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_entries_status ON inventory_entries(status);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_special_access_dept_date ON special_edit_access(department_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_device_sessions_user ON device_sessions(user_id);
