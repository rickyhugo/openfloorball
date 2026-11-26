# OpenFloorball

Floorball statistics, tables and reports. It starts with Sweden and is built to cover every federation and the World Championships.

## Stack

Astro renders the pages on the server. React islands handle the interactive parts, and shadcn/ui supplies the controls. Data lives in Postgres. The decision record is in `docs/adr/0001-stack-and-data-model.md`.

## Commands

```sh
npm install
mise run dev
mise run build
mise run typecheck
mise run lint
```

## Environment

Secrets live in Doppler, workplace `hugoplanet`, project `openfloorball`, config `dev`. Run `doppler login` once, then `doppler setup --no-interactive` in the repository root. `mise run dev` starts the server with the secrets injected, and `mise run secrets` lists their names. Never commit a secret. `.env*` is ignored.

## Database

The schema is in `src/lib/db/schema.ts` and migrations are in `db/migrations`.

```sh
mise run db:generate
mise run db:migrate
```

`dev` and `prd` currently point at the same Neon database. Create a Neon branch before the site takes real writes.

## Status

One page exists. It shows the SSL Herrar 2024/25 standings from a fixture. Ingestion, Postgres and every other competition are not built yet.
