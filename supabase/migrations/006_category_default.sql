-- Migration 006: Set default value for category column
-- Since category is no longer user-selectable from the forms,
-- we set a DB-level default of 'General' so inserts never fail
-- even if the application doesn't explicitly provide the column.
ALTER TABLE expenses ALTER COLUMN category SET DEFAULT 'General';
