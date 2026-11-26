import { neon } from "@neondatabase/serverless"

export type SearchKind = "competition" | "team" | "game" | "player"

export type SearchHit = {
  kind: SearchKind
  title: string
  subtitle: string | null
  url: string
}

const client = neon(process.env.DATABASE_URL ?? "")

const SCORE = `
  (case when lower(unaccent(title)) = (select q from params) then 120 else 0 end)
  + (case when lower(unaccent(title)) like (select q from params) || '%' then 80 else 0 end)
  + (case when search_text like (select q from params) || '%' then 60
          when search_text like '% ' || (select q from params) || '%' then 40
          else 25 end)
  + similarity(search_text, (select q from params)) * 40
  + weight - length(title) * 0.05
`

export async function search(term: string): Promise<SearchHit[]> {
  const query = term
    .trim()
    .slice(0, 80)
    .replace(/[%_\\]/g, " ")
    .trim()
  if (query.length < 2) return []

  const fast = (await client.query(
    `
    with params as (
      select lower(unaccent($1)) as q,
             lower(unaccent(split_part($1, ' ', 1))) as first
    ),
    ranked as (
      select kind, title, subtitle, url, ${SCORE} as score
      from search_document, params
      where search_text like '%' || (select first from params) || '%'
        and not exists (
          select 1 from unnest(string_to_array((select q from params), ' ')) tok
          where tok <> '' and search_text not like '%' || tok || '%'
        )
    )
    select kind, title, subtitle, url from (
      select *, row_number() over (partition by kind order by score desc, title) as rn
      from ranked
    ) grouped
    where rn <= 6
    order by score desc, title
    limit 24
    `,
    [query]
  )) as SearchHit[]

  if (fast.length > 0) return fast

  return (await client.query(
    `
    with params as (select lower(unaccent($1)) as q),
    ranked as (
      select kind, title, subtitle, url, ${SCORE} as score
      from search_document, params
      where not exists (
        select 1 from unnest(string_to_array((select q from params), ' ')) tok
        where tok <> ''
          and search_text not like '%' || tok || '%'
          and word_similarity(tok, search_text) < 0.3
      )
    )
    select kind, title, subtitle, url from (
      select *, row_number() over (partition by kind order by score desc, title) as rn
      from ranked
    ) grouped
    where rn <= 6
    order by score desc, title
    limit 24
    `,
    [query]
  )) as SearchHit[]
}
