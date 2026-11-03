import type { Metadata } from 'next';
import { publicSettings } from '@/lib/brand';

export const metadata: Metadata = { title: 'Privacy' };
export const dynamic = 'force-dynamic';

/** A draft for the organization to approve and replace with its own wording. */
export default async function PrivacyPage() {
  const s = await publicSettings();
  const who = s.organizationName ?? s.appName;
  return (
    <main className="prose prose-neutral mx-auto max-w-3xl px-4 py-12 dark:prose-invert">
      <h1>Privacy notice</h1>
      <p>
        This application is run by {who}. It holds the information needed to let people sign in and
        work: names, email addresses, roles, sign-in history and the records the organization keeps
        in it.
      </p>
      <h2>What is stored</h2>
      <ul>
        <li>Your name and email, and the roles you are given.</li>
        <li>Sign-in attempts, with the network address they came from, to protect your account.</li>
        <li>
          An audit log of changes, which cannot be edited or deleted, kept for accountability.
        </li>
        <li>
          Messages you send through the contact form go to {s.supportEmail ?? 'the support address'}{' '}
          by email and are not stored here beyond a record that a message was sent.
        </li>
      </ul>
      <h2>Your choices</h2>
      <ul>
        <li>You can change your name, email and notification preferences from your profile.</li>
        <li>
          You can ask an administrator to export or anonymise your account. Anonymising replaces
          your name and email while keeping the audit history.
        </li>
      </ul>
      <h2>Security</h2>
      <p>
        Connections are encrypted. Passwords are hashed with Argon2id. Two-step verification is
        available to everyone. Backups are encrypted and tested.
      </p>
      <p className="text-sm text-muted-foreground">
        This is a draft notice. {who} should review it with its own advisers and replace it with the
        approved version.
      </p>
    </main>
  );
}
