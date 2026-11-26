# Data acquisition plan

Status: proposed

## Where we are

The application, the toolchain and the secret store are ready. The database exists as a decision, not as a project. Nothing in this plan needs a database to start except the last step.

The gate is a Neon project in `aws-eu-central-1`, with its pooled connection string stored in Doppler as `DATABASE_URL`.

## What the sources actually are

I measured these today, or read them from the source's own documentation.

| Source                                                   | Access                                    | Shape                                                                                                                                     |
| -------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Sweden, `stats.innebandy.se`                             | SPA over `api.innebandy.se/v2/api/public` | Bearer token from `auth/startkit`, then a per-request signature in `x-nonce`, `x-signature` and `x-timestamp`. Not an open API.           |
| Sweden, iBIS API v2                                      | Login, per-club agreement, top two tiers  | Documented REST. One retrieval per day, 00:00 to 06:00, per the federation.                                                               |
| IFF, `app.floorball.sport`                               | Public LeagueOrganizer feed               | Schedule and results are public. Game events need an access and refresh token.                                                            |
| Finland, Switzerland, Czechia, Germany, Latvia, Slovakia | One adapter each in the reference project | Czechia blocks datacenter IPs. Germany now requires a Saisonmanager API key.                                                              |
| Sportradar, SportsAPI                                    | Commercial                                | Fixtures, results, standings, limited events. SportsAPI advertises 15 competitions, seasons back to 2008, and 1000 requests per day free. |

The hard part is access, not parsing.

## Decision

Do not reverse-engineer the signed Swedish endpoint. The signature is a deliberate access control. Rebuilding it is a bypass, it breaks whenever they change the client, and it risks the project before it has a single reader.

Options for Sweden, in order of preference.

1. A media agreement with Svenska IBF for the iBIS API.
2. A club partnership that grants iBIS API access for that club's competition.
3. A commercial feed that carries SSL results and standings.
4. Low-volume collection of public pages, with the terms reviewed first.

Default until one of those lands: use a commercial feed for fixtures, results and standings across countries, and add federation adapters for depth where access is granted.

## Source ladder

Every source starts at the top of this list and stops at the first rung that holds.

1. Documented API under an agreement.
2. Undocumented JSON endpoint that does not gate automated access.
3. Server-rendered HTML over plain HTTP.
4. Headless browser at a low, human-like rate.

Before an adapter is written, spend ten minutes with `curl` and the network panel, then write the verdict in the adapter README. No browser until a source proves it needs one.

## Pipeline shape

- One adapter per source behind a common interface. The registry selects by source name.
- Every fetched record keeps its source id and raw payload in `source_ref`. Raw payloads also go to R2, so tables can be re-derived without a re-scrape.
- Upserts key on the source id. A game's events are deleted and reinserted inside one transaction, so a re-run converges instead of duplicating.
- Each run writes a run record with source, start, end, counts and errors. A failed run is visible, not silent.
- Rate limits and concurrency caps are per source, not global. The collector identifies itself with a User-Agent and a contact URL.
- Finished games are immutable and cached. Only live and recent games are refetched.
- Reconciliation checks fail a run closed. Points must equal the point model, period scores must sum to the final score, and standings must agree with the games.
- Every page shows the source and the fetch time.

## Order of work

1. Schema, adapter interface, and one adapter against recorded fixtures.
2. The IFF World Championships. Small dataset, public feed, high value, and a different shape from a league.
3. One national league with server HTML or an open endpoint, to prove the registry.
4. Sweden once access is settled.
5. History backfill, nightly scheduling, freshness monitoring.

## Not now

Live scores, news ingestion, and cross-source player merges beyond alias rows. Each needs its own decision and its own slice.
