import { API_BASE_PATH, apiErrorSchema, type ApiError } from '@inspower/shared';
import type { ZodType } from 'zod';

/** Where server components reach the API: inside the network, never through the browser. */
export function apiInternalUrl(): string {
  return process.env['API_INTERNAL_URL'] ?? 'http://127.0.0.1:4000';
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
  ) {
    super(error.message);
    this.name = 'ApiRequestError';
  }
}

/**
 * The typed client: fetch, then parse with the Zod schema that is the contract. Server
 * components pass the internal address; the browser uses the same origin (`/api/v1`).
 */
export async function apiGet<T>(
  path: string,
  schema: ZodType<T>,
  init: RequestInit & { base?: string } = {},
): Promise<T> {
  const { base = '', ...rest } = init;
  const res = await fetch(`${base}${API_BASE_PATH}${path}`, {
    ...rest,
    headers: { accept: 'application/json', ...(rest.headers ?? {}) },
    cache: 'no-store',
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
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
  return schema.parse(body);
}
