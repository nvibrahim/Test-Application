import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@inspower/ui/components/alert';
import { Badge } from '@inspower/ui/components/badge';
import { Button } from '@inspower/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@inspower/ui/components/card';
import { Checkbox } from '@inspower/ui/components/checkbox';
import { Field } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { Select } from '@inspower/ui/components/select';
import { Skeleton } from '@inspower/ui/components/skeleton';
import { requireSession } from '@/lib/session';
import { Page } from '@/shell/page';

export const metadata: Metadata = { title: 'Design system' };
export const dynamic = 'force-dynamic';

/** Every component in every state, in both themes. Administrators only in production. */
export default async function DesignSystemPage() {
  const session = await requireSession();
  if (
    process.env.NODE_ENV === 'production' &&
    !session.user.isSuperAdmin &&
    !session.user.permissions.includes('settings.manage')
  )
    redirect('/dashboard');
  const tokens = [
    'background',
    'foreground',
    'card',
    'primary',
    'primary-foreground',
    'secondary',
    'muted',
    'muted-foreground',
    'accent',
    'destructive',
    'success',
    'warning',
    'border',
    'ring',
  ];
  return (
    <Page title="Design system" fullName={session.user.fullName}>
      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Tokens</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {tokens.map((t) => (
              <div key={t} className="rounded-md border p-2 text-xs">
                <div className="mb-1 h-8 rounded" style={{ background: `var(--${t})` }} />
                {t}
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Buttons</h2>
          <div className="flex flex-wrap gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Badges and alerts</h2>
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <Alert>
              <AlertTitle>Plain</AlertTitle>
              <AlertDescription>An ordinary message.</AlertDescription>
            </Alert>
            <Alert variant="success">
              <AlertDescription>Saved.</AlertDescription>
            </Alert>
            <Alert variant="warning">
              <AlertDescription>Something needs attention.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertDescription>Something went wrong.</AlertDescription>
            </Alert>
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Forms</h2>
          <Card>
            <CardHeader>
              <CardTitle>A card with fields</CardTitle>
              <CardDescription>Inputs are 44 px tall on phones, 36 px on desktops.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field id="ds-text" label="Text" help="Help text under the field.">
                <Input id="ds-text" defaultValue="Hello" />
              </Field>
              <Field id="ds-error" label="With an error" error="This is not right.">
                <Input id="ds-error" aria-invalid defaultValue="Oops" />
              </Field>
              <Field id="ds-select" label="Select">
                <Select id="ds-select" defaultValue="b">
                  <option value="a">Option A</option>
                  <option value="b">Option B</option>
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox defaultChecked /> A checkbox
              </label>
              <Input disabled defaultValue="Disabled" />
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
        </section>
      </div>
    </Page>
  );
}
