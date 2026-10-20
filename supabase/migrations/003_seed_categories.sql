-- ============================================================
-- Site Ledger — Seed Expense Categories
-- Pakistani construction site terms (Roman-Urdu retained per PRD §8)
-- ============================================================

insert into public.expense_categories (name, is_seeded) values
  ('Cement', true),
  ('Sariya (steel)', true),
  ('Bajri (crush)', true),
  ('Reta (sand)', true),
  ('Bricks / Blocks', true),
  ('Block work', true),
  ('Mistri (mason)', true),
  ('Mazdoor (labour)', true),
  ('Dihari (daily wage)', true),
  ('Contractor payment', true),
  ('Advance to labour', true),
  ('Shuttering', true),
  ('Roof slab (chhat)', true),
  ('Plumbing', true),
  ('Sanitary fittings', true),
  ('Electrical wiring', true),
  ('Tiles', true),
  ('Marble', true),
  ('Wood & doors', true),
  ('Paint', true),
  ('Plaster', true),
  ('Glass & aluminium', true),
  ('Grill / iron work', true),
  ('Machinery rent', true),
  ('Transport / freight', true),
  ('Water tanker', true),
  ('Tools', true),
  ('Approval & municipal fees', true),
  ('Site tea & food', true),
  ('Staff salary', true),
  ('Miscellaneous', true)
on conflict (name) do nothing;
