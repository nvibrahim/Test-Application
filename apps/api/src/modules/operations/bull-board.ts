import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { INestApplication } from '@nestjs/common';
import { API_BASE_PATH } from '@inspower/shared';
import type { Express, NextFunction, Request, Response } from 'express';
import { QUEUE_NAMES, QueueService } from '../../platform/jobs/queue.service';
import { SessionsService } from '../auth/sessions.service';

export const BULL_BOARD_PATH = `${API_BASE_PATH}/admin/queues`;

/**
 * Bull Board, the queue inspector, on the API behind the same session cookie: only an active
 * session holding `jobs.manage` (or the Super Admin) gets past the middleware; everyone else
 * sees 404 so the path is not advertised. Reached through the web app's origin at
 * /api/v1/admin/queues. Read-mostly; the app's own Jobs screen audits its actions, this does not,
 * which is why it needs the stronger permission.
 */
export function mountBullBoard(app: INestApplication): void {
  const express = app.getHttpAdapter().getInstance() as Express;
  const sessions = app.get(SessionsService);
  const queues = app.get(QueueService);
  const adapter = new ExpressAdapter();
  adapter.setBasePath(BULL_BOARD_PATH);
  createBullBoard({
    queues: QUEUE_NAMES.map((name) => new BullMQAdapter(queues.queue(name))),
    serverAdapter: adapter,
    options: { uiConfig: { boardTitle: 'Inspower queues' } },
  });
  const guard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = await sessions.authenticate(req, res);
      if (
        auth &&
        auth.stage === 'active' &&
        (auth.isSuperAdmin || auth.permissions.has('jobs.manage'))
      ) {
        // The board is a small bundled app; the API's own policy (default-src 'none') would block it.
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
        );
        return next();
      }
    } catch {
      // fall through
    }
    res.status(404).json({ code: 'not_found', message: 'Not found' });
  };
  express.use(BULL_BOARD_PATH, guard, adapter.getRouter());
}
