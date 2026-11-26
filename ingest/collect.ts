import { mkdir, readFile, writeFile } from "node:fs/promises"
import { chromium, type Page } from "playwright-core"

const SEASON = process.env.IBIS_SEASON ?? "44"
const SEASON_LABEL = process.env.IBIS_SEASON_LABEL ?? "2026-27"
const BASE = "https://stats.innebandy.se"
const RAW = `data/raw/ibis/${SEASON_LABEL}`

const SENIOR =
  /(Herrar|\bHerr\b|Damer|\bDam\b|SSL|Allsvenskan|Division|Norrlandsserien|Klubbhuset|SSB-Ligan)/i
const YOUTH =
  /(\bU\d|\bP\d|\bF\d|Pojk|Flick|Junior|\bHJ\b|\bDJ\b|Veteran|Oldboy|Motion|\bMix\b|Para|Poolspel|Sammandrag|Pantamera|Nivå|Ljusröd|\bRöd\b|\bBlå\b|\bGrön\b|Skol|Distriktslag|Utveckling|Ungdom)/i
const NOT_LEAGUE = /(Cup|Träning|Invitational|Pre-Season|Mästerskap|\bDM\b)/i

type CompetitionRow = {
  CompetitionID: number
  CategoryID: number
  CategoryName: string
  Name: string
  LogotypeUrl: string | null
  FederationID: number
}

function isSenior(row: CompetitionRow) {
  const name = `${row.CategoryName} ${row.Name}`
  return SENIOR.test(name) && !YOUTH.test(name) && !NOT_LEAGUE.test(name)
}

async function open(page: Page) {
  await page.goto(`${BASE}/statistik`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  })
  await page.waitForTimeout(4000)
  await page.selectOption("#seasonId", SEASON)
  await page.waitForTimeout(2000)
}

async function enumerate(page: Page): Promise<CompetitionRow[]> {
  const federationIds = [
    ...new Set(
      await page.$$eval("#federationId option", (options) =>
        options
          .map((option) => (option as HTMLOptionElement).value)
          .filter(Boolean)
      )
    ),
  ]
  const rows = new Map<number, CompetitionRow>()
  for (const federationId of federationIds) {
    try {
      const responsePromise = page.waitForResponse(
        (response) =>
          response
            .url()
            .includes(
              `/seasons/${SEASON}/federations/${federationId}/competitions`
            ) && response.status() === 200,
        { timeout: 20000 }
      )
      await page.selectOption("#federationId", federationId)
      const response = await responsePromise
      const body = (await response.json()) as CompetitionRow[]
      await mkdir(`${RAW}/federations`, { recursive: true })
      await writeFile(
        `${RAW}/federations/${federationId}.json`,
        JSON.stringify(body)
      )
      for (const row of body)
        rows.set(row.CompetitionID, {
          ...row,
          FederationID: Number(federationId),
        })
      console.log(`fed ${federationId}: ${body.length}`)
    } catch (error) {
      console.log(`fed ${federationId}: FAILED ${String(error).slice(0, 80)}`)
    }
  }
  return [...rows.values()]
}

async function capture(page: Page, url: string, key: string, outDir: string) {
  const responses = new Map<string, string>()
  const onResponse = async (response: import("playwright-core").Response) => {
    const u = response.url()
    if (
      !u.includes("api.innebandy.se") ||
      u.includes("/v2/api/auth/") ||
      response.status() !== 200
    )
      return
    if (!(response.headers()["content-type"] ?? "").includes("json")) return
    try {
      responses.set(new URL(u).pathname, await response.text())
    } catch {
      // The body can disappear when the page navigates away.
    }
  }
  page.on("response", onResponse)
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 })
  try {
    await page.waitForResponse(
      (response) => response.url().includes(key) && response.status() === 200,
      {
        timeout: 15000,
      }
    )
  } catch {
    // A response can be dropped when the page navigates.
  }
  await page.waitForTimeout(800)
  page.off("response", onResponse)
  await mkdir(outDir, { recursive: true })
  for (const [path, body] of responses) {
    const name = path
      .replace(/^\/v2\/api\/public\//, "")
      .replace(/[^a-zA-Z0-9.-]+/g, "_")
    await writeFile(`${outDir}/${name}.json`, body)
  }
  return responses.size
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome-stable",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
})
const page = await browser.newPage()
page.setDefaultTimeout(30000)
await open(page)

let competitions: CompetitionRow[]
try {
  competitions = JSON.parse(await readFile(`${RAW}/competitions.json`, "utf8"))
  console.log(`cached competitions ${competitions.length}`)
} catch {
  competitions = await enumerate(page)
  await mkdir(RAW, { recursive: true })
  await writeFile(
    `${RAW}/competitions.json`,
    JSON.stringify(competitions, null, 2)
  )
  if (process.env.IBIS_ENUMERATE_ONLY === "1") {
    await browser.close()
    process.exit(0)
  }
}

const senior = competitions.filter(isSenior)
const only = process.env.IBIS_ONLY ? Number(process.env.IBIS_ONLY) : null
const targets = only
  ? senior.filter((row) => row.CompetitionID === only)
  : senior
console.log(`senior ${senior.length}, collecting ${targets.length}`)

let done = 0
for (const competition of targets) {
  const outDir = `${RAW}/${competition.CompetitionID}`
  try {
    const stats = await capture(
      page,
      `${BASE}/sasong/${SEASON}/serie/${competition.CompetitionID}/statistik`,
      `/competitions/${competition.CompetitionID}/playerstatistics`,
      outDir
    )
    await page.waitForTimeout(500)
    const matches = await capture(
      page,
      `${BASE}/sasong/${SEASON}/serie/${competition.CompetitionID}/spelprogram`,
      `/competitions/${competition.CompetitionID}/matches`,
      outDir
    )
    done += 1
    console.log(
      `${done}/${targets.length} ${competition.CompetitionID} ${competition.Name}: ${stats}+${matches}`
    )
  } catch (error) {
    console.log(
      `FAILED ${competition.CompetitionID} ${competition.Name}: ${String(error).slice(0, 100)}`
    )
  }
  await page.waitForTimeout(600)
}

await browser.close()
console.log(`collected ${done}/${targets.length}`)
