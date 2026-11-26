import type { APIRoute } from "astro"
import { getTodayLiveMatches } from "@/lib/ibis-live"

export const prerender = false

export const GET: APIRoute = async () => {
  try {
    const data = await getTodayLiveMatches()
    return new Response(JSON.stringify(data), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    })
  } catch (error) {
    console.error("live list failed", error)
    return new Response(JSON.stringify({ error: "live_unavailable" }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
    })
  }
}
