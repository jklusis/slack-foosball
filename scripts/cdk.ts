import { spawnSync } from "node:child_process"

export function runCdk(args: string[], env: NodeJS.ProcessEnv): void {
  const child = spawnSync("npx", ["cdk", ...args], { stdio: "inherit", env })
  if (child.error) {
    console.error(child.error.message)
    process.exit(1)
  }
  if (child.status !== 0) process.exit(child.status ?? 1)
}
