import type { Side } from "../domain/types"

export const actionId = {
  join: "game_join",
  joinA: "game_join_a",
  joinB: "game_join_b",
  leave: "game_leave",
  cancel: "game_cancel",
  start: "game_start",
  finish: "game_finish",
  pick: "game_pick",
  pickHome: "game_pick_home",
  pickAway: "game_pick_away",
  save: "game_save",
} as const

export function isPick(id: string): boolean {
  return id === actionId.pick || id === actionId.pickHome || id === actionId.pickAway
}

export function encodePick(gameId: string, round: 0 | 1 | 2, side: Side): string {
  return `${gameId}:${round}:${side}`
}

export function decodePick(
  value: string,
): { gameId: string; round: 0 | 1 | 2; side: Side } | undefined {
  const match = /^(.*):([012]):(home|away)$/.exec(value)
  const gameId = match?.[1]
  const round = match?.[2]
  const side = match?.[3]
  if (!gameId || !round || (side !== "home" && side !== "away")) return undefined
  if (round !== "0" && round !== "1" && round !== "2") return undefined
  return { gameId, round: Number(round) as 0 | 1 | 2, side }
}
