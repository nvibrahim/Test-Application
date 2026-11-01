import pino, { type Logger } from 'pino';

export type { Logger };

/** Structured JSON logs. Never log personal data beyond a user id. */
export function createLogger(level: string, name: string): Logger {
  return pino({
    level,
    name,
    base: { service: name },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.token',
        '*.secret',
      ],
      censor: '[redacted]',
    },
  });
}
