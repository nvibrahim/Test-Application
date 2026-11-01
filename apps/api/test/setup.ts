// Integration tests run against a real PostgreSQL and Valkey (see docs: pnpm test:integration).
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] ??=
  'postgresql://inspower:inspower@127.0.0.1:5432/inspower_test?schema=public';
process.env['REDIS_URL'] ??= 'redis://127.0.0.1:6379/1';
process.env['REDIS_PREFIX'] = 'inspower_test';
process.env['AUTH_ENCRYPTION_KEY'] ??= Buffer.alloc(32, 0xaa).toString('base64');
process.env['BACKUP_ENCRYPTION_KEY'] ??= Buffer.alloc(32, 0xbb).toString('base64');
process.env['LOG_LEVEL'] = 'silent';
process.env['SMTP_HOST'] = '127.0.0.1';
process.env['SMTP_PORT'] = '1';
