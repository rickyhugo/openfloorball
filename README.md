# OpenFloorball

Floorball statistics, tables and reports. It covers Sweden, Finland and Switzerland today and is built to cover every federation and the World Championships.

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

## Ingestion

Swedish leagues come from the signed iBIS API, collected through `stats.innebandy.se` in a headless browser.

```sh
mise run ingest:collect   # capture raw iBIS responses
mise run ingest:load      # load Sweden into Postgres
mise run ingest:verify    # check loaded competitions
```

Finland comes from `fliiga.com`, which requires an anti-bot cookie. Pass it in `FLIIGA_COOKIE` (a `name=value; name=value` header string).

```sh
FLIIGA_COOKIE="..." mise run ingest:fi
```

Switzerland comes from the public `myapp.swissunihockey.ch` pages, read in a headless browser.

```sh
mise run ingest:ch
```

External league loaders share `ingest/external/load.ts`. They upsert country, competition, season, clubs, season teams, standings and games, then refresh the search index.

## Live

`/live` lists today's matches from Sweden, Finland and Switzerland. `/live/{source}/{matchId}` follows one match and refreshes every five seconds with the score, period, last event time and the event feed.

Sources are public but uneven. Sweden uses the signed public iBIS API. Switzerland uses the public myapp endpoints; the free timeline exposes only the latest events. Finland uses the public F-Liiga pages. Set `FLIIGA_COOKIE` to use the direct pages; without it the live adapter falls back to the Jina reader, which is rate limited. Set `JINA_API_KEY` to raise that limit.

## Status

Live on the tailnet at `https://openfloorball.hugoplanet.se`. It has country-aware navigation, a competition directory, standings, results, fixtures, team pages, player pages for Sweden, global search, and live Swedish matches. Finland and Switzerland include current-season standings, results and fixtures; player statistics for those countries are not loaded yet.
