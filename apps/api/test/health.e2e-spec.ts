import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { healthDetailsSchema, healthSchema } from '@inspower/shared';
import { createTestApp } from './app';

let app: INestApplication;

beforeAll(async () => {
  ({ app } = await createTestApp());
});
afterAll(async () => app.close());

describe('GET /api/v1/health', () => {
  it('answers 200 with the public health shape and a request id', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(healthSchema.parse(res.body).status).toBe('ok');
    expect(res.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('echoes a well-formed incoming request id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'test-request-0001');
    expect(res.headers['x-request-id']).toBe('test-request-0001');
  });

  it('reports every dependency on /details, the worker degraded when it is not running', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/details');
    expect(res.status).toBe(200);
    const body = healthDetailsSchema.parse(res.body);
    expect(body.checks.database.status).toBe('ok');
    expect(body.checks.redis.status).toBe('ok');
    expect(['ok', 'degraded']).toContain(body.checks.worker.status);
    expect(body.status).not.toBe('down');
  });
});

describe('errors', () => {
  it('answers an unknown route with the error contract', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'not_found', requestId: expect.any(String) });
  });
});
