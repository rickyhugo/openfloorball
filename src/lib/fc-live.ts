import type { LiveMatch, LiveMatches } from "./live-types"

// FloorballConnect backs the cz/sk/lv/de sources. Implemented by the
// multi-country loader; the stubs keep the build green until then.
export async function getFcLiveMatches(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _source: "cz" | "sk" | "lv" | "de"
): Promise<LiveMatches> {
  return { date: new Date().toISOString().slice(0, 10), matches: [] }
}

export async function getFcLiveMatch(
  _source: "cz" | "sk" | "lv" | "de",
  id: string
): Promise<LiveMatch> {
  throw new Error(`fc live match not available: ${id}`)
}
