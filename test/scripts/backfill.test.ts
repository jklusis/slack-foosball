import { describe, expect, it } from "vitest"
import { backfillLastPlayed } from "../../scripts/backfill"

type Input = Record<string, unknown>

function conditionalFailure(): Error {
  const error = new Error("The conditional request failed")
  error.name = "ConditionalCheckFailedException"
  return error
}

describe("backfillLastPlayed", () => {
  it("reads every scan page and counts only the ratings it stamped", async () => {
    const pages: Input[] = [
      {
        Items: [{ teamId: "T1", userId: "A", displayName: "Ada", doubles: { elo: 1016, wins: 1, losses: 0 } }],
        LastEvaluatedKey: { teamId: "T1", userId: "A" },
      },
      {
        Items: [
          { teamId: "T1", userId: "B", displayName: "Ben", singles: { elo: 984, wins: 0, losses: 1 } },
          { teamId: "T1", userId: "C", displayName: "Cia", doubles: { elo: 1000, wins: 0, losses: 0, lastPlayedAt: 1 } },
        ],
      },
    ]
    const updates: Input[] = []
    const client = {
      async send(command: object) {
        const input = (command as { input: Input }).input
        if ("UpdateExpression" in input) {
          updates.push(input)
          if ((input.Key as Input).userId === "B") throw conditionalFailure()
          return {}
        }
        return pages.shift()
      },
    }
    expect(await backfillLastPlayed("Players", 42, client)).toBe(1)
    expect(pages).toEqual([])
    expect(updates.map((update) => (update.Key as Input).userId)).toEqual(["A", "B"])
  })

  it("stops the deploy on any other write error", async () => {
    const client = {
      async send(command: object) {
        const input = (command as { input: Input }).input
        if ("UpdateExpression" in input) throw new Error("throttled")
        return { Items: [{ teamId: "T1", userId: "A", displayName: "Ada", elo: 1000, wins: 0, losses: 0 }] }
      },
    }
    await expect(backfillLastPlayed("Players", 42, client)).rejects.toThrow("throttled")
  })
})
