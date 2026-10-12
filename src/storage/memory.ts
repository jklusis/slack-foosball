import type { CompletedGame, Game, Ladder, LadderFormat, OpenGame, PlayerStanding, Rating } from "../domain/types"
import { ladderFormat } from "../domain/types"
import { ladderFromPlayers, standingOf, type PlayerRecord } from "./codec"
import type { GameRepository, StoredGame } from "./repository"

type StoredPlayer = PlayerRecord & { teamId: string }

export class MemoryRepository implements GameRepository {
  private readonly games = new Map<string, StoredGame>()
  private readonly players = new Map<string, StoredPlayer>()

  async create(game: OpenGame): Promise<StoredGame> {
    const key = gameKey(game.teamId, game.id)
    if (this.games.has(key)) throw new Error(`Game ${game.id} already exists`)
    const stored = { version: 1, game: structuredClone(game) }
    this.games.set(key, stored)
    return structuredClone(stored)
  }

  async get(teamId: string, gameId: string): Promise<StoredGame | undefined> {
    const stored = this.games.get(gameKey(teamId, gameId))
    return stored ? structuredClone(stored) : undefined
  }

  async compareAndSwap(expectedVersion: number, game: Game): Promise<"ok" | "conflict"> {
    const key = gameKey(game.teamId, game.id)
    const current = this.games.get(key)
    if (!current || current.version !== expectedVersion) return "conflict"
    this.games.set(key, { version: expectedVersion + 1, game: structuredClone(game) })
    return "ok"
  }

  async complete(
    expectedVersion: number,
    game: CompletedGame,
    standings: readonly PlayerStanding[],
  ): Promise<"ok" | "conflict"> {
    const key = gameKey(game.teamId, game.id)
    const current = this.games.get(key)
    if (!current || current.version !== expectedVersion || current.game.phase !== "reporting") {
      return "conflict"
    }
    this.games.set(key, { version: expectedVersion + 1, game: structuredClone(game) })
    for (const standing of standings) this.writeStanding(game.teamId, ladderFormat(game.format), standing)
    return "ok"
  }

  async getStandings(
    teamId: string,
    userIds: readonly string[],
    format: LadderFormat,
  ): Promise<PlayerStanding[]> {
    const found: PlayerStanding[] = []
    for (const userId of userIds) {
      const record = this.players.get(playerKey(teamId, userId))
      if (!record) continue
      const standing = standingOf(record, format)
      if (standing) found.push(standing)
    }
    return found
  }

  async listLadders(teamId: string): Promise<Ladder> {
    const records = [...this.players.values()].filter((standing) => standing.teamId === teamId)
    return ladderFromPlayers(records)
  }

  private writeStanding(teamId: string, format: LadderFormat, standing: PlayerStanding): void {
    const key = playerKey(teamId, standing.userId)
    const current = this.players.get(key)
    const rating: Rating = { elo: standing.elo, wins: standing.wins, losses: standing.losses }
    const next: StoredPlayer = {
      teamId,
      userId: standing.userId,
      displayName: standing.displayName,
      ...(current?.doubles ? { doubles: current.doubles } : {}),
      ...(current?.singles ? { singles: current.singles } : {}),
      [format]: rating,
    }
    this.players.set(key, structuredClone(next))
  }
}

function gameKey(teamId: string, gameId: string): string {
  return `${teamId}#${gameId}`
}

function playerKey(teamId: string, userId: string): string {
  return `${teamId}#${userId}`
}
