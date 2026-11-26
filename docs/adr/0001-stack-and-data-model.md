# Astro over Postgres, with one ingest adapter per source

Status: accepted on 2026-11-26

## Context

Floorball statistics live in one system per federation, not in one feed. Sweden, Finland, Switzerland, Czechia, Germany, Latvia and Slovakia each publish through a different platform. The IFF publishes championships through its own app. Each platform has its own ids, its own event names and its own idea of what a period, a shot and a save are.

The stack decision is therefore mostly a data decision. The site is read-mostly. Data changes in batches after games finish. Pages are highly cacheable. The hard parts are ingestion, identity and correction, not rendering.

## Decision

Use Astro with React islands, Postgres, and a separate ingest process in TypeScript.

- **Rendering.** Astro renders every page on the server. Static content ships no client JavaScript. Only sortable tables and charts hydrate.
- **Components.** shadcn/ui on React islands, for dialogs, menus, tabs and forms. Data surfaces such as the standings table are built from shadcn primitives and owned in the repository.
- **Cache.** Serve pages from the CDN with `stale-while-revalidate`. Each page response carries the data version of the entities it shows. Ingest purges cache tags for the games, teams and competitions it changed.
- **Database.** One Postgres database, hosted on Neon. Drizzle ORM with one generated TypeScript schema shared by ingest and web.
- **Ingest.** A separate process, not a request handler. It runs nightly from a scheduled job and on demand. One adapter per source behind a common interface, selected from a registry keyed by source name. Effect is scoped to this process, for retries, rate limits, concurrency and schema parsing. It never enters the web bundle. A headless browser appears inside an adapter only when that source has no callable endpoint.
- **Search.** Postgres full-text plus `pg_trgm` for names. Add a dedicated search engine only when search becomes a product surface.
- **News and reports.** MDX files in the repository at first. Add a headless CMS when a writer who does not use git joins.

## Data model

Canonical tables, all keyed by internal ids.

| Table                | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `country`            | Federation and its source adapter                  |
| `competition`        | League, cup or championship                        |
| `season`             | Competition edition, with a phase                  |
| `team_season`        | Club team in one season, with its alias rows       |
| `person`             | Player identity, stable across seasons and sources |
| `roster_entry`       | Person in a team_season with a jersey number       |
| `game`               | One fixture, with status and period scores         |
| `game_event`         | Goal, penalty, shot, save, goalkeeper change       |
| `lineup`             | Person in a game, with role                        |
| `source_ref`         | Source name, external id, raw JSON, fetch time     |
| `standing`           | Materialized view over finished games              |
| `player_season_stat` | Materialized view over events and lineups          |

`source_ref` is what makes the model scale. Every ingested record keeps its external id and raw payload. A new federation adds rows, not columns. A correction re-runs the adapter and replaces only that source's slice.

Phase is an enum on `season`, not a flag on `game`. Standings, leaderboards and reports read `regular-season`, `playoffs` and `cup` by name. A cup game cannot leak into a league table.

Player identity is the one genuinely hard problem. The same person appears under different spellings in eight countries and fifteen seasons. Resolve it with a canonical `person` row plus alias rows, and a small admin action to merge or split. Do not solve it with string matching at render time.

## Rejected options

- **Next.js.** It works. Astro wins because the site is content plus a few interactive tables, so near-zero client JavaScript is the default rather than an optimisation.
- **Solid islands.** Slightly smaller runtime. React wins on component ecosystem and hiring, and shadcn is React.
- **A single-page app.** Tens of thousands of programmatic pages need server HTML for search engines and first paint.
- **Python and a static site generator.** This rebuilds the machinery that a framework already provides, and splits the schema across two languages.
- **Document database, GraphQL, queue or microservices.** The domain is relational, the traffic is reads, and one process can ingest every source.
- **SQLite at the edge.** Analytical queries over millions of events need Postgres.

## Consequences

- Swapping the database later means a migration of every table. Postgres is the lock-in here, and it is deliberate.
- A new country costs one adapter file and one `country` row. It does not cost a deployable or a schema change.
- Live scores need a licensed live feed and a different ingest cadence. The nightly batch covers everything else, and the UI must not promise live data before that feed exists.
- The federation API in Sweden allows one retrieval per day, between 00:00 and 06:00, under a per-club agreement. That cadence sets the update promise on every Swedish page.

## First slice

One adapter, Sweden. One season, SSL Herren. Postgres with the tables above. Four pages: standings, game, team and player leaderboard, plus one sortable table island. Verify against the federation's own tables for a full round, then measure the mobile budget on a throttled connection.

Nothing else ships until that slice is correct. Adding Switzerland, Finland or the IFF is then a repeated unit, not a new project.
