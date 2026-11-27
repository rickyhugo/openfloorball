import { and, asc, eq, isNull, sql } from "drizzle-orm"
import { getDb } from "../src/lib/db/client"
import { player, rosterEntry, season } from "../src/lib/db/schema"
import { ibisGet } from "../src/lib/ibis-live"

type IbisPlayer = {
  Name: string
  Position: string | null
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

const rows = await db
  .selectDistinct({ id: player.id, externalId: player.externalId })
  .from(rosterEntry)
  .innerJoin(season, eq(season.id, rosterEntry.seasonId))
  .innerJoin(player, eq(player.id, rosterEntry.playerId))
  .where(
    and(
      eq(season.label, latest.label),
      eq(player.source, "ibis"),
      isNull(player.position)
    )
  )
  .orderBy(asc(player.externalId))
  .limit(Number(process.env.POSITION_LIMIT ?? 1000))

console.log(`${latest.label}: ${rows.length} players without a position`)
let updated = 0
let failed = 0
let done = 0
const queue = [...rows]

async function worker() {
  for (;;) {
    const row = queue.shift()
    if (!row) return
    try {
      const info = await ibisGet<IbisPlayer>(
        `/v2/api/public/players/${row.externalId}`
      )
      const position = positionName(info.Position)
      if (position) {
        await db.update(player).set({ position }).where(eq(player.id, row.id))
        updated += 1
      }
    } catch {
      failed += 1
    }
    done += 1
    if (done % 100 === 0) {
      console.log(`${done}/${rows.length} updated ${updated} failed ${failed}`)
    }
  }
}

await Promise.all(Array.from({ length: 4 }, worker))
console.log(`done: ${updated} updated, ${failed} failed`)
