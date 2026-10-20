'use client';

import { AppLayout } from '@/components/AppLayout';

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}

