import { healthDetailsSchema, type HealthCheck, type HealthDetails } from '@inspower/shared';
import { Badge } from '@inspower/ui/components/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@inspower/ui/components/card';
import { apiGet, apiInternalUrl, ApiRequestError } from '@/lib/api';

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

export async function HealthCard() {
  let details: HealthDetails | null = null;
  let problem: string | null = null;
  try {
    details = await apiGet('/health/details', healthDetailsSchema, { base: apiInternalUrl() });
  } catch (error) {
    problem =
      error instanceof ApiRequestError
        ? `The API answered ${error.status}: ${error.message}`
        : 'The API is not reachable';
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>System health</span>
          {details ? (
            <StatusBadge status={details.status} />
          ) : (
            <Badge variant="destructive">Down</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {details
            ? `Version ${details.version}, checked ${new Date(details.time).toLocaleTimeString('en-GB')}`
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
      ) : null}
    </Card>
  );
}
