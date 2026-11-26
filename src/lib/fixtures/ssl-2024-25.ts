import { playedFor, pointsFor, type Standing } from "@/lib/domain"

type SourceRow = [
  name: string,
  played: number,
  regulationWins: number,
  overtimeWins: number,
  overtimeLosses: number,
  regulationLosses: number,
  goalsFor: number,
  goalsAgainst: number,
  points: number,
]

const source: SourceRow[] = [
  ["Storvreta IBK", 26, 20, 2, 2, 2, 169, 77, 66],
  ["IBF Falun", 26, 19, 2, 2, 3, 198, 118, 63],
  ["Växjö IBK", 26, 18, 4, 1, 3, 178, 103, 63],
  ["Pixbo IBK", 26, 19, 1, 0, 6, 194, 131, 59],
  ["FBC Kalmarsund", 26, 12, 3, 2, 9, 142, 126, 44],
  ["Mullsjö AIS", 26, 13, 1, 1, 11, 158, 156, 42],
  ["Linköping IBK", 26, 12, 1, 4, 9, 146, 153, 42],
  ["Nykvarns IBF", 26, 7, 2, 4, 13, 113, 146, 29],
  ["Jönköpings IK", 26, 5, 5, 3, 13, 141, 175, 28],
  ["Team Thorengruppen SK", 26, 7, 0, 5, 14, 127, 136, 26],
  ["Warberg IC", 26, 5, 3, 4, 14, 100, 137, 25],
  ["AIK IBF", 26, 4, 4, 1, 17, 108, 180, 21],
  ["IBK Dalen", 26, 1, 7, 3, 15, 118, 178, 20],
  ["FC Helsingborg", 26, 4, 1, 4, 17, 128, 204, 18],
]

function toTeamId(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export const sslHerrar2024_25 = {
  competition: "SSL Herrar",
  season: "2024/25",
  source: "stats.innebandy.se",
  updatedLabel: "Slutställning",
  rows: source.map(
    (
      [
        teamName,
        played,
        regulationWins,
        overtimeWins,
        overtimeLosses,
        regulationLosses,
        goalsFor,
        goalsAgainst,
        points,
      ],
      index
    ): Standing => ({
      position: index + 1,
      teamId: toTeamId(teamName),
      teamName,
      played,
      regulationWins,
      overtimeWins,
      overtimeLosses,
      regulationLosses,
      goalsFor,
      goalsAgainst,
      points,
    })
  ),
}

for (const row of sslHerrar2024_25.rows) {
  const calculatedPlayed = playedFor(row)
  if (row.played !== calculatedPlayed) {
    throw new Error(
      `${row.teamName}: played is ${row.played}, results sum to ${calculatedPlayed}`
    )
  }

  const calculatedPoints = pointsFor(row)
  if (row.points !== calculatedPoints) {
    throw new Error(
      `${row.teamName}: points are ${row.points}, point model gives ${calculatedPoints}`
    )
  }
}
