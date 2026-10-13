import type { CompletedGame, Game, Ladder, LadderFormat, NewGame, PlayerStanding } from "../domain/types"

export type StoredGame = {
  version: number
  game: Game
}

export interface GameRepository {
  create(game: NewGame): Promise<StoredGame>
  get(teamId: string, gameId: string): Promise<StoredGame | undefined>
  compareAndSwap(expectedVersion: number, game: Game): Promise<"ok" | "conflict">
  complete(
    expectedVersion: number,
    game: CompletedGame,
    standings: readonly PlayerStanding[],
  ): Promise<"ok" | "conflict">
  getStandings(teamId: string, userIds: readonly string[], format: LadderFormat): Promise<PlayerStanding[]>
  listLadders(teamId: string): Promise<Ladder>
}
