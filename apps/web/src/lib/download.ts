import { apiErrorSchema } from '@inspower/shared';
import { ApiRequestError } from './api';

/**
 * Downloads a file from the API in the browser. A plain link cannot answer a step-up challenge,
 * so the file is fetched (through `withStepUp`, which asks and retries), then handed to the
 * browser as a blob with the name from Content-Disposition.
 */
export async function fetchDownload(url: string): Promise<void> {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const parsed = apiErrorSchema.safeParse(body);
    throw new ApiRequestError(
      res.status,
      parsed.success
        ? parsed.data
        : {
            code: 'internal_error',
            message: `The API answered ${res.status}`,
            requestId: 'unknown',
          },
    );
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'download';
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
