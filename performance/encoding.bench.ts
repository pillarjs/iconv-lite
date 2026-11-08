import type { TestContext } from "vitest"
import type { BenchmarkCase } from "./fixtures.ts"
import { test } from "vitest"
import { checkCase, createCases } from "./fixtures.ts"

// Compatibility CI typechecks with Vitest 3; benchmark CI runs current Vitest.
// Use its concrete API when available and describe the calls used here otherwise.
type BenchAPI = TestContext extends { bench: infer API } ? API : {
  (name: string, run: () => void): unknown
  compare(...measurements: unknown[]): Promise<unknown>
}
const groups = new Map<string, BenchmarkCase[]>()
for (const entry of await createCases()) {
  const group = entry.name.split("/").slice(0, 3).join("/")
  if (!groups.has(group)) groups.set(group, [])
  groups.get(group)!.push(entry)
}

for (const [name, entries] of groups) {
  test(name, async context => {
    const { bench } = context as TestContext & { bench: BenchAPI }
    const measurements = []
    const results = []
    for (const entry of entries) {
      const reason = checkCase(entry)
      if (reason) {
        console.warn(`Skipping ${entry.name}: ${reason}`)
        continue
      }
      const { run } = entry
      let result: unknown
      measurements.push(bench(entry.name.slice(name.length + 1), () => { result = run!() }))
      // Consume the measured output without including validation in the timing.
      results.push(() => {
        const reason = checkCase({ ...entry, run: () => result })
        if (reason) throw new Error(`${entry.name}: ${reason}`)
      })
    }
    await bench.compare(...measurements, { time: 500, warmupTime: 100 })
    for (const check of results) check()
  })
}
