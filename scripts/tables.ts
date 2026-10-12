export type StackResource = {
  ResourceType?: string
  PhysicalResourceId?: string
}

export function dynamoTableNames(resources: readonly StackResource[]): string[] {
  return resources.flatMap((resource) =>
    resource.ResourceType === "AWS::DynamoDB::Table" && resource.PhysicalResourceId
      ? [resource.PhysicalResourceId]
      : [],
  )
}
