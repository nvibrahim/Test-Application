import { appName } from '@/lib/brand';
import { TopBar } from './top-bar';

/** Every app page: the top bar with its title, then the content with phone-friendly gutters. */
export function Page({
  title,
  fullName,
  children,
}: {
  title: string;
  fullName: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <TopBar title={title} fullName={fullName} appName={appName()} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
    </>
  );
}
