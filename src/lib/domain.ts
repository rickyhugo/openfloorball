export type Standing = {
  position: number
  teamId: string
  teamName: string
  teamHref?: string
  played: number
  regulationWins: number
  overtimeWins: number
  overtimeLosses: number
  regulationLosses: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

type Results = Pick<
  Standing,
  "regulationWins" | "overtimeWins" | "overtimeLosses" | "regulationLosses"
>

const POINT_VALUES = {
  regulationWin: 3,
  overtimeWin: 2,
  overtimeLoss: 1,
  regulationLoss: 0,
} as const

export function pointsFor(results: Results): number {
  return (
    results.regulationWins * POINT_VALUES.regulationWin +
    results.overtimeWins * POINT_VALUES.overtimeWin +
    results.overtimeLosses * POINT_VALUES.overtimeLoss +
    results.regulationLosses * POINT_VALUES.regulationLoss
  )
}

export function playedFor(results: Results): number {
  return (
    results.regulationWins +
    results.overtimeWins +
    results.overtimeLosses +
    results.regulationLosses
  )
}

export function goalDifference(
  standing: Pick<Standing, "goalsFor" | "goalsAgainst">
): number {
  return standing.goalsFor - standing.goalsAgainst
}
