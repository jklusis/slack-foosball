import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { App } from "aws-cdk-lib"
import { Template } from "aws-cdk-lib/assertions"
import { describe, expect, it } from "vitest"
import { FoosballStack } from "../../infra/foosball-stack"

describe("FoosballStack", () => {
  it("publishes one public function url and deletes both tables with the stack", () => {
    const app = new App({ outdir: mkdtempSync(join(tmpdir(), "foosball-cdk-")) })
    const stack = new FoosballStack(app, "Foosball", {
      apiKey: "test-api-key",
      signingSecret: "test-signing-secret",
      botToken: "xoxb-test",
    })
    const template = Template.fromStack(stack)

    const tables = template.findResources("AWS::DynamoDB::Table")
    expect(Object.values(tables)).toHaveLength(2)
    expect(Object.values(tables).every((table) => table.DeletionPolicy === "Delete")).toBe(true)
    const logGroups = template.findResources("AWS::Logs::LogGroup")
    expect(Object.values(logGroups)).toHaveLength(1)
    expect(Object.values(logGroups).every((group) => group.DeletionPolicy === "Delete")).toBe(true)
    for (const type of ["AWS::DynamoDB::Table", "AWS::Lambda::Function", "AWS::IAM::Role", "AWS::Logs::LogGroup"]) {
      const resources = template.findResources(type)
      expect(Object.keys(resources).length).toBeGreaterThan(0)
      for (const resource of Object.values(resources)) {
        expect(resource.Properties.Tags).toEqual(
          expect.arrayContaining([{ Key: "ManagedBy", Value: "foosball-aws-cdk" }]),
        )
      }
    }
    template.hasResourceProperties("AWS::Lambda::Url", { AuthType: "NONE" })
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs26.x",
      Timeout: 10,
      MemorySize: 256,
      Environment: {
        Variables: {
          FOOSBALL_API_KEY: "test-api-key",
          SLACK_SIGNING_SECRET: "test-signing-secret",
          SLACK_BOT_TOKEN: "xoxb-test",
        },
      },
    })
    const [controller] = Object.values(template.findResources("AWS::Lambda::Function"))
    expect(controller?.Properties.Environment.Variables).not.toHaveProperty("FOOSBALL_INACTIVE_DAYS")
    expect(Object.keys(template.toJSON().Outputs ?? {})).toEqual(
      expect.arrayContaining(["FunctionUrl", "ApiKey", "SlackRequestUrl"]),
    )
  })

  it("keeps both tables from being replaced, with point-in-time recovery on", () => {
    const app = new App({ outdir: mkdtempSync(join(tmpdir(), "foosball-cdk-")) })
    const stack = new FoosballStack(app, "Foosball", {
      apiKey: "test-api-key",
      signingSecret: "test-signing-secret",
      botToken: "xoxb-test",
    })
    const tables = Template.fromStack(stack).findResources("AWS::DynamoDB::Table")
    // A new logical id makes CloudFormation create a new table and delete the old one, with every rating in it.
    expect(Object.keys(tables).sort()).toEqual(["Games1C5D5B9B", "PlayersCF26CFA0"])
    // These replace the table under the same id: a new key, a new key type, a fixed name, or a local secondary index.
    const keys = { Games1C5D5B9B: "gameId", PlayersCF26CFA0: "userId" }
    for (const [id, sortKey] of Object.entries(keys)) {
      const properties = tables[id]?.Properties
      expect(properties.KeySchema).toEqual([
        { AttributeName: "teamId", KeyType: "HASH" },
        { AttributeName: sortKey, KeyType: "RANGE" },
      ])
      expect(properties.AttributeDefinitions).toEqual(
        expect.arrayContaining([
          { AttributeName: "teamId", AttributeType: "S" },
          { AttributeName: sortKey, AttributeType: "S" },
        ]),
      )
      expect(properties.TableName).toBeUndefined()
      expect(properties.LocalSecondaryIndexes).toBeUndefined()
    }
    for (const table of Object.values(tables)) {
      expect(table.Properties.PointInTimeRecoverySpecification).toEqual({ PointInTimeRecoveryEnabled: true })
    }
  })

  it("passes the inactivity limit to the function only when it is set", () => {
    const app = new App({ outdir: mkdtempSync(join(tmpdir(), "foosball-cdk-")) })
    const stack = new FoosballStack(app, "Foosball", {
      apiKey: "test-api-key",
      signingSecret: "test-signing-secret",
      botToken: "xoxb-test",
      inactiveDays: 14,
    })
    Template.fromStack(stack).hasResourceProperties("AWS::Lambda::Function", {
      Environment: { Variables: { FOOSBALL_INACTIVE_DAYS: "14" } },
    })
  })
})
