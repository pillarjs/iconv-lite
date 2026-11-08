import { test } from "vitest"
import { checkCase, createCases } from "./fixtures.js"

for (const entry of await createCases()) {
  test(entry.name, context => {
    const reason = checkCase(entry)
    if (reason) context.skip(reason)
  })
}
