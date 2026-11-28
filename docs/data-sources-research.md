# Data sources research

Researched 2026-11-28. Every endpoint listed was called live this session unless marked otherwise. No signups or paid keys were used.

## Sweden (iBIS / innebandy.se)

### Working (already in repo, re-verified today)

- `https://api.innebandy.se/v2/api/auth/startkit` (GET) + `POST /v2/api/auth/handshake` — session token + signing secret. Signing scheme: HMAC-SHA256 over "GET / {path} / {timestamp} / {nonce} / {sha256 of empty body}" using `ss` from the handshake, sent as `x-nonce` / `x-timestamp` / `x-signature` plus `authorization: Bearer {accessToken}` and the handshake cookies. Replicated outside the browser this session (standalone node script, HTTP 200).
- `/v2/api/public/competitions/{id}/playerstatistics` — skater rows with `PenaltyMinutes` (columns confirmed in `data/raw/ibis/2026-27/44023/competitions_44023_playerstatistics.json`: GP, G, PP/BP goals, A, Points, PenaltyMinutes; no position).
- `/v2/api/public/competitions/{id}/goaliestatistics` — rows: `MatchesPlayed, ShotsAgainst, GoalsAgainst, SavePercentage` (same raw capture).
- `/v2/api/public/competitions/{id}/matches`, `/v2/api/public/players/{playerId}` (returns `Position` such as "Målvakt", "Back", "Center"), live match events — unchanged.

### Newly discovered (verified live this session)

- **`GET /v2/api/public/teams/{TeamID}` — full roster in one call, including positions.** Response embeds a `Players` array with `PlayerID, Name, ShirtNo, PositionID, Position` ("Back", "Center", "Målvakt", …), `Captain`, season match/goal totals. Tested with `https://api.innebandy.se/v2/api/public/teams/209` (IF Ariel H2, Småland federation). `TeamID` values are the `HomeTeamID`/`AwayTeamID` and the `TeamID` column already present in every playerstatistics row, so team IDs need no extra lookup. `/v2/api/public/teams/{id}/players` and `/roster` are 404 — the roster is only in the single `teams/{id}` object.
- `GET /v2/api/public/competitions/{id}` — competition metadata (verified: SeasonID 44, playoff config, PlayerStatisticsPublic true). Useful for validation, not needed for ingestion.
- `/v2/api/public/competitions/44023/teams` and `/v2/api/public/seasons/44/teams` are 404 — no competition-level team list; derive teams from matches/playerstatistics as we do now.

### Position semantics (partially verified)

- `players/{id}` carries one `Position` plus cumulative career totals and a `LicenseHistory` array per season (association + license type, not per-season position). The teams/{id} roster is the current team's registered roster, so it is effectively season-current. Nothing in the API exposes a per-season position history — treat "position as of today" as the semantic (likely, inferred from response shape; not proven with a player who changed teams mid-season).

### Remaining gaps

- Bulk positions are now solved (one call per team instead of one per player). Goalie saves/save% per competition are already available. Nothing material missing except: no per-season position, no faceoff/shot data, and the match feed has no per-player TOI.

## Finland (fliiga.com)

### Working (already in repo, re-verified today)

- `https://fliiga.com/wp-admin/admin-ajax.php?action=fliiga_scoreboard_points&season=2026-2027&phase=&series=miehet|naiset&lang=en` — full skater table. Direct curl from this box hits the "One moment, please…" anti-bot interstitial (verified twice today); the same URL via `https://r.jina.ai/` returned the full JSON (~450 KB). The repo's FLIIGA_COOKIE path also bypasses it.
- fliiga.com match-card HTML for schedule.

### Newly discovered (all verified live via r.jina.ai this session)

The scoreboard action name is derived from the tab id on `https://fliiga.com/en/statistics/men/` (page has divs id=points, goalkeepers, penalties, standings, attendance; loader is `wp-content/themes/fliiga-child/front/js/scoreboards.js?ver=1.0.6`, which fetches `action=fliiga_scoreboard_{tabId}&season=…&phase=…&series=…&lang=…`). That gives boards we do not ingest yet:

1. **`action=fliiga_scoreboard_goalkeepers`** — the missing FI goalie feed. Array of goalies with `role: "Maalivahti"`, `games_played`, `saves`, `saves_per_game`, `conceded`, `conceded_per_game`, `shutouts`, `save_percentage` (e.g. Joonas Kaltiainen, Oilers: 4 GP, 39 saves, 5 conceded, 88.64 %), plus `torneopal_id`, `birth_date`, `shirt_number`, `wp_link`, `team_name`, `standing`. Tested for series=miehet, season=2026-2027.
2. **`action=fliiga_scoreboard_penalties`** — skaters sorted by penalty minutes; every row has `penalty_minutes` and `penalty_minutes_per_game` (top rows 8+ PIM). Same enriched skater fields as the points board: `shots`, plus/minus, `blocks`, `faceoffs_won/lost`, `shot_percentage` — also present on the points board, i.e. FI plus/minus, shots and blocks are free and we currently throw them away.
3. **`action=fliiga_scoreboard_standings`** and **`action=fliiga_scoreboard_attendance`** — exist (ids on the page); not fetched this session (contents unverified, same fetch shape).
4. **`action=match_live_data&match_id={torneopal_id}`** — per-match JSON: `status` ("Fixture"/"Played"), scores, `venue_name`, `attendance`, `round_name`, `wp_link`, `home_team`/`away_team` with `torneopal_id`, and a `player_stats` array with `{player:{torneopal_id,first_name,last_name}, goals, assists, points}`. Verified on a played women's game (id 929496, 4:6, 37 players with G/A/P) and on fixtures (pre-registered roster with zeroed stats). No goalie saves/shots and no penalty minutes per match; no match event feed.

### Positions and Torneopal

- Player pages (e.g. `https://fliiga.com/en/players/men/joona-rantala/`, fetched via r.jina.ai) show Team, Age, season G/A/P, club history — **no position**. Position beyond Maalivahti/Kenttäpelaaja does not exist in any fliiga feed tested.
- The `torneopal_id` fields confirm Torneopal is fliiga's backend. `https://api.torneopal.net/api/v3/*` answers, but only with widget-oriented document.write stubs ("No widget specified…") — a public JSON API for floorball was not reachable this session. Mark Torneopal direct access as **speculative/gated**; fliiga's own admin-ajax endpoints cover what we need anyway.

### Remaining gaps

- Player positions (none available, only goalie/field).
- Per-match penalty minutes and goalie saves (only season totals via the two scoreboards).

## Switzerland (swiss unihockey)

### Working (already in repo, re-verified today)

- `https://swissunihockey-api.azurewebsites.net/api/...` with `Referer: https://myapp.swissunihockey.ch/`:
  - `statisticstableapi/getplayerstatisticsforleague?LeagueID=9380|9534&PageID=0&PageSize=1000&SelectedColumnType=11` — 327 rows for L-UPL Men. **Verified again: the Pen column is 0 for all 327 rows**, including when sorted by `SelectedColumnType=20` (the penalty-minutes column, per the endpoint's own header `{"Label":"Pen","Explanation":"Penalty minutes","ColumnTypeID":20}`). The JS chunk also shows an optional Team filter param.
  - `leagueapi/getleaguegames?LeagueID=9380` (132 games, full schedule/scores), `leagueapi/getleagueheader`, `leagueapi/getleagueteams`, `followgameapi/initgameview?GameID=…` (game header incl. NumberOfLineUps, NumberOfGameRosters, PlayerOfTheMatchForGame), `followgameapi/initpubliclivetimelineblurbs?GameID=…&SharedSecret=THIS_IS_MAGIC_VALUE` — works, but returns 0 blurbs for a finished September game: it is live-only, not an archive feed (verified on GameID 110209).
- FloorballConnect timelines for CH — unchanged.

### Newly discovered (all verified live this session)

Found by pulling the myapp Next.js chunks from the statistics page and grepping `/_next/static/chunks/*.js` for /api/ paths (134 unique paths captured):

1. **`statisticstableapi/initgoalkeepercleansheetstatisticsforleague?LeagueID=9380`** — real goalie table for the league: 25 rows of {Name, ItemID (player id), team logo, GP, CS} (Alessio Mura 10 GP / 1 CS, etc.). This is the only goalie table populated at league level.
2. **`statisticstableapi/initplayerstatisticsforleagueorganizer?LeagueOrganizerID=1`** — organizer-wide skater table (TableType 8), same GP/G/Ass/P/Pen/GA/PA columns. Works.
3. **`statisticstableapi/initplayerprofilestatistics?PlayerID={id}`** — per-player season history table, columns S / GP / G / Ass / P / 2' / 2+2' / 10' / Pen / MP / GA / PA. Verified for two players (43159 Albin Sjögren: 4 seasons of rows; 60945). Penalty columns exist but are almost all zero — the myapp DB has sparse Swiss penalty data (Sjögren 25/26: 1×2', 26/27: none). The same PlayerID with `initplayerprofilecompetitionstatistics` returned 0 rows for the IDs tested (likely needs the right season/competition context).
4. **Goalie GA/SA/save% endpoints exist but are empty for swiss unihockey:** `statisticstableapi/initgoaliestatisticsforcompetition?CompetitionID=…` (returns the GP/GA/SA/% header with Rows: [] for 9380, 9534, 1310, 1, 22464) and `statisticstableapi/getmoregoaliestatisticsforleagueorganizer` (400 unless GenderID; with GenderID=1 still []). `leagueapi/calculategoalkeeperstatistics` / `calculateplayerstatistics` are 401 (member/admin only). So save% for CH league play is **not publicly exposed** — only clean sheets (1).
5. **`magazinegameviewapi/initgamelineups?GameID=110209`** — returns HomeTeamLineUp: null, AwayTeamLineUp: null (lineups only if teams published them; that game had NumberOfLineUps: 2). `gamelineupapi/getgamelineupforgamebyid` and `gameteamrosterapi/*` are 401 without member auth. Lineups are unusable as a dependable source.
6. **api-v2.swissunihockey.ch is fully gated.** The docs are public: `GET https://api-v2.swissunihockey.ch/api/doc` and `/api/doc/table/overview` list Table API endpoints (`/api/games`, `/api/game_events`, `/api/players`, `/api/topscorers`, `/api/rankings`, `/api/national_players`, `/api/seasons`, `/api/clubs`, …) and a Business API (`/bo/games`, `/bo/session` public; `/bo/players`, `/bo/people` private). But every Table endpoint tried (`/api/games`, `/api/leagues`, `/api/seasons`) returns 401 {"type":"Authorization::AuthRequired"} with no auth, with or without Referer — the docs' "public" label now means "documented", not "open". Whatever consumer key gates it is not obtainable without signup, so out of scope.

### Remaining gaps

- **Penalty minutes:** myapp has the columns but the data is (near-)zero; FloorballConnect is the better free source (see next section: real per-game penalty events and per-player PIM on the CH players pages).
- **Positions:** no free source found. myapp has no public position field anywhere in the 134 captured API paths; FloorballConnect player pages have no position either. Remaining gap, probably only closable via api-v2 with a consumer key.
- **Goalie saves/save%:** only clean sheets + GP are public. GA/SA/% endpoints exist but return empty rows.

## FloorballConnect (stats.floorballconnect.com)

Free static-site aggregator. Already used for CH timelines; it covers far more and is the cheapest path to new countries and to CH/SK penalties.

### URL patterns (all verified this session)

- Home: `https://stats.floorballconnect.com/`
- League/category: `/category/{cc}-{ss}-{phase}.html` where cc = cz|czw|sk|skw|dew|de (Germany men uses a bare suffix)|lv|lvw|se|sew|ch|chw|fi|fiw|cc|ccw|wfc-2024; ss = 25-26|26-27 (DE also 22-23…24-25); phase = regular-season|playoffs|cup. Examples fetched live: `/category/cz-25-26-regular-season.html` (868 KB, full standings table GP/W/OTW/OTL/L/Goals/GD/Points + every game link), `/category/sk-25-26-regular-season.html`, `/category/lv-26-27-regular-season.html`, `/category/dew-26-27-regular-season.html`.
- Player-stats table per league-season: `/category/{cc}-{ss}-{phase}-players.html` — columns Rank / Player / Team / Goals / Assists / Points / PIM. Verified for cz, ch, lv (343 players for CH 25/26; **PIM has real non-zero values**, e.g. Albin Sjögren 2).
- Game: `/{gameId}-{home}-vs-{away}-{cc}-{ss}-{phase}.html` (also legacy `{teamA}-{date}-{teamB}-vs-…` slugs, e.g. `classic-eraviikingit-14-3-2026-classic-vs-eraviikingit-fi-25-26-regular-season.html`). Contains the base64 event feed (`data-events-b64` on #gameEventsTimeline): per event minute, period, team, side, score, event_kind ("goal"|"penalty"|"break"), title (scorer/player), title_uid (player-… link), assist, assist_uid, tag ("goal"|"penalty_2"|…), situation, moment. Penalty events carry the player name and tag (penalty_2 verified); per-team penalty-type tables (2 / 2+2 / 10 / match) render from the same data.
- Player profile: `/player-{hash}.html` — game log (Date/Game/Result/Competition/G/A/P/PP/SH), season splits with Penalty Minutes (PIM) and Points/Game. **No position, no goalie numbers** even for known goalies (checked Alessio Mura's profile).
- Team: `/{team-slug}-{cc}-{ss}-{phase}-{cc}-{ss}-{phase}.html` (doubled suffix is real, e.g. `fbc-liberec-cz-25-26-regular-season-cz-25-26-regular-season.html`) — team aggregates incl. a **Penalties panel (total, per game, 2-min count, rank of N)**, top duos, clutch leaders, table history, streaks, goal timing.
- Extras: `/category/players.html` (1.7 MB all-players index), `/compare-players.html`, `/league-average-*.html`, `/head-to-head.html`, `/archive.html`, `/stats-explained.html`.
- **`GET https://stats.floorballconnect.com/theme/search/search-index.json`** — 770 KB JSON: {version, item_count, items: 5039} where each item is {type: player|team|league, name, subtitle ("Club · Country · 2026/27"), url, weight}. 4739 players, 214 teams, 86 leagues. A complete, ready-made enumeration of every player/team/league page on the site — ideal as an ingestion manifest.

### What it does not have

- Positions (no field anywhere), goalie statistics (no GAA/SV%/saves on any page checked), lineups/rosters per game, and only top-level G/A/P/PIM player stats (no +/-, no shots). Game events lag by roughly a day for some leagues (a Nov 28 FI game had no events yet; a Mar 2026 FI game had full events incl. 10 penalties).

## New countries via FloorballConnect

All verified by fetching a real category page, a played game page, and (where listed) the players table this session. Common shape for every country: standings + full schedule/results on the category page, G/A/P/PIM player tables on -players.html, game events (goals + penalty events) in data-events-b64, team pages with penalty aggregates, and the global search-index.json manifest. Same free aggregator we already parse for CH timelines.

| Country (league)                                   | Category ids tested                                       | Verified data                                                                                                                                                                      | Quality notes                                                              | Effort           |
| -------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------- |
| **Czechia — ČEZ Extraliga (cz) / žen (czw)**       | cz-25-26-regular-season (+ players), czw categories exist | Standings table (GP/W/OTW/OTL/L/GD/Pts); played game 1290056 had 18 events: 12 goals w/ scorer+assist uids, **4 penalty events** (tag penalty_2); players table w/ PIM; team pages | richest non-CH coverage; assist names sometimes ALL-CAPS                   | **small-medium** |
| **Slovakia — Extraliga mužov (sk) / žien (skw)**   | sk-25-26, sk-26-27                                        | Played game 131911 had 24 events: 14 goals, **8 penalty events**; standings; players table                                                                                         | same generator as cz                                                       | **small-medium** |
| **Latvia — ELVI līga (lv / lvw)**                  | lv-26-27-regular-season (+ players)                       | Played game 56083 had 12 events incl. goals w/ scorer uid; standings; players table w/ PIM                                                                                         | smaller league, fewer events                                               | **small**        |
| **Germany — 1. FBL (de bare / dew)**               | dew-26-27-regular-season, 26-27-regular-season            | Played women's game 58769 had 18 events: **16 goals, 0 penalty events** — DE penalty events sparse/absent in that sample; standings; players pages exist                           | same pattern, penalty data weaker; DE also has older seasons (22/23–26/27) | **small-medium** |
| **Bonus: IFF Champions Cup (cc/ccw) and WFC 2024** | categories in search index                                | categories listed; not fetched                                                                                                                                                     | Worlds/Cup seasons could piggyback on the same loader                      | **small**        |

What an ingestion looks like (mirrors ingest/finland.ts → a new external loader against ingest/external/load.ts):

1. Fetch theme/search/search-index.json → league/team/player manifests (one request).
2. Fetch category/{cc}-{ss}-{phase}.html → standings rows + game URLs (cheerio, static HTML).
3. Fetch each game page → data-events-b64 decode → events, scorers, assists, penalty tags; score/date from the page.
4. Fetch category/…-players.html → G/A/P/PIM table; join players to teams.
5. Player/team title_uid/hash links give stable external ids.

No anti-bot was observed on stats.floorballconnect.com (plain curl worked for every page).

## Recommendations (ranked)

1. **Add FI goalie ingestion from fliiga_scoreboard_goalkeepers** — small, **verified live**. New ajax action, same auth pattern as the existing scoreboard call (jina/cookie). Unlocks saves, save %, conceded, shutouts per goalie for miehet+naiset. Probably the single biggest missing-piece win.
2. **Switch Swiss penalty-minutes ingestion to FloorballConnect players tables (category/ch-…-players.html)** — small, **verified live**. myapp Pen is 0 for all 327 rows (re-verified today) and even myapp player profiles are near-zero; FC has real PIM per player/season and per-game penalty events we already fetch for timelines. Use myapp only as fallback.
3. **Replace per-player SE position calls with bulk `GET /v2/api/public/teams/{TeamID}`** — small, **verified live**. One request per team (ids already in our playerstatistics rows) returns the full roster with Position, ShirtNo, Captain; cuts thousands of player calls to a few dozen. Keep players/{id} for single-player pages.
4. **Also capture FI skater extras from the existing points board** (plus_minus, shots, blocks, faceoffs, penalty_minutes) — small, **verified live** (fields are already in the JSON we fetch for points). Zero new requests.
5. **Onboard Czechia, Slovakia, Latvia, Germany via a FloorballConnect external loader** — medium, **verified live** (category/game/player/players pages + search-index manifest all fetched today). One generic loader covers all four (+CH/SK penalties as a side effect); standings, results, fixtures, player stats with PIM, and event timelines. Suggested order: CZ → SK → LV → DE (DE penalty data looks thinner).
6. **Add CH goalie clean sheets from initgoalkeepercleansheetstatisticsforleague** — small, **verified live**. GP/CS per goalie for L-UPL; keeps the goalie table non-empty for CH until a save% source appears.
7. **Record that CH save %, positions and api-v2 are closed for free access** — documentation only. initgoaliestatisticsforcompetition / getmoregoaliestatisticsforleagueorganizer return the GP/GA/SA/% schema with empty rows; api-v2 is 401 everywhere despite "public" docs; no position field exists in any free CH feed. Re-check if api-v2 keys ever become free.
8. **FI per-match penalty/goalie detail** — speculative, skip for now: match_live_data gives only G/A/P per player; Torneopal's public API could not be reached. Season-level PIM via recommendation 4 covers most of the gap.
