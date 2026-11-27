import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

// What each part of src/ may import. AGENTS.md, Code shape, says why. Change a rule only with a reason in the PR.
// "storage/repository" is the storage interface; the rest of storage/ is internal to it.
const rules: Record<string, { local: readonly string[]; external: boolean }> = {
  domain: { local: ["domain"], external: false },
  slack: { local: ["slack", "domain"], external: true },
  storage: { local: ["storage", "domain"], external: true },
  app: { local: ["app", "domain", "storage/repository"], external: false },
  handler: { local: ["app", "domain", "slack", "storage/repository"], external: true },
  config: { local: [], external: false },
}
// lambda.ts wires the real adapters together, so it may import anything.
const unchecked = new Set(["lambda"])

const src = resolve(import.meta.dirname, "../src")

describe("layers", () => {
  it("imports only what each part of src/ may use", () => {
    const checked = files(src)
    expect(checked.length).toBeGreaterThan(10)
    const violations = checked.flatMap((file) => {
      const from = partOf(file)
      if (unchecked.has(from)) return []
      const rule = rules[from]
      if (!rule) return [`${rel(file)}: no rule for ${from}. Add one to test/layers.test.ts.`]
      return importsOf(file)
        .filter((specifier) => !allowed(rule, from, file, specifier))
        .map((specifier) => `${rel(file)} imports "${specifier}", but ${from} may import only ${describeRule(rule)}`)
    })
    expect(violations).toEqual([])
  })
})

function allowed(rule: { local: readonly string[]; external: boolean }, from: string, file: string, specifier: string) {
  if (!specifier.startsWith(".")) return rule.external
  const target = resolve(dirname(file), specifier)
  const part = partOf(target)
  if (part === from) return true
  const surface = relative(src, target).replace(/\.ts$/, "")
  return rule.local.includes(part) || rule.local.includes(surface)
}

function partOf(file: string): string {
  const [first = ""] = relative(src, file).split("/")
  return first.replace(/\.ts$/, "")
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8")
  return [...text.matchAll(/(?:from|import)\s*\(?\s*["'`]([^"'`]+)["'`]/g)].map((match) => match[1] ?? "")
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return files(path)
    return path.endsWith(".ts") ? [path] : []
  })
}

function describeRule(rule: { local: readonly string[]; external: boolean }): string {
  const local = rule.local.length > 0 ? rule.local.join(", ") : "nothing in src/"
  return rule.external ? `${local}, and packages` : `${local}, and no packages`
}

function rel(file: string): string {
  return relative(resolve(src, ".."), file)
}
