-- SK Kitchen Inventory — Seed Script
-- Run AFTER 001_initial_schema.sql to create the initial Super Admin user.
-- Change the PIN immediately after first login!

-- Default Super Admin (change pin after first login!)
INSERT INTO users (id, email, username, name, pin, role, active, permissions, admin_back_date_edit_days)
VALUES ('USR-superadmin', 'admin@skkitchen.com', 'admin', 'Super Admin', '1234', 'Super Admin', TRUE, '{}', '')
ON CONFLICT (id) DO NOTHING;

-- Default admin_settings
INSERT INTO admin_settings (key, value) VALUES ('AdminBackDateEditDays', '')
ON CONFLICT (key) DO NOTHING;

-- Example departments — update names to match your actual outlets
INSERT INTO departments (id, name, display_order, back_date_edit_days, active)
VALUES
  ('DEPT-001', 'Janakpuri',    1, 1, TRUE),
  ('DEPT-002', 'Sikanderpur',  2, 1, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Core sections — Opening, Received, Issued, In Hand, Wastage
INSERT INTO sections (id, name, display_order, department_scope, movement_sign, include_in_reconciliation, active)
VALUES
  ('SEC-opening',   'Opening',   1, '', 'PLUS',  FALSE, TRUE),
  ('SEC-received',  'Received',  2, '', 'PLUS',  TRUE,  TRUE),
  ('SEC-issued',    'Issued',    3, '', 'MINUS', TRUE,  TRUE),
  ('SEC-inhand',    'In Hand',   4, '', 'PLUS',  FALSE, TRUE),
  ('SEC-wastage',   'Wastage',   5, '', 'MINUS', TRUE,  TRUE)
ON CONFLICT (id) DO NOTHING;
