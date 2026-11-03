import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Every request carries an id, returned in the response and written to logs and audit rows. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const id = incoming && /^[A-Za-z0-9_-]{8,128}$/.test(incoming) ? incoming : randomUUID();
  (req as Request & { requestId: string }).requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}

export function requestIdOf(req: Request): string {
  return (req as Request & { requestId?: string }).requestId ?? 'unknown';
}
