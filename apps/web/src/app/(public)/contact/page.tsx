import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContactForm } from '@/features/public/contact-form';
import { publicSettings } from '@/lib/brand';

export const metadata: Metadata = { title: 'Contact' };
export const dynamic = 'force-dynamic';

export default async function ContactPage() {
  const s = await publicSettings();
  if (!s.landing.showContactForm || !s.supportEmail) notFound();
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        Contact {s.organizationName ?? s.appName}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Your message goes by email to our team. We reply to the address you give.
      </p>
      <ContactForm />
    </main>
  );
}
