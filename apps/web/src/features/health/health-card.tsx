import {
  healthDetailsSchema,
  healthSchema,
  type HealthCheck,
  type HealthDetails,
} from '@inspower/shared';
import { Badge } from '@inspower/ui/components/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@inspower/ui/components/card';
import { apiServer, ApiRequestError } from '@/lib/api';

const labels: Record<keyof HealthDetails['checks'], string> = {
  database: 'Database',
  redis: 'Cache and queues',
  worker: 'Background worker',
  mail: 'Mail server',
};

function StatusBadge({ status }: { status: HealthCheck['status'] }) {
  const variant = status === 'ok' ? 'success' : status === 'degraded' ? 'warning' : 'destructive';
  const text = status === 'ok' ? 'OK' : status === 'degraded' ? 'Degraded' : 'Down';
  return <Badge variant={variant}>{text}</Badge>;
}

/**
 * With a session that may read system status: every dependency. Without one: the public,
 * shallow health only.
 */
export async function HealthCard({ cookie }: { cookie?: string }) {
  let details: HealthDetails | null = null;
  let shallow: { status: HealthCheck['status']; version: string; time: string } | null = null;
  let problem: string | null = null;
  try {
    if (cookie) details = await apiServer('/health/details', healthDetailsSchema, { cookie });
    else shallow = await apiServer('/health', healthSchema);
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
      shallow = await apiServer('/health', healthSchema).catch(() => null);
    } else {
      problem =
        error instanceof ApiRequestError
          ? `The API answered ${error.status}: ${error.message}`
          : 'The API is not reachable';
    }
  }
  const head = details ?? shallow;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>System health</span>
          {head ? <StatusBadge status={head.status} /> : <Badge variant="destructive">Down</Badge>}
        </CardTitle>
        <CardDescription>
          {head
            ? `Version ${head.version}, checked ${new Date(head.time).toLocaleTimeString('en-GB')}`
            : problem}
        </CardDescription>
      </CardHeader>
      {details ? (
        <CardContent>
          <ul className="divide-y">
            {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => {
              const check = details.checks[key];
              return (
                <li key={key} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <div className="font-medium">{labels[key]}</div>
                    {check.detail ? (
                      <div className="text-muted-foreground">{check.detail}</div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    {check.latencyMs !== undefined ? (
                      <span className="text-muted-foreground tabular-nums">
                        {check.latencyMs} ms
                      </span>
                    ) : null}
                    <StatusBadge status={check.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      ) : shallow ? (
        <CardContent className="text-sm text-muted-foreground">
          Sign in with system access to see every dependency.
        </CardContent>
      ) : null}
    </Card>
  );
}
