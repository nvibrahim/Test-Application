import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { Job } from 'bullmq';
import {
  allScheduledJobs,
  type JobRun,
  type JobsResponse,
  type QueueCounts,
  type QueueName,
  type ScheduledJobView,
} from '@inspower/shared';
import type { z } from 'zod';
import type { jobRunQuerySchema } from '@inspower/shared';
import type { Env } from '../../platform/config/config';
import { ENV } from '../../platform/config/config.module';
import { PrismaService } from '../../platform/database/prisma.service';
import { ApiException, notFound } from '../../platform/http/api-error';
import { QUEUE_NAMES, QueueService } from '../../platform/jobs/queue.service';
import { TransactionService } from '../../platform/transaction/transaction.service';
import type { AuthContext } from '../access/request-context';
import { ctxOf } from '../auth/credentials.service';
import { readBackupSettings } from '../backups/engine';
import { nightlyCron } from '../backups/retention';
import { OperationsActions } from './operations.actions';

type RunQuery = z.infer<typeof jobRunQuerySchema>;

/**
 * Background jobs: live counts from the queues, history from `job_runs` (written by the worker
 * as it picks jobs up), retry / cancel / remove on the live job. Scheduled jobs: the shared
 * registry joined with its `scheduled_jobs` row and the live scheduler; pause removes the
 * scheduler, resume puts it back, run now queues one run. Every action is audited.
 */
@Injectable()
export class JobsService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly transactions: TransactionService,
  ) {}

  async counts(): Promise<QueueCounts[]> {
    return Promise.all(
      QUEUE_NAMES.map(async (name) => {
        const q = this.queues.queue(name);
        const [c, paused] = await Promise.all([
          q.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed'),
          q.isPaused(),
        ]);
        return {
          name,
          waiting: c['waiting'] ?? 0,
          active: c['active'] ?? 0,
          delayed: c['delayed'] ?? 0,
          completed: c['completed'] ?? 0,
          failed: c['failed'] ?? 0,
          paused,
        };
      }),
    );
  }

  async list(auth: AuthContext, query: RunQuery): Promise<JobsResponse> {
    const rows = await this.prisma.jobRun.findMany({
      where: {
        organizationId: auth.organizationId,
        ...(query.queue ? { queue: query.queue } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ queuedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, query.limit);
    const runs: JobRun[] = await Promise.all(
      page.map(async (r) => {
        const live = await this.queues
          .queue(r.queue as QueueName)
          .getJob(r.jobId)
          .then((j) => !!j)
          .catch(() => false);
        return {
          id: r.id,
          queue: r.queue as QueueName,
          name: r.name,
          jobId: r.jobId,
          status: r.status,
          attempts: r.attempts,
          inputSummary: r.inputSummary ?? null,
          result: r.result ?? null,
          error: r.error,
          queuedAt: r.queuedAt.toISOString(),
          startedAt: r.startedAt?.toISOString() ?? null,
          finishedAt: r.finishedAt?.toISOString() ?? null,
          live,
        };
      }),
    );
    return {
      queues: await this.counts(),
      runs,
      nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  private async liveJob(
    auth: AuthContext,
    runId: string,
  ): Promise<{ job: Job; run: { id: string; queue: string; jobId: string } }> {
    const run = await this.prisma.jobRun.findFirst({
      where: { id: runId, organizationId: auth.organizationId },
    });
    if (!run) throw notFound('Job not found');
    const job = await this.queues.queue(run.queue as QueueName).getJob(run.jobId);
    if (!job) throw new ApiException('conflict', 'The job is no longer in the queue');
    return { job, run };
  }

  async retry(req: Request, auth: AuthContext, runId: string): Promise<void> {
    const { job, run } = await this.liveJob(auth, runId);
    const state = await job.getState();
    if (state !== 'failed' && state !== 'completed') {
      throw new ApiException('conflict', `A ${state} job cannot be retried`);
    }
    await job.retry(state);
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      await tx.jobRun.update({
        where: { id: run.id },
        data: { status: 'queued', error: null, finishedAt: null },
      });
      await audit({
        action: OperationsActions.jobRetried,
        entityType: 'job',
        entityId: run.jobId,
        changes: { queue: run.queue },
      });
    });
  }

  async cancel(req: Request, auth: AuthContext, runId: string): Promise<void> {
    const { job, run } = await this.liveJob(auth, runId);
    const state = await job.getState();
    if (state === 'active')
      throw new ApiException(
        'conflict',
        'A running job cannot be cancelled; it finishes or fails on its own',
      );
    await job.remove();
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      await tx.jobRun.update({
        where: { id: run.id },
        data: { status: 'cancelled', finishedAt: new Date() },
      });
      await audit({
        action: OperationsActions.jobCancelled,
        entityType: 'job',
        entityId: run.jobId,
        changes: { queue: run.queue, state },
      });
    });
  }

  /** Removes the history row (and the live job if it still exists and is not running). */
  async remove(req: Request, auth: AuthContext, runId: string): Promise<void> {
    const run = await this.prisma.jobRun.findFirst({
      where: { id: runId, organizationId: auth.organizationId },
    });
    if (!run) throw notFound('Job not found');
    const job = await this.queues.queue(run.queue as QueueName).getJob(run.jobId);
    if (job) {
      if ((await job.getState()) === 'active')
        throw new ApiException('conflict', 'A running job cannot be removed');
      await job.remove();
    }
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      await tx.jobRun.delete({ where: { id: run.id } });
      await audit({
        action: OperationsActions.jobRemoved,
        entityType: 'job',
        entityId: run.jobId,
        changes: { queue: run.queue },
      });
    });
  }

  // Scheduled jobs

  async scheduled(auth: AuthContext): Promise<ScheduledJobView[]> {
    const [rows, org, backups, schedulers] = await Promise.all([
      this.prisma.scheduledJob.findMany(),
      this.prisma.organization.findUnique({
        where: { id: auth.organizationId },
        select: { timeZone: true },
      }),
      readBackupSettings(this.prisma, auth.organizationId),
      this.queues.queue('maintenance').getJobSchedulers(0, 100),
    ]);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const next = new Map(schedulers.map((s) => [s.key, s.next ? new Date(s.next) : null]));
    return allScheduledJobs.map((j) => {
      const row = byKey.get(j.key);
      return {
        key: j.key,
        name: j.name,
        description: j.description,
        cron: j.key === 'backup-nightly' ? nightlyCron(backups.nightlyAt) : j.cron,
        timeZone: j.inOrganizationTime && org?.timeZone ? org.timeZone : 'UTC',
        catchUp: !!j.catchUp,
        isPaused: row?.isPaused ?? false,
        lastRunAt: row?.lastRunAt?.toISOString() ?? null,
        lastResult: row?.lastResult ?? null,
        lastError: row?.lastError ?? null,
        nextRunAt: row?.isPaused ? null : (next.get(j.key)?.toISOString() ?? null),
      };
    });
  }

  private definition(key: string) {
    const def = allScheduledJobs.find((j) => j.key === key);
    if (!def) throw notFound('Unknown scheduled job');
    return def;
  }

  async pause(req: Request, auth: AuthContext, key: string): Promise<void> {
    this.definition(key);
    await this.queues.queue('maintenance').removeJobScheduler(key);
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      await tx.scheduledJob.upsert({
        where: { key },
        update: { isPaused: true, nextRunAt: null, organizationId: auth.organizationId },
        create: { key, organizationId: auth.organizationId, isPaused: true },
      });
      await audit({
        action: OperationsActions.schedulePaused,
        entityType: 'scheduled_job',
        entityId: key,
      });
      await emit({ name: 'jobs.schedule.changed', channels: ['organization'], payload: { key } });
    });
  }

  async resume(req: Request, auth: AuthContext, key: string): Promise<void> {
    const def = this.definition(key);
    const [org, backups] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: auth.organizationId },
        select: { timeZone: true },
      }),
      readBackupSettings(this.prisma, auth.organizationId),
    ]);
    const pattern = key === 'backup-nightly' ? nightlyCron(backups.nightlyAt) : def.cron;
    const tz = def.inOrganizationTime && org?.timeZone ? org.timeZone : 'UTC';
    await this.queues
      .queue('maintenance')
      .upsertJobScheduler(
        key,
        { pattern, tz },
        { name: key, data: { key }, opts: { removeOnComplete: 100, removeOnFail: 100 } },
      );
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      await tx.scheduledJob.upsert({
        where: { key },
        update: { isPaused: false, organizationId: auth.organizationId },
        create: { key, organizationId: auth.organizationId, isPaused: false },
      });
      await audit({
        action: OperationsActions.scheduleResumed,
        entityType: 'scheduled_job',
        entityId: key,
      });
      await emit({ name: 'jobs.schedule.changed', channels: ['organization'], payload: { key } });
    });
  }

  async runNow(req: Request, auth: AuthContext, key: string): Promise<void> {
    this.definition(key);
    await this.queues.queue('maintenance').add(
      key,
      { key, manual: true, startedBy: auth.userId },
      {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
    await this.transactions.run(ctxOf(req, auth), ({ audit }) =>
      audit({
        action: OperationsActions.scheduleRunNow,
        entityType: 'scheduled_job',
        entityId: key,
      }),
    );
  }
}
