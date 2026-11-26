import type { APIRoute } from "astro"
import { search } from "@/lib/search"

export const prerender = false

export const GET: APIRoute = async ({ url }) => {
  const query = url.searchParams.get("q") ?? ""
  try {
    const hits = await search(query)
    return new Response(JSON.stringify({ hits }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=10",
      },
    })
  } catch (error) {
    console.error("search failed", error)
    return new Response(JSON.stringify({ hits: [] }), {
      headers: { "content-type": "application/json; charset=utf-8" },
    })
  }
}
