import type { Player } from "../src/domain/types"

export function player(userId: string, displayName = userId): Player {
  return { userId, displayName }
}
