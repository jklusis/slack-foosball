import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb"
import type { DocumentSender } from "../src/storage/dynamo"
import { lastPlayedBackfills } from "../src/storage/codec"

type ScanPage = { Items?: Record<string, unknown>[]; LastEvaluatedKey?: Record<string, unknown> }

export async function backfillLastPlayed(
  playersTable: string,
  playedAt: number,
  client: DocumentSender = DynamoDBDocumentClient.from(new DynamoDBClient({})) as unknown as DocumentSender,
): Promise<number> {
  let stamped = 0
  let startKey: Record<string, unknown> | undefined
  do {
    const page = (await client.send(
      new ScanCommand({ TableName: playersTable, ExclusiveStartKey: startKey }),
    )) as ScanPage
    for (const item of page.Items ?? []) {
      for (const update of lastPlayedBackfills(item, playedAt)) {
        try {
          await client.send(new UpdateCommand({ TableName: playersTable, ...update }))
          stamped += 1
        } catch (error) {
          // A game saved since the scan already set the time.
          if (!(error instanceof Error && error.name === "ConditionalCheckFailedException")) throw error
        }
      }
    }
    startKey = page.LastEvaluatedKey
  } while (startKey)
  return stamped
}
