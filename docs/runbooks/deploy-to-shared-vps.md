# Runbook: deploy a client to a shared VPS behind nginx

Use this when the server already runs nginx (with certbot) for other sites, as the Hostinger VPS
does. Caddy is **not** started there: it would fight nginx for ports 80 and 443. Each client's web
and API containers are published on `127.0.0.1` only, on their own pair of ports, and nginx
forwards the domain to them.

The worked example is the test site: client `test`, domain `test.inspowerdatahub.com`.

## 0. Once per server

- Docker Engine with the compose plugin, Node 24 and pnpm (`corepack enable`).
- Log Docker in to GitHub's registry with a personal access token that has `read:packages`:

  ```bash
  docker login ghcr.io -u <github-user>
  ```

- Clone this repository, for example to `/srv/inspower-core`, and run `pnpm install`.
  Client files live in `/srv/inspower-core/clients/<slug>/.env` (never commit them).

## 1. DNS

Point an `A` record for the domain at the server. Cloudflare proxying is fine.

## 2. Create the client

From `/srv/inspower-core`:

```bash
INSPOWER_CLIENTS_ROOT=/srv/inspower-core pnpm inspower client new test --version 2026.11.03-f351936 --domain test.inspowerdatahub.com --image ghcr.io/nvibrahim/inspower
```

This writes `clients/test/.env` with fresh passwords and keys, picks the next free local ports
(web 3101 / API 4101 for the first client; pass `--web-port` and `--api-port` to choose), starts
PostgreSQL and Valkey, creates the schema, starts api, worker and web, and checks
`http://127.0.0.1:<API_HOST_PORT>/api/v1/health`.

Put `AUTH_ENCRYPTION_KEY` and `BACKUP_ENCRYPTION_KEY` from that file in the password manager now.

Check the ports are free first if other apps use 3101 or 4101: `ss -ltn | grep -E ':(3101|4101) '`.

## 3. nginx and HTTPS

```bash
sudo cp infra/nginx/inspower-site.conf /etc/nginx/sites-available/test.inspowerdatahub.com.conf
```

```bash
sudo sed -i 's/DOMAIN/test.inspowerdatahub.com/; s/WEB_PORT/3101/; s/API_PORT/4101/' /etc/nginx/sites-available/test.inspowerdatahub.com.conf
```

```bash
sudo ln -s /etc/nginx/sites-available/test.inspowerdatahub.com.conf /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
```

```bash
sudo certbot --nginx -d test.inspowerdatahub.com
```

`nginx -t` must pass before the reload; it checks every site on the server, not only this one.
If the `map $http_upgrade` block already exists in another site, delete it from this file.

## 4. First Super Admin

```bash
docker compose -p inspower-test --env-file clients/test/.env -f infra/compose/docker-compose.prod.yml run --rm api cli admin create
```

Then open https://test.inspowerdatahub.com, sign in, and finish the setup wizard.

## 5. Later releases

```bash
INSPOWER_CLIENTS_ROOT=/srv/inspower-core pnpm inspower release <version> --client test --image ghcr.io/nvibrahim/inspower
```

The version and the exact command are in the summary of each "Release image" run on GitHub.
See `release-and-rollback.md` for rollback and holding a client.

## Removing the test site

```bash
docker compose -p inspower-test --env-file clients/test/.env -f infra/compose/docker-compose.prod.yml down
```

This keeps the data volumes. Remove the nginx site and reload nginx. Delete the volumes
(`inspower-test-*`) only when the data is no longer wanted.
