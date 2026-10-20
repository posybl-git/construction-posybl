# Site Ledger — Construction Expense & Cash-Flow Tracker

Site Ledger is a fast, role-based construction expense and cash-flow tracker designed specifically for Pakistani construction contractors and site managers. Built with **Next.js 16 (Turbopack)**, **TypeScript**, and **Supabase**.

---

## ⚡ Key Features

- **Role-Based Workflows**:
  - 👑 **Admin Portal**: Executive overview (`/dashboard`), all projects (`/projects`), contract revisions, client payments (`/payments`), daily & monthly expense registers.
  - 👷 **Site Manager Portal**: Minimal distraction-free interface (`/site`) showing only assigned projects, today's expense count, and fast expense entry with no access to contract values or profit margins.
- **PKR & PKT Formatting**:
  - Native Pakistani Rupee numbering (`Rs 4,50,000`), shorthand amount parser (`5 lakh`, `1.2 cr`, `45k`), and words generator.
  - Pakistan Standard Time (`UTC+5`) date boundaries.
- **High-Speed Mobile Expense Entry**:
  - One-tap category chips, Today/Yesterday buttons, vendor autocomplete, advance alerts, and draft auto-saving.
- **Strict Row-Level Security & Audit Log**:
  - RLS policies ensuring site managers only access assigned project data, with an append-only audit trail on all changes.

---

## 🚀 Getting Started

### 1. Environment Configuration

Add your Supabase project credentials in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 2. Database Migrations

Execute the migration scripts in order within your Supabase SQL Editor:

1. `supabase/migrations/001_initial_schema.sql` — Tables, views, triggers, audit logging
2. `supabase/migrations/002_rls_policies.sql` — Row-Level Security policies
3. `supabase/migrations/003_seed_categories.sql` — Seed construction categories

### 3. Run Locally

```bash
npm run dev
```

Visit `http://localhost:3000`.

### 4. Production Build

```bash
npm run build
```
