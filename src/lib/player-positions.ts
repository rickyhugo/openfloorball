import { and, eq } from "drizzle-orm"
import { getDb } from "./db/client"
import { player } from "./db/schema"
import { ibisGet } from "./ibis-live"

type IbisPlayer = {
  Position: string | null
}

type IbisTeamRosterPlayer = {
  PlayerID: number
  Position: string | null
}

type IbisTeam = {
  Players?: IbisTeamRosterPlayer[]
}

const POSITIONS: Record<string, string> = {
  Goalkeeper: "Målvakt",
  Defender: "Back",
  Forward: "Forward",
  Center: "Center",
  Winger: "Ytter",
}

const cache = new Map<string, string | null>()

function positionName(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return POSITIONS[trimmed] ?? trimmed
}

async function updatePlayerPosition(externalId: string, position: string) {
  await getDb()
    .update(player)
    .set({ position })
    .where(and(eq(player.source, "ibis"), eq(player.externalId, externalId)))
}

async function fetchPosition(externalId: string): Promise<string | null> {
  if (cache.has(externalId)) return cache.get(externalId) ?? null
  try {
    const info = await ibisGet<IbisPlayer>(
      `/v2/api/public/players/${externalId}`
    )
    const position = positionName(info.Position)
    cache.set(externalId, position)
    if (position) {
      await updatePlayerPosition(externalId, position)
    }
    return position
  } catch {
    cache.set(externalId, null)
    return null
  }
}

async function fetchTeamPositions(
  teamExternalId: string
): Promise<Map<string, string | null>> {
  const team = await ibisGet<IbisTeam>(`/v2/api/public/teams/${teamExternalId}`)
  const positions = new Map<string, string | null>()
  for (const rosterPlayer of team.Players ?? []) {
    positions.set(
      String(rosterPlayer.PlayerID),
      positionName(rosterPlayer.Position)
    )
  }
  return positions
}

export async function fillIbisPositions<
  T extends { playerExternalId: string; position: string | null },
>(source: string, entries: T[], teamExternalId?: string): Promise<T[]> {
  if (source !== "ibis") return entries
  const missing = [
    ...new Set(
      entries
        .filter((entry) => !entry.position)
        .map((entry) => entry.playerExternalId)
    ),
  ]
  if (missing.length === 0) return entries

  const results = new Map<string, string | null>()

  const fill = async () => {
    if (teamExternalId && missing.some((id) => !cache.has(id))) {
      try {
        const roster = await fetchTeamPositions(teamExternalId)
        for (const externalId of missing) {
          const position = roster.get(externalId) ?? null
          if (!cache.has(externalId)) cache.set(externalId, position)
          results.set(externalId, position)
          if (position) await updatePlayerPosition(externalId, position)
        }
        return
      } catch {
        // Fall back to per-player fetches below.
      }
    }
    const queue = [...missing]
    const workers = Array.from({ length: 6 }, async () => {
      for (;;) {
        const externalId = queue.shift()
        if (!externalId) return
        results.set(externalId, await fetchPosition(externalId))
      }
    })
    await Promise.allSettled(workers)
  }

  await Promise.race([
    fill().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 6_000)),
  ])

  return entries.map((entry) => {
    if (entry.position || !results.has(entry.playerExternalId)) return entry
    return {
      ...entry,
      position: results.get(entry.playerExternalId) ?? entry.position,
    }
  })
}
