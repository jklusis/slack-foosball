import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb"
import type { CompletedGame, Game, Ladder, LadderFormat, OpenGame, PlayerStanding } from "../domain/types"
import { ladderFormat } from "../domain/types"
import {
  gameFromItem,
  gameToItem,
  ladderFromPlayers,
  playerFromItem,
  playerUpdate,
  standingOf,
} from "./codec"
import type { GameRepository, StoredGame } from "./repository"

type Item = Record<string, unknown>

export type DocumentSender = {
  send(command: object): Promise<unknown>
}

export class DynamoRepository implements GameRepository {
  private readonly client: DocumentSender

  constructor(
    private readonly gamesTable: string,
    private readonly playersTable: string,
    client?: DocumentSender,
  ) {
    this.client =
      client ??
      (DynamoDBDocumentClient.from(new DynamoDBClient({})) as unknown as DocumentSender)
  }

  async create(game: OpenGame): Promise<StoredGame> {
    const stored = { version: 1, game }
    await this.client.send(
      new PutCommand({
        TableName: this.gamesTable,
        Item: gameToItem(stored),
        ConditionExpression: "attribute_not_exists(gameId)",
      }),
    )
    return stored
  }

  async get(teamId: string, gameId: string): Promise<StoredGame | undefined> {
    const result = (await this.client.send(
      new GetCommand({ TableName: this.gamesTable, Key: { teamId, gameId } }),
    )) as { Item?: Item }
    return result.Item ? gameFromItem(result.Item) : undefined
  }

  async compareAndSwap(expectedVersion: number, game: Game): Promise<"ok" | "conflict"> {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.gamesTable,
          Item: gameToItem({ version: expectedVersion + 1, game }),
          ConditionExpression: "version = :version",
          ExpressionAttributeValues: { ":version": expectedVersion },
        }),
      )
      return "ok"
    } catch (error) {
      if (isConditionalFailure(error)) return "conflict"
      throw error
    }
  }

  async complete(
    expectedVersion: number,
    game: CompletedGame,
    standings: readonly PlayerStanding[],
  ): Promise<"ok" | "conflict"> {
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.gamesTable,
                Item: gameToItem({ version: expectedVersion + 1, game }),
                ConditionExpression: "version = :version AND phase = :phase",
                ExpressionAttributeValues: { ":version": expectedVersion, ":phase": "reporting" },
              },
            },
            ...standings.map((standing) => ({
              Update: {
                TableName: this.playersTable,
                ...playerUpdate(game.teamId, ladderFormat(game.format), standing),
              },
            })),
          ],
        }),
      )
      return "ok"
    } catch (error) {
      if (isConditionalFailure(error)) return "conflict"
      throw error
    }
  }

  async getStandings(
    teamId: string,
    userIds: readonly string[],
    format: LadderFormat,
  ): Promise<PlayerStanding[]> {
    const loaded = await Promise.all(
      userIds.map(async (userId) => {
        const result = (await this.client.send(
          new GetCommand({ TableName: this.playersTable, Key: { teamId, userId } }),
        )) as { Item?: Item }
        if (!result.Item) return undefined
        return standingOf(playerFromItem(result.Item), format)
      }),
    )
    return loaded.filter((standing): standing is PlayerStanding => standing !== undefined)
  }

  async listLadders(teamId: string): Promise<Ladder> {
    const result = (await this.client.send(
      new QueryCommand({
        TableName: this.playersTable,
        KeyConditionExpression: "teamId = :teamId",
        ExpressionAttributeValues: { ":teamId": teamId },
      }),
    )) as { Items?: Item[] }
    return ladderFromPlayers((result.Items ?? []).map(playerFromItem))
  }
}

function isConditionalFailure(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("name" in error)) return false
  if (error.name === "ConditionalCheckFailedException") return true
  if (error.name !== "TransactionCanceledException" || !("CancellationReasons" in error)) return false
  const reasons = error.CancellationReasons
  return (
    Array.isArray(reasons) &&
    reasons.some((reason) => isRecord(reason) && reason.Code === "ConditionalCheckFailed")
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
