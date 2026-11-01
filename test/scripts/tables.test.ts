import { describe, expect, it } from "vitest"
import { dynamoTableNames, playersTableName } from "../../scripts/tables"

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

  it("finds the players table by its logical id", () => {
    expect(
      playersTableName([
        { ResourceType: "AWS::DynamoDB::Table", LogicalResourceId: "Games3A1B", PhysicalResourceId: "Foosball-Games" },
        { ResourceType: "AWS::DynamoDB::Table", LogicalResourceId: "Players9C2D", PhysicalResourceId: "Foosball-Players" },
      ]),
    ).toBe("Foosball-Players")
    expect(playersTableName([])).toBeUndefined()
  })
})
