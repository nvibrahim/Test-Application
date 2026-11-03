import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { healthSchema } from '@inspower/shared';
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

  it('keeps /details behind a session (the auth suite reads it as the owner)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/details');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('unauthenticated');
  });
});

describe('errors', () => {
  it('answers an unknown route with the error contract', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'not_found', requestId: expect.any(String) });
  });
});
