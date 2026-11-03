import { Button } from '@inspower/ui/components/button';
import { SignOutButton } from './sign-out-button';

export function MaintenanceScreen({ message, appName }: { message: string; appName: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-2xl font-semibold">{appName} is closed for maintenance</h1>
      <p className="text-muted-foreground">{message}</p>
      <div className="flex gap-2">
        <Button asChild variant="outline">
          <a href="/dashboard">Try again</a>
        </Button>
        <SignOutButton />
      </div>
    </main>
  );
}
