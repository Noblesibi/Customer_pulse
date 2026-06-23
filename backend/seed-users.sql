-- Check existing users
SELECT uid, name, role FROM "Users" ORDER BY name;

-- Insert all missing users (ON CONFLICT DO NOTHING so existing ones are untouched)
INSERT INTO "Users" (uid, email, name, role, position, "userType", department, password, projects, employees)
VALUES
  ('mock-nazneen-ceo-uid', 'nj@gmail.com', 'Nazneen Jahangir', 'Executive', 'CEO', 'CEO', 'Executive Office', 'nj123', '[]', '[]'),
  ('mock-exec-uid', 'executive@pulse.com', 'Executive User', 'Executive', 'Chief Executive Officer', 'CEO', NULL, 'exec123', '[]', '[]'),
  ('mock-finance-head-uid', 'financehead@gmail.com', 'Finance Head', 'Executive', 'Finance Head', 'Functional Head', 'Finance', 'financehead123',
    '[{"name":"Apex Financial Services","projectManagers":[],"employees":["John Smith","Alice Cooper"]},{"name":"Quarterly Financial Planning","projectManagers":[],"employees":["John Smith"]},{"name":"Billing Integration","projectManagers":[],"employees":["Alice Cooper"]}]',
    '["John Smith","Alice Cooper"]'),
  ('mock-global-hr-head-uid', 'globalhrhead@gmail.com', 'Global HR Head', 'Executive', 'Global HR Head', 'Functional Head', 'HR', 'globalhrhead123',
    '[{"name":"Acme Corporation","projectManagers":[],"employees":["Jane Doe"]},{"name":"Annual Appraisal System","projectManagers":[],"employees":["Bob Marley"]}]',
    '["Jane Doe","Bob Marley"]'),
  ('mock-itg-head-uid', 'itghead@gmail.com', 'ITG Head', 'Executive', 'ITG Head', 'Functional Head', 'ITG', 'itghead123',
    '[{"name":"Global Logistics Inc","projectManagers":[],"employees":["Linus Torvalds"]},{"name":"Cybersecurity Audit","projectManagers":[],"employees":["Steve Wozniak"]}]',
    '["Linus Torvalds","Steve Wozniak"]'),
  ('mock-nda-head-uid', 'ndahead@gmail.com', 'NDA Head', 'Executive', 'NDA Head', 'Functional Head', 'Legal', 'ndahead123',
    '[{"name":"Acme Corporation","projectManagers":[],"employees":["Harvey Specter"]},{"name":"Compliance Training","projectManagers":[],"employees":["Mike Ross"]}]',
    '["Harvey Specter","Mike Ross"]'),
  ('mock-tc-head-uid', 'tchead@gmail.com', 'TC Head', 'Executive', 'TC Head', 'Functional Head', 'TC', 'tchead123',
    '[{"name":"Global Logistics Inc","projectManagers":[],"employees":["Alan Turing"]},{"name":"AI/ML Platform R&D","projectManagers":[],"employees":["Grace Hopper"]}]',
    '["Alan Turing","Grace Hopper"]'),
  ('mock-quality-head-uid', 'qualityhead@gmail.com', 'Quality Head', 'Executive', 'Quality Head', 'Functional Head', 'Quality', 'qualityhead123',
    '[{"name":"Apex Financial Services","projectManagers":[],"employees":["Dennis Ritchie"]},{"name":"Performance Regression Suite","projectManagers":[],"employees":["Ken Thompson"]}]',
    '["Dennis Ritchie","Ken Thompson"]'),
  ('mock-manager-uid', 'manager@pulse.com', 'Manager User', 'Sales Manager', 'Logistics Division Lead', 'BU Head', NULL, 'manager123', '[]', '[]'),
  ('mock-employee-uid', 'employee@pulse.com', 'Employee User', 'Employee', 'Frontend Engineer', 'Employee', NULL, 'employee123', '[]', '[]')
ON CONFLICT (uid) DO NOTHING;

-- Verify final count
SELECT uid, name, role, "userType" FROM "Users" ORDER BY name;
