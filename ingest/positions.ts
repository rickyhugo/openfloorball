import { and, asc, eq, isNull, sql } from "drizzle-orm"
import { getDb } from "../src/lib/db/client"
import { player, rosterEntry, season, teamSeason } from "../src/lib/db/schema"
import { ibisGet } from "../src/lib/ibis-live"

type IbisTeamRosterPlayer = {
  PlayerID: number
  Position: string | null
}

type IbisTeam = {
  Players?: IbisTeamRosterPlayer[]
}

const SWEDISH: Record<string, string> = {
  Goalkeeper: "Målvakt",
  Defender: "Back",
  Forward: "Forward",
  Center: "Center",
  Winger: "Ytter",
}

function positionName(value: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return SWEDISH[trimmed] ?? trimmed
}

const db = getDb()
const [latest] = await db
  .select({ label: season.label })
  .from(season)
  .orderBy(sql`${season.label} desc`)
  .limit(1)
if (!latest) throw new Error("no seasons")

const teamLimit = Number(process.env.POSITION_LIMIT ?? 200)

const teams = await db
  .selectDistinct({ externalId: teamSeason.externalId })
  .from(rosterEntry)
  .innerJoin(season, eq(season.id, rosterEntry.seasonId))
  .innerJoin(player, eq(player.id, rosterEntry.playerId))
  .innerJoin(teamSeason, eq(teamSeason.id, rosterEntry.teamSeasonId))
  .where(
    and(
      eq(season.label, latest.label),
      eq(player.source, "ibis"),
      isNull(player.position)
    )
  )
  .orderBy(asc(teamSeason.externalId))
  .limit(teamLimit)

console.log(
  `${latest.label}: ${teams.length} teams with players missing a position`
)

let updated = 0
let failed = 0
let done = 0
const queue = teams.map((team) => team.externalId)

async function worker() {
  for (;;) {
    const externalId = queue.shift()
    if (!externalId) return
    try {
      const team = await ibisGet<IbisTeam>(`/v2/api/public/teams/${externalId}`)
      const positions = new Map<string, string | null>()
      for (const rosterPlayer of team.Players ?? []) {
        positions.set(
          String(rosterPlayer.PlayerID),
          positionName(rosterPlayer.Position)
        )
      }
      const teamPlayers = await db
        .select({
          id: player.id,
          externalId: player.externalId,
          position: player.position,
        })
        .from(rosterEntry)
        .innerJoin(player, eq(player.id, rosterEntry.playerId))
        .innerJoin(teamSeason, eq(teamSeason.id, rosterEntry.teamSeasonId))
        .innerJoin(season, eq(season.id, rosterEntry.seasonId))
        .where(
          and(
            eq(season.label, latest.label),
            eq(player.source, "ibis"),
            eq(teamSeason.externalId, externalId)
          )
        )
      for (const row of teamPlayers) {
        const position = positions.get(row.externalId) ?? null
        if (position && position !== row.position) {
          await db.update(player).set({ position }).where(eq(player.id, row.id))
          updated += 1
        }
      }
    } catch {
      failed += 1
    }
    done += 1
    if (done % 25 === 0) {
      console.log(`${done}/${teams.length} updated ${updated} failed ${failed}`)
    }
  }
}

await Promise.all(Array.from({ length: 4 }, worker))
console.log(
  `done: ${updated} updated, ${failed} failed across ${teams.length} teams`
)
