import { test } from "vitest"
import { checkCase, createCases } from "./fixtures.js"

const groups = new Map()
for (const entry of await createCases()) {
  const group = entry.name.split("/").slice(0, 3).join("/")
  if (!groups.has(group)) groups.set(group, [])
  groups.get(group).push(entry)
}

for (const [name, entries] of groups) {
  test(name, async ({ bench }) => {
    const measurements = []
    const results = []
    for (const entry of entries) {
      const reason = checkCase(entry)
      if (reason) {
        console.warn(`Skipping ${entry.name}: ${reason}`)
        continue
      }
      const { run } = entry
      let result
      measurements.push(bench(entry.name.slice(name.length + 1), () => { result = run() }))
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
