import { z } from 'zod';
import { apiServer } from '@/lib/api';
import { appName } from '@/lib/brand';
import { cookieHeader } from '@/lib/session';
import { TopBar } from './top-bar';

/** Every app page: the top bar with its title, bell and sign-out, then the content with phone-friendly gutters. */
export async function Page({
  title,
  fullName,
  children,
}: {
  title: string;
  fullName: string;
  children: React.ReactNode;
}) {
  const [name, unread] = await Promise.all([
    appName(),
    apiServer('/notifications/unread', z.object({ unread: z.number().int() }), {
      cookie: await cookieHeader(),
    })
      .then((r) => r.unread)
      .catch(() => 0),
  ]);
  return (
    <>
      <TopBar title={title} fullName={fullName} appName={name} unread={unread} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
    </>
  );
}
