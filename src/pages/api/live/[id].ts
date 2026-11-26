import type { APIRoute } from "astro"
import { getLiveMatch } from "@/lib/ibis-live"

export const prerender = false

export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    })
  }
  try {
    const match = await getLiveMatch(id)
    return new Response(JSON.stringify(match), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    })
  } catch (error) {
    console.error("live match failed", id, error)
    return new Response(JSON.stringify({ error: "live_unavailable" }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
    })
  }
}
