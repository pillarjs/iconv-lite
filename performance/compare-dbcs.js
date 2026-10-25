"use strict"

// node performance/compare-dbcs.js /path/to/baseline [node|web] [--json]
const path = require("path")
const { compare } = require("./dbcs")

async function main () {
  const args = process.argv.slice(2).filter(arg => arg !== "--json")
  const [baselinePath, backend = "node"] = args
  if (!baselinePath || args.length > 2 || !["node", "web"].includes(backend)) {
    throw new Error("Usage: node performance/compare-dbcs.js /path/to/baseline [node|web] [--json]")
  }
  const before = require(path.resolve(baselinePath))
  const after = require("../")
  before.setBackend(require(path.resolve(baselinePath, "backends", backend)))
  after.setBackend(require(`../backends/${backend}`))
  const rounds = Number(process.env.BENCH_ROUNDS || 7)
  const milliseconds = Number(process.env.BENCH_MS || 100)
  const rows = await compare(before, after, { rounds, milliseconds })
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ runtime: process.version, backend, rounds, milliseconds, rows }, null, 2))
  } else {
    console.log(`${process.version}, ${backend} backend; median of ${rounds} rounds (${milliseconds} ms each). Positive change means faster.`)
    console.table(rows.map(({ name, before, after, change }) => ({ name, before, after, "change %": change })))
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
