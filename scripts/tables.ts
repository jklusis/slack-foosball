import { spawnSync } from "node:child_process"

export type StackResource = {
  ResourceType?: string
  LogicalResourceId?: string
  PhysicalResourceId?: string
}

export function dynamoTableNames(resources: readonly StackResource[]): string[] {
  return resources.flatMap((resource) =>
    resource.ResourceType === "AWS::DynamoDB::Table" && resource.PhysicalResourceId
      ? [resource.PhysicalResourceId]
      : [],
  )
}

export function playersTableName(resources: readonly StackResource[]): string | undefined {
  return resources.find(
    (resource) =>
      resource.ResourceType === "AWS::DynamoDB::Table" && resource.LogicalResourceId?.startsWith("Players"),
  )?.PhysicalResourceId
}

export function stackResources(env: NodeJS.ProcessEnv): StackResource[] {
  const child = spawnSync(
    "aws",
    ["cloudformation", "describe-stack-resources", "--stack-name", "Foosball", "--output", "json"],
    { encoding: "utf8", env },
  )
  if (child.error) {
    console.error(child.error.message)
    process.exit(1)
  }
  if (child.status !== 0) {
    const err = child.stderr ?? ""
    if (/does not exist/i.test(err)) {
      console.error("No Foosball stack in this account and region.")
      process.exit(1)
    }
    process.stderr.write(err)
    process.exit(child.status ?? 1)
  }
  const parsed = JSON.parse(child.stdout) as { StackResources?: StackResource[] }
  return parsed.StackResources ?? []
}
