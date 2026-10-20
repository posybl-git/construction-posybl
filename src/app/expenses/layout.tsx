'use client';

import { AppLayout } from '@/components/AppLayout';

export default function ExpensesLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
