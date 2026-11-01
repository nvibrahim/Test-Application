import type { Metadata } from 'next';
import { HealthCard } from '@/features/health/health-card';

export const metadata: Metadata = { title: 'System health' };
export const dynamic = 'force-dynamic';

export default function HealthPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">System health</h1>
      <HealthCard />
    </main>
  );
}
