import { MANAGED_BY_TAG } from "../infra/tags"
import { backfillLastPlayed } from "./backfill"
import { runCdk } from "./cdk"
import { awsEnv } from "./env"
import { playersTableName, stackResources } from "./tables"

const env = awsEnv({ createKey: true })

// Bootstrap synthesizes this app, so it needs the same env vars as deploy. Repeating it is safe.
runCdk(["bootstrap", "--tags", `${MANAGED_BY_TAG.key}=${MANAGED_BY_TAG.value}`], env)
runCdk(["deploy", "--require-approval", "never"], env)

const playersTable = playersTableName(stackResources(env))
if (!playersTable) {
  console.error("The Foosball stack has no Players table.")
  process.exit(1)
}
const stamped = await backfillLastPlayed(playersTable, Date.now())
if (stamped > 0) console.log(`Set the last game time to now on ${stamped} older ratings.`)
