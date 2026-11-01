import {
  API_BASE_PATH,
  APP_SLUG,
  CSRF_HEADER,
  apiErrorSchema,
  type ApiError,
} from '@inspower/shared';
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
  get code() {
    return this.error.code;
  }
}

async function parseResponse<T>(res: Response, schema?: ZodType<T>): Promise<T> {
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;
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
  return schema ? schema.parse(body) : (body as T);
}

export interface ServerRequestInit extends RequestInit {
  /** The incoming request's Cookie header, so the API sees the person's session. */
  cookie?: string;
}

/**
 * Server components and route handlers: talk to the API directly over the internal address,
 * forwarding the browser's cookies. Never cached.
 */
export async function apiServer<T>(
  path: string,
  schema: ZodType<T>,
  init: ServerRequestInit = {},
): Promise<T> {
  const { cookie, ...rest } = init;
  const res = await fetch(`${apiInternalUrl()}${API_BASE_PATH}${path}`, {
    ...rest,
    headers: { accept: 'application/json', ...(cookie ? { cookie } : {}), ...(rest.headers ?? {}) },
    cache: 'no-store',
  });
  return parseResponse(res, schema);
}

function csrfToken(): string {
  if (typeof document === 'undefined') return '';
  const names = [`__Host-${APP_SLUG}_csrf`, `${APP_SLUG}_csrf`];
  for (const part of document.cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name && names.includes(name)) return decodeURIComponent(rest.join('='));
  }
  return '';
}

/**
 * The browser: same-origin `/api/v1/...` (the web app forwards to the API), cookies included,
 * the CSRF token from its cookie in the header on every write.
 */
export const api = {
  async get<T>(path: string, schema?: ZodType<T>): Promise<T> {
    const res = await fetch(`${API_BASE_PATH}${path}`, {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    });
    return parseResponse(res, schema);
  },
  async send<T>(
    method: 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    schema?: ZodType<T>,
  ): Promise<T> {
    // A page rendered on the server has not given the browser a CSRF cookie yet; fetch one first.
    if (!csrfToken()) {
      await fetch(`${API_BASE_PATH}/auth/csrf`, {
        credentials: 'same-origin',
        cache: 'no-store',
      }).catch(() => undefined);
    }
    const res = await fetch(`${API_BASE_PATH}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        [CSRF_HEADER]: csrfToken(),
      },
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return parseResponse(res, schema);
  },
  post<T>(path: string, body?: unknown, schema?: ZodType<T>) {
    return this.send('POST', path, body, schema);
  },
  put<T>(path: string, body?: unknown, schema?: ZodType<T>) {
    return this.send('PUT', path, body, schema);
  },
  delete<T>(path: string, schema?: ZodType<T>) {
    return this.send('DELETE', path, undefined, schema);
  },
};

/** A message for people, from an API error or anything else thrown. */
export function messageOf(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const problems = (error.error.details as { problems?: string[] } | undefined)?.problems;
    if (problems?.length) return problems.join(' ');
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong';
}
