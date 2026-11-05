import { spawnSync } from "node:child_process"
import { runCdk } from "./cdk"
import { awsEnv } from "./env"
import { dynamoTableNames, stackResources } from "./tables"

const env = awsEnv({ createKey: false })
const tables = dynamoTableNames(stackResources(env))

console.log("This deletes the Foosball stack, including the Lambda, the function URL, and both DynamoDB tables.")
runCdk(["destroy", "Foosball"], env)

// A stack deployed earlier can still have DeletionPolicy Retain. Remove those tables after the stack is gone.
for (const name of tables) deleteIfPresent(name, env)

function deleteIfPresent(name: string, env: NodeJS.ProcessEnv): void {
  const child = spawnSync("aws", ["dynamodb", "delete-table", "--table-name", name], {
    encoding: "utf8",
    env,
  })
  if (child.status === 0) {
    console.log(`Deleted table ${name}.`)
    return
  }
  const err = `${child.stderr ?? ""}`
  if (err.includes("ResourceNotFoundException")) return
  process.stderr.write(err)
  process.exit(child.status ?? 1)
}
