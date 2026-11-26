import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL ?? "")
const base = process.env.BASE_URL ?? "http://localhost:4321"

const competitions = await sql`
  select external_id, name from competition order by name
`

const failures: string[] = []
let ok = 0
for (const competition of competitions) {
  const response = await fetch(`${base}/serie/${competition.external_id}`)
  const html = await response.text()
  if (response.status === 200 && html.includes("<table")) {
    ok += 1
  } else {
    failures.push(
      `${competition.external_id} ${competition.name}: ${response.status}`
    )
  }
}

console.log(`pages ok ${ok}/${competitions.length}`)
for (const failure of failures.slice(0, 20)) console.log(`  ${failure}`)
if (failures.length) process.exitCode = 1
