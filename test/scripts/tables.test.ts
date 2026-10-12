import { describe, expect, it } from "vitest"
import { dynamoTableNames } from "../../scripts/tables"

describe("dynamoTableNames", () => {
  it("returns the games and players tables from a stack", () => {
    expect(
      dynamoTableNames([
        { ResourceType: "AWS::Lambda::Function", PhysicalResourceId: "foosball-controller" },
        { ResourceType: "AWS::DynamoDB::Table", PhysicalResourceId: "Foosball-Games" },
        { ResourceType: "AWS::DynamoDB::Table", PhysicalResourceId: "Foosball-Players" },
        { ResourceType: "AWS::DynamoDB::Table" },
      ]),
    ).toEqual(["Foosball-Games", "Foosball-Players"])
  })
})
