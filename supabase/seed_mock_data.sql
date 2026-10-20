-- ============================================================
-- Site Ledger - Demo & Mock Data Seed Script
-- Realistic Pakistani residential construction projects, staff floats,
-- payments, milestones, payables, and daily expenses.
-- ============================================================

-- 1. USERS & PROFILES
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
) VALUES 
(
  'a0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'admin@siteledger.app',
  crypt('admin123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb,
  '{"full_name":"Muhammad Wakeel (Owner / Admin)","role":"admin","phone":"+923001234567"}'::jsonb,
  now(), now(), false
),
(
  'a0000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'ahsan@siteledger.app',
  crypt('sitemanager123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"],"role":"site_manager"}'::jsonb,
  '{"full_name":"Ahsan Malik (Site Supervisor)","role":"site_manager","phone":"+923015551234"}'::jsonb,
  now(), now(), false
),
(
  'a0000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'tariq@siteledger.app',
  crypt('sitemanager123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"],"role":"site_manager"}'::jsonb,
  '{"full_name":"Tariq Mehmood (Site Supervisor)","role":"site_manager","phone":"+923218889900"}'::jsonb,
  now(), now(), false
)
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles SET phone = '+923001234567' WHERE id = 'a0000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET phone = '+923015551234' WHERE id = 'a0000000-0000-0000-0000-000000000002';
UPDATE public.profiles SET phone = '+923218889900' WHERE id = 'a0000000-0000-0000-0000-000000000003';

-- 2. PROJECTS
INSERT INTO public.projects (
  id, name, client_name, client_phone, address, plot_size, covered_area_sqft,
  project_type, supervision_percent, contract_value, start_date, expected_completion,
  status, notes, created_by
) VALUES
(
  'b0000000-0000-0000-0000-000000000001',
  'Ahmed House - Bahria Town Phase 8',
  'Ahmed Bilal',
  '+923004567890',
  'Street 14, Sector B, Bahria Town Phase 8, Rawalpindi',
  '1 Kanal',
  4800,
  'turnkey',
  null,
  25000000,
  '2026-06-01',
  '2027-03-31',
  'active',
  'Full turnkey construction including grey structure, plumbing, electrification, tiles, and high-end woodwork.',
  'a0000000-0000-0000-0000-000000000001'
),
(
  'b0000000-0000-0000-0000-000000000002',
  'Villa 42 - DHA Phase 2, Islamabad',
  'Col. (R) Tariq Javaid',
  '+923335557788',
  'Lane 6, Sector C, DHA Phase 2, Islamabad',
  '10 Marla',
  3200,
  'turnkey',
  null,
  14000000,
  '2026-05-15',
  '2026-12-31',
  'active',
  'Modern 10-Marla luxury villa with Spanish tiles and imported sanitary ware.',
  'a0000000-0000-0000-0000-000000000001'
),
(
  'b0000000-0000-0000-0000-000000000003',
  'Usman Residence - Gulberg Greens',
  'Sheikh Usman Ali',
  '+923219988776',
  'Plot 112, Executive Block, Gulberg Greens, Islamabad',
  '2 Kanal',
  8500,
  'labour_only',
  null,
  2800000,
  '2026-08-01',
  '2027-06-30',
  'active',
  'Labour contract only. Client provides cement, steel, bricks, sand, and finishings directly.',
  'a0000000-0000-0000-0000-000000000001'
),
(
  'b0000000-0000-0000-0000-000000000004',
  'Commercial Plaza - G-11 Markaz',
  'Haji Munir & Sons',
  '+923001122334',
  'Plot 24, G-11 Markaz, Islamabad',
  '15 Marla',
  9000,
  'cost_plus',
  12,
  38000000,
  '2025-10-01',
  '2026-09-30',
  'completed',
  'Cost-plus supervision fee of 12% on verified bills. Successfully handed over to client.',
  'a0000000-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

-- 3. ASSIGNMENTS
INSERT INTO public.project_assignments (project_id, user_id, created_by) VALUES
('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001'),
('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001'),
('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001'),
('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (project_id, user_id) DO NOTHING;

-- 4. CONTRACT REVISION
INSERT INTO public.contract_revisions (
  project_id, old_value, new_value, reason, changed_by, changed_at
) VALUES (
  'b0000000-0000-0000-0000-000000000002',
  13000000,
  14000000,
  'Client requested underground water tank enlargement and extra servant quarter on rooftop (+Rs 10,00,000).',
  'a0000000-0000-0000-0000-000000000001',
  '2026-07-20 10:00:00+05'
)
ON CONFLICT DO NOTHING;

-- 5. VENDORS
INSERT INTO public.vendors (id, name, normalised_name, phone, notes, created_by) VALUES
('c0000000-0000-0000-0000-000000000001', 'Askari Cement Agency', 'askari cement agency', '+923005544332', 'Authorized distributor for Fauji & Bestway Cement. Credit terms 15 days.', 'a0000000-0000-0000-0000-000000000001'),
('c0000000-0000-0000-0000-000000000002', 'Ittefaq Steel Mills & Traders', 'ittefaq steel mills & traders', '+923214433221', 'Grade 60 deformed steel bar supplier. Supply per ton delivered to site.', 'a0000000-0000-0000-0000-000000000001'),
('c0000000-0000-0000-0000-000000000003', 'Malik Bajri & Reta Supplies', 'malik bajri & reta supplies', '+923337766554', 'Margalla crush bajri and Lawrencepur sand dumper supplies.', 'a0000000-0000-0000-0000-000000000001'),
('c0000000-0000-0000-0000-000000000004', 'Khan Brothers Sanitary & Tiles', 'khan brothers sanitary & tiles', '+923008899001', 'Master tiles, Sonex fittings, Porta sanitary ware dealer.', 'a0000000-0000-0000-0000-000000000001'),
('c0000000-0000-0000-0000-000000000005', 'Rehman Electric & Hardware Store', 'rehman electric & hardware store', '+923451122334', 'Pakistan Cables, GM switchboards, conduit pipes, distribution boxes.', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- 6. CASH ISSUANCES
INSERT INTO public.cash_issuances (
  user_id, project_id, issue_date, amount, funding_source, method, note, is_adjustment, created_by
) VALUES
('a0000000-0000-0000-0000-000000000002', null, '2026-10-01', 100000, 'client_funds', 'cash', 'Initial October site float handed over in cash', false, 'a0000000-0000-0000-0000-000000000001'),
('a0000000-0000-0000-0000-000000000002', null, '2026-10-15', 150000, 'client_funds', 'bank_transfer', 'Top-up float transfer via Easypaisa for labour dihari and hardware', false, 'a0000000-0000-0000-0000-000000000001'),
('a0000000-0000-0000-0000-000000000003', null, '2026-10-10', 50000, 'client_funds', 'cash', 'Petty cash for site supplies and tanker water', false, 'a0000000-0000-0000-0000-000000000001'),
('e78000af-a287-4d6e-9d3f-dec7a38f5ce1', 'b0000000-0000-0000-0000-000000000001', '2026-10-05', 200000, 'client_funds', 'cash', 'Initial site float handed over in cash for Ahmed House site setup & groundwork', false, 'a0000000-0000-0000-0000-000000000001'),
('e78000af-a287-4d6e-9d3f-dec7a38f5ce1', 'b0000000-0000-0000-0000-000000000002', '2026-10-14', 150000, 'client_funds', 'bank_transfer', 'Site float top-up via Bank Al Habib for labour dihari and hardware', false, 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- 7. PROJECT ASSIGNMENTS (HKMR KHAN)
INSERT INTO public.project_assignments (project_id, user_id, created_by) VALUES
('b0000000-0000-0000-0000-000000000001', 'e78000af-a287-4d6e-9d3f-dec7a38f5ce1', 'a0000000-0000-0000-0000-000000000001'),
('b0000000-0000-0000-0000-000000000002', 'e78000af-a287-4d6e-9d3f-dec7a38f5ce1', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- 8. EXPENSES RECORDED BY HKMR KHAN
INSERT INTO public.expenses (
  project_id, expense_name, quantity, unit, rate, amount, expense_date, category, purpose, vendor_id, payment_status, paid_from, paid_via, paid_method, created_by
) VALUES
('b0000000-0000-0000-0000-000000000001', 'Dihari Mazdoor - 4 Labourers for Foundation Excavation', 4, 'men', 1800, 7200, '2026-10-06', 'Mazdoor (labour)', 'Manual trench excavation for boundary wall and water tank', null, 'paid', 'client_funds', 'site_float', 'cash', 'e78000af-a287-4d6e-9d3f-dec7a38f5ce1'),
('b0000000-0000-0000-0000-000000000001', 'Water Tanker (Bowser) - 2 Tankers for Compaction', 2, 'bowsers', 3250, 6500, '2026-10-08', 'Water tanker', 'Water supply for earth ramming and compaction before lean concrete', 'c0000000-0000-0000-0000-000000000003', 'paid', 'client_funds', 'site_float', 'cash', 'e78000af-a287-4d6e-9d3f-dec7a38f5ce1'),
('b0000000-0000-0000-0000-000000000001', 'Shuttering Oil, Nails & Binding Wire (16 Gauge)', 1, 'lot', 14800, 14800, '2026-10-10', 'Tools', 'Wood shuttering release oil 2 cans, 10kg wire, 5kg steel nails', 'c0000000-0000-0000-0000-000000000005', 'paid', 'client_funds', 'site_float', 'cash', 'e78000af-a287-4d6e-9d3f-dec7a38f5ce1'),
('b0000000-0000-0000-0000-000000000001', 'Mistri & Mazdoor Dihari - Footing Concrete Pour', 8, 'men', 2750, 22000, '2026-10-12', 'Mistri (mason)', '3 head masons and 5 helper mazdoor for raft foundation concrete pour', null, 'paid', 'client_funds', 'site_float', 'cash', 'e78000af-a287-4d6e-9d3f-dec7a38f5ce1'),
('b0000000-0000-0000-0000-000000000002', 'uPVC Underground Drainage Pipes (4 inch Class B)', 12, 'lengths', 3200, 38400, '2026-10-15', 'Plumbing', 'Main sewerage line installation from courtyard to inspection chamber', 'c0000000-0000-0000-0000-000000000004', 'paid', 'client_funds', 'site_float', 'cash', 'e78000af-a287-4d6e-9d3f-dec7a38f5ce1'),
('b0000000-0000-0000-0000-000000000001', 'Site Tea, Refreshment & Ice for Labour (Weekly)', 1, 'week', 8400, 8400, '2026-10-17', 'Site tea & food', 'Daily afternoon tea and bread for site team, drinking water blocks', null, 'paid', 'client_funds', 'site_float', 'cash', 'e78000af-a287-4d6e-9d3f-dec7a38f5ce1'),
('b0000000-0000-0000-0000-000000000002', 'Emergency Hardware - Level Pipe, Measuring Tape & Trowels', 1, 'set', 4600, 4600, '2026-10-19', 'Tools', 'Water level pipe 50m, 50m fiberglass tape, 4 steel trowels (kandi)', 'c0000000-0000-0000-0000-000000000005', 'paid', 'client_funds', 'site_float', 'cash', 'e78000af-a287-4d6e-9d3f-dec7a38f5ce1'),
('b0000000-0000-0000-0000-000000000001', 'Daily Wage Labour - Site Cleaning & Column Curing', 2, 'men', 1800, 3600, '2026-10-20', 'Mazdoor (labour)', 'Morning and evening curing of RCC columns and clearing debris', null, 'paid', 'client_funds', 'site_float', 'cash', 'e78000af-a287-4d6e-9d3f-dec7a38f5ce1'),
('b0000000-0000-0000-0000-000000000002', 'PPRC Hot/Cold Water Pipes & Brass Fittings (Bill Due)', 1, 'lot', 32000, 32000, '2026-10-18', 'Sanitary fittings', 'Internal concealed bathroom water supply pipes delivery', 'c0000000-0000-0000-0000-000000000004', 'unpaid', 'client_funds', 'direct', null, 'e78000af-a287-4d6e-9d3f-dec7a38f5ce1')
ON CONFLICT DO NOTHING;
