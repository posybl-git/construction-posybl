-- ============================================================
-- Site Ledger — Demo & Mock Data Seed Script
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
  'Ahmed House — Bahria Town Phase 8',
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
  'Villa 42 — DHA Phase 2, Islamabad',
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
  'Usman Residence — Gulberg Greens',
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
  'Commercial Plaza — G-11 Markaz',
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
('a0000000-0000-0000-0000-000000000003', null, '2026-10-10', 50000, 'client_funds', 'cash', 'Petty cash for site supplies and tanker water', false, 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
