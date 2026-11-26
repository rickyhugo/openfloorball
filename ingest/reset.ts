import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL ?? "")
await sql`
  truncate table
    player_competition_stat,
    goalie_competition_stat,
    roster_entry,
    team_season_stat,
    game,
    team_season,
    season,
    competition,
    club,
    player,
    country
  restart identity cascade
`
console.log("truncated")
