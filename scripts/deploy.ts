import { MANAGED_BY_TAG } from "../infra/tags"
import { runCdk } from "./cdk"
import { awsEnv } from "./env"

const env = awsEnv({ createKey: true })

// Bootstrap synthesizes this app, so it needs the same env vars as deploy. Repeating it is safe.
runCdk(["bootstrap", "--tags", `${MANAGED_BY_TAG.key}=${MANAGED_BY_TAG.value}`], env)
runCdk(["deploy", "--require-approval", "never"], env)
