import { and, eq } from "drizzle-orm"
import { getDb } from "./db/client"
import { player } from "./db/schema"
import { ibisGet } from "./ibis-live"

type IbisPlayer = {
  Position: string | null
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

async function fetchPosition(externalId: string): Promise<string | null> {
  if (cache.has(externalId)) return cache.get(externalId) ?? null
  try {
    const info = await ibisGet<IbisPlayer>(
      `/v2/api/public/players/${externalId}`
    )
    const position = positionName(info.Position)
    cache.set(externalId, position)
    if (position) {
      await getDb()
        .update(player)
        .set({ position })
        .where(
          and(eq(player.source, "ibis"), eq(player.externalId, externalId))
        )
    }
    return position
  } catch {
    cache.set(externalId, null)
    return null
  }
}

export async function fillIbisPositions<
  T extends { playerExternalId: string; position: string | null },
>(source: string, entries: T[]): Promise<T[]> {
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
  const queue = [...missing]
  const workers = Array.from({ length: 6 }, async () => {
    for (;;) {
      const externalId = queue.shift()
      if (!externalId) return
      results.set(externalId, await fetchPosition(externalId))
    }
  })

  await Promise.race([
    Promise.allSettled(workers),
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
