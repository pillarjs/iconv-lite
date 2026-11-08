import { copyFileSync, mkdirSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"

// Preserve the public declarations while their implementations are still JavaScript.
// Remove each handwritten declaration when its module is migrated to TypeScript.
for (const directory of ["lib", "backends", "encodings", "types"]) {
  for (const file of readdirSync(directory, { recursive: true })) {
    if (!file.endsWith(".d.ts")) continue
    const source = join(directory, file)
    const destination = join("dist", source)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(source, destination)
  }
}
