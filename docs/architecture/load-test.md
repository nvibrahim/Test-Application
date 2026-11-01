# Sign-in load test

Sign-in is the one endpoint everyone hits at the same minute, and the one deliberately made
slow: Argon2id with 64 MiB of memory and three passes. This records what that costs.

How to run (never against a real deployment; the script refuses a database whose name is not
a test one):

```bash
pnpm --filter @inspower/api build
DATABASE_URL=postgresql://inspower:inspower@127.0.0.1:5432/inspower_e2e \
REDIS_URL=redis://127.0.0.1:6379/2 REDIS_PREFIX=inspower_e2e \
pnpm --filter @inspower/api test:load -- 40 400 10
```

The script resets the test database, creates 40 users sharing one hash, starts the built API in
test mode, runs 400 correct sign-ins with 10 concurrent clients (each from its own forwarded
address so the per-address throttle does not shape the result), then shows the lockout engaging
for one account.

## 1 November 2026, build container

Machine: 4 CPUs (Intel Xeon 2.10 GHz, shared), 16 GiB, Node 24.22. API and PostgreSQL on the same host.

| Metric     | Value           |
| ---------- | --------------- |
| Successful | 400 of 400      |
| Throughput | 18.3 sign-ins/s |
| p50        | 538 ms          |
| p95        | 643 ms          |
| p99        | 701 ms          |
| Max        | 742 ms          |

Lockout for one account from one address, wrong password each time: nine `invalid_credentials`
answers at about 200 ms each (the growing delay is applied before the hash, so wrong passwords
are cheap), then `account_locked` on the tenth, as Settings → Security says by default.

## Reading it

- A single API container on four shared cores signs in about 18 people a second; a 200-person
  organization arriving within one minute is well inside that. Argon2id is the cost (about 100 ms
  of CPU per hash); the rest is the database, Redis and the session write.
- Latency under load stays under a second at p99 with ten concurrent sign-ins. Each sign-in
  takes 64 MiB while hashing, so ten in flight is 640 MiB: the API container's memory limit in
  `docker-compose.prod.yml` (512 MiB) should be raised to 1 GiB for clients with more than a few
  hundred people, or the Argon2 memory cost lowered in `passwords.service.ts`.
- Wrong passwords cost the attacker the same hash time as a right one only up to the delay
  threshold; after that the delay dominates and the lock ends it.

Re-run on the operations host before the first client and record the numbers below this line.
