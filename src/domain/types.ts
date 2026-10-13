export type Player = {
  userId: string
  displayName: string
}

export type Side = "home" | "away"
export type Team = "A" | "B"
export type Format = "doubles" | "singles" | "match"
// A random-teams 2v2 is "random" until it starts, then a "match". A 2v2 is "pending" until a mode is chosen.
export type GameFormat = Format | "random" | "pending"
export type LadderFormat = "doubles" | "singles"
export type Mode = "random" | "teams" | "long"

export function ladderFormat(format: GameFormat): LadderFormat {
  return format === "singles" ? "singles" : "doubles"
}

export type SidePlayers = {
  doubles: [Player, Player]
  singles: [Player]
  match: [Player, Player]
}

export type Roster = {
  doubles: [Player, Player, Player, Player]
  singles: [Player, Player]
  match: [Player, Player, Player, Player]
}

export type RoundOf<F extends Format> = {
  home: SidePlayers[F]
  away: SidePlayers[F]
  winner: Side | null
}

export type DecidedRoundOf<F extends Format> = {
  home: SidePlayers[F]
  away: SidePlayers[F]
  winner: Side
}

export type SessionRounds<F extends Format> = F extends "doubles"
  ? [RoundOf<"doubles">, RoundOf<"doubles">, RoundOf<"doubles">]
  : F extends "match"
    ? [RoundOf<"match">]
    : [RoundOf<"singles">]

export type DecidedSession<F extends Format> = F extends "doubles"
  ? [DecidedRoundOf<"doubles">, DecidedRoundOf<"doubles">, DecidedRoundOf<"doubles">]
  : F extends "match"
    ? [DecidedRoundOf<"match">]
    : [DecidedRoundOf<"singles">]

export type FourPlayers = Roster["doubles"]
export type TwoPlayers = Roster["singles"]
export type Round = RoundOf<"doubles">
export type DecidedRound = DecidedRoundOf<"doubles">
export type ThreeRounds = SessionRounds<"doubles">
export type ThreeDecided = DecidedSession<"doubles">

export type Rating = {
  elo: number
  wins: number
  losses: number
}

export type RatingChange = {
  userId: string
  displayName: string
  before: number
  after: number
  wins: number
  losses: number
}

export type RatingChangesOf<F extends Format> = F extends "singles"
  ? [RatingChange, RatingChange]
  : [RatingChange, RatingChange, RatingChange, RatingChange]

export type PlayerStanding = Rating & {
  userId: string
  displayName: string
}

export type Ladder = {
  doubles: PlayerStanding[]
  singles: PlayerStanding[]
}

type GameBase = {
  id: string
  teamId: string
  channelId: string
  createdBy: string
}

export type SetupGame = GameBase & { phase: "setup"; format: "pending"; players: [] }

export type OpenGame =
  | (GameBase & { phase: "open"; format: "singles" | "doubles"; players: Player[] })
  | (GameBase & { phase: "open"; format: "random"; players: Player[] })
  | (GameBase & {
      phase: "open"
      format: "match"
      players: Player[]
      teamA: Player[]
      teamB: Player[]
    })

type InProgress<F extends Format, Phase extends "active" | "reporting"> = GameBase & {
  phase: Phase
  format: F
  players: Roster[F]
  rounds: SessionRounds<F>
}

export type ActiveGame =
  | InProgress<"doubles", "active">
  | InProgress<"singles", "active">
  | InProgress<"match", "active">
export type ReportingGame =
  | InProgress<"doubles", "reporting">
  | InProgress<"singles", "reporting">
  | InProgress<"match", "reporting">

export type CompletedGame =
  | (GameBase & {
      phase: "completed"
      format: "doubles"
      players: Roster["doubles"]
      rounds: DecidedSession<"doubles">
      ratingChanges: RatingChangesOf<"doubles">
    })
  | (GameBase & {
      phase: "completed"
      format: "singles"
      players: Roster["singles"]
      rounds: DecidedSession<"singles">
      ratingChanges: RatingChangesOf<"singles">
    })
  | (GameBase & {
      phase: "completed"
      format: "match"
      players: Roster["match"]
      rounds: DecidedSession<"match">
      ratingChanges: RatingChangesOf<"match">
    })

export type CancelledGame = GameBase & {
  phase: "cancelled"
  format: GameFormat
  players: Player[]
  cancelledBy: Player
}

export type NewGame = SetupGame | OpenGame

export type Game = SetupGame | OpenGame | ActiveGame | ReportingGame | CompletedGame | CancelledGame

export const Reason = {
  gameFull: "game-full",
  notInGame: "not-in-game",
  notAPlayer: "not-a-player",
  needFour: "need-four",
  needTwo: "need-two",
  needTeams: "need-teams",
  teamFull: "team-full",
  wrongPhase: "wrong-phase",
  resultsIncomplete: "results-incomplete",
} as const

export type RejectReason = (typeof Reason)[keyof typeof Reason]

export const FlowReason = {
  missingGame: "missing-game",
  tryAgain: "try-again",
} as const

export type FlowReason = (typeof FlowReason)[keyof typeof FlowReason]

export type Click =
  | { type: "mode"; mode: Mode }
  | { type: "join"; team?: Team }
  | { type: "leave" }
  | { type: "cancel" }
  | { type: "start" }
  | { type: "finish" }
  | { type: "pick"; round: 0 | 1 | 2; side: Side }
  | { type: "save" }

export function requireTwo<T>(values: readonly T[]): [T, T] {
  const [first, second] = values
  if (first === undefined || second === undefined || values.length !== 2) {
    throw new Error("Expected two items")
  }
  return [first, second]
}

export function requireFour<T>(values: readonly T[]): [T, T, T, T] {
  const [first, second, third, fourth] = values
  if (
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined ||
    values.length !== 4
  ) {
    throw new Error("Expected four items")
  }
  return [first, second, third, fourth]
}
