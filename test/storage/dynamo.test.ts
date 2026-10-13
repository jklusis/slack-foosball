import { describe, expect, it } from "vitest"
import { apply } from "../../src/domain/game"
import { pairings } from "../../src/domain/pairings"
import type { OpenGame, ReportingGame, Setup2v2Game } from "../../src/domain/types"
import { requireFour } from "../../src/domain/types"
import { DynamoRepository, type DocumentSender } from "../../src/storage/dynamo"
import { player } from "../helpers"

describe("DynamoRepository", () => {
  it("stores a 2v2 setup and replaces it with the chosen mode", async () => {
    const repo = new DynamoRepository("Games", "Players", new FakeDocuments())
    const setup: Setup2v2Game = {
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "setup",
      format: "2v2",
      players: [],
    }
    await repo.create(setup)
    expect(await repo.get("T1", "game-1")).toEqual({ version: 1, game: setup })
    const chosen = apply(setup, { type: "choose2v2", mode: "random" })
    if (chosen.kind !== "save") throw new Error("expected save")
    expect(await repo.compareAndSwap(1, chosen.game)).toBe("ok")
    expect((await repo.get("T1", "game-1"))?.game).toMatchObject({ phase: "open", format: "random", players: [] })
  })

  it("keeps a conditional roster write and a second rating update from landing", async () => {
    const repo = new DynamoRepository("Games", "Players", new FakeDocuments())
    const open: OpenGame = {
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "open",
      format: "doubles",
      players: [],
    }
    const created = await repo.create(open)
    expect(await repo.compareAndSwap(created.version + 5, { ...open, players: [player("A")] })).toBe(
      "conflict",
    )
    expect((await repo.get("T1", "game-1"))?.game.players).toEqual([])

    const players = requireFour([player("A"), player("B"), player("C"), player("D")])
    const reporting: ReportingGame = {
      id: open.id,
      teamId: open.teamId,
      channelId: open.channelId,
      createdBy: open.createdBy,
      phase: "reporting",
      format: "doubles",
      players,
      rounds: [
        { ...pairings(players)[0], winner: "home" },
        { ...pairings(players)[1], winner: "home" },
        { ...pairings(players)[2], winner: "home" },
      ],
    }
    expect(await repo.compareAndSwap(1, reporting)).toBe("ok")
    const rated = apply(reporting, { type: "save", userId: "A", ratings: new Map() })
    if (rated.kind !== "complete") throw new Error("expected complete")
    expect(await repo.complete(2, rated.game, rated.standings)).toBe("ok")
    expect(await repo.complete(2, rated.game, rated.standings)).toBe("conflict")
    const ladders = await repo.listLadders("T1")
    expect(ladders.doubles.find((standing) => standing.userId === "A")?.elo).toBe(1048)
    expect(ladders.singles).toEqual([])
    expect(await repo.getStandings("T1", ["A", "missing"], "doubles")).toHaveLength(1)
    expect(await repo.getStandings("T1", ["A"], "singles")).toHaveLength(0)

    const singles: ReportingGame = {
      id: "game-2",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "reporting",
      format: "singles",
      players: [players[0], players[1]],
      rounds: [{ home: [players[0]], away: [players[1]], winner: "home" }],
    }
    await repo.create({
      id: "game-2",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "open",
      format: "singles",
      players: [],
    })
    expect(await repo.compareAndSwap(1, singles)).toBe("ok")
    const singlesRated = apply(singles, { type: "save", userId: "A", ratings: new Map() })
    if (singlesRated.kind !== "complete") throw new Error("expected complete")
    expect(await repo.complete(2, singlesRated.game, singlesRated.standings)).toBe("ok")
    const after = await repo.listLadders("T1")
    expect(after.doubles.find((standing) => standing.userId === "A")?.elo).toBe(1048)
    expect(after.singles.find((standing) => standing.userId === "A")?.elo).toBe(1016)
  })
})

type Item = Record<string, unknown>

type TransactOp =
  | { kind: "put"; table: unknown; item: Item; condition: unknown; values: unknown }
  | {
      kind: "update"
      table: unknown
      key: unknown
      expression: unknown
      names: unknown
      values: unknown
    }

class FakeDocuments implements DocumentSender {
  private readonly tables = new Map<string, Map<string, Item>>()

  async send(command: object): Promise<unknown> {
    if (!("input" in command) || !isRecord(command.input)) throw new Error("missing input")
    const input = command.input
    if (Array.isArray(input.TransactItems)) return this.transact(input.TransactItems)
    if (typeof input.KeyConditionExpression === "string") return this.query(input)
    if (isRecord(input.Item)) return this.put(input)
    if (isRecord(input.Key)) return { Item: this.read(input.TableName, input.Key) }
    throw new Error("unknown command")
  }

  private put(input: Record<string, unknown>): Record<string, never> {
    const item = input.Item as Item
    const current = this.read(input.TableName, item)
    if (!this.allowed(current, input.ConditionExpression, input.ExpressionAttributeValues)) {
      throw { name: "ConditionalCheckFailedException" }
    }
    this.write(input.TableName, item)
    return {}
  }

  private transact(items: unknown): Record<string, never> {
    if (!Array.isArray(items)) throw new Error("missing transact items")
    const ops = items.map((item) => this.readOp(item))
    const allowed = ops.every((op) => {
      if (op.kind !== "put") return true
      return this.allowed(this.read(op.table, op.item), op.condition, op.values)
    })
    if (!allowed) {
      throw {
        name: "TransactionCanceledException",
        CancellationReasons: [{ Code: "ConditionalCheckFailed" }],
      }
    }
    for (const op of ops) {
      if (op.kind === "put") this.write(op.table, op.item)
      else this.applyUpdate(op)
    }
    return {}
  }

  private readOp(item: unknown): TransactOp {
    if (!isRecord(item)) throw new Error("expected transact item")
    if (isRecord(item.Put)) {
      const put = item.Put
      if (!isRecord(put.Item)) throw new Error("expected put item")
      return {
        kind: "put",
        table: put.TableName,
        item: put.Item,
        condition: put.ConditionExpression,
        values: put.ExpressionAttributeValues,
      }
    }
    if (isRecord(item.Update)) {
      return {
        kind: "update",
        table: item.Update.TableName,
        key: item.Update.Key,
        expression: item.Update.UpdateExpression,
        names: item.Update.ExpressionAttributeNames,
        values: item.Update.ExpressionAttributeValues,
      }
    }
    throw new Error("expected put or update")
  }

  private applyUpdate(op: Extract<TransactOp, { kind: "update" }>): void {
    if (op.expression !== "SET displayName = :displayName, #format = :rating") {
      throw new Error(`Unexpected update ${String(op.expression)}`)
    }
    if (!isRecord(op.key) || !isRecord(op.names) || !isRecord(op.values)) throw new Error("bad update")
    const format = op.names["#format"]
    if (format !== "doubles" && format !== "singles") throw new Error("bad format")
    const current = this.read(op.table, op.key) ?? { teamId: op.key.teamId, userId: op.key.userId }
    this.write(op.table, {
      ...current,
      displayName: op.values[":displayName"],
      [format]: op.values[":rating"],
    })
  }

  private query(input: Record<string, unknown>): { Items: Item[] } {
    const values = isRecord(input.ExpressionAttributeValues) ? input.ExpressionAttributeValues : {}
    const teamId = values[":teamId"]
    const table = this.tables.get(String(input.TableName)) ?? new Map()
    return { Items: [...table.values()].filter((item) => item.teamId === teamId) }
  }

  private allowed(current: Item | undefined, expression: unknown, values: unknown): boolean {
    if (expression === undefined) return true
    const expected = isRecord(values) ? values : {}
    if (expression === "attribute_not_exists(gameId)") return current === undefined
    if (expression === "version = :version") return current?.version === expected[":version"]
    if (expression === "version = :version AND phase = :phase") {
      return current?.version === expected[":version"] && current?.phase === expected[":phase"]
    }
    throw new Error(`Unexpected condition ${String(expression)}`)
  }

  private read(tableName: unknown, key: unknown): Item | undefined {
    if (!isRecord(key)) return undefined
    return this.tables.get(String(tableName))?.get(storageKey(key))
  }

  private write(tableName: unknown, item: Item): void {
    const table = this.tables.get(String(tableName)) ?? new Map<string, Item>()
    table.set(storageKey(item), item)
    this.tables.set(String(tableName), table)
  }
}

function storageKey(item: Item): string {
  return `${String(item.teamId)}#${String(item.gameId ?? item.userId)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
